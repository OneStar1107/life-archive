// core/utils/datetime.ts
// ══════════════════════════════════════════════════════════════
// 日期与时间文案
// ══════════════════════════════════════════════════════════════
//
// 为什么不用 new Date(str).toLocaleString()：
//   1. toLocaleString 在 Android 旧 WebView / 鸿蒙 ArkTS 上返回格式不一致，
//      同一份数据三个端会显示成「2026/10/3」「2026-10-03」「10月3日」三种样子。
//   2. 带时区偏移的字符串会被本地时区换算，跨时区用户看到的日期会整体偏一天。
//   所以这里全部走**字符串切片**：只取 ISO 串里我们自己看得懂的字段，
//   展示结果三端逐字一致，代价是「不做时区换算」——
//   而这恰好是我们要的：用户写「今天」时，日期本来就该是他写下那天的字面值。
//
// 唯一用到 Date 的地方是「现在几点」（问候语），那是本地时钟，不需要跨端一致。

/** 两位补零 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** 一~七（周一为 1，周日为 7） */
const WEEK_NAMES: string[] = ['一', '二', '三', '四', '五', '六', '日']

/** 从 ISO 串里取「日」部分：2026-10-03T08:21:00.000Z → 3 */
function dayOf(iso: string): number {
  // 前10 位是 YYYY-MM-DD，第 8、9 位是日的十位与个位
  if (iso.length < 10) return 0
  const s = iso.slice(8, 10)
  const n = parseInt(s, 10)
  return isNaN(n) ? 0 : n
}

/** 从 ISO 串里取「月」部分 → 10 */
function monthOf(iso: string): number {
  if (iso.length < 7) return 0
  const n = parseInt(iso.slice(5, 7), 10)
  return isNaN(n) ? 0 : n
}

/** 从 ISO 串里取「年」部分 → 2026 */
function yearOf(iso: string): number {
  if (iso.length < 4) return 0
  const n = parseInt(iso.slice(0, 4), 10)
  return isNaN(n) ? 0 : n
}

/** 从 ISO 串里取「时分」→ "08:21"；没有时分则返回空串 */
function timeOf(iso: string): string {
  if (iso.length < 16) return ''
  const hh = iso.slice(11, 13)
  const mm = iso.slice(14, 16)
  if (hh.length < 2 || mm.length < 2) return ''
  return `${hh}:${mm}`
}

/** 星期几：传ISO 串返回「周一」~「周日」；算不出返回空串 */
function weekOf(iso: string): string {
  if (iso.length < 10) return ''
  const y = yearOf(iso)
  const m = monthOf(iso)
  const d = dayOf(iso)
  if (y === 0 || m === 0 || d === 0) return ''
  // 以 UTC 构造，避免本地时区把「周一」推成「周日」
  const t = new Date(Date.UTC(y, m - 1, d))
  const idx = t.getUTCDay() // 0=周日
  const one = idx === 0 ? 7 : idx
  return `周${WEEK_NAMES[one - 1]}`
}

/** 列表用短时间：今天显示「08:21」，今年显示「10月3日」，跨年才带年份 */
export function shortTime(iso: string, nowIso: string): string {
  if (iso.length === 0) return ''
  const hm = timeOf(iso)
  if (isSameDay(iso, nowIso)) return hm
  const y = yearOf(iso)
  const ny = yearOf(nowIso)
  if (y !== ny && y !== 0) return `${y}年${monthOf(iso)}月${dayOf(iso)}日`
  return `${monthOf(iso)}月${dayOf(iso)}日`
}

/** 详情用完整时间：2026年10月3日 周六 08:21 */
export function fullTime(iso: string): string {
  if (iso.length === 0) return '时间未记录'
  const y = yearOf(iso)
  const m = monthOf(iso)
  const d = dayOf(iso)
  const w = weekOf(iso)
  const hm = timeOf(iso)
  let s = `${y}年${m}月${d}日`
  if (w.length > 0) s += ` ${w}`
  if (hm.length > 0) s += ` ${hm}`
  return s
}

/** 时间轴上的日期分组标题：2026年10月 */
export function monthTitle(iso: string): string {
  return `${yearOf(iso)}年${monthOf(iso)}月`
}

/** 今天 / 昨天 / 某天 */
export function dayLabel(iso: string, nowIso: string): string {
  if (iso.length === 0) return ''
  if (isSameDay(iso, nowIso)) return '今天'
  if (isSameDay(iso, yesterdayOf(nowIso))) return '昨天'
  const y = yearOf(iso)
  const ny = yearOf(nowIso)
  if (y !== ny && y !== 0) return `${y}年${monthOf(iso)}月${dayOf(iso)}日`
  return `${monthOf(iso)}月${dayOf(iso)}日`
}

/** 两个 ISO 串是否同一天（按字面年月日比对，不做时区换算） */
export function isSameDay(a: string, b: string): boolean {
  if (a.length < 10 || b.length < 10) return false
  return a.slice(0, 10) === b.slice(0, 10)
}

/** 昨天的字面日期（用 Date 只做「减一天」这种纯日历运算，不涉及时区） */
export function yesterdayOf(nowIso: string): string {
  const y = yearOf(nowIso)
  const m = monthOf(nowIso)
  const d = dayOf(nowIso)
  if (y === 0 || m === 0 || d === 0) return nowIso
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() - 1)
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

/** 逾期天数：dueAt早于今天则返回正数，否则 0 */
export function overdueDays(dueAt: string, nowIso: string): number {
  if (dueAt.length < 10) return 0
  const y = yearOf(dueAt)
  const m = monthOf(dueAt)
  const d = dayOf(dueAt)
  if (y === 0 || m === 0 || d === 0) return 0
  const due = Date.UTC(y, m - 1, d)
  const ny = yearOf(nowIso)
  const nm = monthOf(nowIso)
  const nd = dayOf(nowIso)
  if (ny === 0 || nm === 0 || nd === 0) return 0
  const now = Date.UTC(ny, nm - 1, nd)
  if (due >= now) return 0
  return Math.round((now - due) / 86400000)
}

/** 当前的本地时间，格式与后端 ISO 串一致：2026-10-03T08:21:00 */
export function nowIso(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`
  )
}

/** 今天的日期：2026-10-03（dailyStat 的 date 入参要这个格式） */
export function todayDate(): string {
  return nowIso().slice(0, 10)
}

/** 现在的「第 N 天」用不到绝对起点，改成按时段的问候更贴近产品调性 */
export function greetingOf(nowIsoStr: string): string {
  const hm = timeOf(nowIsoStr)
  if (hm.length < 5) return '你好'
  const h = parseInt(hm.slice(0, 2), 10)
  if (isNaN(h)) return '你好'
  if (h < 5) return '夜深了'
  if (h < 9) return '早安'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 23) return '晚上好'
  return '夜深了'
}
