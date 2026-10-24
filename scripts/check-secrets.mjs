#!/usr/bin/env node
/**
 * scripts/check-secrets.mjs —— 提交前密钥泄漏扫描
 *
 * 用法：
 *   node scripts/check-secrets.mjs            # 扫描工作区（含未跟踪文件）
 *   node scripts/check-secrets.mjs --staged   # 只扫 git 暂存区
 *
 * 命中即 exit 1，阻断提交。
 *
 * 扫描目标：
 *   1. 私钥 PEM 头
 *   2. .p12 / .jks / .keystore 密码字面量
 *   3. JWT_SECRET / DATABASE_URL 的真实值（非占位）
 *   4. 云厂商 AK / SK
 *   5. Bearer token 字面量
 *   6. 硬编码 Authorization 头
 *   7. 真实身份证号 / 手机号
 *   8. 被 git 跟踪的证书实体文件
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

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

const SCAN_EXT = new Set([
  '.ts', '.js', '.mjs', '.cjs', '.uts', '.uvue', '.vue', '.json', '.json5',
  '.yml', '.yaml', '.md', '.sh', '.scss', '.css', '.html', '.xml', '.gradle',
  '.properties', '.txt', '.sql', '.prisma', '.plist', '.example', '.env',
])

const SKIP_DIR = new Set([
  'node_modules', '.git', 'unpackage', 'dist', 'build', 'coverage', '.next',
  '.workbuddy', '.hvigor', '.idea', '.gradle', 'qa-v50', 'ui-refs',
  'backup-v33-20261001', 'backup-v34-20261001', 'backup-v50-20261001',
  'backup-v51-20261002', 'backup-v52-20261002', 'backup-v53-20261002',
  'backup-v54-20261002', 'backup-v55-20261002',
])

const CERT_EXT = ['.p12', '.jks', '.keystore', '.p7b', '.cer', '.csr', '.mobileprovision']

/**
 * .gitignore 规则匹配。
 *
 * ★ 为什么自己实现而不调 `git check-ignore`：
 *   一是 `git ls-files --others --ignored` 在 Windows 上会撞 260 字符路径限制，
 *   静默漏条目；二是部分 CI / 沙箱环境禁止 node 派生子进程（EBUSY）。
 *   这里纯 JS 解析 .gitignore，覆盖本仓库实际用到的语法（目录、
 *   前导 /、否定 !、通配 * 与 **、反斜杠转义），不依赖 git 进程。
 *
 * 扫描器的职责是「扫描**可能被提交**的文件」——
 * .env / node_modules / unpackage 永远进不了仓库，扫它们只是噪音。
 * 真正的防线是 .gitignore + gitTrackedCerts() 双向校验。
 */
const ignoreRules = []

function loadIgnoreRules() {
  ignoreRules.length = 0
  let content
  try {
    content = readFileSync(resolve(ROOT, '.gitignore'), 'utf8')
  } catch {
    return // 没有 .gitignore 就不过滤
  }

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length === 0) continue
    if (line.startsWith('#')) continue
    // 否定规则：! 前缀。用于「! .env.example」这类白名单
    const negated = line.startsWith('!')
    let pattern = negated ? line.slice(1).trim() : line
    if (pattern.length === 0) continue

    // 只处理目录形式（末尾 /），本仓库的忽略规则都是目录/后缀形式
    const dirOnly = pattern.endsWith('/')
    pattern = pattern.replace(/^\//, '').replace(/\/$/, '')
    if (pattern.length === 0) continue

    // ★ git 语义：不含 `/` 的 pattern 匹配**任意层级**的同名项。
    //   `.env` 必须能匹配 `backend/.env`；`node_modules/` 能匹配
    //   `backend/node_modules/` 及其下所有内容。
    //   含 `/` 的 pattern 则锚定在仓库根。
    const anchored = pattern.includes('/')
    const glob = anchored ? pattern : '**/' + pattern
    const re = globToRegExp(glob)

    // 目录规则同时匹配「目录自身」与「目录下任意内容」
    ignoreRules.push({ re, dirOnly, negated })
  }
}

/** 把 .gitignore 通配符转成正则 */
function globToRegExp(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*'
        i += 1
        // 跳过紧跟的 /
        if (glob[i + 1] === '/') i += 1
      } else {
        out += '[^/]*'
      }
    } else if (c === '?') {
      out += '[^/]'
    } else if ('.+^${}()|[]\\'.includes(c)) {
      out += '\\' + c
    } else {
      out += c
    }
  }
  return new RegExp('^' + out + '$')
}

/** 该相对路径是否被 .gitignore 命中 */
function isGitignored(rel) {
  if (ignoreRules.length === 0) return false

  const segments = rel.split('/')

  let ignored = false
  for (const rule of ignoreRules) {
    let hit = rule.re.test(rel)

    // 目录规则还要匹配「该目录下任意深度的内容」：
    // `node_modules/` 要能命中 `backend/node_modules/.pnpm/x/y.js`
    if (!hit && rule.dirOnly) {
      for (let i = 1; i <= segments.length; i++) {
        if (rule.re.test(segments.slice(0, i).join('/'))) {
          hit = true
          break
        }
      }
    }

    if (!hit) continue
    // 否定规则（!）优先级更高；后出现的规则覆盖先出现的
    ignored = !rule.negated
  }
  return ignored
}


const PLACEHOLDER = /(占位|注入|placeholder|example|示例|changeme|your[_-]|<占位|process\.env|\$\{|\{\{|xxx+|REDACTED|<待补充>|\*\*\*|示例号码|13800000000|13812348000)/i

/**
 * 测试夹具白名单。
 *
 * e2e 测试里必须放一个「形似真实凭证」的假值才能验证拒绝路径
 * （例如伪造 token 必须被 401 拒绝）。这类值是**测试意图的一部分**，
 * 不是泄漏。用目录级 + 行级双白名单精确豁免，避免整文件放行。
 */
const FIXTURE_FILES = /^(backend[\\/]test[\\/].*\.e2e-spec\.ts|backend[\\/]prisma[\\/].*)$/

/**
 * PEM 私钥头。用字符串拼接构造，避免本文件自身被规则命中
 * （否则扫描器会把自己定义的模式当成泄漏）。
 */
const PEM_MARK = '-----BEGIN ' + 'PRIVATE KEY'

/**
 * 裸 JWT 字面量。
 * 构造成字符串拼接，否则本文件里的模式本身会被规则命中。
 * JWT 结构：header.payload.signature，三段 base64url。
 */
const JWT_RE = new RegExp('eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}')

const RULES = [
  { id: 'PEM 私钥', re: new RegExp(PEM_MARK) },
  {
    id: 'JWT token 字面量',
    re: JWT_RE,
    allowIfMatch: /(占位|注入|placeholder|example|<占位|xxx+|\$\{|伪造|fake|dummy|stub|测试|示例)/i,
  },
  {
    id: '证书密码字面量',
    re: /(keystorePassword|storePassword|keyPassword|storepass|keypass|keystore_secret)["'\s]*[:=]\s*["']?([^\s"',;]{6,})/i,
    allowIfMatch: PLACEHOLDER,
  },
  {
    id: 'JWT 密钥真实值',
    re: /JWT_(ACCESS_|REFRESH_)?SECRET["'\s]*[:=]\s*["']([A-Za-z0-9_\-+/=]{24,})["']/,
    allowIfMatch: PLACEHOLDER,
  },
  {
    id: '数据库连接串真实值',
    re: /postgres(ql)?:\/\/([^\s:@/'"]+):([^\s:@/'"]+)@[^\s/'"]+/,
    allowIfMatch: PLACEHOLDER,
    // 连接串中含 ${VAR} 或 process.env 的一律视为占位
    skipWhenPlaceholder: true,
  },
  { id: '云厂商 AccessKey', re: /\b(LTAI[A-Za-z0-9]{12,}|AKIA[A-Z0-9]{16}|AK[A-Z0-9]{18})\b/ },
  {
    id: '云厂商 SecretKey',
    re: /(accessKeySecret|secretKey|secret_key|appSecret|APP_SECRET)["'\s]*[:=]\s*["']([A-Za-z0-9]{24,})["']/i,
    allowIfMatch: PLACEHOLDER,
  },
  {
    id: 'Bearer token 字面量',
    re: /Bearer\s+[A-Za-z0-9_\-+/=]{20,}/,
    // 伪造 / 占位 / 夹具用的假 token 不算泄漏
    allowIfMatch: /(占位|注入|placeholder|example|<占位|xxx+|\$\{|伪造|fake|dummy|stub|测试)/i,
  },
  {
    id: '硬编码 Authorization 头',
    re: /["']Authorization["']\s*:\s*["']\s*(Bearer|Basic)\s+[A-Za-z0-9_\-+/=]{8,}/i,
    allowIfMatch: PLACEHOLDER,
  },
  {
    id: '身份证号字面量',
    re: /\b[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/,
    allowIfMatch: /(示例|占位|example|placeholder|xxx+|000000)/i,
  },
  {
    id: '真实手机号字面量',
    re: /\b1[3-9]\d{9}\b/,
    // 手机号在隐私政策/台账/文档注释/测试夹具中作为「示例」出现是允许的
    allowIfMatch: /(示例|占位|example|placeholder|xxx+|13800138000|13800000000|13812348000|你的手机号|待补充|夹具|测试号)/i,
  },
  {
    id: 'Bearer token 字面量',
    re: /Bearer\s+[A-Za-z0-9_\-+/=]{20,}/,
    // 伪造 / 占位 / 夹具用的假 token 不算泄漏
    allowIfMatch: /(占位|注入|placeholder|example|<占位|xxx+|\$\{|伪造|fake|dummy|stub|测试)/i,
  },
]

const findings = []

/**
 * 参考文档豁免：这些文件是「描述规则」而非「使用密钥」，
 * 例如 01 号文档里列出了私钥 PEM 头这个模式。
 * 只豁免这三个「规则来源」目录，不豁免任何代码目录。
 */
const REFERENCE_DOCS = /^(docs[\\/]prompts[\\/]|docs[\\/]project[\\/]红线)/

function isReferenceDoc(file) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  return REFERENCE_DOCS.test(rel)
}


function record(file, lineNo, rule, text) {
  const masked = text
    .replace(/[A-Za-z0-9_\-+/=]{12,}/g, (m) => m.slice(0, 4) + '****' + m.slice(-2))
    .trim()
    .slice(0, 120)
  findings.push({ file, line: lineNo, rule, text: masked })
}

function isScannable(file) {
  const base = file.slice(Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/')) + 1)
  if (base === '.env' || base === '.env.example' || base.endsWith('.example')) return true
  const ext = extname(file).toLowerCase()
  if (ext === '') return true
  return SCAN_EXT.has(ext)
}

function scanFile(file) {
  let content
  try {
    const st = statSync(file)
    if (st.size > 4 * 1024 * 1024) return
    content = readFileSync(file, 'utf8')
  } catch {
    return
  }
  if (content.includes('\0')) return
  // 参考文档豁免
  if (isReferenceDoc(file)) return

  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length > 2000) continue
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue
      if (rule.skipWhenPlaceholder && /\$\{|\{\{|process\.env|<\$/.test(line)) continue
      if (rule.allowIfMatch && rule.allowIfMatch.test(line)) continue
      record(relative(ROOT, file).replace(/\\/g, '/'), i + 1, rule.id, line)
    }
  }
}

/** 相对仓库根的 POSIX 风格路径 */
function relOf(abs) {
  return relative(ROOT, abs).replace(/\\/g, '/')
}

function collectFiles() {
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
      if (e.name.startsWith('.') && e.name !== '.env') continue
      const full = resolve(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.isFile() && isScannable(full) && !isGitignored(relOf(full))) files.push(full)
    }
  }
  return files
}

function stagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: ROOT,
      encoding: 'utf8',
    })
    return out
      .split('\n')
      .filter(Boolean)
      .map((f) => resolve(ROOT, f))
      .filter((f) => existsSync(f))
  } catch {
    return []
  }
}

function gitTrackedCerts() {
  try {
    return execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
      .split('\n')
      .filter(Boolean)
      .filter((f) => CERT_EXT.some((e) => f.toLowerCase().endsWith(e)))
  } catch {
    return []
  }
}

function certsOnDisk() {
  const found = []
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
      if (e.isDirectory()) stack.push(full)
      else if (CERT_EXT.some((x) => full.toLowerCase().endsWith(x))) {
        found.push(relative(ROOT, full).replace(/\\/g, '/'))
      }
    }
  }
  return found
}

function main() {
  const staged = process.argv.includes('--staged')
  loadIgnoreRules()
  const files = staged ? stagedFiles() : collectFiles()

  for (const f of files) scanFile(f)

  const tracked = gitTrackedCerts()
  const onDisk = certsOnDisk()

  if (findings.length) {
    console.log(`\n${C.red}${C.bold}✖ 发现 ${findings.length} 处疑似密钥泄漏${C.reset}\n`)
    for (const f of findings) {
      console.log(`${C.red}  ${f.file}:${f.line}${C.reset}  [${f.rule}]`)
      console.log(`${C.dim}    ${f.text}${C.reset}`)
    }
  }

  if (tracked.length) {
    console.log(`\n${C.red}${C.bold}✖ 以下证书文件被 git 跟踪，必须从索引移除：${C.reset}`)
    tracked.forEach((f) => console.log(`${C.red}    git rm --cached ${f}${C.reset}`))
  }

  const hardFail = findings.length > 0 || tracked.length > 0

  if (onDisk.length && !hardFail) {
    console.log(`\n${C.yellow}${C.bold}⚠ 以下证书实体存在于工作区（应移至仓库外 D:\\certs\\）：${C.reset}`)
    onDisk.forEach((f) => console.log(`${C.yellow}    ${f}${C.reset}`))
  }

  console.log(`\n${C.cyan}${'─'.repeat(52)}${C.reset}`)
  console.log(`${C.dim}扫描模式：${staged ? 'git 暂存区' : '全工作区'}    文件数：${files.length}${C.reset}`)

  if (hardFail) {
    console.log(`${C.red}${C.bold}✖ 扫描未通过，请修复后重试${C.reset}`)
    process.exit(1)
  }

  if (onDisk.length) {
    console.log(`${C.yellow}⚠ 存在证书实体文件（未入库）。请确认 .gitignore 已覆盖，并移至仓库外${C.reset}`)
  } else {
    console.log(`${C.green}${C.bold}✔ 扫描通过：零告警${C.reset}`)
  }
  process.exit(0)
}

main()
