# CI 流水线说明

> **本文件的用途**
> 说明「人生档案 · 冰川记忆」（`com.lifearchive.app`）CI 流水线每个阶段做什么、
> 失败了怎么办、以及**哪些环节必须在本地跑**。
>
> 依据：`docs/prompts/07-三端测试体系.md` T7 与 ③ 硬约束。
> 配置文件：[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)。

---

## 一、先看这一段：CI 绿灯**不等于**可以上架

这是本文件最重要的一条，看不懂会白忙。

> **CI 全绿只证明「代码逻辑没退化」，不证明「App 在真机上能跑」。**
>
> 三端出包与真机测试**全部不在 CI 范围内**。原因有五条，每条都是硬约束：

| # | 环节 | 为什么不在 CI | 出处 |
|---|---|---|---|
| 1 | **鸿蒙出包** | 鸿蒙**没有云打包**，必须本地 DevEco Studio 出 `.app`。CI 上没有 DevEco 与 HarmonyOS SDK | 06 号文件头 |
| 2 | **iOS 出包** | ipa 需签名证书（`.p12` + `.mobileprovision`），证书实体按规范存**仓库外**（`D:\certs\`）。把证书放进 CI runner 等于扩大泄露面 | 06 号 B4、09 号 A2 |
| 3 | **Android 出包** | 云打包需付费账号与 HBuilderX 登录态；且**自定义调试基座严禁用于上架** | 06 号 A7 |
| 4 | **跨端 UI 用例** | `uni-automator` 需要 HBuilderX 注入 `program` 对象并驱动真机/模拟器/基座，CI 上一概没有 | 07 号 T1 |
| 5 | **性能指标** | 冷启动 / 响应 / 闪退率必须在 **release 包真机**上采。CI 跑 debug 构建，数据不可作为上线依据 | 07 号 ⑨ 第 5 条 |

**结论**：CI 绿灯后，还必须完成下面这些才能提交上架：

- [ ] 本地 HBuilderX / DevEco Studio 出三端包（apk / ipa / `.app`）
- [ ] 六类设备真机验证，填实 [`test-matrix.md`](./test-matrix.md)
- [ ] release 包冷启动实测（**≤1100ms** 鸿蒙体检阻塞线）
- [ ] 鸿蒙 DevEco Testing + AGC「启动自检」云测试**无崩溃、无严重 UX 问题**

> ⚠️ 07 号禁止事项第 10 条：**禁止在未跑过真机的情况下对外声称「已通过三端测试」。**
> 当前 [`test-matrix.md`](./test-matrix.md) 全部为「未覆盖」，这就是事实状态。

---

## 二、阶段图

```
  PR 提交 / 推送
        │
        ▼
 ┌──────────────┐
 │ 1. lint      │  后端 ESLint + 前端平台宏检查
 │    ~2 min    │  最便宜的检查放最前，语法错 1 分钟内拦住
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │ 2. typecheck │  后端 tsc --noEmit
 │    ~2 min    │  ★ 前端不在此阶段（无 tsconfig，见下）
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │ 3. unit      │  ★★ 唯一真正验证产品逻辑的阶段 ★★
 │    ~4 min    │  · 后端单测 + 红线自检（14 条）
 │              │  · 前端 Node 层单测（103 条）
 │              │  · 前端红线脚本（6 条规则）
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │ 4. secrets   │  ★ 密钥泄漏扫描 + 证书实体检查
 │    ~1 min    │  命中即红，禁止合并
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │ 5. e2e       │  postgres:16-alpine + migrate + 全链路
 │    ~5 min    │  auth / memories 两条链路
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │ 6. build     │  nest build + 校验 dist/main.js 存在
 │    ~3 min    │  ★ 只编译后端，不出任何移动端包
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │ 门禁         │  六阶段全绿才通过
 │ ci-passed    │  并提示「绿灯 ≠ 可上架」
 └──────────────┘
```

> **依赖顺序是刻意的**：`e2e` 与 `build` 都 `needs: [lint, typecheck, unit, secrets]`。
> 密钥泄漏比测试失败严重得多 —— 密钥一旦进过 git 历史就必须**轮换**，
> 删文件也没用。所以没必要为一个注定要拦下的提交去起数据库。

---

## 三、每个阶段做什么、失败了怎么办

### 阶段 1 · lint

| 项 | 命令 | 作用 |
|---|---|---|
| 后端 ESLint | `cd backend && pnpm run lint` | TS 规范、Promise 误用、隐式 any |
| 前端平台宏 | `cd frontend && pnpm run lint:platforms` | 业务代码里出现 `#ifdef` / `#ifndef` |

**★ 为什么前端不用 ESLint**：`.uvue` 不是合法 JS/TS，任何 JS 解析器都会在第一行
`<template>` 上崩掉。前端真正的静态门禁是两个 **node 脚本**（`check-platforms.mjs`、
`check-redlines.mjs`），它们做文本扫描，反而比解析器可靠。

**失败怎么办**：

- 后端 ESLint 报红 → 本地 `cd backend && pnpm run lint` 看具体规则
- 平台宏泄漏 → 检查是不是把平台差异写进了 pages/components。
  **正确修法**是把差异抽成 `core/platform/index.ts` 里的一个函数，业务代码只调它。
  脚本会列出已登记的例外（`App.uvue` / `core/storage/secure.ts` / `core/env/env.ts`），
  它们不阻塞但待收口

### 阶段 2 · typecheck

`cd backend && pnpm run typecheck`（`tsc --noEmit`）

**★ 为什么只有后端**：前端是 HBuilderX 工程，**没有 `tsconfig.json`** ——
它的类型检查由 uts 编译器在出包时完成，不在 CI 范围。

> 代价要说清楚：前端的类型错误会在**本地产物**里暴露，而不是在 PR 阶段。
> 这是 HBuilderX 工程形态的固有限制，无法靠 CI 补上。

**失败怎么办**：本地 `cd backend && pnpm run typecheck`，看报错行号。

### 阶段 3 · unit ★★

这是整条流水线里**唯一真正验证产品逻辑**的阶段。

| 套件 | 条数 | 验证什么 |
|---|---|---|
| 后端红线自检 `test/redlines.spec.ts` | 14 | 三条工程红线的机器门禁 |
| 前端 Node 层单测 `tests/unit/` | 103 | 错误码契约、重试策略、取消竞态、路由守卫 |
| 前端红线 `check-redlines.mjs` | 6 类规则 | 见下 |

**三条后端红线**（`redlines.spec.ts`，详见该文件头注释）：

1. 禁止裸 `throw new Error()` —— 否则业务失败全被归一化成 90003「开小差了」，
   日志里没有业务码，HTTP 状态码也错（参数错误会变成 500，进而被前端重试）
2. 控制器不自己包 `Result<T>` —— 否则与 `ResponseInterceptor` 双重包装，
   前端拿到 `{code:0, data:{code:0, data:…}}`，所有页面取不到数据，
   **而后端接口测试全绿**（supertest 断的是 HTTP 层，看不到这层结构问题）
3. 错误码必须是合法五位数字（0 除外）—— 位数错了区间判定就失效，
   例如把 `20001` 写成 `2001`，`isAuthError` 不再识别为认证错误，也不会跳登录

**前端六类红线规则**（`check-redlines.mjs`）：

| # | 规则 | 对应的事故 |
|---|---|---|
| 1 | 页面/组件不得有硬编码颜色字面量 | 深色模式下出现白块 —— 商店常见驳回项 |
| 2 | 不得用 `vh` 单位 | 页面根是 `flex:1`，折叠屏展开/折叠时 `vh` 跳变导致错位 |
| 3 | 文字必须包在 `<text>` 里 | 渲染异常 |
| 4 | `onWindowResize` 必须有解绑路径 | 07 号禁止事项第 9 条：监听器泄漏，折叠几次后越来越卡 |
| 5 | 测试文件禁止 `console.log` | 必须用断言表达预期 |
| 6 | 测试文件禁止硬编码凭据 | 07 号禁止事项第 4 条 + DoD「grep 不到真实账号密码」 |

**★ 注意 `PagesResult` 例外**：规则 2 排除 `PageResult`，
因为那是分页**数据体**的类型（`list`/`total`/`hasNext`），不是响应信封。
`redlines.spec.ts` 里有一条反向用例专门钉住这个例外，防止规则被后人「简化」掉。

**失败怎么办**：

- 前端单测红 → `cd frontend && pnpm test`
- 红线脚本红 → 脚本会按规则分组列出 `文件:行号`，按提示改
- 若红线脚本**误报**（比如你用了正确的平台封装写法），
  **先确认自己没写错**。持续误报的规则最终会被加白名单绕过，那比没有规则更糟

### 阶段 4 · secrets ★

```bash
node scripts/check-secrets.mjs      # 扫密钥泄漏
git ls-files | grep -Ei '\.(p12|jks|keystore|p7b|cer|csr)$'   # 证书实体
```

**★ 这不是「顺手跑一下」的工具，是合并的前置条件。**

密钥一旦进过 git 历史，就必须**轮换密钥** —— 删文件、force push 都没用，
因为历史提交里还在。这道检查是唯一成本极低、收益极高的防线。

**失败怎么办**：

1. 脚本会报出 `文件:行号 [规则名]`
2. 若是误报（如测试夹具里形似真实凭证的假值），
   在该行加上「示例 / 夹具 / 伪造 / 测试」等说明词即可豁免
3. 若是真泄漏：**先轮换密钥**，再清理文件
4. 证书实体被跟踪 → `git rm --cached <file>`，并确认 `.gitignore` 已覆盖

> 仓库里唯一允许出现「形似凭证」的地方是 `backend/test/*.e2e-spec.ts` 与
> `frontend/fixtures/account.js`，且都是**本地 mock 环境才存在的占位值**。

### 阶段 5 · e2e

| 项 | 值 |
|---|---|
| 数据库 | `postgres:16-alpine`（GitHub Actions service 容器） |
| 库名 | `lifearchive_test` |
| 迁移 | `pnpm prisma:deploy` |
| 用例 | `auth.e2e-spec.ts`（认证全链路）+ `memories.e2e-spec.ts` |
| 前置检查 | `node scripts/check-error-codes.mjs`（前后端错误码同源） |

**★ 为什么只起 PostgreSQL**：本项目不需要 RabbitMQ / Redis。
多起一个服务就多一个「为什么它没起来」的问题。

**★ 数据库凭据为什么不用 Secrets**：e2e 用不到任何真实环境凭据。
把生产口令注入 CI 等于让每一次 CI 运行都能接触到它。
CI service 容器用的是固定的临时口令，容器销毁即失效。

**★ 为什么错误码校验放在 e2e 之前**：它只读两个文件、不需要数据库，
成本极低，但能在最早的时间拦住「前端私自加了错误码数字」这类同源问题。

**失败怎么办**：

- 首次在新环境跑不通，多半是数据库没就绪。脚本里已加 30 秒重试兜底
- `prisma migrate deploy` 失败 → 检查 `prisma/migrations/` 是否有新迁移未提交
- 用例失败 → 本地起库复现：
  ```bash
  cd backend
  docker compose up -d
  pnpm prisma:deploy
  pnpm test:e2e
  ```

### 阶段 6 · build

`nest build` + 校验 `dist/src/main.js` 存在 + 归档 `backend/dist`（保留 30 天）。

**★ 为什么加「校验产物存在」这一步**：
不加的话，`build` 命令有可能「成功」但没产出任何文件
（`outDir` 配错、`nest-cli.json` 写坏）。那样每次 CI 都是绿的，
直到某天真的需要部署才发现。

> 顺带发现的事实：`nest build` 退出码是 0，但产物落在 **`dist/src/main.js`**
> 而不是 `dist/main.js`（`tsconfig.json` 的 `outDir: "./dist"` 会把 `src/` 一起编进去）。
> 本流水线按**实际路径**校验并如实归档。
> 由此暴露一个**已存在的缺陷**：`package.json` 的 `start:prod` 写的是
> `node dist/main.js`，与实际产物对不上 —— 见第五节「已知问题」。

**★ 这一阶段不出任何移动端包**，原因见第一节。

### 门禁 · ci-passed

汇总六个阶段的结果，全绿才通过，并在日志里打印
「绿灯 ≠ 可上架」的提醒。用 `if: always()` 保证上游失败时也能给出确定结论，
而不是让 PR 一直挂在「等待中」。

---

## 四、测试分层：什么在哪跑

这是本工程最重要的约定，看错会白忙。

| 层 | 位置 | 运行环境 | 状态 |
|---|---|---|---|
| **第 1 层 · Node 逻辑** | `frontend/tests/unit/`（4 文件 / 103 条）<br>`backend/test/redlines.spec.ts`（14 条） | Node 20 | ✅ **在 CI 跑，必须全绿** |
| **第 2 层 · 跨端 UI** | `frontend/pages/**/*.test.js`（8 文件 / 38 条） | HBuilderX + 真机/模拟器 | ⚠️ **不在 CI**，尚未真机验证 |
| **第 3 层 · 原生测试** | Android JUnit/Espresso、iOS XCTest/XCUITest、鸿蒙 hypium | 各端工具链 | ⚠️ 尚未建立 |
| **第 4 层 · 云真机** | 华为/小米/OPPO/vivo 厂商云测 | 云平台 | ⚠️ 尚未执行 |
| **第 5 层 · 官方预检** | DevEco Testing、AGC「启动自检」 | 鸿蒙必做 | ⚠️ 尚未执行 |

### 为什么第 2 层不能进 CI

`.uvue` 页面**无法在 Node/Jest 里 mount**，原因是两条：

1. uni-app x 页面是 `.uvue` + `<script lang="uts">`，编译目标是 uts/ArkTS，
   不是 JS。`vue-jest` / `@vue/test-utils` 面向 `.vue`（SFC → JS），
   解析 `.uvue` 直接失败
2. 即便改扩展名强行解析，页面渲染依赖 uni 的**原生渲染管线**
   （`<view>`/`<text>`/`<scroll-view>` 都不是 DOM 元素）。
   在 jsdom 里挂载后 `querySelector('.page')` 永远返回 null，
   测试会「假通过」—— **比没有测试更危险，因为它掩盖问题**

所以 `frontend/package.json` 里**故意没装** `vue-jest` 与 `@vue/test-utils`（理由写在该文件注释里）。

### 本地跑第 2 层

```bash
# 1. HBuilderX 安装插件：「初始化测试环境」+「运行 uni-app 自动化测试」
# 2. 编辑 frontend/env.js，把目标平台的 env 设为 true（一次只开一个）
# 3. 菜单：运行 → 运行 uni-app 自动化测试
```

**★ 平台限制（不知道会白忙一天）**：

| 限制 | 影响 | 应对 |
|---|---|---|
| App 端 **iOS 仅支持模拟器**，不支持真机跑 automator | iOS 拿不到真机自动化数据 | 走 **XCTest/XCUITest** + **TestFlight** |
| **Windows 跑不了 iOS 用例** | 本机（Windows）无法跑 iOS 自动化 | 切 macOS，或 CI 配 macOS runner |
| 鸿蒙无云打包 | 无法用流水线出包测试 | 本地 DevEco 出包 + AGC 云测试兜底 |
| 鸿蒙单测用 hypium + hamock | 与 Jest 是两套体系 | 独立测试目录 |

---

## 五、已知问题（阻断 CI 或部署，需修）

> 以下都是本次搭建测试体系时**实测发现**的既有问题，不在测试体系范围内，
> 但会实际阻断流水线上线，故登记在此。

| # | 问题 | 影响 | 修法 |
|---|---|---|---|
| 1 | `backend/eslint.config.mjs` 导入 `typescript-eslint`，但 `package.json` 的 `devDependencies` 里只有 `@typescript-eslint/*` 子包，**没有 `typescript-eslint` 伞包** | **CI 阶段 1（lint）首次运行即失败**：`Cannot find package 'typescript-eslint'` | `pnpm add -D typescript-eslint@^8`（与已装的 `@typescript-eslint/*@8.71.0` 配套） |
| 2 | 构建产物在 `dist/src/main.js`，但 `start:prod` 写的是 `node dist/main.js` | **`pnpm start:prod` 会失败**，生产无法启动 | 二选一：`tsconfig.json` 加 `"include": ["src/**/*"]`，或把 `start:prod` 改成 `node dist/src/main.js` |
| 3 | `core/http/types.ts` 的 `HTTP_METHOD` **缺 `HEAD` 键**，而 `retry.ts` 的幂等白名单里写了 `HTTP_METHOD.HEAD` | 白名单实际是 `['GET', undefined]`：`'HEAD'` 不被识别为幂等；且**任何漏传 method 的调用会被误判为幂等而重试**（可能造成重复数据） | 补 `HEAD: 'HEAD'`。已用 `it.todo` 记录在 `frontend/tests/unit/retry.test.js` |

> ★ 问题 1 与 2 都是**「命令成功但结果不对」**的类型 ——
> 这正是阶段 6「校验产物存在」这类断言存在的理由。
> 纯看退出码的话，这两条都会一直潜伏到部署那天。

---

## 六、当前状态（必须诚实面对）

> ## ⚠️ 跨端 UI 用例：**代码已就绪，一条都没在真机上跑过**
>
> **原因**：三端都还没出包（阶段 06 未完成）。
>
> **这意味着**：
> - 38 条 UI 用例**从未执行过**，不能声称它们「通过」
> - [`test-matrix.md`](./test-matrix.md) 全部为「未覆盖」
> - 冷启动、响应、闪退率等性能数据**全部未采集**
> - 深色模式 / 安全区 / 大字体截图**未产出**
>
> **当前真正验证过的只有**：Node 层单测 103 条 + 后端红线 14 条 + 两条后端 e2e 链路。

### 阻塞项

| # | 阻塞项 | 影响 | 出处 |
|---|---|---|---|
| 1 | **项目根路径含中文** | **鸿蒙编译会失败或运行即崩** | [`../project/工程红线自检.md`](../project/工程红线自检.md) 第七条 |
| 2 | 三端签名证书未生成 | 无法出包 | [`signing-ledger.md`](./signing-ledger.md) |
| 3 | 后端未部署到公网可访问环境 | 真机无法联调 | `TODO(待补充)` |
| 4 | 测试账号未准备 | 登录类 UI 用例无法跑 | [`../prompts/07-三端测试体系.md`](../prompts/07-三端测试体系.md) |

---

## 七、待办：出包后要补的验证

按 [`test-matrix.md`](./test-matrix.md) 的流程逐台执行：

1. 六类设备（小屏 / 刘海 / 大屏 / 折叠屏 / 平板 / 鸿蒙 NEXT）× 用例组填实
2. T5 专项测试 14 项（冷启动用 **release 包**、弱网、10 并发 401 只触发 1 次 refresh、
   深色模式截图、大字体、横竖屏切 10 次、折叠屏展开折叠、后台 1 小时耗电 ≤8%）
3. 鸿蒙 DevEco Testing + AGC「启动自检」→ AppAnalyzer 拿到 100 分
4. 把 `test-matrix.md` 的「未覆盖」逐行改成「已通过」或「有缺陷」
5. 把本文件第六节的「当前状态」更新为实际结果

---

## 八、相关文档

- [`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml) —— 流水线配置本体
- [`./test-matrix.md`](./test-matrix.md) —— 设备 × 系统版本 × 用例覆盖矩阵
- [`./build-checklist.md`](./build-checklist.md) —— 三端出包前自检
- [`./signing-ledger.md`](./signing-ledger.md) —— 签名证书台账
- [`../prompts/07-三端测试体系.md`](../prompts/07-三端测试体系.md) —— 本流水线与用例体系的依据
- [`../project/工程红线自检.md`](../project/工程红线自检.md) —— 红线清单与路径整改方案
- `frontend/env.js` —— uni-automator 环境配置与平台限制说明
- `frontend/jest.config.js` —— 为什么 `.uvue` 不能在 Node 里 mount
