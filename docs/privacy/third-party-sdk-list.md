# 第三方 SDK 清单

> **本文件的用途**
> 本文件登记「人生档案」（`com.lifearchive.app`）三端（iOS / Android / HarmonyOS NEXT）集成的**全部第三方 SDK**。
> 它是三端商店审核的必查项：Google Play 的 Data Safety 表单、App Store 的 App Privacy 营养标签、华为 AGC 的隐私合规自检，都会核对"你声明的 SDK"与"你包里的 SDK"是否一致。
>
> **什么时候填**
> 1. **引入任何第三方 SDK 之前**（即写代码之前），先在本文件登记，再更新 `privacy-policy.md` 第六节与 App Store Connect 的隐私标签。
> 2. 每次发布前用实际产物复核一遍（见文末「复核方法」）。
> 3. 移除 SDK 时也要回来划掉，并同步隐私政策。
>
> ⚠️ **红线：引入任何第三方 SDK 前必须先更新本清单与隐私政策，否则三端商店会驳回。**
> 依据：`08-三端上架发布.md` 禁止事项第 9 条「禁止遗漏任何一个第三方 SDK 的隐私披露」。

---

## 一、当前状态

> ## ✅ 本版本（versionName `1.0.0` / versionCode `100`）**未集成任何第三方 SDK**
>
> **技术原因**：本项目使用 **uni-app x VDOM 渲染模式**，ArkTS 侧**不支持通过 npm 引入第三方包**，因此天然无法集成第三方 SDK。这是本项目的技术特性带来的合规红利，也是必须持续维持的约束。

因此：

- ✅ 不需要填写 Google Play **Data Safety** 表单的"第三方 SDK 数据收集"部分（表本身仍需提交，声明为无 SDK 收集）。
- ✅ 不需要为第三方 SDK 准备 `PrivacyInfo.xcprivacy` 的 `NSPrivacyAccessedAPITypes` 条目。
- ✅ 鸿蒙端不需要因为第三方 SDK 而额外申请 ACL 受限权限。
- ✅ 隐私政策第六节无需列出任何第三方 SDK 条目。

---

## 二、uni-app x 内置模块说明（非第三方 SDK）

以下能力由 `@dcloudio/uni-app-harmony` 等**uni-app x 运行时内置模块**提供，属于**应用自身运行时的组成部分**，不引入任何第三方代码、不加载任何第三方 SDK 清单文件（`PrivacyInfo.xcprivacy` 中不体现为第三方条目）。

**它们是"我们自己"，但为了让审核方与用户看得懂，逐条列出其数据边界：**

| 内置模块 | 用途 | 是否访问个人信息 | 涉及的信息类型 | 收集时机 |
|---|---|---|---|---|
| `uni.request` | 调用后端 API（`https://api.lifearchive.cn`） | **是**（传输用户自己录入的内容） | 用户主动录入的业务内容 | **仅在用户同意隐私政策后** |
| `uni.getNetworkTypeSync` | 判断网络是否可用，无网时显示离线提示 | 否（结果仅本地使用，**不上传**） | 网络类型 | 用户同意后 |
| `uni.getAppBaseInfo` | 读取应用版本号与渠道标识，随请求头 `X-App-Version` / `X-Client-Channel` 上报 | 是（仅上传应用自身版本，不含设备标识符） | 应用版本、渠道 | 用户同意后 |
| `uni.getSystemInfoSync` | 读取屏幕尺寸与安全区，用于布局计算 | 否（纯本地布局） | 屏幕尺寸、安全区 | 用户同意后 |
| `uni.getDeviceInfoSync` | 读取设备类型/品牌/型号/系统版本，用于界面适配判断 | 否（纯本地判断） | 设备类型、品牌、型号、系统版本 | 用户同意后 |
| `uni.setStorageSync` / `getStorageSync` | 本地存储令牌、隐私同意标记 `privacy_consent_accepted` 等 | 否（本地） | 令牌、同意标记 | — |
| `uni.showModal` / `showToast` / `setClipboardData` | 弹窗、提示、复制链接 | 否 | — | — |
| `uni.chooseImage` / `chooseFile` | 调用系统相册/文件选择器由你选图 | 是（你主动选择的图片） | 你选中的图片 | 使用该功能时 |
| 文件读写（应用沙箱内） | 读取应用私有目录中的缓存与配置 | 否 | — | — |

> 📌 上述"涉及个人信息"的判定依据：本文件表格与 `privacy-policy.md` 第 2.3 节「设备信息」表**逐条一致**。
> 📌 未同意隐私政策（`privacy_consent_accepted != true`）时，应用**不发起任何 `uni.request` 请求**，也不读取上述任何设备信息 API。

---

## 三、预留：第三方 SDK 登记表格

> **引入任何第三方 SDK 前，先在此表新增一行并填全所有列。**
> 空列视为未完成登记，视为禁止提交审核。

### 3.1 登记字段说明

| 列 | 填什么 | 备注 |
|---|---|---|
| SDK 名称 | 官方全称 | 与商店后台显示名一致 |
| 版本号 | 精确到小版本 | 如 `1.2.3`，不用 `^1.2.3` |
| 平台 | `android` / `ios` / `harmony` / 三端 | — |
| 用途 | 为什么非它不可 | 写不出理由就说明不需要它 |
| 收集的信息类型 | 勾选式：`设备标识符` / `位置` / `通讯录` / `设备信息` / `用户内容` / `网络` / `标识符` | 必须与隐私政策第二节逐项对应 |
| 是否为必需 | `必需` / `可选` | 声明"可选"的必须提供关闭开关 |
| 官网 | — | — |
| 引入日期 | `YYYY-MM-DD` | — |
| 引入的版本 | 引入时的 versionCode | 便于回溯 |
| 隐私政策披露位置 | `privacy-policy.md` 第几节 | 填不上就不能引入 |
| App Store 隐私标签对应项 | 营养标签的勾选项 | 与 SDK 官方声明一致 |
| 关闭/撤回方式 | 用户如何关闭 | 必填 |

### 3.2 登记表（当前为空 —— 这是正确状态）

| SDK 名称 | 版本号 | 平台 | 用途 | 收集的信息类型 | 是否为必需 | 官网 | 引入日期 | 引入版本 | 隐私政策披露位置 | ASC 隐私标签 | 关闭/撤回方式 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| _（无）_ | — | — | — | — | — | — | — | — | — | — | — |

> **这一行"（无）"就是合规结论本身。** 如果未来有人在这里加了行，就必须同时完成：
> 1. `privacy-policy.md` 第六节新增该 SDK 的披露；
> 2. `permission-comparison.md` 补充它带来的权限；
> 3. Android manifest 补充它带来的 `uses-permission`（含用途说明）；
> 4. iOS `Info.plist` 补充它带来的 `NS*UsageDescription`；
> 5. 鸿蒙 `module.json5` 补充它带来的权限与 `reason`；
> 6. 若是 iOS 且该 SDK 在 Apple 的 required-reason API 名单内，补充 `PrivacyInfo.xcprivacy`；
> 7. Google Play 提交时更新 Data Safety 表单。
>
> 漏任何一步，三端商店都会驳回，且会被列入"隐私不一致"类问题。

---

## 四、常见"看起来像 SDK 实际不是"的东西

以下内容**不是**第三方 SDK，但容易被误报，顺手澄清：

| 项 | 归属 |
|---|---|
| `bcryptjs`（后端密码哈希） | **后端** Node 依赖，不打进客户端包，不收集任何用户信息，不进商店隐私披露 |
| Prisma / PostgreSQL 驱动、Redis 客户端 | 后端依赖，同上 |
| 系统相册/文件选择器（`uni.chooseImage`） | **操作系统**能力，不是 SDK；你选中的图片才被本应用处理 |
| 系统网络状态 API | **操作系统**能力 |
| 极简样式图标 | 随源码内联，无字体文件、无追踪 |

---

## 五、复核方法（每次出包前执行）

1. **Android**：解包 APK 检查 `lib/` 与 `assets/` 目录，确认无 `lib/*.so` 形式的第三方原生库与 `assets/` 下的第三方配置文件；对 APK 跑一次第三方 SDK 扫描（若引入扫描工具，工具本身需在此登记）。
   ```bash
   # 检查是否存在非项目自产的 native 库
   unzip -l app-release.apk | grep -E "lib/.*\.so" | grep -v "liblifearchive"
   ```
2. **iOS**：用 Xcode `Product > Generate Privacy Report` 生成隐私报告，核对**第三方 SDK 分区为空**；检查 `Pods/` 与 `Package.resolved` 确认无第三方依赖（预期：均不存在）。
3. **HarmonyOS**：在 AGC「版本信息 → 软件包管理 → 上传」后启动自检，查看系统自动解析出的**权限列表**是否与 `harmony-permissions.md` 一致；检查 `oh-package.json5` 与 `oh_modules` 确认无第三方依赖（预期：均不存在）。

> 任一环节发现清单外的 SDK，**立即停止提审**，先补齐本文件与隐私政策。

---

## 六、变更记录

| 日期 | 变更 | 变更人 | 影响的 versionCode |
|---|---|---|---|
| 2026-10-03 | 首次建立清单，确认 1.0.0 无任何第三方 SDK | `TODO(待补充：填表人)` | 100 |
| _待补充_ | _后续新增/移除 SDK 时在此追加行_ | — | — |

---

> 🔗 相关文档
> - [`privacy-policy.md`](./privacy-policy.md) —— 第六节引用本清单
> - [`permission-comparison.md`](./permission-comparison.md) —— 权限四方对照
> - [`../release/上架台账.md`](../release/上架台账.md) —— DoD 要求"第三方 SDK 清单已更新到最新版本"
