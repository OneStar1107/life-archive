/**
 * scripts/gen-openapi.ts
 * ══════════════════════════════════════════════════════════════
 * 导出 OpenAPI 3 规范与错误码表
 * ══════════════════════════════════════════════════════════════
 *
 * 用法：pnpm gen:openapi
 * 产出：
 *   docs/api/openapi.yaml     —— 契约，前端据此生成类型安全 service
 *   docs/api/error-codes.json —— 错误码表，前端 error-code.ts 的生成源
 *
 * 实现方式：在内存中创建 Nest 应用（不 listen），拿到 Swagger document。
 * 这样不需要真的起 HTTP 服务，也不需要数据库可连。
 */

import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ValidationPipe } from '@nestjs/common'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

import { AppModule } from '../src/app.module'
import {
  ERROR_CODE_MESSAGE,
  ErrorCode,
  isAuthError,
  isLoginExpired,
  isTokenExpired,
} from '../src/common/constants/error-codes'

const OUT_DIR = resolve(__dirname, '../../docs/api')

/**
 * 极简 YAML 序列化器。
 * 不引入 yaml 依赖：openapi.yaml 只需导出一次，用不着完整的 YAML 实现，
 * 而多一个依赖就多一处供应链风险与一处版本冲突可能。
 *
 * 支持的类型：string / number / boolean / null / 数组 / 普通对象。
 * 字符串按需加引号，含特殊字符或像数字/布尔/null 时强制加引号。
 */
function toYaml(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent)

  if (value === null || value === undefined) return 'null\n'
  if (typeof value === 'boolean' || typeof value === 'number') return `${value}\n`
  if (typeof value === 'string') return `${yamlScalar(value)}\n`

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]\n'
    let out = '\n'
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        // 数组里的对象：首行不缩进，靠 - 承载
        const body = toYaml(item, indent + 2)
        out += `${pad}- ${body.slice(indent + 2)}`
      } else {
        out += `${pad}- ${toYaml(item, indent + 2).trimStart()}`
      }
    }
    return out
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  )
  if (entries.length === 0) return `${pad}{}\n`

  let out = '\n'
  for (const [k, v] of entries) {
    const key = /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(k) ? k : `"${k}"`
    if (v !== null && typeof v === 'object') {
      const isEmptyArr = Array.isArray(v) && v.length === 0
      const isEmptyObj = !Array.isArray(v) && Object.keys(v as object).length === 0
      if (isEmptyArr) {
        out += `${pad}${key}: []\n`
        continue
      }
      if (isEmptyObj) {
        out += `${pad}${key}: {}\n`
        continue
      }
      out += `${pad}${key}:${toYaml(v, indent + 2)}`
    } else {
      out += `${pad}${key}: ${toYaml(v, indent + 2).trimEnd()}\n`
    }
  }
  return out
}

/** 标量加引号规则 */
function yamlScalar(s: string): string {
  if (s === '') return "''"
  const needsQuote =
    /^[\s]|[\s]$/.test(s) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /: |#|[\n\r\t]/.test(s) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(s) ||
    /^-?\d+(\.\d+)?$/.test(s) ||
    /^0[xob]/i.test(s)
  if (!needsQuote) return s
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

async function main(): Promise<void> {
  process.env['NODE_ENV'] ??= 'development'

  // 内存应用：只为了拿 Swagger 文档
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  const apiBaseUrl = process.env['API_BASE_URL'] ?? 'https://api.lifearchive.cn'
  const appName = process.env['APP_NAME'] ?? '人生档案'

  const config = new DocumentBuilder()
    .setTitle(`${appName} API`)
    .setDescription(
      `
## 响应约定

所有接口返回统一结构 \`Result<T>\`：

\`\`\`json
{
  "code": 0,
  "message": "操作成功",
  "data": {},
  "traceId": "550e8400-e29b-41d4-a716-446655440000"
}
\`\`\`

> **HTTP 200 只代表通信成功，业务成败一律看 \`code\`。** 唯一例外是真正的鉴权失败（HTTP 401）。

## 错误码分段

| 段 | 含义 |
|---|---|
| 0 | 成功 |
| 1xxxx | 参数 / 校验 |
| 2xxxx | 认证 |
| 3xxxx | 权限 |
| 4xxxx | 资源 |
| 5xxxx | 业务 |
| 9xxxx | 系统 |

## 鉴权流程

1. \`POST /auth/register\` 或 \`POST /auth/login\` 拿到 \`tokens\`
2. 之后每个请求带 \`Authorization: Bearer {accessToken}\`
3. 收到 \`code = 20001\`（token 过期）时，调 \`POST /auth/refresh\` 换新的一对
4. 收到 \`code = 20002 / 20003 / 20004 / 20005\` 时必须跳登录，**不要再试刷新**

> 刷新是轮换式的：每次刷新都会作废旧的 refresh token。
> 若检测到已作废的 refresh 被再次使用（重放攻击），服务端会吊销整个令牌族。
`,
    )
    .setVersion('1.0.0')
    .setExternalDoc('错误码表', `${apiBaseUrl}/../error-codes.json`)
    .addServer(apiBaseUrl, '生产环境')
    .addServer('http://localhost:3000', '本地开发')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addTag('认证', '注册 / 登录 / 刷新 / 登出')
    .addTag('账号', '资料 / 隐私同意 / 数据导出 / 注销')
    .addTag('资料', '「你」Tab')
    .addTag('感受', '情绪记录与情绪粒度训练')
    .addTag('记忆', '记忆节点 / 图谱 / 时间轴')
    .addTag('健康', '身体的信号')
    .addTag('旅途', '去过的地方')
    .addTag('待办', '待办 · 时间与你')
    .addTag('洞察', '我是怎么一点点认识你的')
    .addTag('文件', '头像与图片上传')
    .addTag('健康检查', '容器探针')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  // 让 401/200 也能在文档里体现
  document.components = document.components ?? {}
  document.components.schemas = document.components.schemas ?? {}

  await app.close()

  // ── 写 openapi.yaml ──
  mkdirSync(OUT_DIR, { recursive: true })
  const yamlPath = resolve(OUT_DIR, 'openapi.yaml')
  const header = [
    `# ${appName} API —— OpenAPI 3 规范`,
    '#',
    '# 本文件由 backend/scripts/gen-openapi.ts 自动生成，请勿手工编辑。',
    '# 生成命令：pnpm gen:openapi',
    '# 前端据此生成类型安全的 service（frontend/services/*.service.ts）。',
    '',
  ].join('\n')
  writeFileSync(yamlPath, header + toYaml(document), 'utf8')
  console.log(`✔ 已生成 ${yamlPath}`)

  // ── 写 error-codes.json ──
  const codesPath = resolve(OUT_DIR, 'error-codes.json')
  const payload = {
    generatedAt: new Date().toISOString(),
    note:
      '本文件由 backend/src/common/constants/error-codes.ts 自动生成。' +
      '前端 frontend/core/http/error-code.ts 必须与本表同源，' +
      '由 node scripts/check-error-codes.mjs 在 CI 中强制校验。',
    ranges: {
      0: '成功',
      '1xxxx': '参数 / 校验',
      '2xxxx': '认证',
      '3xxxx': '权限',
      '4xxxx': '资源',
      '5xxxx': '业务',
      '9xxxx': '系统',
    },
    // 枚举名 → 数值，前端可用它做常量引用
    enum: ErrorCode,
    // 数值 → 中文文案
    messages: ERROR_CODE_MESSAGE,
    // 分类判定规则，前端可据此决定是否触发刷新
    rules: {
      isAuthError: '20000 ≤ code < 30000',
      isTokenExpired: 'code === 20001（唯一允许静默刷新的码）',
      isLoginExpired: 'code ∈ {20000, 20002, 20003, 20004, 20005}',
    },
  }
  writeFileSync(codesPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  console.log(`✔ 已生成 ${codesPath}`)

  // ── 自检：把判定函数在真实数据上跑一遍，避免规则写错 ──
  const probe: Array<[string, number, boolean, boolean, boolean]> = [
    ['20001 TOKEN_EXPIRED', ErrorCode.TOKEN_EXPIRED, true, true, false],
    ['20002 LOGIN_EXPIRED', ErrorCode.LOGIN_EXPIRED, true, false, true],
    ['20005 REFRESH_REUSED', ErrorCode.REFRESH_REUSED, true, false, true],
    ['30001 NO_PERMISSION', ErrorCode.NO_PERMISSION, false, false, false],
    ['0 SUCCESS', ErrorCode.SUCCESS, false, false, false],
  ]
  let failed = 0
  for (const [label, code, wantAuth, wantExpired, wantLogin] of probe) {
    const gotAuth = isAuthError(code)
    const gotExpired = isTokenExpired(code)
    const gotLogin = isLoginExpired(code)
    const ok = gotAuth === wantAuth && gotExpired === wantExpired && gotLogin === wantLogin
    if (!ok) {
      failed += 1
      console.error(
        `✖ ${label}: 期望 auth=${wantAuth} expired=${wantExpired} login=${wantLogin}，` +
          `实际 auth=${gotAuth} expired=${gotExpired} login=${gotLogin}`,
      )
    }
  }
  if (failed > 0) {
    console.error(`✖ 错误码分类自检未通过（${failed} 项）`)
    process.exit(1)
  }
  console.log(`✔ 错误码分类自检通过（${probe.length} 项）`)
  console.log(`✔ 共导出 ${Object.keys(ERROR_CODE_MESSAGE).length} 条错误码`)

  void dirname
}

main().catch((e: unknown) => {
  console.error('✖ 生成 OpenAPI 失败：', e)
  process.exit(1)
})
