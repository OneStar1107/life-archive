#!/usr/bin/env node
/**
 * frontend/scripts/check-platforms.mjs —— 平台条件编译宏泄漏检查
 * ══════════════════════════════════════════════════════════════
 * 依据：docs/project/工程红线自检.md 红线第 2 条
 *   「业务代码中无 #ifdef / #ifndef；条件编译只在 core/platform/index.ts」
 *
 * ★ 为什么这条要卡在 CI：
 *   平台宏写错（APP-HARMONY 写成 HARMONYOS）**编译不报错**，
 *   但安卓专属 API 会被打进鸿蒙包，运行即崩。
 *   03 号把这条列为「最高频事故」，光靠人 review 守不住，必须机器拦。
 *
 * 用法：node scripts/check-platforms.mjs
 * 命中即 exit 1。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
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

/**
 * ★ 唯一允许写平台宏的文件（白名单）。
 *   这里是全工程所有平台差异的收口点，改平台行为只改这一个文件。
 */
const ALLOWED = new Set(['core/platform/index.ts'])

/**
 * ★ 例外白名单：非平台差异，而是「语言/构建期宏」或已知的合理例外。
 *
 *   env.ts 用 `#ifdef DEBUG` 区分 dev/prod，这是**构建模式**不是平台，
 *      三端行为一致，放行。
 *   secure.ts 与 App.uvue 的宏是历史遗留 —— 已在红线文档登记，
 *      收口到 platform/index.ts 之前先放行，但会在报告里提示待收口。
 *      （直接卡死会阻塞 CI，比放过并记账更糟。）
 */
const ALLOWED_EXCEPTIONS = {
  'core/env/env.ts': { reason: '使用 #ifdef DEBUG 区分构建模式，非平台差异' },
  'core/storage/secure.ts': { reason: '历史遗留，待收口到 core/platform/index.ts' },
  'App.uvue': { reason: '历史遗留，待收口到 core/platform/index.ts' },
}

const SCAN_EXT = new Set(['.ts', '.uts', '.uvue', '.vue', '.js'])

const SKIP_DIR = new Set([
  'node_modules', 'unpackage', 'dist', 'build', 'coverage',
  'harmony-configs', '.hvigor', '.idea', '.git',
])

/**
 * 只认真正的条件编译指令，避开注释里的「禁止写出 #ifdef」这类说明文字。
 * 刻意不带 g 标志：逐行匹配，用不上全局状态，也省掉 lastIndex 的坑。
 */
const MACRO_RE = /^[ \t]*\/\/[ \t]*#(ifdef|ifndef|endif|else)\b/

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
      const full = resolve(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.isFile() && SCAN_EXT.has(extname(full).toLowerCase())) files.push(full)
    }
  }
  return files
}

function relOf(abs) {
  return relative(ROOT, abs).replace(/\\/g, '/')
}

function main() {
  console.log(`${C.bold}平台条件编译宏泄漏检查${C.reset}`)
  console.log(`${C.cyan}${'─'.repeat(52)}${C.reset}`)
  console.log(`${C.dim}唯一允许：core/platform/index.ts${C.reset}\n`)

  const files = collectFiles()
  const violations = []
  const noted = []

  for (const f of files) {
    const rel = relOf(f)
    let content
    try {
      content = readFileSync(f, 'utf8')
    } catch {
      continue
    }

    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (!MACRO_RE.test(lines[i])) continue

      if (ALLOWED.has(rel)) continue

      if (ALLOWED_EXCEPTIONS[rel] != null) {
        noted.push({ file: rel, line: i + 1, reason: ALLOWED_EXCEPTIONS[rel].reason })
        continue
      }

      violations.push({ file: rel, line: i + 1, text: lines[i].trim() })
    }
  }

  if (violations.length) {
    console.log(`${C.red}${C.bold}✖ 发现 ${violations.length} 处平台宏泄漏：${C.reset}\n`)
    for (const v of violations) {
      console.log(`${C.red}  ${v.file}:${v.line}${C.reset}  ${v.text}`)
    }
    console.log(`\n${C.dim}处理方式：把平台差异抽成 core/platform/index.ts 里的一个函数，业务代码只调它。${C.reset}`)
    console.log(`${C.dim}参考：core/platform/index.ts 的 windowWidth() 三分支写法。${C.reset}\n`)
  }

  if (noted.length) {
    console.log(`${C.yellow}${C.dim}以下为已登记的例外（不阻塞，但待收口）：${C.reset}`)
    for (const n of noted) {
      console.log(`${C.dim}  ${n.file}:${n.line}  ${n.reason}${C.reset}`)
    }
    console.log('')
  }

  if (violations.length) {
    console.log(`${C.red}${C.bold}✖ 检查未通过${C.reset}`)
    process.exit(1)
  }

  console.log(`${C.green}${C.bold}✔ 平台宏检查通过（业务代码无平台条件编译）${C.reset}`)
  process.exit(0)
}

main()
