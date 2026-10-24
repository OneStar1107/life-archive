# 权限四方对照表

> **本文件的用途**
> 本文件是「人生档案」（`com.lifearchive.app`）的**权限口径唯一对照表**，把同一件事在五个地方的口径摆在一起，防止"隐私政策说 A、鸿蒙写 B、商店后台勾 C"导致驳回。
>
> 依据 `docs/prompts/00-README-总控约束.md` 坑 #6：
> > 「隐私政策 ≡ ASC 隐私标签 ≡ Info.plist 用途说明 ≡ 鸿蒙 reason，四者必须逐条一致」
>
> **什么时候填 / 怎么改**
> 1. **改动任一侧时必须同步全部五列**，改完重新核对"口径是否一致"列。
> 2. 每次出包前执行 `node scripts/check-secrets.mjs` 之外，再执行文末的条数自检。
> 3. 引入任何新权限前，先在这里加行，五列填全再写代码。

---

## 一、事实来源（唯一真相）

本表所有鸿蒙列均**逐字抄录**以下两个文件，不做改写、不做推测：

| 来源文件 | 作用 |
|---|---|
| `frontend/harmony-configs/entry/src/main/module.json5` | `requestPermissions` 数组 —— 鸿蒙侧声明的权限全集 |
| `frontend/harmony-configs/entry/src/main/resources/base/element/string.json` | `internet_reason` / `network_info_reason` / `download_reason` 三条 reason 文案 |

其他列来源：

| 来源 | 说明 |
|---|---|
| `frontend/manifest.json` → `app-plus.distribute.android.permissions` | Android 侧 `uses-permission` |
| `frontend/manifest.json` → `app-plus.distribute.ios` | iOS 侧；**当前无任何 `NS*UsageDescription`** |
| `docs/privacy/privacy-policy.md` | 隐私政策披露章节 |

### 1.1 `module.json5` 当前声明（3 条，全文抄录）

```json5
"requestPermissions": [
  {
    "name": "ohos.permission.INTERNET",
    "reason": "$string:internet_reason",
    "usedScene": { "abilities": ["EntryAbility"], "when": "always" }
  },
  {
    "name": "ohos.permission.GET_NETWORK_INFO",
    "reason": "$string:network_info_reason",
    "usedScene": { "abilities": ["EntryAbility"], "when": "always" }
  },
  {
    "name": "ohos.permission.WRITE_DOWNLOAD_DIR",
    "reason": "$string:download_reason",
    "usedScene": { "abilities": ["EntryAbility"], "when": "inuse" }
  }
]
```

### 1.2 `string.json` 三条 reason 文案（全文抄录）

| key | value |
|---|---|
| `internet_reason` | 用于人生档案加载你记录的感受、记忆与身体信号，例如同步记忆图谱、获取旅途列表与身体信号趋势 |
| `network_info_reason` | 用于判断当前网络是否可用，在无网络时为你显示可重试的离线提示而不是空白页面 |
| `download_reason` | 用于把你选中的图片保存到本地相册，作为记忆节点或旅途封面的素材 |

---

## 二、★ 五方逐条对照表

> **口径是否一致**的判定标准：
> 五列描述的是**同一件业务用途**，且**没有任何一列声称做了实际未做的事**。
> 「本端不适用/无需声明」是**合法的一致状态**——只要确实不需要声明。

### 2.1 权限 1 / 联网

| 列 | 内容 | 口径 |
|---|---|---|
| **鸿蒙 `module.json5`** | `ohos.permission.INTERNET`，`when: always` | 联网 |
| **鸿蒙 `string.json` reason** | 用于人生档案加载你记录的感受、记忆与身体信号，例如同步记忆图谱、获取旅途列表与身体信号趋势 | 联网加载用户数据 |
| **iOS Info.plist** | **无需声明**。`INTERNET` 在 iOS 无对应 `NS*UsageDescription`；App Transport Security 默认禁止明文 HTTP，本项目全站 HTTPS | 不适用 |
| **App Store 隐私标签** | 在「数据收集」中**不勾选任何"我们收集"项**。联网本身不收集数据；用户主动录入的内容通过"用户内容"项在 `privacy-policy.md` 2.2 节披露 | 不适用（无独立勾选项） |
| **Android manifest** | `<uses-permission android:name="android.permission.INTERNET"/>`（`manifest.json` 第 30 行） | 联网 |
| **隐私政策披露章节** | 2.3 设备信息表「应用版本号与渠道标识 / 平台标识」行 + 2.2 业务内容表全部；2.5 说明"纯客户端应用不使用 Cookie" | 联网传输用户主动录入的内容 |
| **口径是否一致** | ✅ **一致** —— 五列都指向"为加载用户自己的数据而联网"，无任何一列越界 | ✅ |

### 2.2 权限 2 / 网络状态

| 列 | 内容 | 口径 |
|---|---|---|
| **鸿蒙 `module.json5`** | `ohos.permission.GET_NETWORK_INFO`，`when: always` | 读网络状态 |
| **鸿蒙 `string.json` reason** | 用于判断当前网络是否可用，在无网络时为你显示可重试的离线提示而不是空白页面 | **仅**判断可用性以显示离线提示 |
| **iOS Info.plist** | **无需声明**。iOS 的网络可达性通过 `SCNetworkReachability` / `NWPathMonitor` 获取，**不要求** `NS*UsageDescription`；且本项目**不读取**具体 SSID / BSSID / IP | 不适用 |
| **App Store 隐私标签** | 不勾选任何项。理由：**不采集网络状态**，仅本地判断后展示 UI，结果不上传 | 不适用 |
| **Android manifest** | `<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>`（`manifest.json` 第 31 行） | 读网络状态 |
| **隐私政策披露章节** | 2.3 设备信息表首行：网络类型，`getNetworkTypeSync`，**"否，仅本地判断后展示提示"** | 仅本地判断，**不上传** |
| **口径是否一致** | ✅ **一致** —— 双方口径都是"只判断有无网络、不读取网络身份信息、不上报" | ✅ |

### 2.3 权限 3 / 保存图片到下载目录

| 列 | 内容 | 口径 |
|---|---|---|
| **鸿蒙 `module.json5`** | `ohos.permission.WRITE_DOWNLOAD_DIR`，`when: inuse` | 写公共下载目录 |
| **鸿蒙 `string.json` reason** | 用于把你选中的图片保存到本地相册，作为记忆节点或旅途封面的素材 | 保存**用户已选中的图片**到相册/下载目录 |
| **iOS Info.plist** | **无需声明**。本项目在 iOS 侧**不实现**"保存到系统相册"功能（图片只作为记录配图上传保存到应用侧），因此不涉及 `NSPhotoLibraryAddUsageDescription`。⚠️ 若 iOS 端后续实现该功能，**必须**同步新增 `NSPhotoLibraryAddUsageDescription` 并回填本表 | 不适用（当前不适用） |
| **App Store 隐私标签** | 不勾选"照片"项。本项目**不读取**用户相册（仅使用用户主动选中的图片），**不写入**系统相册 | 不适用 |
| **Android manifest** | **无对应权限**。Android 端当前未实现"保存到本地相册"功能，Scoped Storage 下也无需该权限。⚠️ 若 Android 端后续实现，需评估 `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`（API 33+ 须用 `READ_MEDIA_IMAGES`）并回填本表 | 不适用（当前不适用） |
| **隐私政策披露章节** | 2.2 业务内容表「图片文件」行：限 jpg / png / webp / heic / heif，单文件 ≤ 10MB，用途为"头像 / 记忆配图 / 旅途封面 / 日记插图" | 用户主动选中的图片 |
| **口径是否一致** | ✅ **一致（附条件）** —— 三端口径均为"只处理你主动选中的图片"；Android/iOS 侧因未实现该能力而不声明，属合法的一致状态。**条件**：任一端一旦实现保存到相册，本表当日必须回填 | ✅ |

### 2.4 iOS 侧当前无任何 `NS*UsageDescription`

`frontend/manifest.json` 的 `app-plus.distribute.ios` 段当前只有 `bundleid` / `versionName` / `versionCode` / `minIosVersion` / `idfa: false` / `UIBackgroundModes: []` / `dSYMs: false` / `schemes`，**无任何权限用途说明**。

这是**正确且刻意**的状态：本应用不申请相机、麦克风、定位、相册、通讯录、蓝牙、通知等任何受 iOS 管控的能力。

> ✅ 佐证：`idfa: false` —— 不使用广告标识符，App Store Connect 隐私标签的"Data Used to Track You"全部可勾 **"Not Used"**。
> ✅ 佐证：`UIBackgroundModes: []` —— 无后台常驻能力，与"不采集后台数据"的承诺一致。

### 2.5 Android 侧权限只有 2 条

`manifest.json` 的 `android.permissions` 数组**只列 2 项**（且 `usesCleartextTraffic: false` 强制禁明文）：

| # | 权限 | 用途 | 对应鸿蒙权限 |
|---|---|---|---|
| 1 | `android.permission.INTERNET` | 访问后端 API | `ohos.permission.INTERNET` |
| 2 | `android.permission.ACCESS_NETWORK_STATE` | 判断网络可用性以显示离线提示 | `ohos.permission.GET_NETWORK_INFO` |

Android 的这两条是 `normal` 保护级别（安装即授予、**无需运行时弹窗**、**无需用途说明字段**），因此 manifest 中只写权限名是**符合规范的**，与 iOS 的"无 `NS*` 声明"是同一种"最小声明"策略。

> ⚠️ **Android 侧若新增敏感权限**（如 `READ_MEDIA_IMAGES`、`ACCESS_FINE_LOCATION`、`CAMERA`、`RECORD_AUDIO`），Android 商店会要求在**应用管理后台的"权限说明"表单**逐项填写用途文案，且文案口径必须与本表、隐私政策一致。届时需在本表新增行。

---

## 三、条数一致性自检

> **判定式**（任一不等即为 ❌ 阻塞）
> ```
> 鸿蒙 module.json5 声明条数
>   == 鸿蒙 string.json 中 reason 条文案条数
>   == 隐私政策 2.3 节披露的设备信息条数
>   == harmony-permissions.md 台账条数
>   == permission-comparison.md 本表行数
> ```

| 项 | 值 |
|---|---|
| `module.json5` `requestPermissions` 条数 | **3** |
| `string.json` 中 `*_reason` 文案条数 | **3**（`internet_reason` / `network_info_reason` / `download_reason`） |
| 本表权限行数 | **3** |
| `harmony-permissions.md` 台账条数 | **3**（见该文件自检章节） |
| Android `uses-permission` 条数 | **2**（权限 3 在 Android 侧不适用，见 2.3） |
| iOS `NS*UsageDescription` 条数 | **0** |

**结论：✅ 全部一致。**

---

## 四、四方口径一致的整体勾选结论

> 依据 `08-三端上架发布.md` 第 ④ 节：
> > 「四份文档必须口径一致：隐私政策 ≡ App Store 隐私标签 ≡ Info.plist 用途说明 ≡ 鸿蒙 reason」

| # | 检查项 | 结论 | 依据 |
|---|---|---|---|
| 1 | 鸿蒙 `module.json5` 声明的每个权限，隐私政策都有对应披露 | ✅ | 三条权限分别对应隐私政策 2.3（网络类型）、2.3（应用版本/平台）、2.2（图片文件） |
| 2 | 鸿蒙 `string.json` 的 reason 文案，**具体到业务场景**而非"为了应用正常运行" | ✅ | 三条均含具体业务动作与示例（同步记忆图谱 / 显示离线提示 / 保存记忆节点或旅途封面） |
| 3 | iOS Info.plist 声明的每个 `NS*`，隐私政策都有对应说明 | ✅ | **本项目当前声明 0 条**，无不一致可能 |
| 4 | App Store 隐私标签的每一项勾选，隐私政策都有对应章节 | ⬜ | **待 App Store Connect 后台实际填写时逐项回填**（见下表） |
| 5 | Android `uses-permission` 每条都有用途说明（敏感权限时） | ✅ | 两条均为 `normal` 级别，无需用途说明字段 |
| 6 | 没有在任何一处声称"我们收集通讯录/位置/人脸"等实际未收集的信息 | ✅ | 隐私政策 2.4 节明确列出 6 类"不收集"并与代码一致（无定位/相机/麦克风/通讯录权限声明） |
| 7 | 隐私政策没有声称做了代码未做的事 | ✅ | 2.3 节逐行核实：`networkType()` 结果不上传、`getSystemInfoSync` 仅布局、`getDeviceInfoSync` 仅适配判断（见 `frontend/core/platform/index.ts`） |
| 8 | 三端权限数量均在最小必要集内 | ✅ | 鸿蒙 3 条、Android 2 条、iOS 0 条；无冗余权限 |

**整体结论：✅ 四方口径一致。** 仅第 4 项（App Store 隐私标签实际勾选）需在提交前于 App Store Connect 后台逐项回填确认。

### 4.1 App Store Connect 隐私标签回填表（提交时填写）

| 隐私标签问题 | 应选答案 | 依据（隐私政策章节） | 实际填写 |
|---|---|---|---|
| 是否追踪用户（Data Used to Track You）？ | **No**（`idfa: false`，无广告 SDK） | 六节（无第三方 SDK） | ⬜ 待填 |
| 是否收集数据（Data Collected）？ | **Yes** | 2.1 / 2.2 | ⬜ 待填 |
| 收集的数据类型 | 见下 | — | ⬜ 待填 |
| 用途是否仅用于 App 功能？ | **Yes**（无广告、无分享给他人） | 第三节 | ⬜ 待填 |
| 是否与所声明的隐私政策一致？ | **Yes** | 全文 | ⬜ 待填 |
| 账号删除请求路径 | App 内「你 → 设置 → 注销账号」+ 邮箱 | 第七节 | ⬜ 待填 |

**收集的数据类型逐项建议**（按 App Store Connect 的分类）：

| ASC 选项 | 选否 | 理由 |
|---|---|---|
| Contact Info（手机号/邮箱/昵称/头像） | **是** | 2.1 节，账号注册必需 |
| Health & Fitness（身体信号指标） | **是** | 2.2 节，用户**手动录入**，不接 HealthKit |
| Photos or Videos（头像/配图/封面） | **是** | 2.2 节图片文件，**用户主动上传** |
| User Content（感受、记忆、旅途、待办文字） | **是** | 2.2 节 |
| Sensitive Info | 否 | 不收集身份证/金融/精准位置 |
| Location（精确/粗略/实时位置） | **否** | **不申请定位权限**，旅途坐标由用户手动填写 |
| Device ID（设备标识符） | **否** | 不收集 IDFA/OAID/Android ID/IMEI |
| Product Interaction（埋点/广告互动） | **否** | 无埋点 SDK；仅请求头带应用版本与渠道 |
| Browsing History | **否** | 无 |
| Search History | **否** | 搜索为应用内本地过滤，不上传搜索词 |
| Identifiers | **否** | — |
| Diagnostics（崩溃日志、请求 ID） | **是** | 请求头 `X-Request-Id` 与应用版本，用于排查；不含设备标识符 |
| Other Data | **否** | — |

> ⚠️ 上表若与实际提交时的勾选不一致，**必须先改本表与隐私政策**，不要只改后台。

---

## 五、变更流程（改动任一权限时）

1. 在 `module.json5` 增/删权限条目，`reason` 与 `usedScene` 同步（`user_grant` 类型**必须**有 `reason` + `usedScene`，否则编译期报错 `The reason and usedScene attributes are mandatory for user_grant permissions`）。
2. `string.json` 增/删 `*_reason` 文案，**文案必须具体到业务场景**。
3. 本表增/删行，填全六列 + 口径结论。
4. `docs/release/harmony-permissions.md` 台账同步。
5. `docs/privacy/privacy-policy.md` 第 2.3 / 2.4 节同步（新增权限要写清用途；新增敏感权限必须同步检查 2.4 的"不收集"清单）。
6. Android `manifest.json` `permissions` 数组同步（如涉及）。
7. iOS `Info.plist`（HBuilderX 出包时由 `manifest.json` 生成）同步（如涉及）。
8. 重跑第三节的条数自检。

---

## 六、相关文档

- [`./privacy-policy.md`](./privacy-policy.md) —— 隐私政策正文
- [`./third-party-sdk-list.md`](./third-party-sdk-list.md) —— 第三方 SDK 清单
- [`../release/harmony-permissions.md`](../release/harmony-permissions.md) —— 鸿蒙权限台账
- [`../release/上架台账.md`](../release/上架台账.md) —— 鸿蒙四项一致自检
