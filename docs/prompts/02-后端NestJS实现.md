# 02 · 后端 NestJS 实现

> **投喂方式：`00` + `01`（已完成状态）+ 本文件。**
> 前置：01 阶段已完成，PostgreSQL 可连，Prisma 迁移已就绪。

---

## ① 角色设定

你是一位 **NestJS 架构师**，为三端移动应用提供稳定、安全、可观测的后端 API。你熟悉 OWASP Top 10、JWT 安全实践与国内合规要求。

## ② 目标与上下文

为 **{应用名称}** 交付完整后端：REST API、统一响应与错误码、JWT 双 Token 轮换、限流、结构化日志、健康检查、OpenAPI 文档。

关键约束：**前端三端共享同一套错误码**，错误码编号表必须与前端 `frontend/core/http/error-code.ts` 严格同源，不允许各自脑补。

## ③ 硬约束

- NestJS **10/11**，TypeScript **strict**
- Prisma 5/6，仅 `prisma migrate`
- `class-validator` + `class-transformer`，全局 `ValidationPipe`
- `@nestjs/swagger` → `/docs`，可导出 `openapi.yaml`
- `nestjs-pino` 结构化日志 + pino redact 脱敏
- `helmet`、`@nestjs/throttler`
- `@nestjs/jwt` + `bcrypt`（cost ≥ 12）

## ④ 输入占位符

{应用名称}、{包名}、{核心功能}、{业务模块列表}、{API域名}、{隐私政策URL}。

## ⑤ 必须产出的目录树

```
backend/src/
├── main.ts                          # 全局管道/过滤器/拦截器/Swagger/CORS/优雅停机
├── app.module.ts
├── config/
│   ├── configuration.ts             # 集中读取环境变量
│   └── validation.ts                # Joi schema，缺失即启动失败
├── common/
│   ├── constants/
│   │   └── error-codes.ts           # ★ 单一错误码来源
│   ├── interceptors/
│   │   ├── response.interceptor.ts  # 统一包装 Result<T>
│   │   └── logging.interceptor.ts
│   ├── filters/
│   │   └── all-exception.filter.ts  # 任何异常 -> 统一错误码
│   ├── decorators/
│   │   ├── public.decorator.ts
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   └── dto/
│       ├── page.dto.ts              # 统一分页入参
│       └── result.dto.ts            # 统一出参
├── database/
│   └── prisma.service.ts            # 生命周期钩子 + 优雅断连
├── modules/
│   ├── auth/                        # 注册/登录/刷新/登出/改密
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── token.service.ts         # 轮换 + 重用检测
│   │   └── dto/
│   ├── users/
│   ├── files/                       # 上传（存储抽象）
│   ├── health/                      # /health/live /health/ready
│   └── {业务模块}/                  # 按 {业务模块列表} 逐个展开
└── test/
    └── auth.e2e-spec.ts
```

## ⑥ 分步任务

**T1 · 配置校验**
`config/validation.ts` 用 Joi 声明全部必需环境变量：`DATABASE_URL`、`REDIS_URL`、`JWT_SECRET`、`JWT_REFRESH_SECRET`、`ACCESS_TTL`、`REFRESH_TTL`、`PORT`、`NODE_ENV`。任一缺失**启动时立即抛错并退出**，禁止运行时才发现 undefined。

**T2 · 统一响应结构**

```ts
interface Result<T> {
  code: number        // 业务码，0 为成功
  message: string     // 中文可展示文案
  data: T | null
  traceId: string     // 全链路追踪，写进响应头 X-Trace-Id
}
```

**核心原则：HTTP 200 只代表「通信成功」，业务成败一律看 `code`。** 唯一例外是真正的鉴权失败可用 401。把这个原则写进代码注释。

**T3 · 错误码体系**（`common/constants/error-codes.ts`）

| 段 | 含义 | 示例 |
|---|---|---|
| `0` | 成功 | `0 = 操作成功` |
| `1xxxx` | 参数/校验 | `10001 = 参数格式错误` |
| `2xxxx` | 认证授权 | `20001 = token 已过期，请刷新`；`20002 = 登录已失效，请重新登录` |
| `3xxxx` | 权限 | `30001 = 无操作权限` |
| `4xxxx` | 资源 | `40001 = 数据不存在`；`40002 = 数据已存在` |
| `5xxxx` | 业务 | 按 {业务模块列表} 自定义 |
| `9xxxx` | 系统 | `90001 = 服务暂时不可用` |

**必须同时导出一份 JSON/TS 映射，供前端 05 阶段直接消费，禁止前端自定义数字。**

**T4 · JWT 双 Token**
- Access Token：`JWT_SECRET`，有效期 **15 分钟**，载荷仅含 `sub`（userId）与 `ver`
- Refresh Token：`JWT_REFRESH_SECRET`，有效期 **7 天**，存库**（存哈希，不存明文）**
- **轮换 + 重用检测**：每次刷新颁发新 Refresh 并作废旧的；若检测到已作废的 Refresh 被再次使用（重放攻击），**吊销该 `familyId` 下全部令牌**并强制重新登录
- 登出：将 Refresh 标记吊销；如有 Redis 则写短期黑名单

**T5 · 限流**
`@nestjs/throttler` 全局默认限流；登录、注册、短信类接口**单独更严格的限流**（如 60 秒内 5 次）。限流命中返回 `90001` 或专用码并附 `Retry-After`。

**T6 · 健康检查与优雅停机**
- `/health/live`：进程存活即 200
- `/health/ready`：执行 `SELECT 1` 探库，DB 断开返回 **非 200**（供容器编排判定）
- `app.enableShutdownHooks()`，关闭时优雅断连 Prisma 与 Redis

**T7 · Swagger**
`/docs` 分组展示；配置 Bearer Auth；标注 `@ApiResponse` 各错误码；提供 `pnpm gen:openapi` 导出到 `docs/api/openapi.yaml`。

**T8 · 日志脱敏**
pino `redact` 配置必须覆盖：`req.headers.authorization`、`*.password`、`*.passwordHash`、`*.token`、`*.refreshToken`、`*.idCard`、`*.phone`。**日志中不允许出现任何明文 token**，这是 DoD 硬性检查项。

**T9 · 文件上传（files 模块）**
存储抽象接口，默认本地磁盘实现但**限制大小与 MIME 白名单**；文件不进 git，落到挂载卷或对象存储；返回 URL 走 `{API域名}`。禁止把上传根目录设在项目内。

**T10 · 业务模块**
按 `{业务模块列表}` 逐个实现标准 CRUD：Controller / Service / DTO（create/update/query 三件套）/ Swagger 装饰。**每个出参必须用 DTO 显式裁剪，禁止返回 Prisma Entity 原对象**（会泄漏 passwordHash 等字段）。

**T11 · e2e 测试**
`test/auth.e2e-spec.ts` 用 supertest 覆盖：注册 → 登录 → 拿 access 访问受保护接口 → refresh 轮换 → 旧 refresh 失效 → 登出。另加一个业务模块 CRUD 用例。

## ⑦ 代码与命名规范

- 模块划分一个业务域一个目录，禁止跨模块直接 `import` 另一个模块的 Service（需经 Module exports）
- Service 抛 `BusinessException(code, message)`，由全局过滤器转响应；**禁止裸 `throw new Error()`**
- DTO 全部带 `class-validator` 装饰器与 `@ApiProperty`
- 异步一律 async/await，禁止混用 `.then()` 风格
- 数据库查询必须显式 `select` 或经 DTO 裁剪，禁止 `include` 全部关联

## ⑧ 验收标准 Definition of Done

- [ ] 所有接口返回统一 `Result<T>`，全仓库无裸 throw
- [ ] `401` 与「业务失败」在**错误码层面**可区分（前端据此决定是否刷新）
- [ ] `pnpm test:e2e` 全绿
- [ ] `/health/ready` 在手动停掉 PG 容器时返回非 200
- [ ] 日志文件中 grep 不到任何 token / password 明文
- [ ] `pnpm gen:openapi` 成功产出 `docs/api/openapi.yaml`
- [ ] 所有出参 DTO 中不存在 `passwordHash`、`deletedAt` 等内部字段
- [ ] 启动缺少环境变量时立即退出并打印缺哪个变量
- [ ] 错误码表已导出并被前端可读的格式文件

## ⑨ 禁止事项

1. 禁止把 JWT 密钥、DB 密码写进源码（一律环境变量 + Joi 校验）
2. 禁止返回 Prisma Entity 原对象
3. 禁止 `prisma db push` 或任何自动改表行为
4. 禁止把 SQL 错误、堆栈信息回显给客户端
5. 禁止在 Guard / Interceptor 中编写业务逻辑
6. 禁止 access token 有效期超过 30 分钟
7. 禁止把 refresh token 明文存库
8. 禁止在生产使用 `NODE_ENV=development` 式的宽松配置
9. 禁止无限流地暴露登录与短信接口
10. 禁止在仓库内生成上传文件目录

## ⑩ 输出格式要求

按 00 号第 ⑩ 节五段式输出。特别注意「关键代码」段，请给出**完整可运行**的：error-codes.ts、response.interceptor.ts、auth.service.ts、token.service.ts 四个文件的全部内容。

## ⑪ 提交前自检清单

- [ ] 前端拿到我的 `openapi.yaml`，能不能直接生成类型安全的 SDK？
- [ ] 三端对同一个错误码会不会显示不同文案？（必须统一）
- [ ] 如果我停掉数据库，健康检查会不会正确失败？
- [ ] 有没有任何一个接口会把内部字段泄漏出去？
- [ ] 并发刷新发生时，旧的 refresh token 还能不能用？（必须不能）
