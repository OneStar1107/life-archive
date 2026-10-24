# 03 · 前端 uni-app x 骨架

> **投喂方式：`00` + `01` + `02`（已完成状态）+ 本文件 + `04-跨端适配规范.md`（建议同批投喂）。**
> 前置：HBuilderX 4.61+ 与 DevEco Studio 已安装；后端 API 契约（openapi.yaml）已产出。

---

## ① 角色设定

你是一位 **uni-app x 跨端专家**，精通 uts/uvue 语法、ArkTS 编译链路，以及 iOS/Android/HarmonyOS 三端的工程配置差异。

## ② 目标与上下文

为 **{应用名称}**（包名 `{包名}`）交付可编译到三端的前端骨架：目录清晰、配置正确、平台差异收敛到单一出口、路由与鉴权就绪。

**最重要的架构决策**：三端的差异必须全部封进 `frontend/core/platform/`，业务代码里不许出现任何一个 `#ifdef`。否则后期每加一个功能就要在三处打补丁，必然失控。

## ③ 硬约束（版本矩阵，逐条核对）

| 项 | 要求 |
|---|---|
| HBuilderX | **4.61+**（支持 Harmony NEXT） |
| DevEco Studio | HBuilderX 4.61+ → **5.0.7.210+**；4.81+ → **5.1.0.849+**；热刷新需 **5.1.1.823+**；**HBuilderX <5.14 必须配 DevEco ≤6.1.0** |
| 渲染模式 | **VDOM（uts）** |
| 页面后缀 | `.uvue`；逻辑文件 `.uts` |
| 兼容基线 | iOS 12+ / Android 5+ / 鸿蒙 API 14+；模拟器镜像 API ≥19 |
| 状态管理 | Pinia |
| CSS 约束 | web 子集；**默认 flex 竖向**；文字必须在 `<text>` 内；样式不继承 |
| npm 生态 | **VDOM 模式不可用**，只能使用 uni_modules 插件市场插件 |
| 布局单位 | `rpx`（750 设计稿） |

**uni-app x 语法红线（极易写错）**：
- `<view>` 内**文字必须包在 `<text>` 里**，否则三端表现不一致甚至不显示
- 布局默认 **flex 且方向为 column**（与 Web 默认 row 相反）
- CSS 只支持 web 子集：`float`、`position:fixed` 部分受限，复杂选择器不支持
- **不支持 `plus.*` API**
- 事件写法 `@click`，不是 `@tap`

## ④ 输入占位符

{应用名称}、{应用英文名}、{包名}、{核心功能}、{业务模块列表}、{API域名}、{隐私政策URL}。

## ⑤ 必须产出的目录树

```
frontend/
├── manifest.json                      # ★ 三端包名与配置
├── pages.json                         # 路由与全局样式
├── theme.json                         # 深色模式变量
├── App.uvue
├── main.uts
├── version.json                       # ★ 版本单一源
├── .hbuilderx/launch.json             # ★ 鸿蒙工程外置
├── harmony-configs/                   # ★ 必须入库
│   ├── AppScope/app.json5
│   ├── entry/src/main/module.json5
│   ├── entry/src/main/resources/base/element/string.json
│   └── build-profile.json5
├── pages/
│   ├── index/index.uvue               # 首页
│   ├── login/login.uvue               # 登录
│   └── ...                            # 按 {业务模块列表} 展开
├── components/                        # AppButton / AppInput / AppCard / AppEmpty / AppLoading / AppSafeBottom
├── composables/
├── stores/
│   ├── auth.ts
│   └── app.ts                         # 主题、网络状态
├── services/                          # 由 openapi.yaml 生成
├── core/
│   ├── platform/index.ts              # ★ 唯一的平台差异出口
│   ├── http/                          # 见 05
│   ├── storage/                       # 安全存储抽象
│   └── env/env.ts                     # dev/staging/prod 三套
├── styles/
│   ├── tokens.scss
│   └── mixins.scss
├── static/
├── uni_modules/
├── env.js
└── jest.config.js
```

### `core/platform/index.ts` —— 唯一允许出现平台宏的文件

```uts
// #ifdef APP-HARMONY
export const PLATFORM: string = 'harmony'
// #endif
// #ifdef APP-ANDROID
export const PLATFORM: string = 'android'
// #endif
// #ifdef APP-IOS
export const PLATFORM: string = 'ios'
// #endif

export function statusBarHeight(): number { /* 三分支 + 兜底 */ }
export function safeAreaBottom(): number { /* 三分支 + 兜底 */ }
export function isFoldable(): boolean { /* 三分支 + 兜底 */ }
export function deviceType(): string { /* phone | tablet | 2in1 */ }
export function osVersion(): string { /* 三分支 + 兜底 */ }
export function requestPermission(name: string): Promise<boolean> { /* 三分支 + 兜底 */ }
```

**每一组都必须有完整的三分支 + 兜底实现**，缺任何一个平台都会编译不过。

### `manifest.json` 关键节点

```json
{
  "name": "{应用名称}",
  "appid": "",
  "versionName": "取自 version.json",
  "versionCode": "取自 version.json",
  "app-plus": {
    "distribute": {
      "android": { "packagename": "{包名}" },
      "ios": { "bundleid": "{包名}" }
    },
    "safearea": {
      "background": "#FFFFFF",
      "backgroundDark": "#000000",
      "bottom": { "offset": "auto" }
    },
    "darkmode": true,
    "themeLocation": "theme.json"
  },
  "app-harmony": {
    "bundleName": "{包名}",
    "safearea": { "background": "#FFFFFF", "backgroundDark": "#000000" }
  }
}
```

**包名三处必须完全一致**，且符合鸿蒙规则：点分 ≥3 段、7~128 字符、禁含 `oh/ohos/harmony/harmonyos/openharmony/system` 作为**独立段**。

### `harmony-configs/entry/src/main/module.json5` 权限声明模板

```json5
{
  "module": {
    "requestPermissions": [
      {
        "name": "ohos.permission.INTERNET",
        "reason": "$string:internet_reason",
        "usedScene": { "abilities": ["EntryAbility"], "when": "always" }
      }
    ]
  }
}
```

对应 `resources/base/element/string.json`：

```json5
{
  "string": [
    { "name": "internet_reason", "value": "用于{应用名称}加载{核心功能}所需的网络数据，例如获取列表详情与同步您的账号信息" }
  ]
}
```

**`reason` 必须具体到业务场景**，写「为了应用正常运行」必被驳回。详见 08 号 C10。

## ⑥ 分步任务

**T1 · manifest.json**：按上述模板填三端包名；开启深色模式与 `themeLocation`；配置 `safearea` 的 light/dark 双背景；版本名与版本号**引用 `version.json`，不手写**。

**T2 · pages.json**：`globalStyle` 中所有颜色一律写成 `@变量名` 形式（指向 `theme.json`），支持 light/dark 自动切换。配置 tabBar（如需）与首页路由。

**T3 · theme.json**：定义 light 与 dark 两套完整变量（背景、主色、文字一级/二级/三级、分割线、危险色、成功色）。**变量数量需覆盖后续所有页面**，避免后期临时加硬编码颜色。

**T4 · harmony-configs**：创建完整四个文件（AppScope/app.json5、entry module.json5、element/string.json、build-profile.json5）。先执行一次「运行到鸿蒙」让 HBuilderX 生成基础结构，再手工补齐。

**T5 · Pinia stores**
- `auth.ts`：accessToken / refreshToken / userInfo，actions：login、logout、refresh、hydrate（冷启动恢复）
- `app.ts`：theme（light/dark/follow-system）、networkType、isOnline

**T6 · 路由守卫**：白名单（登录页、隐私政策页）；未登录访问受保护页跳登录；已登录访问登录页跳首页。

**T7 · 基础组件**（全部走 tokens，零硬编码尺寸）
`AppButton`（主/次/文字三种，含 loading 与 disabled 态）、`AppInput`（含校验态与错误提示）、`AppCard`、`AppEmpty`（含重试按钮槽位）、`AppLoading`、`AppSafeBottom`（底部安全区占位）。

**T8 · `core/env/env.ts`**：dev / staging / prod 三套 `baseURL`，由编译模式决定；**禁止硬编码 IP 或 localhost**。

**T9 · 首启隐私弹窗**：首次启动弹出隐私政策同意弹窗，读取 `{隐私政策URL}`；**未同意前不得调用任何获取设备信息的 API**（这是三端上架的共同硬要求）。

**T10 · 主页面骨架**：按 `{业务模块列表}` 生成首页与各模块列表页骨架（可先用静态数据），确保三端都能编译通过。

## ⑦ 代码与命名规范

- 页面与组件文件名**大驼峰**；store 与工具**小写中划线**
- 每个 `.uvue` 文件结构顺序固定：`<template>` → `<script lang="uts" setup>` → `<style scoped>`
- 样式一律写在 `<style scoped>`，禁止行内 style（除动态计算值）
- 所有颜色、间距、圆角、字号取自 `styles/tokens.scss`
- 组件通信：父传子用 props，子传父用 emits，**禁止**用全局事件总线

## ⑧ 验收标准 Definition of Done

- [ ] 三端包名完全一致且符合鸿蒙命名规则
- [ ] **`grep -rn "#ifdef" frontend/pages frontend/components frontend/stores` 返回空**
- [ ] **`grep -rn "100vh\|375px\|667px" --include="*.uvue" frontend/` 返回空**
- [ ] 深色模式切换后所有页面无白底残留（含启动页、安全区外背景、tabBar）
- [ ] `harmony-configs/` 已入库，其中证书类文件已 ignore
- [ ] 首启隐私弹窗可用，且未同意前不会发起任何网络请求或调用设备信息 API
- [ ] 三端均能编译通过并在至少 1 台设备/模拟器上启动首页
- [ ] `core/platform/index.ts` 中每个函数都有三分支 + 兜底

## ⑨ 禁止事项

1. **禁止在业务代码中出现任何 `#ifdef`/`#ifndef`**
2. 禁止使用 `plus.*` API
3. 禁止使用 npm 包（VDOM 模式不支持），只能用 uni_modules
4. 禁止硬编码宽高、`100vh`、`position:fixed;bottom:0` 不加安全区
5. 禁止把 token 明文存进 `uni.setStorageSync`（走 `core/storage` 的安全存储抽象）
6. 禁止在 `manifest.json` 中写任何证书密码或 API Key
7. 禁止在 `<view>` 里直接写裸文字（必须包 `<text>`）
8. 禁止 `@tap` 等老语法（统一 `@click`）
9. 禁止假设 flex 方向为 row（uni-app x 默认是 column）
10. 禁止在未同意隐私政策前调用设备信息类 API

## ⑩ 输出格式要求

按 00 号第 ⑩ 节五段式。「关键代码」段必须完整给出：`manifest.json`、`core/platform/index.ts`、`App.uvue`、`pages.json`、`theme.json`、三个 Pinia store 的全部内容。

## ⑪ 提交前自检清单

- [ ] 我的 uts 代码能否通过强类型编译？（uts 不做隐式类型转换）
- [ ] 有没有把文字直接写在 `<view>` 下？
- [ ] 深色模式下 `_dark` 变量是否全部补齐？
- [ ] 鸿蒙端 `bundleName` 是否真的等于 iOS Bundle ID？
- [ ] 如果我删掉 `core/platform`，业务代码还能编译吗？（应该能，只是功能降级）
