/**
 * test/redlines.spec.ts
 * ══════════════════════════════════════════════════════════════
 * 后端工程红线自检（★ 本文件在 CI 中真实执行并必须全绿）
 * ══════════════════════════════════════════════════════════════
 *
 * 依据：docs/project/工程红线自检.md 与 docs/prompts/00-README-总控约束.md
 *
 * ────────────────────────────────────────────────────────────
 * ★ 为什么红线要做成单测，而不是写进文档
 * ────────────────────────────────────────────────────────────
 *
 * 文档里的规矩会被绕过，单测不会。这三条红线每一条都对应一个
 * **已经发生过或必然会发生**的线上事故：
 *
 * 1. 禁止裸 `throw new Error()`
 *    后果：全局异常过滤器（AllExceptionFilter）拿不到错误码，
 *    只能归一化成 90003「开小差了」。用户看到的是无意义的文案，
 *    排查时日志里也没有业务码，等于线索全断。
 *    而且 HTTP 状态码会变成 500 而不是对应的 4xx，
 *    前端的 shouldRetry 会把参数错误也拿去重试。
 *
 * 2. 控制器不自己包 `Result<T>`
 *    后果：与 ResponseInterceptor 双重包装，
 *    前端拿到 `{ code: 0, data: { code: 0, data: ... } }`，
 *    所有页面在真机上取不到数据 —— 而后端接口测试全绿，
 *    因为 supertest 断的是 HTTP 层，看不到这层结构问题。
 *
 * 3. 错误码必须是合法五位数字
 *    后果：写错成 4 位或 6 位时，错误码在前后端的区间判定里
 *    （如 `code >= 20000 && code < 30000`）会落到错误的分支。
 *    比如把 30001 写成 3001，它就不再被识别为权限错误，
 *    也不会触发跳登录，行为完全不可预期。
 *
 * ────────────────────────────────────────────────────────────
 * ★ 本文件不做类型检查，只做文本与结构扫描
 * ────────────────────────────────────────────────────────────
 *
 * 刻意不用 AST 解析：这三条规则的判定依据是「文本里有没有这个模式」，
 * 而 AST 解析会漏掉注释里的话术、字符串里的拼接，反而更不可靠。
 * 文本扫描 + 精确的排除清单，是这里更稳的做法。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, relative, extname } from 'node:path'

/** backend/ 目录 */
const BACKEND_ROOT = resolve(__dirname, '..')
/** 被扫描的源码根 */
const SRC_ROOT = join(BACKEND_ROOT, 'src')

/** 递归收集 src 下的所有 .ts 文件 */
function collectTsFiles(dir: string = SRC_ROOT): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full))
    } else if (entry.isFile() && extname(entry.name) === '.ts') {
      out.push(full)
    }
  }
  return out
}

/** 相对 backend/ 的 POSIX 路径，用于报错时好定位 */
function rel(p: string): string {
  return relative(BACKEND_ROOT, p).replace(/\\/g, '/')
}

interface Hit {
  file: string
  line: number
  text: string
}

/**
 * 剥掉注释后再匹配。
 *
 * ★ 为什么必须剥：源码里有大量「禁止 throw new Error()」这样的规则说明注释，
 *   不剥的话每条都会误报，规则直接失效（加了白名单就会被绕过）。
 *   剥注释用逐行状态机而不是正则整体替换 —— 正则处理不了
 *   「字符串里含双斜杠」与「多行块注释的收尾」这两种边界。
 *   （★ 写这个注释时不要在块注释内出现块注释的结束符，否则会提前闭合。）
 */
function stripComments(src: string): string {
  const lines = src.split(/\r?\n/)
  const out: string[] = []
  let inBlock = false

  for (const raw of lines) {
    if (inBlock) {
      const end = raw.indexOf('*/')
      if (end >= 0) {
        inBlock = false
        out.push(raw.slice(end + 2).replace(/^\s*/, ''))
      } else {
        out.push('')
      }
      continue
    }

    // 行注释：从 // 到行尾。但要避开字符串里的 //
    const lineComment = findLineCommentStart(raw)
    const line = lineComment >= 0 ? raw.slice(0, lineComment) : raw

    const blockStart = line.indexOf('/*')
    if (blockStart >= 0) {
      const blockEnd = line.indexOf('*/', blockStart + 2)
      if (blockEnd >= 0) {
        out.push(line.slice(0, blockStart) + line.slice(blockEnd + 2))
      } else {
        out.push(line.slice(0, blockStart))
        inBlock = true
      }
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

/** 找行注释起始位置，跳过字符串字面量里的 // */
function findLineCommentStart(line: string): number {
  let inSingle = false
  let inDouble = false
  let inBacktick = false

  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i]
    const next = line[i + 1]

    if (c === '\\') {
      i++ // 跳过转义字符
      continue
    }
    if (c === "'" && !inDouble && !inBacktick) inSingle = !inSingle
    else if (c === '"' && !inSingle && !inBacktick) inDouble = !inDouble
    else if (c === '`' && !inSingle && !inDouble) inBacktick = !inBacktick
    else if (c === '/' && next === '/' && !inSingle && !inDouble && !inBacktick) {
      return i
    }
  }
  return -1
}

/**
 * 排除清单：这些文件里的 throw new Error() 是**允许的**。
 *
 * ★ 每一条排除都必须写明「为什么允许」，否则将来会变成
 *   「不知道当初为什么加的，也不敢删」的死代码豁免。
 */
const THROW_EXCLUSIONS: Record<string, string> = {
  // 启动期配置校验：此时应用还没起来，抛原生 Error 让进程退出是正确行为。
  // 走 AllExceptionFilter 反而会打印一个无意义的 JSON 响应。
  'src/config/validation.ts': '启动期配置校验，抛原生 Error 让进程退出是正确的',
  // 配置文件里同样不做业务错误处理。
  'src/config/configuration.ts': '配置文件，无业务逻辑',
  // 入口引导：UPLOAD_ROOT 校验失败要阻止启动。
  'src/main.ts': '启动引导期校验，失败即退出',
}

/** 排除测试文件自身 */
function isTestFile(p: string): boolean {
  const name = rel(p)
  return name.endsWith('.spec.ts') || name.endsWith('.e2e-spec.ts')
}

// ══════════════════════════════════════════════════════════════
describe('后端红线自检', () => {
  const allFiles = collectTsFiles()

  // ────────────────────────────────────────────────────────
  describe('红线 1：禁止裸 throw new Error()', () => {
    /**
     * 业务代码里每个 throw 都必须带错误码。
     * 裸 throw new Error() 会被 AllExceptionFilter 归一化成 90003，
     * 用户看到「开小差了」，日志里也没有业务码可查。
     */
    it('src 下不存在裸 throw new Error()', () => {
      const hits: Hit[] = []

      for (const file of allFiles) {
        const relPath = rel(file)
        if (isTestFile(file)) continue
        if (THROW_EXCLUSIONS[relPath] != null) continue

        const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/)
        lines.forEach((line, i) => {
          if (/throw\s+new\s+Error\s*\(/.test(line)) {
            hits.push({ file: relPath, line: i + 1, text: line.trim() })
          }
        })
      }

      if (hits.length > 0) {
        const detail = hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join('\n')
        throw new Error(
          `发现 ${hits.length} 处裸 throw new Error()：\n${detail}\n\n` +
            '改法：抛 BusinessException(错误码) 或 AuthException(错误码)，\n' +
            '让 AllExceptionFilter 能拿到业务码与正确的 HTTP 状态码。\n' +
            '裸 throw 会把一切业务失败变成 90003「开小差了」，线索全断。',
        )
      }

      expect(hits).toEqual([])
    })

    it('排除清单里的文件确实存在（防止写了无效豁免）', () => {
      // ★ 这条是给未来的自己看的：
      //   如果某个文件被重构删了/改名了，豁免就变成一句空话，
      //   而没人会去检查一个「看起来还在」的白名单。
      const stale = Object.keys(THROW_EXCLUSIONS).filter((p) => !existsSync(join(BACKEND_ROOT, p)))
      expect({ staleExemptions: stale }).toEqual({ staleExemptions: [] })
    })

    it('确实扫到了文件（防止路径写错导致空跑通过）', () => {
      // ★ 空跑通过是最危险的失败模式：规则看起来在跑，
      //   实际一个文件都没读到，等于没有门禁。
      expect(allFiles.length).toBeGreaterThan(30)
    })
  })

  // ────────────────────────────────────────────────────────
  describe('红线 2：控制器不自己包 Result<T>', () => {
    /**
     * ResponseInterceptor 已经在最外层包了 { code, message, data, traceId }。
     * 控制器再包一次就成了双重包装，前端取不到数据。
     *
     * ★ 注意排除 PageResult<T>：那是分页**数据体**的类型
     *   （list / total / page / hasNext），不是响应信封，
     *   控制器返回它是完全正确的。
     */
    it('所有 controller 都不自行包装 Result<T>', () => {
      const controllers = allFiles.filter((f) => f.endsWith('.controller.ts'))
      expect(controllers.length).toBeGreaterThan(5)

      const hits: Hit[] = []
      for (const file of controllers) {
        const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/)
        lines.forEach((line, i) => {
          // 负向先行：PageResult / ResultDto 都不是违规
          const cleaned = line.replace(/PageResult/g, '').replace(/ResultDto/g, '')
          if (/(Promise<\s*)?Result</.test(cleaned)) {
            hits.push({ file: rel(file), line: i + 1, text: line.trim() })
          }
        })
      }

      if (hits.length > 0) {
        const detail = hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join('\n')
        throw new Error(
          `控制器自行包装了 Result<T>（${hits.length} 处）：\n${detail}\n\n` +
            '响应信封由 ResponseInterceptor 统一生成，控制器只返回业务数据。\n' +
            '双重包装后前端拿到 { code:0, data:{ code:0, data:... } }，所有页面取不到数据。',
        )
      }

      expect(hits).toEqual([])
    })

    it('PageResult 是允许的（分页数据体不是响应信封）', () => {
      // 反向确认：确保上面的规则没有把 PageResult 一起误杀。
      // controllers 里现在大量使用 PageResult<T>，若规则写错会全线飘红。
      const controllers = allFiles.filter((f) => f.endsWith('.controller.ts'))
      const usesPageResult = controllers.some((f) =>
        readFileSync(f, 'utf8').includes('PageResult<'),
      )
      expect(usesPageResult).toBe(true)
    })

    it('ResponseInterceptor 确实在做统一包装（规则 2 的前提）', () => {
      // ★ 如果哪天有人删掉了 ResponseInterceptor 的包装逻辑，
      //   规则 2 就变成了「禁止大家正确地自己包装」——
      //   那时候应该改的是这条规则，而不是让控制器集体违规。
      const interceptorPath = join(SRC_ROOT, 'common/interceptors/response.interceptor.ts')
      expect(existsSync(interceptorPath)).toBe(true)

      const src = readFileSync(interceptorPath, 'utf8')
      expect(src).toMatch(/code\s*:/)
      expect(src).toMatch(/traceId\s*:/)
    })
  })

  // ────────────────────────────────────────────────────────
  describe('红线 3：错误码必须是合法五位数字', () => {
    const codesSrc = readFileSync(join(SRC_ROOT, 'common/constants/error-codes.ts'), 'utf8')

    /**
     * 解析 ERROR_CODE_MESSAGE 的键。
     * 匹配 `12345: '文案',` 形式。
     */
    function parseMessageKeys(src: string): Array<{ key: string; line: number }> {
      const out: Array<{ key: string; line: number }> = []
      const lines = src.split(/\r?\n/)
      const re = /^\s*(\d+)\s*:\s*'([^']*)'/

      let inBlock = false
      lines.forEach((line, i) => {
        if (inBlock) {
          if (line.includes('*/')) inBlock = false
          return
        }
        if (line.trim().startsWith('/*')) {
          if (!line.includes('*/')) inBlock = true
          return
        }
        const m = re.exec(line)
        if (m != null) out.push({ key: m[1], line: i + 1 })
      })
      return out
    }

    it('ERROR_CODE_MESSAGE 的每个键都是合法五位数字（0 除外）', () => {
      const keys = parseMessageKeys(codesSrc)
      expect(keys.length).toBeGreaterThan(50)

      const bad = keys.filter((k) => {
        if (k.key === '0') return false // 0 是成功码，合法例外
        return !/^\d{5}$/.test(k.key)
      })

      if (bad.length > 0) {
        const detail = bad.map((b) => `  第 ${b.line} 行: ${b.key}`).join('\n')
        throw new Error(
          `错误码必须是五位数字（0 除外），发现 ${bad.length} 处不合规：\n${detail}\n\n` +
            '位数错了会让区间判定失效，例如 isAuthError 判 20000 ≤ code < 30000，\n' +
            '把 20001 写成 2001 就不再被识别为认证错误，也不会触发跳登录。',
        )
      }
      expect(bad).toEqual([])
    })

    it('成功码 0 存在且唯一', () => {
      const keys = parseMessageKeys(codesSrc).map((k) => k.key)
      expect(keys).toContain('0')
      expect(keys.filter((k) => k === '0')).toHaveLength(1)
    })

    it('错误码无重复', () => {
      // 重复键在 TS 对象字面量里后者覆盖前者，前者等于白写。
      // 而文案表重复往往意味着有人从别处复制粘贴时没改码。
      const keys = parseMessageKeys(codesSrc).map((k) => k.key)
      const seen = new Set<string>()
      const dup = keys.filter((k) => {
        if (seen.has(k)) return true
        seen.add(k)
        return false
      })
      expect({ duplicates: dup }).toEqual({ duplicates: [] })
    })

    /**
     * 解析 ErrorCode 枚举的码值。
     *
     * ★ 格式是 `NAME: 10001,`（名字在前、数字在后），
     *   与 ERROR_CODE_MESSAGE 的 `10001: '文案',` 正好相反 ——
     *   两处正则方向写反了就会静默解析出 0 条，
     *   所以下面专门有一条「枚举必须解析出足够多码」的断言兜底。
     */
    function parseEnumKeys(src: string): string[] {
      const start = src.indexOf('export const ErrorCode')
      const end = src.indexOf('ERROR_CODE_MESSAGE')
      if (start < 0 || end < 0 || end <= start) return []

      const enumPart = src.slice(start, end)
      return Array.from(enumPart.matchAll(/^\s*[A-Z][A-Z0-9_]*\s*:\s*(\d+)\s*,?/gm)).map(
        (m) => m[1],
      )
    }

    it('★ ErrorCode 枚举与 ERROR_CODE_MESSAGE 的码集合完全一致', () => {
      // ★ 这是最重要的一条：两张表必须一一对应。
      //   少一条 → 该错误码没有文案，messageOf 回落到 90003，用户看到「开小差了」
      //   多一条 → 前后端对不上，同一错误三端显示不同说法
      // scripts/check-error-codes.mjs 校验的是与**前端**的一致性，
      // 这里校验的是后端**内部**两张表的一致性（它覆盖不到这一层）。
      const enumKeys = parseEnumKeys(codesSrc)
      const tableKeys = parseMessageKeys(codesSrc).map((k) => k.key)

      // ★ 先断言解析成功。若解析器写坏导致枚举解析出 0 条，
      //   后面的 missingInTable 会全是空数组，测试「假通过」——
      //   所以必须先把「解析数量合理」这个前提钉住。
      expect(enumKeys.length).toBeGreaterThan(50)
      expect(tableKeys.length).toBeGreaterThan(50)

      const missingInTable = enumKeys.filter((k) => !tableKeys.includes(k))
      const missingInEnum = tableKeys.filter((k) => k !== '0' && !enumKeys.includes(k))

      expect({
        enumCount: enumKeys.length,
        tableCount: tableKeys.length,
        missingInTable,
        missingInEnum,
      }).toEqual({
        // 枚举含 SUCCESS: 0，文案表的 0 也算一条，数量应当相等
        enumCount: tableKeys.length,
        tableCount: tableKeys.length,
        missingInTable: [],
        missingInEnum: [],
      })
    })

    it('每个错误码都有非空中文文案', () => {
      const lines = codesSrc.split(/\r?\n/)
      const re = /^\s*(\d+)\s*:\s*'([^']*)'/
      const empty: string[] = []

      let inBlock = false
      lines.forEach((line) => {
        if (inBlock) {
          if (line.includes('*/')) inBlock = false
          return
        }
        if (line.trim().startsWith('/*')) {
          if (!line.includes('*/')) inBlock = true
          return
        }
        const m = re.exec(line)
        if (m != null && m[2].trim().length === 0) empty.push(m[1])
      })

      // 空文案 = 页面弹一个空 toast，用户以为 App 卡了
      expect({ emptyMessages: empty }).toEqual({ emptyMessages: [] })
    })
  })

  // ────────────────────────────────────────────────────────
  describe('扫描器自检', () => {
    it('★ stripComments 能正确剥掉注释与字符串里的 //', () => {
      // 扫描器自己出错的话，所有规则都会静默失效。
      // 所以给它加几条针对性用例。
      expect(stripComments('// throw new Error(1)\nconst a = 1')).toBe('\nconst a = 1')
      expect(stripComments('const a = 1 // throw new Error(2)')).toBe('const a = 1 ')
      expect(stripComments('/* throw new Error(3) */\nconst b = 2')).toBe('\nconst b = 2')
      expect(stripComments('const url = "http://x" // cmt')).toBe('const url = "http://x" ')
    })

    it('★ stripComments 不会把字符串内容当成注释剥掉', () => {
      // 剥多了会漏检：比如 'throw new Error()' 写在字符串里就该被保留。
      const out = stripComments("const msg = 'a // b'")
      expect(out).toContain('a // b')
    })

    it('多行块注释被完整跳过', () => {
      const src = ['/**', ' * throw new Error(1)', ' */', 'const c = 3'].join('\n')
      expect(stripComments(src)).toBe('\n\n\nconst c = 3')
    })
  })
})
