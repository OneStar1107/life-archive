# 05 · 联网层与前后端 API 契约

> **投喂方式：`00` + `02`（已完成状态）+ `03`（已完成状态）+ 本文件。**
> 前置：后端 openapi.yaml 已产出，前端骨架已就绪。

---

## ① 角色设定

你是一位**移动端网络层专家**。你深知移动网络的真实状况：电梯里没信号、地铁上频繁切基站、弱网下请求能挂 30 秒不返回、多个接口同时 401 会把 naive 实现打成刷新风暴。

## ② 目标与上下文

为 **{应用名称}** 交付一个请求封装，一次性解决：鉴权、Token 刷新、重试、超时、错误分类、取消竞态、弱网降级、日志脱敏、契约生成。

**核心设计原则**：把网络的不确定性，全部收敛在这一层。业务调用方只需要 `await getXxx()`，不需要关心 token 过期怎么办、断网了怎么提示。

## ③ 硬约束

- 全部请求走 **HTTPS**，`{API域名}` 必须 ICP 备案
- 超时显式设置 **15 秒**（uni.request 默认 60s 太长，用户会以为 App 死了）
- 错误码与后端 `backend/src/common/constants/error-codes.ts` **严格同源**
- uni-app x 中使用 `uni.request` / `uni.uploadFile` / `uni.downloadFile`
- 禁止使用 npm HTTP 库（axios 在 VDOM 模式不可用）

## ④ 输入占位符

{API域名}、{包名}、{核心功能}、后端导出的错误码表。

## ⑤ 必须产出的目录树

```
frontend/core/http/
├── request.ts          # 内核：Promise 化 + 拦截器链
├── interceptor.ts      # request / response / error 三段拦截器
├── refresh.ts          # Token 单例刷新锁
├── retry.ts            # 退避重试策略
├── error-code.ts       # ★ 与后端同源的错误码映射
├── cancel.ts           # 请求取消与竞态处理
└── types.ts            # RequestConfig / HttpResponse / Result<T>

frontend/core/env/env.ts       # dev / staging / prod
frontend/core/storage/secure.ts  # Keychain / Keystore / Asset Store 抽象
frontend/services/              # 由 openapi.yaml 生成的类型安全 API
```

## ⑥ 分步任务

### T1 · 请求内核 `request.ts`

- Promise 化封装 `uni.request`
- `baseURL` 由 `env.ts` 注入，**页面禁止硬编码 URL**
- 默认 `timeout: 15000`
- 统一注入请求头：`Authorization`、`X-App-Version`、`X-Platform`（ios/android/harmony）、`X-Request-Id`（UUID，用于串日志）、`X-Client-Channel`
- 支持泛型：`request<Res>(config): Promise<Res>`

### T2 · 拦截器链

三段可插拔：`request` → `response` → `error`。每段职责单一，便于单测 mock。

### T3 · 错误三层分类（必须显式区分，这是最常见的 bug 源）

| 层 | 判定依据 | 典型情形 |
|---|---|---|
| **网络层** | `statusCode === -1` 或 fail 回调 | DNS 失败、SSL 握手失败、超时、断网 |
| **HTTP 层** | `statusCode` 为 4xx / 5xx | 401 未授权、500 服务异常 |
| **业务层** | `data.code !== 0` | 参数错误、数据不存在、业务规则拒绝 |

> **绝对禁止只判 HTTP 200 就 resolve。** HTTP 层的三端表现还可能不一致（鸿蒙与 iOS 对 `-1` 的错误描述不同），不要依赖平台给的错误文案做逻辑分支。

### T4 · Token 刷新并发锁（最容易写错，务必照做）

```
let refreshingPromise: Promise<string> | null = null

遇到 401 且非刷新接口：
  1. 若 refreshingPromise 为空 → 发起刷新并赋值
  2. 否则 → await 同一个 Promise（关键：不能各自发起）
  3. 刷新请求本身必须携带 skipAuthRefresh 标记，禁止走 401 分支（否则无限递归）
  4. 刷新成功 → 更新凭证 → 重放原请求（最多 1 次）
  5. 刷新失败 → 清空 refreshingPromise + 清除凭证 + 抛出 LOGIN_EXPIRED
```

**禁止在拦截器里直接 `uni.redirectTo` 跳转登录页** —— 拦截器应该只抛错误，由业务层订阅事件决策。理由有三：拦截器无法 mock 跳转、测试会死锁、某些场景（如后台静默刷新）不应该跳转。

### T5 · 重试策略

- **仅对幂等 GET 与网络类错误重试**，最多 **2 次**
- 指数退避：500ms → 1500ms，**带随机抖动**（避免同时重试造成雪崩）
- 以下情况**不重试**：POST/PUT/DELETE、超时以外的 4xx、401/403、主动取消
- 若业务确实需要 POST 重试，必须携带 `Idempotency-Key` 头并由后端配合

### T6 · 取消与竞态

- 页面 `onUnload` 时取消该页面全部在途请求
- 搜索框输入走防抖（建议 300ms）+ 取消上一个请求
- 提供统一的 `AbortTask` 抽象

### T7 · 错误码映射 `error-code.ts`

与后端编号一一对应，映射为可展示的中文文案：

```uts
export const ERROR_CODE = {
  0: '操作成功',
  10001: '参数格式有误，请检查后重试',
  20001: '登录状态已过期，正在重新登录',
  20002: '登录已失效，请重新登录',
  30001: '您没有执行此操作的权限',
  40001: '内容不存在或已被删除',
  90001: '服务暂时不可用，请稍后再试',
  NETWORK_ERROR: '网络连接失败，请检查网络后重试',
  TIMEOUT: '请求超时，请稍后重试',
  LOGIN_EXPIRED: '登录已失效，请重新登录',
} as const
```

**禁止前端自定义新的错误码数字**，需要新码时必须回后端加。

### T8 · 弱网与离线

- `uni.getNetworkType()` + `uni.onNetworkStatusChange()` 全局监听
- 断网状态统一管理进 `app` store，全局展示顶部横幅提示
- GET 请求可选缓存兜底（缓存命中时返回数据并标记 `isStale`）
- 请求失败展示**可点击重试的空状态页**，而不是白屏或 toast 一闪而过
- 网络恢复后自动重试关键请求（如首页数据）

### T9 · 安全与合规

- 强制 HTTPS；Android 9+ 默认禁明文（保持 `usesCleartextTraffic=false`）；iOS ATS；鸿蒙同理
- 证书必须是**可信 CA 签发的有效证书**，禁止自签、过期、域名不匹配
- 敏感凭证（access/refresh token）走 `core/storage/secure.ts` 抽象，落到 iOS Keychain / Android Keystore / 鸿蒙 Asset Store，**禁止明文写 `uni.setStorageSync`**
- 日志脱敏：禁止打印完整 URL query（其中可能有 token）、手机号、身份证
- **国密 SM2/SM4：默认不实现**。除非 `{合规等级}` 明确要求（政务/金融专网），否则属于过度设计

### T10 · 契约生成

从 `docs/api/openapi.yaml` 生成 `frontend/services/*.ts`：每个方法都有入参/出参 TS 类型，按业务域分文件。**不得手写 API 调用散落在页面里**。

## ⑦ 代码与命名规范

- 文件路径别名：`@/` 指向 `frontend/`
- service 命名：`{模块}.service.ts`，方法名动宾结构（`getUserList` / `createOrder`）
- 请求方法：`GET/POST/PUT/DELETE` 用大写常量，禁止字符串硬写
- 所有导出的 API 函数必须有明确的入参类型与返回值类型标注（uts 强类型要求）

## ⑧ 验收标准 Definition of Done

- [ ] 断网时：统一展示"网络不可用"可重试状态页，**不是白屏**
- [ ] Mock Server 下同时发起 **10 个 401 请求 → 只发出 1 次 refresh**（抓包或日志验证）
- [ ] 刷新失败后：跳登录且**不死循环**（重复触发 10 次只弹一次登录）
- [ ] 超时 15s 生效；超时后只有 GET 会重试
- [ ] 页面卸载后，返回的请求不会再去更新已销毁页面的数据（无报错）
- [ ] 抓包验证：无明文 HTTP、URL query 中无 token、日志无手机号/身份证
- [ ] `frontend/services/` 下每个方法都有完整类型标注
- [ ] 所有错误提示文案来自 `error-code.ts`，无散落的字面字符串
- [ ] token 存储位置经安全存储抽象，明文 grep 不到

## ⑨ 禁止事项

1. 禁止在页面里硬编码 `baseURL` 或完整 URL
2. 禁止在 `catch` 里吞掉错误（`catch(e) {}` 是零容忍写法）
3. 禁止无限重试或固定间隔重试
4. 禁止刷新接口被 401 分支再次拦截（要有 `skipAuthRefresh`）
5. 禁止在拦截器内做页面跳转
6. 禁止把 `console.log(response)` 留在生产代码
7. 禁止明文存储 token / refreshToken
8. 禁止前端自定义错误码数字
9. 禁止 `GET` 请求把敏感信息放在 URL query
10. 禁止在非明确要求下实现国密算法

## ⑩ 输出格式要求

按 00 号第 ⑩ 节五段式。「关键代码」段必须完整给出 `request.ts`、`refresh.ts`、`retry.ts`、`error-code.ts`、`secure.ts` 五个文件的全部内容。

「验证方式」段必须给出：如何用 Mock Server 构造并发 401 场景，以及用 Charles/mitmproxy 验证无明文的步骤。

## ⑪ 提交前自检清单

- [ ] 10 个请求同时 401，我的代码会发几次 refresh？（必须 1 次）
- [ ] 用户进电梯断网 10 秒再出来，我的 App 会怎么处理？
- [ ] 用户在搜索框飞快输入 10 个字，会发出几个搜索请求？
- [ ] 如果 refresh token 也过期了，会不会无限循环刷？
- [ ] 抓包看看，我能从 URL 里偷到用户的 token 吗？
