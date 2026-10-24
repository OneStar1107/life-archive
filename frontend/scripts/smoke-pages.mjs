/**
 * 人生档案 · 前端全量无头巡检（17 页 × 双主题）
 *
 * 用途：把「页面能不能渲染出来、深色下有没有透白、控制台干不干净」
 *       变成一条命令可复现的回归，而不是靠人肉翻页面。
 *
 * 运行前提：
 *   1. HBuilderX 已把 H5 跑起来（默认 http://localhost:5173）
 *   2. 后端已启动并可登录（默认 http://127.0.0.1:3000）
 *   3. puppeteer-core 可解析（本机未随项目安装，见下方 resolvePuppeteer）
 *
 * 用法：
 *   node frontend/scripts/smoke-pages.mjs
 *   node frontend/scripts/smoke-pages.mjs --base http://localhost:5173 --api http://127.0.0.1:3100
 *   node frontend/scripts/smoke-pages.mjs --only memory/index,insight/index    # 只跑指定页
 *   node frontend/scripts/smoke-pages.mjs --theme dark                        # 只跑深色
 *   node frontend/scripts/smoke-pages.mjs --out .workbuddy/tmp/smoke          # 指定产物目录
 *
 * 退出码：0 = 全部通过；1 = 存在 FAIL；2 = 环境不可用（起不来浏览器 / 拿不到 token）
 *
 * ★ 设计说明（别乱改）
 *   - 深色下的「白块」检测不走截图解码（本机没有图像库），而是用
 *     elementFromPoint 沿页面底部横切采样，逐级向上找第一个非透明背景色。
 *     这是本工程 dock 透白 bug 的直接回归断言，比纯看数字可靠。
 *   - uni-app x 的 H5 是 hash 路由，跳页统一改 location.hash，不要用 goto
 *     （goto 会整页重载，把冷启动噪声算进每个页面）。
 */

import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, delimiter } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─────────────────────────────────────────────────────────────
// 参数
// ─────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  return v == null || v.startsWith('--') ? fallback : v
}

const BASE = arg('base', 'http://localhost:5173')
const API = arg('api', 'http://127.0.0.1:3000')
const THEMES = arg('theme', 'light,dark').split(',').map((s) => s.trim()).filter(Boolean)
const OUT_DIR = resolve(process.cwd(), arg('out', '.workbuddy/tmp/smoke'))
const SHOTS = process.argv.includes('--no-shots') === false
const PHONE = arg('phone', '13800138000')
const PASSWORD = arg('password', 'LifeArchive2026')
const EDGE = arg('edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')

const onlyArg = arg('only', '')
const ONLY = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : null

mkdirSync(OUT_DIR, { recursive: true })

// ─────────────────────────────────────────────────────────────
// 页面清单（顺序与 frontend/pages.json 一致，额外标注入参来源）
// ─────────────────────────────────────────────────────────────
// need: 'memoryId' → 需要一条真实记忆 id，巡检时从后端取第一条
const PAGES = [
  { path: 'pages/index/index', name: '首页' },
  { path: 'pages/login/login', name: '登录' },
  { path: 'pages/register/register', name: '注册' },
  { path: 'pages/privacy/privacy', name: '隐私政策' },
  { path: 'pages/feeling/index', name: '感受' },
  { path: 'pages/feeling/edit', name: '感受·编辑' },
  { path: 'pages/memory/index', name: '记忆（含图谱）', wait: 2600 },
  { path: 'pages/memory/detail', name: '记忆·详情', need: 'memoryId' },
  { path: 'pages/memory/timeline', name: '记忆·时间线' },
  { path: 'pages/health/index', name: '健康' },
  { path: 'pages/journey/index', name: '旅程' },
  { path: 'pages/todo/index', name: '待办', wait: 2000 },
  { path: 'pages/insight/index', name: '洞察' },
  { path: 'pages/mine/index', name: '我的' },
  { path: 'pages/mine/profile', name: '我的·资料' },
  { path: 'pages/mine/boundary', name: '我的·边界' },
  { path: 'pages/mine/settings', name: '我的·设置' },
]

const TARGETS = ONLY ? PAGES.filter((p) => ONLY.includes(p.path)) : PAGES
if (TARGETS.length === 0) {
  console.error(`[smoke] --only 没匹配到任何页面。可选值：\n  ${PAGES.map((p) => p.path).join('\n  ')}`)
  process.exit(2)
}

// ─────────────────────────────────────────────────────────────
// 依赖解析：puppeteer-core 不随项目安装（避免污染 uni-app x 依赖树）
// ─────────────────────────────────────────────────────────────
async function resolvePuppeteer() {
  // ① 项目内可解析（最理想：puppeteer-core 进了 devDependencies）
  try {
    const m = await import('puppeteer-core')
    return m.default ?? m
  } catch {
    /* 落到 ②③ */
  }

  // ② 外部依赖目录：--pptr <dir> 或 SMOKE_PPTR 环境变量
  // ③ NODE_PATH：★ ESM 的 import() 不认 NODE_PATH，必须用 CJS 的
  //    require.resolve(..., { paths }) 先定位入口，再 import 该绝对文件路径。
  const dirs = [arg('pptr', ''), process.env['SMOKE_PPTR'] || '']
    .concat((process.env['NODE_PATH'] || '').split(delimiter))
    .map((s) => s && s.trim())
    .filter(Boolean)

  let lastErr = null
  for (const dir of dirs) {
    try {
      const req = createRequire(resolve(dir, '.__smoke_probe.js'))
      const entry = req.resolve('puppeteer-core')
      const m = await import(pathToFileURL(entry).href)
      return m.default ?? m
    } catch (e) {
      lastErr = e // ★ 别静默吞：解析失败往往就是这里的问题
    }
  }

  console.error(
    `[smoke] 解析不到 puppeteer-core。最后一条错误：${lastErr ? lastErr.message : '(没有候选目录)'}\n` +
      '        puppeteer-core 故意不装进项目依赖（避免污染 uni-app x 依赖树），\n' +
      '        所以要用下列方式之一告诉脚本去哪找：\n' +
      '          --pptr <含 node_modules 的目录>\n' +
      '          SMOKE_PPTR=<目录>  或  NODE_PATH=<目录>\n' +
      '        本机当前做法：\n' +
      '          cd C:/Users/<你>/.workbuddy/binaries/node/workspace && npm i puppeteer-core\n' +
      '          NODE_PATH=C:/Users/<你>/.workbuddy/binaries/node/workspace/node_modules \\\n' +
      '            node frontend/scripts/smoke-pages.mjs',
  )
  process.exit(2)
}

// ─────────────────────────────────────────────────────────────
// 后端：登录 + 取一条真实记忆 id
// ─────────────────────────────────────────────────────────────
async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`登录失败 HTTP ${r.status}`)
  const j = await r.json()
  if (j.code !== 0) throw new Error(`登录失败 code=${j.code} ${j.message}`)
  return j.data.tokens
}

async function firstMemoryId(token) {
  const r = await fetch(`${API}/memories?page=1&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const j = await r.json()
  const id = j?.data?.list?.[0]?.id
  return typeof id === 'string' ? id : null
}

// ─────────────────────────────────────────────────────────────
// 页面内审计
// ─────────────────────────────────────────────────────────────
const AUDIT = `(() => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const root = document.querySelector('.page')

  const tag = (el) =>
    el.tagName + (el.getAttribute && el.getAttribute('class')
      ? '.' + String(el.getAttribute('class')).trim().split(/\\s+/)[0]
      : '')

  // ── 判定常量（改之前先想清楚，别拍脑袋调）────────────────────
  // LIGHT_MIN 0.5：亮度超过一半就算「亮面」。用 mutant 注入验证过边界：
  //   0.549 报警、0.498 不报警，边界干净。
  // CHROMA_MAX 30：★这一条是防误伤的关键。白/灰/黑是「中性色」，通道极差接近 0；
  //   而品牌色按钮 #7FD4F2 的极差是 115，不会被当成白块。
  //   没有这道过滤，底部一个正常的主色按钮就会被判成透白。
  // MIN_AREA 8000：约等于 100×80 或 190×42。再小就进入「图标/小卡片」范畴，
  //   白不白是设计选择，不是 bug。
  const LIGHT_MIN = 0.5
  const CHROMA_MAX = 30
  const MIN_AREA = 8000

  const lumRaw = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
  const rgbOf = (c) => 'rgb(' + [c.r, c.g, c.b].map((v) => Math.round(v)).join(',') + ')'
  const chromaOf = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)

  // 色值解析：rgb()/rgba() 和 #rgb/#rrggbb/#rrggbbaa 都要支持 ——
  // background-image 的渐变里写的是后者，只认 rgb() 会直接漏掉 gradient 白块。
  function parseColor(s) {
    if (!s) return null
    const m = /rgba?\\(([^)]+)\\)/.exec(s)
    if (m) {
      const p = m[1].split(',').map((v) => parseFloat(v.trim()))
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    const hex = /^#([0-9a-fA-F]{3,8})$/.exec(String(s).trim())
    if (!hex) return null
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const c = {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    }
    return Number.isNaN(c.r) || Number.isNaN(c.g) || Number.isNaN(c.b) ? null : c
  }

  // ★ 一个元素「画出来的底色」有三条路径，只查 backgroundColor 会漏掉两条：
  //   a) backgroundColor
  //   b) background-image: linear-gradient(...) —— 此时 backgroundColor 常常是全透明
  //   c) ::before / ::after 伪元素画的底
  //   gradient 无法解析时（例如 url(...)）按最坏情况当成不透明白，宁可误报不可漏报。
  function paintLayer(cs) {
    const bi = cs.backgroundImage
    if (bi && bi !== 'none') {
      const cols = bi.match(/rgba?\\([^)]*\\)|#[0-9a-fA-F]{3,8}/g) || []
      if (cols.length > 0) {
        let best = null
        for (const raw of cols) {
          const c = parseColor(raw)
          if (c && (best === null || lumRaw(c) > lumRaw(best))) best = c
        }
        if (best) return best
      }
      return { r: 255, g: 255, b: 255, a: 1, unparsed: true }
    }
    return parseColor(cs.backgroundColor)
  }

  // getComputedStyle 很贵，网格扫描要跑上千个点，必须缓存
  const csCache = new WeakMap()
  function layersFor(el) {
    let v = csCache.get(el)
    if (v) return v
    v = {
      self: paintLayer(getComputedStyle(el)),
      before: paintLayer(getComputedStyle(el, '::before')),
      after: paintLayer(getComputedStyle(el, '::after')),
    }
    csCache.set(el, v)
    return v
  }

  function stackOf(el) {
    if (!el) return [{ r: 255, g: 255, b: 255, a: 1 }]
    const layers = []
    let cur = el
    let isSelf = true
    while (cur) {
      const v = layersFor(cur)
      if (isSelf) {
        // 伪元素只对本元素自身取：祖先的伪元素一般不会铺到孙元素上
        if (v.before && v.before.a > 0) layers.push(v.before)
        if (v.after && v.after.a > 0) layers.push(v.after)
      }
      if (v.self && v.self.a > 0) layers.push(v.self)
      cur = cur.parentElement
      isSelf = false
    }
    // 浏览器画布默认是白底：没有任何不透明祖先时以此为基底（这正是 dock 透白的成因）
    layers.push({ r: 255, g: 255, b: 255, a: 1 })
    return layers
  }

  // ★ 必须做 alpha 合成。卡片底色是 rgba(255,255,255,0.07)，直接拿 RGB 通道算亮度
  //   会得到「纯白」的假阳性；实际叠在深色底上只有约 0.1 的亮度。
  function effective(el) {
    const layers = stackOf(el)
    let acc = layers[layers.length - 1]
    let unparsed = !!acc.unparsed
    for (let i = layers.length - 2; i >= 0; i--) {
      const t = layers[i]
      if (t.unparsed) unparsed = true
      acc = {
        r: t.r * t.a + acc.r * (1 - t.a),
        g: t.g * t.a + acc.g * (1 - t.a),
        b: t.b * t.a + acc.b * (1 - t.a),
        a: 1,
      }
    }
    acc.unparsed = unparsed
    return acc
  }

  // ── 双路检测 ────────────────────────────────────────────────
  // 单靠任一路径都有盲区，所以两条并用：
  //
  // A. 全视口网格点采样 —— 抓「没人画，于是露出白色画布」这一类
  //    （dock 透白的真实成因就是这个：该区域所有祖先都没有底色）。
  //    这条路必须走点采样，不能枚举元素：<html> 自己不画任何东西，
  //    但它的祖先链合成结果就是纯白，枚举元素会把整页误判成白块。
  //
  // B. 元素枚举 —— 抓「明明画了，但画成了白的」这一类
  //    （#ffffff 的块、白色的 gradient、伪元素上的白底）。
  //    这条路要求元素**自己确实画了东西**，否则就是容器、不算主体。
  //
  // 两路都用「中性亮色」判定：白/灰才报警，品牌色（#7FD4F2，色度 115）不报警。

  const isSuspect = (c) => lumRaw(c) > LIGHT_MIN && chromaOf(c) <= CHROMA_MAX

  // A. 网格点采样
  const COLS = 11
  const ROW_STEP = 12
  const rows = []
  for (let y = 3; y < vh - 2; y += ROW_STEP) {
    let bright = 0
    for (let i = 0; i < COLS; i++) {
      const x = Math.min(vw - 3, Math.max(3, Math.round((vw * i) / (COLS - 1))))
      const c = effective(document.elementFromPoint(x, y))
      if (isSuspect(c)) bright++
    }
    rows.push({ y, ratio: Math.round((bright / COLS) * 100) / 100 })
  }
  const hotRows = rows.filter((r) => r.ratio >= 0.6)
  // 连续热行才算「一条白带」：单行可能是边框或细分割线（<=12px）
  let longestRun = 0
  let runStart = null
  let bestRun = null
  let prevY = null
  for (const r of hotRows) {
    if (prevY === null || r.y - prevY > ROW_STEP) {
      longestRun = 1
      runStart = r.y
    } else {
      longestRun++
    }
    if (bestRun === null || longestRun > bestRun.rows) {
      bestRun = { rows: longestRun, from: runStart, to: r.y, px: longestRun * ROW_STEP }
    }
    prevY = r.y
  }

  // B. 元素枚举（只收自己确实画了底的元素）
  const panels = []
  const warnPanels = []
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 6) return
    const area =
      Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
    if (area < MIN_AREA) return
    const cs = getComputedStyle(el)
    const paints =
      (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
      (cs.backgroundImage && cs.backgroundImage !== 'none')
    if (!paints) return // 纯容器：不是「白块」主体
    const c = effective(el)
    // 含无法解析的图层（大多是 url() 背景图）：不能断言它是白块，
    // 只能列为「需要人工看一眼的存疑项」，不当 FAIL
    if (c.unparsed) {
      warnPanels.push({ bg: '含无法解析的背景层', area: Math.round(area), w: Math.round(r.width), h: Math.round(r.height), tag: tag(el) })
      return
    }
    if (!isSuspect(c)) return
    panels.push({
      l: Math.round(lumRaw(c) * 100) / 100,
      chroma: Math.round(chromaOf(c)),
      bg: rgbOf(c),
      area: Math.round(area),
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      tag: tag(el),
    })
  })
  const brightPanels = panels.sort((a, b) => b.area - a.area).slice(0, 6)

  const body = document.querySelector('uni-page-body')
  const canvas = document.querySelector('canvas')
  return {
    vw, vh,
    rootCls: root ? root.className : null,
    rootH: root ? Math.round(root.getBoundingClientRect().height) : 0,
    rootBg: root ? getComputedStyle(root).backgroundColor : null,
    bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : null,
    textLen: (body && body.innerText ? body.innerText : '').length,
    head: (body && body.innerText ? body.innerText : '').replace(/\\s+/g, ' ').slice(0, 80),
    canvas: canvas
      ? { w: canvas.width, h: canvas.height, cssW: Math.round(canvas.getBoundingClientRect().width) }
      : null,
    brightPanels,
    hotRows: hotRows.slice(0, 8),
    bestRun,
    warnPanels: warnPanels.slice(0, 5),
  }
})()`

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────
const puppeteer = await resolvePuppeteer()

let tokens
let memoryId = null
try {
  tokens = await login()
  memoryId = await firstMemoryId(tokens.accessToken)
} catch (e) {
  console.error(`[smoke] 后端不可用（${API}）：${e.message}`)
  console.error('       巡检需要登录态；先起后端再跑本脚本。')
  process.exit(2)
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true })
const results = []
let failCount = 0

try {
  for (const theme of THEMES) {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

    let logs = []
    const push = (s) => logs.push(s)
    page.on('console', (m) => {
      if (m.type() === 'error') push(`[error] ${m.text().slice(0, 200)}`)
      else if (m.type() === 'warning') push(`[warn] ${m.text().slice(0, 160)}`)
    })
    page.on('pageerror', (e) => push(`[PAGEERROR] ${(e.stack || e.message || '').slice(0, 400)}`))
    page.on('requestfailed', (r) => {
      const u = r.url()
      if (u.includes('favicon')) return
      push(`[reqfail] ${u.slice(0, 140)} :: ${r.failure()?.errorText || ''}`)
    })
    page.on('response', (r) => {
      const s = r.status()
      if (s >= 400 && !r.url().includes('favicon')) push(`[http${s}] ${r.url().slice(0, 140)}`)
    })

    await page.evaluateOnNewDocument(
      (at, rt, th) => {
        localStorage.setItem('theme_mode', th)
        localStorage.setItem('privacy_consent_accepted', 'true')
        localStorage.setItem('access_token', at)
        localStorage.setItem('refresh_token', rt)
      },
      tokens.accessToken,
      tokens.refreshToken,
      theme,
    )

    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise((r) => setTimeout(r, 1600))

    // 冷启动噪声单列：它不属于任何单个页面，但必须为零
    const bootLogs = logs.slice()
    logs = []

    for (const p of TARGETS) {
      let hash = `#/${p.path}`
      if (p.need === 'memoryId') {
        if (!memoryId) {
          results.push({ theme, path: p.path, name: p.name, status: 'SKIP', note: '后端无记忆数据，跳过' })
          continue
        }
        hash += `?id=${memoryId}`
      }
      await page.evaluate((h) => { window.location.hash = h }, hash)
      await new Promise((r) => setTimeout(r, p.wait || 1500))

      const info = await page.evaluate(AUDIT)
      const errs = logs.slice()
      logs = []

      // ── 断言 ──────────────────────────────────────────────
      // ★ 网络层错误必须带 URL 进明细，否则「400」三个字没法定位是哪个请求
      const isHard = (e) =>
        e.startsWith('[PAGEERROR]') || e.startsWith('[error]') ||
        e.startsWith('[http') || e.startsWith('[reqfail]')
      const issues = errs.filter(isHard)
      const notes = [] // 需要人看一眼、但不算失败的事项
      if (info.rootH < info.vh * 0.6) {
        issues.push(`页面根节点高度 ${info.rootH} < 视口 ${info.vh} 的 60%（疑似白屏/未铺满）`)
      }
      if (info.textLen < 10) {
        issues.push(`可视文本仅 ${info.textLen} 字（疑似空白页）`)
      }
      // A 路：出现了横跨 >=60% 宽度、且连续 >=2 行（>=24px 高）的中性亮色横带
      if (theme === 'dark' && info.bestRun && info.bestRun.rows >= 2) {
        issues.push(
          `深色下 y=${info.bestRun.from}~${info.bestRun.to} 有 ${info.bestRun.px}px 高的中性亮色横带` +
            `（各行亮色采样占比 ${info.hotRows.map((r) => r.ratio).join('/')}）`,
        )
      }
      // B 路：有元素自己画出了中性亮色的块
      if (theme === 'dark' && Array.isArray(info.brightPanels) && info.brightPanels.length > 0) {
        issues.push(
          `深色下 ${info.brightPanels.length} 个中性亮色面板：` +
            info.brightPanels
              .slice(0, 3)
              .map((b) => `${b.tag} ${b.w}x${b.h}@top${b.top} ${b.bg} (亮度${b.l}/色度${b.chroma})`)
              .join(' | '),
        )
      }
      if (Array.isArray(info.warnPanels) && info.warnPanels.length > 0) {
        notes.push(
          `${info.warnPanels.length} 个含无法解析背景层的大块（需人工确认）：` +
            info.warnPanels.slice(0, 2).map((w) => `${w.tag} ${w.w}x${w.h}`).join(' | '),
        )
      }

      const status = issues.length > 0 ? 'FAIL' : 'PASS'
      if (status === 'FAIL') failCount++

      if (SHOTS) {
        const file = resolve(OUT_DIR, `${theme}__${p.path.replace(/\//g, '_')}.png`)
        await page.screenshot({ path: file })
        info.shot = file
      }

      const rec = {
        theme, path: p.path, name: p.name, status,
        h: info.rootH, vh: info.vh, textLen: info.textLen,
        rootBg: info.rootBg, cls: info.rootCls,
        canvas: info.canvas,
        warn: errs.filter((e) => e.startsWith('[warn]')).length,
        issues,
        notes,
        shot: info.shot || null,
      }
      results.push(rec)
      console.log(
        `[${status}] ${theme.padEnd(5)} ${p.name.padEnd(14)} h=${info.rootH}/${info.vh} text=${info.textLen}` +
          (info.canvas ? ` canvas=${info.canvas.w}x${info.canvas.h}` : '') +
          (issues.length ? `\n        ↳ ${issues.join('\n        ↳ ')}` : '') +
          (notes.length ? `\n        · ${notes.join('\n        · ')}` : ''),
      )
    }

    if (bootLogs.length > 0) {
      const bad = bootLogs.filter((e) => e.startsWith('[PAGEERROR]') || e.startsWith('[error]'))
      if (bad.length > 0) {
        failCount++
        results.push({ theme, path: '(冷启动)', name: '冷启动', status: 'FAIL', issues: bad })
        console.log(`[FAIL] ${theme.padEnd(5)} 冷启动\n        ↳ ${bad.join('\n        ↳ ')}`)
      } else {
        console.log(`[PASS] ${theme.padEnd(5)} 冷启动（仅 ${bootLogs.length} 条 warn）`)
      }
    } else {
      console.log(`[PASS] ${theme.padEnd(5)} 冷启动（零噪声）`)
    }

    await page.close()
  }
} finally {
  await browser.close()
}

// ─────────────────────────────────────────────────────────────
// 报告
// ─────────────────────────────────────────────────────────────
const report = {
  at: new Date().toISOString(),
  base: BASE,
  api: API,
  themes: THEMES,
  total: results.length,
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  skip: results.filter((r) => r.status === 'SKIP').length,
  results,
}
const reportPath = resolve(OUT_DIR, 'report.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

console.log('\n─────────────────────────────────────────')
console.log(`总计 ${report.total} 项：PASS ${report.pass} / FAIL ${report.fail} / SKIP ${report.skip}`)
console.log(`报告：${reportPath}`)
if (SHOTS) console.log(`截图：${OUT_DIR}`)
console.log('─────────────────────────────────────────')

process.exit(failCount > 0 ? 1 : 0)
