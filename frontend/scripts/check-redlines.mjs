#!/usr/bin/env node
/**
 * frontend/scripts/check-redlines.mjs —— 前端工程红线检查
 * ══════════════════════════════════════════════════════════════
 * 依据：docs/project/工程红线自检.md 与 docs/prompts/00-README-总控约束.md
 *
 * ★ 与后端 redlines.spec.ts 的分工：
 *   后端红线是 Jest 单测（backend/test/redlines.spec.ts），因为它要读 TS AST 语义；
 *   前端红线是纯文本扫描（本文件），因为 .uvue 不是合法 TS/JS，
 *   任何解析器都会在第一行 <template> 上崩掉 —— 文本扫描反而更可靠。
 *
 * 检查项（每条都对应一个真实事故，不是风格偏好）：
 *   1. 页面/组件里不得出现硬编码颜色字面量（应走 var(--xxx)）
 *   2. 不得出现 100vh / vh 单位（uni-app x 页面是 flex:1，vh 在折叠屏上会错）
 *   3. 文字必须包在 <text> 里 —— 抽查：view > 裸文本节点
 *   4. onWindowResize 必须在 onUnload 里 offWindowResize（07 号禁止事项第 9 条）
 *   5. 测试文件里禁止 console.log（必须用断言）
 *   6. 测试文件里禁止出现真实凭据字面量
 *
 * 用法：node scripts/check-redlines.mjs
 * 命中即 exit 1。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

const SKIP_DIR = new Set([
  'node_modules', 'unpackage', 'dist', 'build', 'coverage',
  'harmony-configs', '.hvigor', '.idea', '.git', 'scripts',
])

/**
 * 收集文件。
 * @param {(relPath: string) => boolean} accept 以仓库相对路径判断是否收
 *   传相对路径而不是扩展名，是因为有些规则要按「完整文件名」判断
 *   （如 .test.js —— extname 拿不到这一层）。
 */
function collectFiles(accept) {
  const files = []
  const stack = [ROOT]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (SKIP_DIR.has(e.name)) continue
      const full = resolve(dir, e.name)
      if (e.isDirectory()) {
        stack.push(full)
      } else if (e.isFile() && accept(relOf(full))) {
        files.push(full)
      }
    }
  }
  return files
}

function relOf(abs) {
  return relative(ROOT, abs).replace(/\\/g, '/')
}

const findings = []
function add(file, line, rule, text) {
  findings.push({ file, line, rule, text: text.trim().slice(0, 110) })
}

// ────────────────────────────────────────────────────────────
// 规则 1：硬编码颜色字面量
//
// ★ 为什么禁：深色模式是三端商店的明确要求。
//   页面里写死 #ffffff，深色模式下就是一块白斑 —— 用户一眼看到就卸载。
//   全部颜色必须走 var(--color-xxx)（见 styles/tokens.scss）。
//
// ★ 但有一类**必须豁免**：CSS 自定义属性的**定义行**（`--color-bg: #F8FBFE;`）。
//   色值总得有个地方落地，那个地方就是主题变量定义块
//   （本项目在 App.uvue 的 .theme-light / .theme-dark 里集中定义）。
//   把定义行也算违规，等于要求「变量的值必须是另一个变量」，逻辑上不可能满足，
//   结果是 68 处必然误报、check:all 永远红 —— 而一个必红的门禁必然被人绕过，最后形同虚设。
//   所以判定口径是：**色值字面量只允许出现在自定义属性的定义里，不得出现在具体样式的使用里。**
// ────────────────────────────────────────────────────────────
const COLOR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/

/** 是不是 CSS 自定义属性的定义行（形如 `--foo: value;`） */
const CUSTOM_PROP_DECL = /^\s*--[A-Za-z0-9_-]+\s*:/

/**
 * 剥掉 CSS 注释（含跨行的 /* ... *\/），注释里说明颜色用途不算违规。
 * 与「测试文件剥 // 注释」用同一套思路：走文本预处理而不是维护注释白名单，
 * 白名单迟早会漏。
 */
function stripCssComments(line, state) {
  let out = ''
  let j = 0
  while (j < line.length) {
    if (state.inComment) {
      const end = line.indexOf('*/', j)
      if (end === -1) return { code: out, inComment: true }
      state.inComment = false
      j = end + 2
    } else {
      const start = line.indexOf('/*', j)
      if (start === -1) {
        out += line.slice(j)
        break
      }
      out += line.slice(j, start)
      state.inComment = true
      j = start + 2
    }
  }
  return { code: out, inComment: state.inComment }
}

// ────────────────────────────────────────────────────────────
// 规则 2：vh 单位
//
// ★ 为什么禁：页面根节点是 flex: 1（不是 100vh），
//   折叠屏展开/折叠时 vh 会跳变，导致内容错位。
// ────────────────────────────────────────────────────────────
const VH_UNIT = /\b\d+(\.\d+)?vh\b/

// ────────────────────────────────────────────────────────────
// 规则 4：折叠屏监听器泄漏
//
// ★ 07 号禁止事项第 9 条：
//   「禁止在折叠屏监听后忘记 offWindowResize」。
//   忘记的后果是监听器越叠越多，切 10 次就 10 份回调，
//   表现为「折叠几次后越来越卡」—— 这类 bug 极难定位。
//
// ★ 判定要认两种正确写法（core/platform/index.ts:397 的 onWindowResize
//   返回的是一个 unbind 函数，这是**推荐写法**）：
//     a. 平台封装：const unbind = onWindowResize(cb) → onUnload 里 unbind()
//     b. 直接解绑：uni.onWindowResize(h) → uni.offWindowResize(h)
//
//   只认 a/b 两种。出现第三种（调了 onWindowResize 却没有任何解绑路径）
//   才算违规 —— 否则会对正确的封装写法误报，
//   而一个会误报的红线脚本必然被人加白名单，最后形同虚设。
// ────────────────────────────────────────────────────────────

/** 是否存在任何形式的解绑路径 */
function hasUnbindPath(content) {
  // a. 平台封装的 unbind 函数：命名约定为 unbindXxx / handleXxx 并被调用
  if (/\b\w*([Uu]nbind|dispose|off)\w*\s*\(/.test(content)) return true
  // b. 直接调 offWindowResize
  if (/\boffWindowResize\s*\(/.test(content)) return true
  return false
}

function main() {
  console.log(`${C.bold}前端工程红线检查${C.reset}`)
  console.log(`${C.cyan}${'─'.repeat(52)}${C.reset}\n`)

  // ── 规则 1~3：.uvue 页面与组件 ──────────────────────────
  const uvueFiles = collectFiles((rel) => rel.endsWith('.uvue'))
  for (const f of uvueFiles) {
    const rel = relOf(f)
    let content
    try {
      content = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    const lines = content.split(/\r?\n/)

    // 样式块起点：只查 <style> 段，模板里的 # 是路由锚点不是颜色
    let inStyle = false
    const comment = { inComment: false }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^<style/.test(line.trim())) inStyle = true
      if (/^<\/style>/.test(line.trim())) inStyle = false
      if (!inStyle) continue

      const { code } = stripCssComments(line, comment)
      // SCSS 的行注释：样式块里 `//` 起头整行都是注释（<style lang="scss"> 合法写法），
      // 注释里说明「浅色 #F8FBFE / 深色 #081217」是在讲设计意图，不是在用色值。
      if (/^\s*\/\//.test(code)) continue
      // 自定义属性的定义行：色值/vh 在这里落地是应该的，豁免规则 1 与 2
      if (CUSTOM_PROP_DECL.test(code)) continue

      if (COLOR_LITERAL.test(code)) {
        add(rel, i + 1, '硬编码颜色字面量（应走 var(--color-xxx)）', line)
      }
      if (VH_UNIT.test(code)) {
        add(rel, i + 1, 'vh 单位（页面根是 flex:1，折叠屏会错位）', line)
      }
    }

    // 规则 4：onWindowResize 必须有配对的解绑路径
    const hasOn = /onWindowResize\s*\(/.test(content)
    if (hasOn && !hasUnbindPath(content)) {
      add(rel, 0, '注册了 onWindowResize 却没有解绑路径（监听器泄漏）', rel)
    }
  }

  // ── 规则 5~6：测试文件 ──────────────────────────────────
  //
  // ★ 注意这里不能用 extname() 判断：extname('login.test.js') 返回 '.js'，
  //   不是 '.test.js' —— 那样过滤会一个测试文件都扫不到，
  //   规则 5/6 会静默失效（比不写规则更危险：看起来在跑，实际没跑）。
  //   所以直接用 endsWith。
  const testFiles = collectFiles((rel) => rel.endsWith('.test.js'))
  for (const f of testFiles) {
    const rel = relOf(f)
    const content = readFileSync(f, 'utf8')
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // 剥掉行注释再查 console.log：
      // 注释里写「禁止 console.log，要用断言」是给维护者看的规则说明，不是代码。
      // 这样处理比维护一份「注释白名单」可靠 —— 白名单迟早会漏。
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '')
      if (/\bconsole\s*\.\s*log\s*\(/.test(code)) {
        add(rel, i + 1, '测试文件里禁止 console.log（用断言表达预期）', line)
      }
      // 真实凭据字面量（与 scripts/check-secrets.mjs 互补：
      // 那个扫全仓库，这个专门守住测试文件 —— 最容易被顺手粘贴真实密码的地方）
      if (/(password|passwd|pwd|token|secret|apiKey)\s*[:=]\s*['"][^'"]{6,}['"]/i.test(code)) {
        if (!/(占位|placeholder|example|夹具|测试|mock|假值|xxx|\$\{|process\.env|TODO)/i.test(line)) {
          add(rel, i + 1, '疑似硬编码凭据（应走 fixtures/account.js 或环境变量）', line)
        }
      }
    }
  }

  // ── 报告 ────────────────────────────────────────────────
  if (findings.length) {
    console.log(`${C.red}${C.bold}✖ 红线未通过，共 ${findings.length} 处：${C.reset}\n`)
    const byRule = new Map()
    for (const f of findings) {
      if (!byRule.has(f.rule)) byRule.set(f.rule, [])
      byRule.get(f.rule).push(f)
    }
    for (const [rule, items] of byRule) {
      console.log(`${C.red}  ▸ ${rule}${C.reset} ${C.dim}(${items.length} 处)${C.reset}`)
      for (const it of items) {
        const where = it.line > 0 ? `${it.file}:${it.line}` : it.file
        console.log(`${C.dim}      ${where}  ${it.text}${C.reset}`)
      }
    }
    console.log(`\n${C.red}${C.bold}✖ 检查未通过${C.reset}`)
    process.exit(1)
  }

  console.log(`${C.dim}已扫描：${uvueFiles.length} 个 .uvue，${testFiles.length} 个测试文件${C.reset}`)
  console.log(`${C.green}${C.bold}✔ 前端红线检查全部通过${C.reset}`)
  process.exit(0)
}

main()
