# 签名证书台账

> **本文件的用途**
> 本文件是「人生档案」（`com.lifearchive.app`）三端**签名证书的元数据台账**：记录证书类型、存放位置、别名规范、有效期、申请流程与灾难恢复流程。
>
> **本文件绝不记录任何密码、私钥内容、证书内容、AK/SK。** 只记录"存放于哪里"。
> 仓库内置 `scripts/check-secrets.mjs` 会在提交时扫描，一旦发现疑似密钥即**阻断提交**。
>
> **什么时候填**
> 1. 拿到营业执照、办完开发者账号后，**第一件事就是生成/申请三端证书**，然后立刻回来填表。
> 2. 每次出包前核对一次有效期（剩余有效期 < 90 天时提醒续期）。
> 3. 任何证书丢失、泄露、误提交事件发生时，第一时间更新本文件的「事件记录」章节。

---

## 零、⚠️ 最高优先级警告

> ## 签名一旦确定，**不可更换**
>
> **换签 = 用户无法覆盖升级 = 只能卸载重装 = 全部本地数据（未上传部分）与账号习惯归零。**
>
> - 证书文件**必须存放在仓库之外**：`D:\certs\`
> - 密码**必须**存放于 CI Secrets / 密码管理器，**绝不**写入 `manifest.json`、`build-profile.json5`、CI YAML、任何文档
> - 证书文件**绝不**提交进 git（`.gitignore` 已覆盖 `*.p12` / `*.jks` / `*.keystore` / `harmony-configs/**/*.p12`）
> - **至少离线备份两份**：`D:\certs\` + 一个与本机不同步的物理介质（U 盘或另一台机器），并**每年验证一次**备份可用性
>
> 依据 `06-三端构建与真机调试.md` 禁止事项第 6、7 条。

---

## 一、总览台账

> **所有字段在拿到真实值后逐格替换。** 当前一列真实信息都没有——因为证件与证书都还没办。

| 端 | 证书类型 | 仓库内是否有实体 | 推荐存放路径 | 别名规范 | 有效期 | 状态 |
|---|---|---|---|---|---|---|
| **Android** | `.keystore`（或 `.jks`），RSA 2048 | ❌ 绝不入库 | `D:\certs\android\com.lifearchive.app.keystore` | `LifeArchiveKey` | **36500 天**（100 年） | ✅ **已生成**（2026-10-05） |
| **iOS** | `.p12`（Distribution 证书） | ❌ 绝不入库 | `D:\certs\ios\com.lifearchive.app.p12` | 建议 `LifeArchiveDistribution` | 由 Apple 决定，通常 1 年或 3 年，需在 Xcode Organizer 中续期 | ⬜ 未申请 |
| **iOS** | `.mobileprovision`（发布描述文件） | ❌ 绝不入库 | `D:\certs\ios\com.lifearchive.app.mobileprovision` | 无（按 App ID 组织） | 通常 1 年（企业/付费账号），到期需重新生成 | ⬜ 未申请 |
| **HarmonyOS** | `.p12`（发布证书私钥） | ❌ 绝不入库 | `D:\certs\harmony\com.lifearchive.app.p12` | `LifeArchiveKey` | 由 AGC 证书决定，**到期不可续，必须重新申请** | ⬜ 未申请 |
| **HarmonyOS** | `.csr`（证书签名请求） | ❌ 绝不入库 | `D:\certs\harmony\com.lifearchive.app.csr` | 同上 `.p12` 别名 | — | ⬜ 未申请 |
| **HarmonyOS** | `.cer`（AGC 签发的发布证书） | ❌ 绝不入库 | `D:\certs\harmony\com.lifearchive.app.cer` | — | AGC 页面显示为准 | ⬜ 未申请 |
| **HarmonyOS** | `.p7b`（发布 Profile） | ❌ 绝不入库 | `D:\certs\harmony\com.lifearchive.appRelease.p7b` | — | AGC 页面显示为准（每应用最多 100 个） | ⬜ 未申请 |

> ⚠️ **鸿蒙关键约束**：**每个华为开发者账号最多只能有 1 个发布证书。** 申请前务必确认 `.p12` 的别名与密码都已备份——**丢失后无法找回，只能删除重建，而删除会影响已上架版本**。

### 1.1 Android 证书已生成的实证记录（2026-10-05）

| 项 | 值 |
|---|---|
| 生成工具 | HBuilderX 自带 Amazon Corretto：`E:\HBuilderX\plugins\amazon-corretto\bin\keytool.exe` |
| 命令 | `keytool -genkeypair -v -keystore <路径> -alias LifeArchiveKey -keyalg RSA -keysize 2048 -validity 36500` |
| 位置 | `D:\certs\android\com.lifearchive.app.keystore`（**仓库外**） |
| 别名 | `LifeArchiveKey` |
| 算法 / 有效期 | RSA 2048，SHA256withRSA，36500 天（100 年） |
| SHA1 | `7F:E0:14:66:E4:98:5E:6E:40:FF:B8:DD:28:00:CB:CF:CA:B9:F7:08` |
| SHA256 | `8E:1B:59:08:58:E4:8A:46:34:DF:73:26:66:02:3E:0C:05:71:20:53:7F:5A:0A:F5:84:F1:AC:FB:8A:12:32:34` |
| 口令去向 | **不入库**。存于 `D:\certs\android\README-本机口令.txt`（仓库外）＋ 密码管理器 |
| ⚠️ 主体名 | `-dname` 目前用的是占位值 `O=LifeArchive`。**应用尚未发布，现在可随时重新生成**；一旦上架即不可更换，所以正式出包前请确认主体名与营业执照一致。 |

> 复核：`node scripts/check-secrets.mjs` 仍零告警（证书与口令文件都在仓库外，`.gitignore` 亦已覆盖 `*.keystore`）。

### 1.1 主体与账号信息

| 项 | 值 | 何时填 |
|---|---|---|
| 营业执照主体全称 | `TODO(待补充：营业执照主体全称)` | 拿到执照后 |
| Android 各市场开发者账号主体 | `TODO(待补充)` | 各市场注册完成后 |
| Apple Developer Program 账号（Team ID） | `TODO(待补充：Team ID)` | 付费加入后 |
| Apple Developer Program 账号主体 | `TODO(待补充)` | 企业认证后（企业账号另需 D-U-N-S 邓白氏编码） |
| 华为开发者账号（AGC）主体 | `TODO(待补充)` | AGC 企业实名认证后 |
| 证书签发日期 | `TODO(待补充)` | 证书生成/申请后 |
| 证书到期日期 | `TODO(待补充)` | 同上 |
| 离线备份位置 | `TODO(待补充：至少两处)` | 备份后 |

---

## 二、Android 签名

### 2.1 生成命令（占位版，实际执行时替换提示信息）

> ⚠️ 执行前请确认：工作目录为 `D:\certs\android\`（**绝不在仓库目录内**）。
> 下文 `<...>` 部分为交互式提示，**不要把真实值写进任何文件或命令历史**。

```bash
keytool -genkey -alias LifeArchiveKey \
  -keyalg RSA -keysize 2048 -validity 36500 \
  -keystore com.lifearchive.app.keystore
```

交互提示逐项说明：

| 提示 | 填什么 | 备注 |
|---|---|---|
| `Enter keystore password:` | `TODO(待补充：由密码管理器生成并记录位置)` | **见 2.2 的致命警告** |
| `Re-enter new password:` | 同上 | — |
| `What is your first and last name?` | `TODO(待补充：主体名称或负责人姓名)` | 组织名（O）填主体全称 |
| `What is your organization name?` | `TODO(待补充：营业执照主体全称)` | 与软著、备案**必须一致** |
| `What is your organizational unit name?` | `TODO(待补充：可填「人生档案产品组」)` | — |
| `What is your city/locality name?` | `TODO(待补充)` | — |
| `What is your state or province name?` | `TODO(待补充)` | — |
| `What is your two-letter country code?` | `CN` | 中国 |

> 若 HBuilderX 云打包只需包名与签名，CN 建议填 `CN`；部分商店会校验证书国家码与主体国别是否一致。

### 2.2 ★「私钥密码必须与证书库密码一致」

> ## ⚠️ 致命警告
>
> **HBuilderX 的硬性要求：`keystore` 的密码与该证书条目的 `keyPassword`（私钥密码）必须完全一致。**
>
> 不一致时 HBuilderX 会报出一堆**与密码毫无关联的莫名错误**（如"打包失败""签名信息读取异常"），极难定位。
>
> **因此本项目的约定是：只设一个密码，库里密码与私钥密码都用它。**
>
> ```bash
> # 查看两处密码是否一致（只看不改，交互时密码不回显）
> keytool -list -v -keystore com.lifearchive.app.keystore -alias LifeArchiveKey
> ```
> 确认 `Entry type` 为 `PrivateKeyEntry` 且 `SHA-256` 指纹已记录到本文件下方表格。

### 2.3 有效期

- 生成时用 `-validity 36500`（100 年），避免"三年后证书过期无法更新"。
- 依据 `06` 号文件提交前自检第 1 条：「三年后我的签名证书过期了怎么办？」

### 2.4 指纹记录（拿到后填）

| 项 | 值 |
|---|---|
| 别名 | `LifeArchiveKey` |
| 签名算法 | `SHA256withRSA` |
| 有效期 | 36500 天 |
| SHA-1 指纹 | `TODO(待补充)` |
| SHA-256 指纹 | `TODO(待补充)` |
| 签名方案 | **V1 + V2（+V3）**，云打包时勾选 |
| 渠道 | `huawei` / `oppo` / `vivo` / `xiaomi` / `honor` / `yyb` |
| 产物 | **APK**（国内上架；Google Play 用 AAB） |

### 2.5 云打包配置位置

- HBuilderX 菜单：发行 → App-Android 云打包 → 勾选 **V1 + V2（+V3）** 签名
- 密码**不写入** `manifest.json`；HBuilderX 会写入本机配置文件，该配置文件**不得提交进 git**
- **自定义调试基座严禁用于上架**（标准基座包名是 `io.dcloud.uniappx`）

### 2.6 安装与验证

```bash
adb devices
adb install -r com.lifearchive.app-v1.0.0-b100-release.apk
adb logcat | grep com.lifearchive.app
```

---

## 三、iOS 签名

### 3.1 需要的文件

| 文件 | 来源 | 说明 |
|---|---|---|
| `.p12` | Apple Developer 后台「Certificates」申请 Distribution 类型 → 导出 | 包含私钥与证书链，**必须设置密码** |
| `.mobileprovision` | Apple Developer 后台「Identifiers」→ Bundle ID `com.lifearchive.app` → 「Profiles」创建 Distribution | 每应用每环境一份，**必须与 `.p12` 配套** |

### 3.2 Apple Developer 后台申请流程（逐步）

1. 登录 Apple Developer（`developer.apple.com`）→ 账号主体必须为 `TODO(待补充：营业执照主体全称)`（企业账号需 D-U-N-S 编码）。
2. **Certificates, Identifiers & Profiles** → `Certificates` → `+` → 选 **App Store**（若用 TestFlight/TestFlight 分发则为 `App Store and Ad Hoc`）→ 上传 CSR → 下载 `.cer` → 用钥匙串串出 `.p12`。
   - **CSR 文件不落在仓库**，用 `openssl` 或 Xcode「钥匙串访问 → 证书助理 → 请求证书颁发机构证书」在仓库外生成。
3. **Identifiers** → 注册 Bundle ID `com.lifearchive.app`（必须与 `manifest.json` 的 `bundleid`、鸿蒙 `bundleName` **完全一致**）。
4. **Profiles** → `+` → 选 App Store → 选择刚注册的 App ID → 选择第 2 步的证书 → 命名 → 下载 `.mobileprovision`。
5. 全部文件放入 `D:\certs\ios\`，**并做离线备份**。

### 3.3 出包与上传

- HBuilderX 云打包（Windows **只能云打包**出 `.ipa`）。
- 上传分发：**Transporter** 或 Xcode Organizer → App Store Connect → **TestFlight**。
- TestFlight：内部测试 100 人即时生效；外部测试最多 1 万人，需短审（通常 <24h）。
- 建议正式提交前**先走一轮 TestFlight 外部测试**。

### 3.4 续期提醒

| 项 | 值 |
|---|---|
| `.p12` 到期日 | `TODO(待补充)` |
| `.mobileprovision` 到期日 | `TODO(待补充)` |
| 续期方式 | 到期前在 Apple Developer 后台重新申请证书与 Profile，重新出包上传 |
| 提醒机制 | 剩余有效期 < 60 天时，在本文件标注并处理 |

### 3.5 必做：`PrivacyInfo.xcprivacy`

> **自 2024-05-01 起 iOS 强制要求**，缺失或无效即被拒。**当前状态：未生成。**
>
> | reason code | 触发条件（本项目） | 预计需要 |
> |---|---|---|
> | `CA92.1` | UserDefaults | ✅ 需声明（本地令牌与同意标记） |
> | `C617.1` | FileTimestamp | 视实际 API 调用，**待核** |
> | `7D9E.1` | DiskSpace | 视实际 API 调用，**待核** |
>
> 提交前用 Xcode `Product > Generate Privacy Report` 校验。
> 详见 [`上架台账.md`](./上架台账.md) 的对应条目。

---

## 四、HarmonyOS 签名

### 4.1 完整链路

```
DevEco Studio: Build > Generate Key and CSR
        ↓
   产出 com.lifearchive.app.p12  +  com.lifearchive.app.csr
        ↓
AGC: 用户与访问 > 证书管理 > 新增证书（发布证书）> 上传 .csr
        ↓
   产出 com.lifearchive.app.cer
        ↓
AGC: HarmonyOS 应用 > HAP Provision Profile 管理 > 添加（类型=发布）> 上传 .cer
        ↓
   产出 com.lifearchive.appRelease.p7b
        ↓
DevEco: File > Project Structure > Signing Configs
        ↓
Build Hap(s)/APP(s) > Build APP(s)  →  com.lifearchive.app.app
```

### 4.2 ★ 每账号仅 1 个发布证书

> ## ⚠️ 关键限制
>
> **每个华为开发者账号最多只能有 1 个发布证书。**
>
> 后果：
> - 申请之前**必须**确认 `.p12` 私钥已备份到至少两处离线介质。
> - **丢失发布证书 = 无法出包**。删除证书会影响已上架版本的更新能力。
> - 不要为了"重新开始"而删除旧证书。
>
> **调试证书**（DevEco 自动申请）无此限制，可随时重签；**发布证书**不可。

### 4.3 发布 Profile

- AGC「HarmonyOS 应用 → HAP Provision Profile 管理 → 添加（类型=发布）」→ 下载 `.p7b`。
- **每应用最多 100 个**。
- 需**ACL 受限权限**时，必须先向 `agconnect@huawei.com` 申请开通。
  > 当前 `module.json5` 声明的 3 条权限均为 `normal` 级别，**不需要 ACL**。若未来新增 ACL 权限，此处必须同步。

### 4.4 DevEco 签名配置

`frontend/harmony-configs/build-profile.json5` 已同步配置结构（**密码为占位符，从环境变量注入**）：

| 字段 | 发布配置项的值 | 说明 |
|---|---|---|
| `name` | `release` | **必须叫 `release`**（调试项名 `default`） |
| `type` | `release` | — |
| `signAlg` | `SHA256withECDSA` | **固定值，不可改** |
| `keyAlias` | `LifeArchiveKey` | 与 `.p12` 内别名一致 |
| `storeFile` | `TODO(待补充：仓库外路径)` | 仓库内只写占位说明 |
| `storePassword` | `TODO(待补充：CI Secrets 注入)` | **绝不写入仓库** |
| `keyPassword` | `TODO(待补充：CI Secrets 注入)` | **绝不写入仓库** |
| `signingVersion` | `1` | — |
| `signingProfile` | `TODO(待补充：.p7b 路径)` | 仓库外 |

同时在 DevEco 中：**取消**「Automatically generate signature」。

### 4.5 ⚠️ 自签名不再被接受

> - 出包必须用 **AGC 关联的发布证书**签名，DevEco 自签名产物**上传 AGC 会失败**。
> - release 模式**不支持断点调试与热更新**，出包前必须在 debug 模式先验证一遍主流程。
> - 产物必须是 `.app`（发行）；`.hap`（调试）不可上架。

### 4.6 安装与验证

```bash
hdc list targets              # 列出设备
hdc shell bm get -u           # 查看设备 UDID
hdc install -r com.lifearchive.app.app
```

> ⚠️ **禁止用 `adb` 安装鸿蒙包，必须用 `hdc`。**

### 4.7 鸿蒙证书台账

| 项 | 值 |
|---|---|
| 发布证书别名 | `LifeArchiveKey` |
| `.p12` 密码存放位置 | `TODO(待补充：CI Secrets / 密码管理器条目名)` |
| `.cer` 序列号 | `TODO(待补充)` |
| `.cer` 有效期至 | `TODO(待补充)` |
| `.p7b` 有效期至 | `TODO(待补充)` |
| AGC 应用名称 | `TODO(待补充)` |
| `bundleName`（须与 `manifest.json` 完全一致） | `com.lifearchive.app` |
| 离线备份位置 | `TODO(待补充)` |

---

## 五、密码存放位置（**只写位置，不写值**）

> ## 本节内容永远是"存放于 XXX"，永远不是密码本身
> `scripts/check-secrets.mjs` 会扫描 `keystorePassword` / `storePassword` / `keyPassword` 等字段的字面量，入库即阻断。

| 密码 | 存放位置 | 备注 |
|---|---|---|
| Android keystore 密码 | `TODO(待补充：密码管理器条目名 / CI Secrets 键名)` | CI Secrets 键名建议 `ANDROID_KEYSTORE_PASSWORD` |
| Android 私钥密码 | 同上（**必须与 keystore 密码一致**） | CI 键名建议 `ANDROID_KEY_ALIAS_PASSWORD` |
| iOS `.p12` 密码 | `TODO(待补充：密码管理器条目名 / CI Secrets 键名)` | CI 键名建议 `IOS_P12_PASSWORD` |
| iOS 描述文件密码 | 通常与 Apple ID 关联，存放于钥匙串 | — |
| 鸿蒙 `.p12` 密码 | `TODO(待补充：密码管理器条目名 / CI Secrets 键名)` | CI 键名建议 `HARMONY_P12_PASSWORD` |
| 鸿蒙 keyAlias 密码 | 同上 | CI 键名建议 `HARMONY_KEY_ALIAS_PASSWORD` |
| 证书离线备份 | `TODO(待补充：物理介质位置)` | 至少两处，与本机不同步 |

### 5.1 权限分级（谁能看到什么）

| 角色 | 可见内容 | 说明 |
|---|---|---|
| 主体负责人 | 密码管理器主条目 | 唯一持证人 |
| 出包操作人 | CI Secrets 注入权限 | **不告知明文**，只知如何调用 |
| 新同事 | 只能看本台账 | 拿不到证书实体，也拿不到密码 |
| 代码审查人 | 只能看到"存放于 XXX" | 永远看不到值 |

---

## 六、灾难恢复流程

> **前提：签名不可更换。丢失 = 不可逆的用户损失。**

### 6.1 灾难场景与预案

| 场景 | 影响 | 恢复流程 | 可行性 |
|---|---|---|---|
| 密钥库密码遗忘，证书文件还在 | 证书无法读取 | 从密码管理器取回；取不回则**无法恢复** | ⚠️ 依赖密码管理器 |
| `.p12` / `.keystore` 文件丢失，密码还在 | 无法出包 | 从离线备份（U 盘/另一台机器）恢复 | ✅ **必须至少有 1 份离线备份** |
| 文件与密码全丢 | **无法出包** | **不可恢复**。安卓/鸿蒙需申请新证书（鸿蒙删除旧证书会影响已上架版本） | ❌ |
| 证书被误提交进 git | 需视为已泄露 | ① 立即 `git rm --cached` 并提交 ② **视为已泄露，按 6.2 处理** ③ 若已推送，联系远端清除历史（Force Push 需团队一致同意） | ⚠️ |
| 证书有效期临近 | 到期后无法更新 | 平台续期流程（见各端章节） | ✅ 前提是**提前 90 天**发现 |
| 签名配置密码占位符未替换 | 打包失败 | 从 CI Secrets 注入后重试 | ✅ 不会造成泄露 |

### 6.2 证书泄露应急

1. **立即**停止所有出包与上传操作。
2. Android：生成新证书库 → 提交到各市场申请"更换签名"（多数市场允许但需审核，且**部分市场仅支持在特殊情形下更换**）。
3. iOS：吊销泄露的 Distribution 证书 → 重新申请 → 重新出包上传（App Store 允许在生效前用新证书上传，已上架版本的更新可用新证书）。
4. 鸿蒙：⚠️ **每账号仅 1 个发布证书**，处理极其困难。必须联系华为开发者支持确认路径。
5. 在本文件「事件记录」中记录全过程。

### 6.3 备份策略

| 要求 | 做法 |
|---|---|
| 份数 | **≥ 2 份**（本机 `D:\certs\` + 一份离线介质） |
| 介质 | 离线 U 盘 / 另一台**不参与同步**的机器。**禁止**放在 OneDrive、网盘同步目录（本项目主仓库正位于 OneDrive，同步会损坏密钥文件） |
| 加密 | 介质本身启用 BitLocker / 加密卷 |
| 验证 | **每年**至少做一次恢复演练：随机取一份，在隔离环境验证能读出证书信息 |
| 记录 | 在本文件填写备份位置与最近一次验证日期 |

| 项 | 值 |
|---|---|
| 备份位置 1 | `TODO(待补充：路径 + 介质类型)` |
| 备份位置 2 | `TODO(待补充：路径 + 介质类型)` |
| 最近一次恢复演练 | `TODO(待补充：YYYY-MM-DD)` |

---

## 七、事件记录

| 日期 | 事件 | 处理 | 结论 |
|---|---|---|---|
| 2026-10-03 | 建立本台账 | — | 三端证书均未生成/未申请 |
| _待补充_ | _填表：证书生成、申请、续期、备份、恢复演练、泄露事件_ | — | — |

---

## 八、提交前自检

- [ ] 三端证书**实体文件**都不在仓库内（`node scripts/check-secrets.mjs` 零告警）
- [ ] `D:\certs\` 下三端证书齐全，命名符合规范：`{包名}.keystore` / `{包名}.p12` / `{包名}.cer` / `{包名}Release.p7b`
- [ ] 本台账的每个 `TODO(待补充)` 都已替换为真实值（**但密码列只写"存放于 XXX"**）
- [ ] Android：确认 **keystore 密码 == keyPassword**（`keytool -list -v` 已核对）
- [ ] Android：有效期为 **36500 天**
- [ ] iOS：`.p12` 与 `.mobileprovision` 配套，Bundle ID 均为 `com.lifearchive.app`
- [ ] 鸿蒙：`signingConfig` 名为 `release`，`signAlg` 为 `SHA256withECDSA`
- [ ] 鸿蒙：`.cer` 来自 AGC，**不是**自签名
- [ ] 离线备份 ≥ 2 份，且**都不在同步目录**
- [ ] 证书别名统一为 `LifeArchiveKey`
- [ ] 密码只存在于密码管理器 / CI Secrets，**任何配置文件里都没有明文**
- [ ] 三端出包均使用**正式证书**，自定义调试基座未被误用
