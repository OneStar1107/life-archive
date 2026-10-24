# 鸿蒙权限台账

> **本文件的用途**
> 本文件是「人生档案」（`com.lifearchive.app`）HarmonyOS 端**权限声明台账**，与 `frontend/harmony-configs/entry/src/main/module.json5` 的 `requestPermissions` 数组**逐条一一对应**。
>
> 依据 `06-三端构建与真机调试.md` DoD：
> > 「`docs/release/harmony-permissions.md` 条目数 == `module.json5` 声明数 == 隐私政策披露数」
>
> 依据 `08-三端上架发布.md` C10 驳回清单第 1 条：
> > 「权限 `usedScene` / `reason` 缺失或理由笼统」→ 必驳
>
> **什么时候填**
> 1. 每次增删改 `module.json5` 的 `requestPermissions` 后，**当日**回填本表。
> 2. 每次鸿蒙出包（Build APPs）前核对一次。
> 3. 提审前与隐私政策、App Store 隐私标签做四方口径比对（见 `docs/privacy/permission-comparison.md`）。

---

## 一、权限清单（3 条，与 `module.json5` 逐条对应）

| # | 权限名 | 类型 | 权限等级 | `reason`（`string.json` key） | `usedScene.abilities` | `usedScene.when` | 对应业务场景 | 运行时是否弹窗 | 是否可裁剪 | 代码调用位置 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `ohos.permission.INTERNET` | `system_grant` | `normal` | `$string:internet_reason` | `["EntryAbility"]` | `always` | 调用后端 API 同步全部业务数据：感受记录、记忆图谱与时间轴、旅途列表与地图点位、身体信号趋势、待办、洞察、文件上传下载 | **否**（安装即授予） | ❌ **不可裁剪** | `frontend/core/http/request.ts`（`uni.request` 封装） |
| 2 | `ohos.permission.GET_NETWORK_INFO` | `system_grant` | `normal` | `$string:network_info_reason` | `["EntryAbility"]` | `always` | 判断网络是否可用；无网络时显示可重试的离线提示而非空白页 | **否**（安装即授予） | ❌ **不可裁剪** | `frontend/core/platform/index.ts:375` `networkType()` |
| 3 | `ohos.permission.WRITE_DOWNLOAD_DIR` | `user_grant` | `normal` | `$string:download_reason` | `["EntryAbility"]` | `inuse` | 把用户已选中的图片保存到本地相册 / Download 目录，用作记忆节点配图或旅途封面 | **是**（首次使用时弹窗） | 🟡 **可裁剪**（去掉"保存到本地"功能即可移除） | `frontend/harmony-configs/` 出包侧保存逻辑 |

### 1.1 reason 文案全文（`string.json` 逐字抄录，用于审核现场核对）

| key | 文案 |
|---|---|
| `internet_reason` | 用于人生档案加载你记录的感受、记忆与身体信号，例如同步记忆图谱、获取旅途列表与身体信号趋势 |
| `network_info_reason` | 用于判断当前网络是否可用，在无网络时为你显示可重试的离线提示而不是空白页面 |
| `download_reason` | 用于把你选中的图片保存到本地相册，作为记忆节点或旅途封面的素材 |

> **审核要点**（依据 06 号 C4 与 08 号 C10）：
> - ✅ 「用于同步记忆图谱」——具体到业务场景 + 有具体例子，**通过**
> - ✅ 「在无网络时为你显示可重试的离线提示而不是空白页面」——说明用户可获得什么，**通过**
> - ✅ 「作为记忆节点或旅途封面的素材」——限定了用途，**通过**
> - ❌ 「为了应用正常运行」——**必被驳回，本项目未使用此类文案**
>
> 三条文案均**不含**笼统表述，均**具体到业务场景**，符合审核要求。

### 1.2 权限类型说明

| 类型 | 含义 | 配置要求 | 本项目条目 |
|---|---|---|---|
| `system_grant`（系统授权） | 安装时系统自动授予，**无需**用户同意、无运行时弹窗 | `module.json5` 中**仅需 `name` 字段**即可 | 权限 1、2 |
| `user_grant`（用户授权） | 运行时需动态申请，**必须**有 `reason` + `usedScene` | 缺 `reason` 或 `usedScene` **编译期即报错**：`The reason and usedScene attributes are mandatory for user_grant permissions` | 权限 3 |

> ⚠️ 权限 1、2 属 `system_grant`，`module.json5` 中仍写了 `reason` 与 `usedScene`。这**属于冗余但合法**的写法（`reason` 会被忽略），且在 AGC 自动解析权限列表时能提供更完整的用途说明，属于**有利于审核**的保守策略，保留。

### 1.3 是否可裁剪的逐条判断

| # | 可裁剪？ | 判断依据 |
|---|---|---|
| 1 | ❌ 不可裁剪 | 移除后应用**完全无法联网**，全部业务功能失效 |
| 2 | ❌ 不可裁剪 | 移除后失去离线提示能力；但**技术上**可改用请求失败后的错误处理替代，从而裁剪。当前保留，因为离线提示是明确的产品体验要求，且该权限不采集任何网络身份信息 |
| 3 | 🟡 可裁剪 | 若产品决定不做"保存图片到本地"，可整条移除，不影响核心业务（图片本身是从相册选后上传，保存到本地是附加能力） |

> **最小权限原则复核**：3 条权限全部服务于已上线的具体功能，**无一条是"以防万一"**。无定位、无相机、无麦克风、无通讯录、无存储全盘访问、无剪贴板、无设备标识符读取。
>
> **ACL 受限权限**：3 条均为 `normal` 级别，**不需要**向 `agconnect@huawei.com` 申请 ACL 开通。

---

## 二、四方一致自检

> **判定式**
> ```
> 本台账条数 == module.json5 声明数 == string.json reason 条数 == 隐私政策披露条数
> ```

| # | 对比对象 | 条数 | 一致？ |
|---|---|---|---|
| 1 | `frontend/harmony-configs/entry/src/main/module.json5` → `requestPermissions` | **3** | — |
| 2 | `frontend/harmony-configs/entry/src/main/resources/base/element/string.json` → `*_reason` | **3** | ✅ |
| 3 | 本文件「一、权限清单」 | **3** | ✅ |
| 4 | `docs/privacy/privacy-policy.md` 第 2.2 / 2.3 节披露的对应条目 | **3**（网络类型 / 应用版本与平台 / 图片文件） | ✅ |
| 5 | `docs/privacy/permission-comparison.md` 权限行 | **3** | ✅ |
| 6 | AGC 上传包后自动解析的权限列表 | `TODO(待补充：出包后填写)` | ⬜ 待验证 |

### 2.1 条数结论

> ## ✅ 3 == 3 == 3 == 3
>
> **自检通过。** 后续任何一次权限增删，**必须**当日同步本表并重跑此判定式。

### 2.2 逐条披露对应关系

| # | 权限 | 隐私政策披露章节 | 披露文案是否与 reason 一致 |
|---|---|---|---|
| 1 | `ohos.permission.INTERNET` | 2.3（应用版本号与渠道标识 / 平台标识两行）+ 2.2（全部业务内容） | ✅ 一致：都表述为"传输用户自己录入的数据" |
| 2 | `ohos.permission.GET_NETWORK_INFO` | 2.3 首行（网络类型） | ✅ 一致：都表述为"仅本地判断可用性以显示离线提示，不上传" |
| 3 | `ohos.permission.WRITE_DOWNLOAD_DIR` | 2.2 业务内容表「图片文件」行 | ✅ 一致：都表述为"用户主动选中的图片，用途为头像/记忆配图/旅途封面/日记插图" |

---

## 三、提审前自检清单

> 依据 `08-三端上架发布.md` C10 高频驳回清单

- [x] 权限 `reason` **无缺失**（3/3 均有）
- [x] 权限 `usedScene` **无缺失**（3/3 均有）
- [x] `reason` **不笼统**（逐条含具体业务场景 + 具体例子）
- [x] `usedScene.when` 取值合法（`always` / `inuse`，均为合法枚举）
- [x] `user_grant` 权限（权限 3）同时具备 `reason` + `usedScene`，可正常编译
- [x] 权限数 == 隐私政策披露数（3 == 3）
- [x] 无 ACL 受限权限（故无需申请开通）
- [ ] AGC 上传后「启动自检」解析的权限列表与本表一致 —— ⬜ **待出包后验证**
- [ ] DevEco Testing 本地隐私检测无异常 —— ⬜ **待出包后执行**
- [ ] 权限弹窗文案与 `download_reason` 一致（鸿蒙系统会自动取 `reason` 作为弹窗说明）—— ⬜ **待真机验证**
- [ ] 用户拒绝权限 3 后有降级提示与引导开启设置页的入口 —— ⬜ **待真机验证**（对应 `frontend/core/platform/index.ts:360` 的 `openAppPermissionSettings`）

---

## 四、权限增删流程

1. 修改 `frontend/harmony-configs/entry/src/main/module.json5` 的 `requestPermissions`。
2. 新增权限必须同时在 `string.json` 增加 `*_reason` 文案（**具体到业务场景，禁止"为了应用正常运行"**）。
3. `user_grant` 权限必须**同时**调用 `requestPermissionsFromUser`，并实现**拒绝后的降级与引导**（参考 `frontend/core/platform/index.ts` 的 `openAppPermissionSettings`）。
4. **当日**回填本文件「一、权限清单」，补齐类型、等级、when、业务场景、是否可裁剪、调用位置。
5. 同步 `docs/privacy/permission-comparison.md` 与 `docs/privacy/privacy-policy.md` 第 2.3 / 2.4 节。
6. 若 Android 侧也涉及，同步 `frontend/manifest.json` 的 `android.permissions`；若是敏感权限，还需准备 Android 商店后台的权限用途说明。
7. 重跑第二节的条数判定式。
8. 提审时在 AGC 核对「启动自检」解析结果。

---

## 五、变更记录

| 日期 | 变更 | 条数变化 | 变更人 |
|---|---|---|---|
| 2026-10-03 | 首次建立台账，与 `module.json5` 初始 3 条对齐 | 0 → 3 | `TODO(待补充：填表人)` |
| _待补充_ | _权限增删时在此追加行_ | — | — |

---

## 六、相关文档

- `frontend/harmony-configs/entry/src/main/module.json5` —— 权限声明（唯一真相）
- `frontend/harmony-configs/entry/src/main/resources/base/element/string.json` —— reason 文案
- [`../privacy/permission-comparison.md`](../privacy/permission-comparison.md) —— 五方逐条对照
- [`../privacy/privacy-policy.md`](../privacy/privacy-policy.md) —— 隐私政策
- [`./build-checklist.md`](./build-checklist.md) —— 出包前自检
- [`./上架台账.md`](./上架台账.md) —— 鸿蒙四项一致自检
