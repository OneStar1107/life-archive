# STATUS · 现在到哪了

> **本文件是什么**：项目**滚动状态**的唯一源——当前状态 / 已知问题 / 下一步。
> 每次开发收尾必须更新本文件（AGENTS.md 收尾规矩第 2 项）。
> 对外门面看 [`README.md`](../README.md)，本文件不写给访客看。

版本 `1.0.0` · 更新于 2026-10-25

---

## 当前状态

| 部分 | 状态 |
|---|---|
| 后端 API + 数据库 + 契约 | ✅ 完成（`tsc` 零错误，63 条错误码前后端同源） |
| 前端 17 页 / 9 组件 / 网络层 / Pinia | ✅ 完成 |
| H5 双主题全量巡检（34 项） | ✅ 全过（检测器经 mutant 26/26 反向验证） |
| 前端单元测试 | ✅ jest 105 条全过 |
| 文档体系（AGENTS/PRD/TODO/工程约定） | ✅ 建成 |
| 开源上线（GitHub `OneStar1107/life-archive`） | ✅ 2026-10-25 完成（CH-010）：双语门面 + 脱敏 + MIT + 单 commit 干净历史 |
| Android 真机链路（签名 / 联调前置 / runbook） | ✅ 配置与文档就绪（CH-006） |
| **Android 真机主流程验证** | ⛔ **未做**——等装机验证，见 CH-009 |
| **三端商店上架** | ⛔ **未做**——需软著 / ICP / APP 备案，见 TODO T-03 |

## 已知问题

| # | 问题 | 状态 |
|---|---|---|
| 1 | 项目根路径含中文，**鸿蒙编译会失败或发行后闪退**（Android / H5 不受影响） | 未整改，见 `docs/project/工程红线自检.md` |
| 2 | 营业执照主体全称未提供（代码内 60+ 处 `TODO(待补充)` 占位） | 待用户提供，见 `docs/project/占位符取值表.md` |
| 3 | 联调临时改动（`usesCleartextTraffic` + `DEV_BASE_URL` 局域网 IP）尚未还原 | 待 CH-009 验证后还原。**注意：未提交的工作区改动不会进公开仓库** |

## 下一步

1. **补传 CI 文件**（CH-010 遗留）：`.github/workflows/ci.yml` 因本机网络拦截 `workflows` 路径未能上传。在能直连 github.com 的网络（或挂梯子）下执行 `git push --force origin main` 一步补上——本地 main 已含该文件
2. **Android 真机验证主流程**（PRD `CH-009`）：装云打包 apk → 登录 → 列表刷数据 → 断网横幅；通过后回填 `test-matrix.md` 并还原联调临时改动
3. **评估「遗忘仪式」落地**（TODO `N-01`）：原型已验证，要做先移 PRD 建条目等确认
4. 补齐营业执照主体全称（TODO `T-03` 的前置）

## 入口

| 我想… | 看这份 |
|---|---|
| 让 AI 接着干活（先读这个） | [`AGENTS.md`](../AGENTS.md) |
| 查需求条目 / 变更历史 | [`docs/prd.md`](prd.md) |
| 查暂时不做 / 新想法 | [`docs/todo.md`](todo.md) |
| 起项目 / 查命令 / 红线 | [`docs/project/工程约定.md`](project/工程约定.md) |
| 查占位符取值 | [`docs/project/占位符取值表.md`](project/占位符取值表.md) |
| 三端出包 / 签名 / 测试矩阵 | [`docs/release/`](release/) 各册 |
| 隐私 / 权限 | [`docs/privacy/`](privacy/) 三份 |
