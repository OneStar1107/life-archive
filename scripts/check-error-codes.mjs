#!/usr/bin/env node
/**
 * scripts/check-error-codes.mjs —— 前后端错误码同源校验
 *
 * 依据 00 号总控约束第 ⑨ 条与 05 号 T7：
 *   「禁止前端自定义新的错误码数字，需要新码时必须回后端加。」
 *
 * 本脚本解析：
 *   后端：backend/src/common/constants/error-codes.ts   （ERROR_CODE_TABLE）
 *   前端：frontend/core/http/error-code.ts              （ERROR_CODE）
 * 逐条比对数值与中文文案，任一不一致即 exit 1。
 *
 * 用法：node scripts/check-error-codes.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const BACKEND = resolve(ROOT, 'backend/src/common/constants/error-codes.ts')
const FRONTEND = resolve(ROOT, 'frontend/core/http/error-code.ts')

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

/** 解析 `10001: '文案',` 形式的条目 */
function parseEntries(src) {
  const map = new Map()
  const re = /(?:^|\n)\s*(?:\/\/.*\n\s*)?(\d{4,5}|[A-Z_]{3,}):\s*'([^']*)'/g
  let m
  while ((m = re.exec(src)) !== null) {
    map.set(m[1], m[2])
  }
  return map
}

function main() {
  console.log(`${C.bold}人生档案 · 前后端错误码同源校验${C.reset}`)
  console.log(`${C.cyan}${'─'.repeat(52)}${C.reset}`)

  for (const [label, file] of [
    ['后端 error-codes.ts', BACKEND],
    ['前端 error-code.ts', FRONTEND],
  ]) {
    if (!existsSync(file)) {
      console.log(`${C.red}✖ 找不到 ${label}：${relative(ROOT, file)}${C.reset}`)
      process.exit(1)
    }
  }

  const backMap = parseEntries(readFileSync(BACKEND, 'utf8'))
  const frontMap = parseEntries(readFileSync(FRONTEND, 'utf8'))

  console.log(`后端条目：${C.cyan}${backMap.size}${C.reset}    前端条目：${C.cyan}${frontMap.size}${C.reset}\n`)

  const problems = []

  // 1. 前端多出来的数字（前端自定义了新码 —— 明确禁止）
  for (const [code, msg] of frontMap) {
    if (/^[A-Z_]+$/.test(code)) continue // 纯前端网络层常量（NETWORK_ERROR 等）不算业务码
    if (!backMap.has(code)) {
      problems.push(`前端存在后端没有的错误码 ${code} = "${msg}"（禁止前端自定义数字）`)
    }
  }

  // 2. 数值与文案必须逐条一致
  for (const [code, backMsg] of backMap) {
    if (!frontMap.has(code)) {
      problems.push(`后端错误码 ${code} = "${backMsg}" 在前端缺失`)
      continue
    }
    if (frontMap.get(code) !== backMsg) {
      problems.push(
        `文案不一致 ${code}：后端 "${backMsg}" vs 前端 "${frontMap.get(code)}"`,
      )
    }
  }

  if (problems.length) {
    console.log(`${C.red}${C.bold}✖ 错误码未同源，共 ${problems.length} 处问题：${C.reset}\n`)
    problems.forEach((p) => console.log(`${C.red}  · ${p}${C.reset}`))
    console.log(`\n${C.red}${C.bold}✖ 校验未通过${C.reset}`)
    process.exit(1)
  }

  console.log(`${C.green}${C.bold}✔ 前后端错误码完全一致（${backMap.size} 条业务码）${C.reset}`)
  process.exit(0)
}

main()
