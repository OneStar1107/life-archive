# PRD · 需求与变更记录

> **本文件是什么**：人生档案项目**需求与改动的唯一记录源**。每一个改动都有编号，
> 写清问题、规则和状态；每一次实现完毕都在文末「变更记录」补一行。
>
> **同一件事只记一处**：条目级变更只在这里记，别处（README / TODO / CHANGELOG）用链接指向本文件。
> 版本对外说明在 [`docs/release/CHANGELOG.md`](release/CHANGELOG.md)（发版时写），那条线不重复记条目。
>
> **流程铁律**（详见 [`AGENTS.md`](../AGENTS.md)）：新想法先进 [`docs/todo.md`](todo.md)；
> 决定要做，先在本文件建条目（状态=待确认）；**用户确认后才允许写代码**。

---

## 编号与状态规则

| 项 | 规则 |
|---|---|
| 编号 | `CH-` + 三位数字，从 001 起**只增不减、不复用**（废弃条目也留在表里，状态标 `已废弃`） |
| 状态机 | `待确认 → 已确认 → 已实现`；中途放弃走 `已废弃`（必须写放弃原因） |
| 问题 | 写现象 + 根因，带 `文件:行号`，不写「优化一下」这种空话 |
| 规则 | 写**可验证的验收标准**（怎么算修好了），不写实现步骤 |
| 落点 | 改了哪些文件、哪个提交；测试结论链接 |
| 变更记录 | 实现完毕**当天**补一行：编号 / 日期 / 提交 / 一句结论 |

---

## 一、需求条目

### CH-001 「你」页未登录态登录按钮不可见

- **问题**：未登录用户打开「你」页，看不到登录入口，无处可去（`frontend/pages/mine/index.uvue`）
- **规则**：未登录态必须显示明确的登录/注册入口，点击可到登录页
- **状态**：✅ 已实现（2026-10-04）
- **落点**：`frontend/pages/mine/index.uvue`；提交 `4e1bedf`

### CH-002 记忆图谱空白（uni-app x 画布 API 不兼容）

- **问题**：记忆页图谱区域一片空白。根因：uni-app x **不支持旧版同步 `createCanvasContext`**，老写法拿不到上下文
- **规则**：图谱在 iOS / Android / 鸿蒙三端均可绘制；H5 冒烟 34 项中图谱相关全过
- **状态**：✅ 已实现（2026-10-04）
- **落点**：`frontend/pages/memory/index.uvue`；提交 `2508af3`

### CH-003 全站白茫茫（主题 CSS 变量无人定义）

- **问题**：全站白底黑字、无卡片质感。根因：色值只定义在 `frontend/theme.json`，而 uni-app x 官方明确 theme.json **只**负责 pages.json/tabBar 的变量解析，页面自己的 CSS 变量框架不注入 → 所有 `var(--color-bg)` 取初始值
- **规则**：全局样式（`frontend/App.uvue` 非 scoped `<style>`）定义 `.theme-light` / `.theme-dark` 两套同名变量，与 theme.json 逐字一致；每页根节点 `:class="themeClass"` 挂其一
- **状态**：✅ 已实现（2026-10-04）
- **落点**：`frontend/App.uvue`；提交 `11891f4`

### CH-004 图谱节点不可见 + 深色模式 dock 白带

- **问题**：两个叠加缺陷——① 图谱 canvas 先画后量，拿到 0 尺寸 → 节点画在画布外；② 深色模式底部 dock 分层白带：uni-h5 对 tabBar 页即使 `custom:true` 仍按原生 tabBar 高度预留底部空间，而原生栏已被全局样式隐藏，预留区「无主」透出白色画布
- **规则**：① canvas **先量后画**；② `.uni-app--showtabbar uni-page-wrapper { height:100% !important }` + `uni-page-body::after { display:none !important }`，自定义 tabBar 自带等高占位
- **状态**：✅ 已实现（2026-10-05）
- **落点**：`frontend/pages/memory/index.uvue`、`frontend/App.uvue`；提交 `227cfc1`（含健康页浮点精度，同批治理）

### CH-005 17 页 × 双主题全量巡检体系化

- **问题**：缺陷全靠用户截图发现，没有系统化回归手段；且 `check-redlines` 自身有 68 处误报（自定义属性定义行被误判），门禁名存实亡
- **规则**：① 新增 `frontend/scripts/smoke-pages.mjs`：17 页 × 深浅双主题 = 34 项无头巡检（双路白块检测：网格点采样 + 元素枚举，含 CSS alpha 合成与 chroma 过滤）；② 检测器本身必须用 mutant 反向验证（人工注入真问题证明抓得到）——首轮 mutant 测出 4 类漏报（渐变白块 / `::before` 白块 / 采样盲区 / 低于门限），加固后 26/26 全抓到；③ `check-redlines` 误报清零
- **状态**：✅ 已实现（2026-10-05）
- **落点**：`frontend/scripts/smoke-pages.mjs`、`frontend/scripts/check-redlines.mjs`；文档 `docs/release/h5-smoke.md`；提交 `ef3c915` / `a4327be` / `ce03138`

### CH-006 Android 真机验证链路打通

- **问题**：`test-matrix.md` 设备矩阵全「未覆盖」（三端未出包）；真机联调有两个隐藏前置：① `targetSdkVersion 34` 下 Android 9+ 默认拦截 `http://` 明文，`usesCleartextTraffic` 不改则真机连不上后端且无报错；② `DEV_BASE_URL` 默认 `127.0.0.1`，在手机上指向手机自己
- **规则**：① `D:/hbuild/lifearchive` 为无中文路径出包副本，**只读使用**（只 `git pull`，不编辑不提交）；② 联调需临时改两处（cleartext + 局域网 IP）+ 防火墙放行 3000，**验完必须还原、绝不提交**；③ 出包用 `D:\certs\android` 正式 keystore（口令不入库）
- **状态**：✅ 已实现（2026-10-05）——文档 / 签名 / 前置条件已交付；**真机跑通主流程本身未完成，见 README 下一步与 CH-009**
- **落点**：`docs/release/android-device-runbook.md`、`docs/release/test-matrix.md`、`docs/release/signing-ledger.md`；提交 `348fece` / `6dfa408`

### CH-007 App 启动图标生成与 DCloud appid 登记

- **问题**：`manifest.json` 图标节点为空（`"icons": {"android": {}, "ios": {}}`）+ appid 未生成，云打包连续被拦
- **规则**：① 图标用**代码绘制**（`scripts/gen-app-icons.py`，Pillow）而非生图模型——启动图标有硬几何约束（主体落在中心 66% 安全区、边缘铺满不透明、48px 下仍可辨认），代码一次画对且可重复重建；源图 `frontend/static/app-icon-source.png` 入库，产物在 unpackage（gitignore，clone 后重跑脚本重建）；② iOS 图标留空（键名结构未验证，填错反触发「配置错误」）；③ appid `__UNI__1510C02` **一次定死，永不再点「重新获取」**
- **状态**：✅ 已实现（2026-10-05）
- **落点**：`scripts/gen-app-icons.py`、`frontend/static/app-icon-source.png`、`frontend/manifest.json`、`docs/project/占位符取值表.md`；提交 `343f66e`

### CH-008 Android uts 编译失败（事件回调内联类型暗雷）

- **问题**：云打包发行编译失败，报错落在调用方 `App.uvue`（.tsc 中间产物行号）。根因：`core/platform/index.ts` 事件封装给 uni API 回调写**内联对象类型**（`{ isConnected: boolean; type: string }`），而官方字段是 `networkType`——H5 的 esbuild 不查类型侥幸通过，Android 的 uts 编译器（Kotlin 严格检查）直接失败
- **规则**：① 给 uni API 回调写参数，一律用**官方全局类型名**（`OnNetworkStatusChangeCallbackResult` / `OnThemeChangeCallbackResult` / `ShowModalSuccess`，全局注入无需 import）；② `onWindowResize` 因类型库无 `OnWindowResize*` 定义，签名收窄为 `() => void` + 零参 handler 绕开类型名；③ 排查手法：`grep -rn "(res: {\|(result: {" frontend/` 找直传 API 的标注
- **状态**：✅ 已实现（2026-10-05）
- **落点**：`frontend/core/platform/index.ts`、`frontend/pages/mine/settings.uvue`；提交 `04e1640`；jest 105 条全过

### CH-009 Android 真机主流程验证

- **问题**：CH-006 只打通了链路（文档 / 签名 / 前置），**还没有人在真机上跑过主流程**——装机、登录、列表刷数据、断网横幅均未验证
- **规则**：① 后端运行中 + 手机与电脑同 WiFi + 防火墙放行 3000；② 主流程（登录 → 记录 → 图谱 → 离线横幅）在真机全通过；③ 结果回填 `docs/release/test-matrix.md` 对应行
- **状态**：🟡 待确认（等用户装机验证结果；联调临时改动还原也依赖这一步）
- **落点**：待定（预计只动 test-matrix.md + 还原两处临时改动）

---

## 二、变更记录

> 每实现完毕一条，当天补一行。「已同步」列登记 README / TODO 是否已跟着更新（收尾规矩，见 AGENTS.md）。

| 编号 | 日期 | 提交 | 结论（一句） | 已同步 |
|---|---|---|---|---|
| CH-001 | 2026-10-04 | `4e1bedf` | 「你」页补未登录态登录入口 | README ✅ / TODO — |
| CH-002 | 2026-10-04 | `2508af3` | 图谱改新画布 API，空白修复 | README ✅ / TODO — |
| CH-003 | 2026-10-04 | `11891f4` | 主题变量改全局样式唯一定义，白茫茫修复 | README ✅ / TODO — |
| CH-004 | 2026-10-05 | `227cfc1` | 先量后画 + dock 预留区治理（含健康浮点） | README ✅ / TODO — |
| CH-005 | 2026-10-05 | `ef3c915` `a4327be` `ce03138` | 34 项巡检 + mutant 26/26 + 门禁误报清零 | README ✅ / TODO — |
| CH-006 | 2026-10-05 | `348fece` `6dfa408` | Android 链路三件套（runbook / 签名 / 前置） | README ✅ / TODO — |
| CH-007 | 2026-10-05 | `343f66e` | 图标代码生成 + appid 登记 | README ✅ / TODO — |
| CH-008 | 2026-10-05 | `04e1640` | uts 回调类型改官方类型名 | README ✅ / TODO — |
