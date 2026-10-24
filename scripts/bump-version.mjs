#!/usr/bin/env node
/**
 * scripts/bump-version.mjs —— 版本号单一源同步器
 *
 * 职责：
 *   1. 从 frontend/version.json 读取 versionName / versionCode
 *   2. versionCode 严格 +1（不大于上一版则报错退出）
 *   3. 同步写入 frontend/manifest.json 的 Android / iOS / 鸿蒙三处版本节点
 *   4. 同步写入 frontend/harmony-configs/AppScope/app.json5
 *   5. 打印 diff 供人工确认
 *
 * 用法：
 *   node scripts/bump-version.mjs patch     # 1.0.0 -> 1.0.1，versionCode +1
 *   node scripts/bump-version.mjs minor     # 1.0.1 -> 1.1.0，versionCode +1
 *   node scripts/bump-version.mjs major     # 1.1.0 -> 2.0.0，versionCode +1
 *   node scripts/bump-version.mjs patch --dry-run   # 只打印不写盘
 *
 * 铁律：只改 versionName 不改 versionCode 是华为与 Google Play 的明确驳回项。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const PATHS = {
  version: resolve(ROOT, 'frontend/version.json'),
  manifest: resolve(ROOT, 'frontend/manifest.json'),
  harmonyApp: resolve(ROOT, 'frontend/harmony-configs/AppScope/app.json5'),
  changelog: resolve(ROOT, 'docs/release/CHANGELOG.md'),
}

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

function fail(msg) {
  console.error(`${C.red}✖ 版本递增失败：${msg}${C.reset}`)
  process.exit(1)
}

function info(msg) {
  console.log(`${C.cyan}›${C.reset} ${msg}`)
}

function ok(msg) {
  console.log(`${C.green}✔${C.reset} ${msg}`)
}

function readJson(file, label) {
  if (!existsSync(file)) fail(`找不到 ${label}：${file}`)
  try {
    // version.json 与 manifest.json 是标准 JSON
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    fail(`${label} 不是合法 JSON —— ${e.message}`)
  }
}

/**
 * app.json5 / module.json5 是 JSON5（含注释与尾逗号），
 * 这里只做「保守的键值替换」，不整体反序列化，避免破坏注释。
 */
function patchJson5Version(file, versionName, versionCode) {
  if (!existsSync(file)) return null
  const before = readFileSync(file, 'utf8')
  let after = before

  // 形如  "versionCode": 100,  /  "versionName": "1.0.0"
  after = after.replace(/("versionCode"\s*:\s*)(\d+)/, `$1${versionCode}`)
  after = after.replace(/("versionName"\s*:\s*")([^"]*)(")/, `$1${versionName}$3`)

  return { before, after, changed: before !== after }
}

function main() {
  const args = process.argv.slice(2)
  const level = args.find((a) => ['patch', 'minor', 'major'].includes(a))
  const dryRun = args.includes('--dry-run')

  if (!level) {
    fail('未指定语义版本级别。用法：node scripts/bump-version.mjs <patch|minor|major> [--dry-run]')
  }

  const version = readJson(PATHS.version, 'frontend/version.json')
  const manifest = readJson(PATHS.manifest, 'frontend/manifest.json')

  const oldName = String(version.versionName)
  const oldCode = Number(version.versionCode)

  if (!/^\d+\.\d+\.\d+$/.test(oldName)) {
    fail(`versionName 非法："${oldName}"，必须是 x.y.z 形式`)
  }
  if (!Number.isInteger(oldCode) || oldCode <= 0) {
    fail(`versionCode 非法："${version.versionCode}"，必须是正整数`)
  }

  // ── 1. 计算新 versionName ──
  const [maj, min, pat] = oldName.split('.').map(Number)
  let newName
  if (level === 'major') newName = `${maj + 1}.0.0`
  else if (level === 'minor') newName = `${maj}.${min + 1}.0`
  else newName = `${maj}.${min}.${pat + 1}`

  // ── 2. 铁律：versionCode 必须严格递增 ──
  const newCode = oldCode + 1
  if (newCode <= oldCode) {
    fail(`versionCode 未严格递增：新 ${newCode} <= 旧 ${oldCode}。华为/Google Play 会直接驳回。`)
  }
  if (oldCode < Number(version.minVersionCode || 0)) {
    fail(`versionCode ${oldCode} 低于 minVersionCode ${version.minVersionCode}，疑似被回滚`)
  }

  console.log(`${C.bold}人生档案 · 版本递增${C.reset}  (${level})`)
  console.log(`${C.yellow}─${C.reset} `.repeat(46))
  console.log(`versionName : ${oldName}  →  ${C.green}${newName}${C.reset}`)
  console.log(`versionCode : ${oldCode}  →  ${C.green}${newCode}${C.reset}`)
  console.log(`${C.yellow}─${C.reset} `.repeat(46))

  if (dryRun) {
    info('--dry-run 模式，未写入任何文件')
    process.exit(0)
  }

  // ── 3. 写 version.json（唯一源）──
  version.versionName = newName
  version.versionCode = newCode
  version.updatedAt = new Date().toISOString().slice(0, 10)
  writeFileSync(PATHS.version, JSON.stringify(version, null, 2) + '\n', 'utf8')
  ok(`frontend/version.json  versionName=${newName}  versionCode=${newCode}`)

  // ── 4. 同步 manifest.json 三处 ──
  const dist = manifest['app-plus']?.distribute
  if (!dist) fail('manifest.json 缺少 app-plus.distribute 节点')

  dist.android && (dist.android.versionName = newName)
  dist.android && (dist.android.versionCode = newCode)
  dist.ios && (dist.ios.versionName = newName)
  dist.ios && (dist.ios.versionCode = newCode)

  if (!manifest['app-harmony']) fail('manifest.json 缺少 app-harmony 节点')
  manifest['app-harmony'].versionName = newName
  manifest['app-harmony'].versionCode = newCode

  // 顶层也保留一份，便于 HBuilderX 云打包面板直接读取
  manifest.versionName = newName
  manifest.versionCode = newCode

  writeFileSync(PATHS.manifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  ok('frontend/manifest.json  app-plus.distribute.android / app-plus.distribute.ios / app-harmony')

  // ── 5. 同步鸿蒙 AppScope/app.json5 ──
  const harmony = patchJson5Version(PATHS.harmonyApp, newName, newCode)
  if (harmony) {
    if (harmony.changed) {
      writeFileSync(PATHS.harmonyApp, harmony.after, 'utf8')
      ok('frontend/harmony-configs/AppScope/app.json5')
    } else {
      info('harmony-configs/AppScope/app.json5 已是目标版本，跳过（键名可能已改结构，请人工核对）')
    }
  } else {
    info('harmony-configs/AppScope/app.json5 尚不存在，跳过')
  }

  // ── 6. 打印 diff ──
  if (harmony) {
    console.log(`\n${C.bold}差异预览${C.reset}`)
    console.log(`${C.yellow}─${C.reset} `.repeat(46))
    const beforeLines = harmony.before.split('\n').filter((l) => /version(Name|Code)/.test(l))
    const afterLines = harmony.after.split('\n').filter((l) => /version(Name|Code)/.test(l))
    beforeLines.forEach((l, i) => {
      console.log(`${C.red}- ${l.trim()}${C.reset}`)
      console.log(`${C.green}+ ${(afterLines[i] || '').trim()}${C.reset}`)
    })
  }

  console.log(`\n${C.green}${C.bold}✔ 版本同步完成${C.reset}  versionName=${newName}  versionCode=${newCode}`)
  console.log(`${C.yellow}⚠ 提审前请确认：华为 / Google Play 均要求 versionCode 严格递增${C.reset}`)
}

main()
