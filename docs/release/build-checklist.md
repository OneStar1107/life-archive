# 三端出包前自检清单

> **本文件的用途**
> 本文件是「人生档案」（`com.lifearchive.app`）**每次出包前必须逐条打勾**的自检清单，分 Android / iOS / HarmonyOS 三节。
>
> **什么时候用**
> 1. 每次点「发行 / 云打包 / Build APPs」**之前**走一遍。
> 2. 提审当天再完整走一遍（此时商店素材相关项也必须全绿）。
> 3. 任何一项打不了勾 → **停止出包**。
>
> **用法**
> 把 `- [ ]` 逐条改成 `- [x]`。未勾选的项在出包记录里必须写明原因。
> 本文件**不是**一次性的模板，出包后保留勾选状态作为记录。

---

## 0 · 三端通用（出包前）

### 0.1 命名与版本

- [ ] **应用名称 = `人生档案`**，与软著证书 / APP 备案 / 桌面名 / 商店展示名**一字不差**
- [ ] **包名 = `com.lifearchive.app`**，Android / iOS / 鸿蒙**三端一致**
- [ ] 桌面显示名实际装机验证：`manifest.json` `name` = `人生档案`、`string.json` `app_name` = `人生档案`、鸿蒙 `EntryAbility.label` = `$string:app_name`
- [ ] `frontend/version.json` 是唯一源，**没有手改** `manifest.json`
- [ ] 本次 `versionName` / `versionCode` 已确认（当前：`1.0.0` / `100`）
- [ ] **`versionCode` 严格大于上一版**（`只改 versionName 不改 versionCode` 是华为与 Google Play 的明确驳回项）
- [ ] 三端 `versionName` 一致、`versionCode` 一致（`node scripts/bump-version.mjs` 同步过）

```bash
# 确认三端版本一致
cat frontend/version.json
grep -n "versionName\|versionCode" frontend/manifest.json
```

### 0.2 合规

- [ ] `node scripts/check-secrets.mjs` **零告警**
- [ ] `node scripts/check-error-codes.mjs` 通过
- [ ] 仓库内**无任何证书实体文件**
- [ ] 本次使用的是**正式证书**，不是自定义调试基座（标准基座包名 `io.dcloud.uniappx` 绝不可用于上架）
- [ ] 产物中**无测试数据、无测试入口、无调试开关、无 debug 信息**
- [ ] 产物中**无第三方 SDK**（与 `docs/privacy/third-party-sdk-list.md` 一致）
- [ ] 产物中**无设计稿占位文案、无 TODO、无 lorem ipsum**
- [ ] 隐私弹窗验证通过（见 0.3）
- [ ] 隐私政策 URL `https://www.lifearchive.cn/privacy` **用 4G 能在无痕窗口打开**（`TODO(待补充：待部署)`）

### 0.3 ★ 隐私弹窗验证（三端商店共同硬要求）

> 依据 `08-三端上架发布.md` 禁止事项第 11 条：「禁止 App 首启在用户同意隐私政策前采集任何任何设备信息」

- [ ] **全新安装**（清数据 / 卸载重装）后首次启动，弹出隐私政策同意弹窗
- [ ] 弹窗标题、正文、按钮文案明确（同意 / 不同意，或「同意并继续」）
- [ ] 弹窗内可点击查看隐私政策全文（App 内摘要页 `pages/privacy/privacy` 或跳转 URL）
- [ ] **点「不同意」后**：应用不进入主流程、不发起任何网络请求、不采集任何设备信息
- [ ] **点「同意」后**：写入本地标记 `privacy_consent_accepted = true`
- [ ] **关键验证**：断网 + 全新安装 → 首启 → 点「同意」→ 抓包确认**没有任何网络请求发出**
- [ ] 二次启动不再弹窗（标记已持久化）
- [ ] 清除应用数据后重新启动，弹窗**重新出现**
- [ ] 提审版本中该弹窗**不可被绕过**（无隐藏的"跳过"入口）

### 0.4 深色模式与安全区截图

> 依据 `07-三端测试体系.md` T5 专项测试

- [ ] **深色模式**：系统切深色模式，**全页面**逐页截图，查白块、黑块、文字不可读、对比度不足
- [ ] 深色模式下弹窗、Toast、空态、加载态、错误态样式均正确
- [ ] **安全区**：
  - [ ] 刘海屏 / 灵动岛机型：顶部内容不被状态栏遮挡
  - [ ] 底部指示条机型：底部按钮不被 Home Indicator 遮挡
  - [ ] 挖孔屏：内容不被挖孔遮挡
  - [ ] 折叠屏展开态：布局切换正确，无内容拉伸/错位
- [ ] 截图已归档至 `TODO(待补充：截图归档路径)`，供商店素材复用

### 0.5 隐私政策四方口径

- [ ] `docs/privacy/permission-comparison.md` 的权限条数 == 实际产物解析出的权限条数
- [ ] 隐私政策 / Info.plist / ASC 隐私标签 / 鸿蒙 `reason` 四方口径一致
- [ ] 隐私政策中的主体名称已替换为真实营业执照全称（无 `TODO(待补充)` 残留）

---

## 1 · Android

### 1.1 包名与配置

- [ ] `manifest.json` → `app-plus.distribute.android.packagename` = `com.lifearchive.app`（**一经发布不可更改**）
- [ ] `targetSdkVersion` ≥ 30（**华为 AppGallery 硬性要求**；当前为 `34` ✅）
- [ ] `minSdkVersion` = `21`（当前值，确认是否还需覆盖更多老机型）
- [ ] `usesCleartextTraffic: false`（**强制禁明文流量**）
- [ ] `android.permissions` 数组确认**只有** `INTERNET` 与 `ACCESS_NETWORK_STATE` 两条，无多余权限
- [ ] `abiFilters` 包含目标市场主流架构（当前 `armeabi-v7a` / `arm64-v8a` / `x86_64`）
- [ ] 图标 1024×1024 PNG、**圆角、无透明通道**

### 1.2 签名

- [ ] 使用**正式证书**（非调试证书）
- [ ] 签名方案勾选 **V1 + V2（+V3）**
- [ ] **keystore 密码 == keyPassword**（HBuilderX 硬性要求，不一致会报莫名错误）
- [ ] 证书有效期 36500 天
- [ ] 别名 = `LifeArchiveKey`
- [ ] 证书实体在 `D:\certs\android\`，**不在仓库内**

### 1.3 产物形式

- [ ] 国内市场上架 → 产物为 **APK**（不是 AAB）
- [ ] 渠道包已按需打出（`huawei` / `oppo` / `vivo` / `xiaomi` / `honor` / `yyb`）
- [ ] 产物命名符合规范：`LifeArchive-v{versionName}-b{versionCode}-{渠道}.apk`

### 1.4 真机安装验证

- [ ] `adb devices` 能识别设备
- [ ] `adb install -r <apk>` **安装成功**
- [ ] 覆盖安装测试：装上旧版 → 装新版 → **成功覆盖且数据保留**（证明签名一致）
- [ ] `adb logcat | grep com.lifearchive.app` **无致命报错**
- [ ] 卸载重装测试：数据被清除，符合预期
- [ ] 主流程跑通：注册 → 登录 → 记录感受 → 记录记忆 → 旅途 → 身体信号 → 待办 → 洞察 → 设置导出 → 注销
- [ ] 深色模式已验证
- [ ] 小屏（≤5"）与大屏（≥6.7"）各验证一轮

---

## 2 · iOS

### 2.1 包名与配置

- [ ] `manifest.json` → `app-plus.distribute.ios.bundleid` = `com.lifearchive.app`
- [ ] `minIosVersion` = `12.0`（当前值，确认与后端最低支持一致）
- [ ] `idfa: false`（不使用广告标识符 ✅，可免填 App Privacy 追踪项）
- [ ] `UIBackgroundModes: []`（无后台常驻 ✅，与"不采集后台数据"一致）
- [ ] 设备类型至少勾选 iPhone 或 iPad 之一（若勾 iPad，需**额外准备 iPad 截图**）
- [ ] `manifest.json` 中**无任何 `NS*UsageDescription`** —— 若新增，必须同步 `docs/privacy/permission-comparison.md`

### 2.2 证书与描述文件

- [ ] `.p12`（Distribution）已生成，密码取自密码管理器
- [ ] `.mobileprovision`（App Store）与 `.p12` **配套**
- [ ] Bundle ID 在 Apple Developer 后台为 `com.lifearchive.app`
- [ ] 证书与描述文件**均在有效期内**

### 2.3 ★ `PrivacyInfo.xcprivacy`（红线，缺失即被拒）

> 自 2024-05-01 起强制。当前状态：**未生成** —— 提审前必须完成。

- [ ] `PrivacyInfo.xcprivacy` 文件已创建并加入工程
- [ ] `NSPrivacyTracking` = `false`
- [ ] `NSPrivacyTrackingDomains` = 空数组
- [ ] `NSPrivacyCollectedDataTypes` 与隐私政策 2.1 / 2.2 逐项对齐
- [ ] `NSPrivacyAccessedAPITypes` 已声明实际用到的 API 类别：

| API 类别 | reason code | 本项目是否用到 | 已声明 |
|---|---|---|---|
| UserDefaults | `CA92.1` | ✅ 用到（本地令牌与同意标记） | ⬜ 待勾 |
| FileTimestamp | `C617.1` | 待核 | ⬜ 待判 |
| DiskSpace | `7D9E.1` | 待核 | ⬜ 待判 |
| SystemBootTime | — | 待核 | ⬜ 待判 |
| ActiveKeyboard | — | 待核（无输入框键盘监听） | ⬜ 待判 |

- [ ] 用 Xcode `Product > Generate Privacy Report` 校验通过
- [ ] **零第三方 SDK**，故无第三方 required-reason 条目

### 2.4 出包与上传

- [ ] Windows 环境走**云打包**产出 `.ipa`
- [ ] 上传分发走 **Transporter** 或 Xcode Organizer
- [ ] 已先走 **TestFlight** 验证一轮（外部测试需短审，通常 <24h）
- [ ] App Store Connect「App 信息」已填**工信部 ICP 备案编号**（`TODO(待补充)`，未取得备案号**禁止提交中国大陆区**）
- [ ] 简体中文 App 信息与备案信息**一致**

### 2.5 审核配套（App Store 驳回率最高两项）

- [ ] **隐私政策 URL + 支持 URL** 均可在 4G 无痕窗口访问
- [ ] **App Privacy 营养标签**已填写，且与隐私政策、隐私清单**一致**（回填 `docs/privacy/permission-comparison.md` 4.1 表）
- [ ] **账号删除功能**已提供（App 内「你 → 设置 → 注销账号」+ `DELETE /users/me`）
- [ ] 已提供**审核员可用的演示账号**（`TODO(待补充：演示账号信息)`）
- [ ] **后端在审核期间必须在线**（已确认值班安排）
- [ ] 2.1 App Completeness：无崩溃、无占位内容、功能完整
- [ ] 截图规格：iPhone 6.9" → **1320×2868**；iPad 13" → **2064×2752**；**真实截图**，不可带 debug 信息

### 2.6 真机验证

- [ ] TestFlight 安装成功
- [ ] 主流程跑通（同 1.4）
- [ ] **禁止只跑模拟器就提交上架** —— 至少一台真机跑过完整主流程
- [ ] 刘海 / 灵动岛机型安全区验证
- [ ] 深色模式已验证

---

## 3 · HarmonyOS NEXT

### 3.1 环境与路径（最容易踩的坑）

- [ ] HBuilderX 4.61+ / DevEco Studio 5.0.7.210+
- [ ] 真机 **API 14+**；模拟器镜像 API ≥ 19
- [ ] **★ 项目根路径纯 ASCII、无中文、无空格**
  > 路径含中文会导致「编译能过但运行即崩」，崩溃日志出现 `cannot find record '&@dcloudio/uni-app-harmony/index&1.0.0'`。
  > 当前工作树路径为 `C:/Users/hyx11/WorkBuddy/Worktrees/人生档案APP开发/main-e001ba0f`，**含中文** —— 见 `docs/project/工程红线自检.md` 第七条，**必须先整改再出包**。
- [ ] `frontend/.hbuilderx/launch.json` 外置路径生效（`D:/hbuild-dev` / `D:/hbuild-build`）
- [ ] **鸿蒙无云打包**，必须本地 DevEco Studio 出包

### 3.2 包名与版本

- [ ] `manifest.json` → `app-harmony.bundleName` = `com.lifearchive.app`
- [ ] `app-harmony.minAPIVersion` = `14`
- [ ] `app-harmony.versionName` / `versionCode` 与 Android / iOS 一致
- [ ] bundleName 7~128 字符、点分 ≥3 段、无 `oh/ohos/harmony/openharmony/system` 独立段 ✅

### 3.3 权限

- [ ] `module.json5` `requestPermissions` 共 **3** 条
- [ ] 每条 `user_grant` 权限都有 `reason` + `usedScene`
- [ ] 3 条 `reason` 文案**具体到业务场景**，无"为了应用正常运行"式笼统表述
- [ ] `string.json` 中 3 条 `*_reason` 齐全
- [ ] `docs/release/harmony-permissions.md` 条数 == 3 == 隐私政策披露数
- [ ] 无 ACL 受限权限（若新增需先向 `agconnect@huawei.com` 申请开通）

### 3.4 签名（★ 自签名不再被接受）

- [ ] AGC「用户与访问 → 证书管理」已申请**发布证书**（`.cer`）
- [ ] AGC「HAP Provision Profile 管理」已创建**类型=发布**的 `.p7b`
- [ ] `build-profile.json5` 中发布配置项名为 **`release`**
- [ ] `signAlg` 为 **`SHA256withECDSA`**
- [ ] 已**取消**「Automatically generate signature」
- [ ] `storeFile` / `storePassword` / `keyPassword` / `signingProfile` 指向 `D:\certs\harmony\` 下的实体
- [ ] 仓库内 `build-profile.json5` 只有**占位说明**，无真实路径与密码
- [ ] 产物是**已签名的 `.app`**，不是 `.hap`、不是自签名
- [ ] ⚠️ 记得**每账号仅 1 个发布证书**，不要删除已有证书

### 3.5 构建

- [ ] debug 模式已跑通主流程（release 模式**不支持断点调试与热更新**，必须先在 debug 验一遍）
- [ ] 菜单「发行 → App-Harmony-本地打包」或 DevEco「Build APP(s)」→ 产出 `.app`
- [ ] 产物大小 ≤ 4GB
- [ ] 产物命名符合规范

### 3.6 图标与素材

- [ ] 图标 **216×216**，使用**分层图标**（`layered_image` 前景 + 背景），已配置
- [ ] 提交图标 == 桌面图标 == 最近任务图标（**三者必须一致**，是高频驳回项）
- [ ] 截图 ≥ 3 张，尺寸 **2340×1080 或 1080×2340**
- [ ] **若适配折叠屏，须额外提供折叠态截图**
- [ ] 截图为**真实界面**，不可用设计稿
- [ ] 已适配平板 / 折叠屏，**未强制锁定屏幕方向**
- [ ] 无广告（一键关闭按钮的要求不适用）

### 3.7 真机安装验证

- [ ] 设备已开启开发者模式 + USB 调试 + 信任本机
- [ ] `hdc list targets` 能识别设备（**禁止用 `adb` 安装鸿蒙包**）
- [ ] `hdc install -r <app>` **成功**
- [ ] 无「签名验证失败 / bundleName 不符 / 权限未授权」报错
- [ ] 主流程跑通（同 1.4）
- [ ] 折叠屏展开 / 折叠切换正常，`offWindowResize` 已正确释放
- [ ] 深色模式已验证
- [ ] 平板 / 2in1 设备布局正常

### 3.8 官方预检（三件事，鸿蒙是驳回重灾区）

- [ ] **DevEco Testing** 本地跑：兼容性 / 稳定性 / 性能 / 功耗 / UX / 隐私，全部无阻塞项
- [ ] **AGC「软件包管理 → 启动自检」**：上传包后跑云测试，产出官方报告
- [ ] 目标：**AppAnalyzer 体检拿到 100 分**（至少无阻塞项）

```bash
# 单元测试
hvigorw --mode module -p module=entry@default -p product=default test@ut --no-daemon
# UI 测试
hvigorw --mode module -p module=entry@default -p product=default test@uitest
# HAP 方式
hdc file send entry-test.hap /data/local/tmp/
hdc install -r /data/local/tmp/entry-test.hap
hdc shell aa test -b com.lifearchive.app -m entry_test
```

### 3.9 APP 备案校验

- [ ] AGC「App 备案」已完成，备案名称 = `人生档案` = 包名对应应用名
- [ ] 备案主体 = `TODO(待补充：营业执照主体全称)`
- [ ] 备案类型选择正确
- [ ] **备案刚过需等 1 个工作日再提交**（华为已知规则）

---

## 4 · 出包记录

| 项 | 内容 |
|---|---|
| 出包日期 | `TODO(待补充)` |
| 出包人 | `TODO(待补充)` |
| 目的 | ⬜ 内部测试 &nbsp;&nbsp; ⬜ 提审 |
| `versionName` / `versionCode` | `TODO(待补充)` |
| Android 产物 | `TODO(待补充：文件名 + SHA-256)` |
| iOS 产物 | `TODO(待补充：文件名 + Build 号)` |
| HarmonyOS 产物 | `TODO(待补充：文件名 + 大小)` |
| 未通过项及原因 | `TODO(待补充)` |

---

## 5 · 提审当天终极自检

> 依据 `08-三端上架发布.md` ⑪ 提交前自检清单，逐条回答

- [ ] 软著上的名字，和手机桌面上显示的名字，**一个字都不差**吗？
- [ ] 隐私政策链接，用 **4G** 打开能加载出来吗？（无痕窗口验证过）
- [ ] App 装好**第一秒**，有没有在用户点「同意」之前偷偷读设备信息？（断网抓包验证过）
- [ ] 这次的 **`versionCode` 比上次大**吗？
- [ ] 如果审核员明天早上 9 点打开我的 App，**后端在线**吗？**演示账号还能登**吗？
- [ ] 我接的**每一个第三方 SDK，隐私政策里都写**了吗？（当前为零个，已核对）
- [ ] 三端**包名完全一致**吗？
- [ ] **软著著作权人 == ICP 备案主体 == APP 备案主体 == 各商店开发者账号主体**吗？
- [ ] iOS 的 **`PrivacyInfo.xcprivacy` 带上了**吗？
- [ ] 鸿蒙的 **`versionCode` 递增**了吗？**图标三层一致**吗？
- [ ] 提交版本里**没有**测试数据、测试入口、调试开关？
