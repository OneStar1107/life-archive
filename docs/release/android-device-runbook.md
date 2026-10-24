# Android 真机 / 模拟器验证 runbook

> **这份文档解决什么**：`test-matrix.md` 里那张设备矩阵现在全是「未覆盖」，因为三端都还没出包。
> 本文件给出**在 Windows 上把 Android 端真正跑起来**的最短可执行路径。
>
> **为什么先从 Android 起**：iOS 自动化在 Windows 上跑不了（需 macOS runner），
> 且 iOS 的 `uni-automator` 只支持模拟器不支持真机；鸿蒙无云打包、必须本地 DevEco Studio。
> 所以 Windows + 无开发者账号时，**Android 是唯一能立刻跑通的一端**。

---

## 〇、分工：C: 是源，D: 是出包副本

项目根路径含中文，会让鸿蒙编译失败、也让本地打包踩各种编码坑。
解决办法不是搬走开发位置，而是**保留一份无中文的出包副本**：

| 位置 | 角色 | 说明 |
|---|---|---|
| `C:/Users/hyx11/WorkBuddy/Worktrees/人生档案APP开发/main-e001ba0f` | **源（唯一真源）** | 日常开发、提交都在这里 |
| `D:/hbuild/lifearchive` | **出包副本（只读使用）** | HBuilderX 打开这个目录出包，**不要在这里改代码** |

副本的 `origin` 已指向源，每次出包前同步一次即可：

```bash
cd /d/hbuild/lifearchive && git pull --ff-only
```

★ 一旦有人在 D: 里改代码，两份就会分叉 —— 出包副本**只做 `git pull`**，不提交、不编辑。

---

## 一、前置清单（状态截至 2026-10-05）

| # | 项 | 状态 | 说明 |
|---|---|---|---|
| 1 | 无中文路径副本 | ✅ 已建 | `D:/hbuild/lifearchive` |
| 2 | Android 签名 keystore | ✅ 已生成 | `D:\certs\android\com.lifearchive.app.keystore`，别名 `LifeArchiveKey`，RSA 2048 / 36500 天。<br>**口令不入库**，见 `D:\certs\android\README-本机口令.txt` 与密码管理器（台账 `signing-ledger.md`） |
| 3 | HBuilderX | ✅ 已装 | `E:/HBuilderX`。自带 Amazon Corretto（`plugins/amazon-corretto/bin/keytool.exe`）与 `adb`（`plugins/launcher-tools/tools/adbs/adb.exe`） |
| 4 | 后端可被设备访问 | ⚠️ 需临时改两处 | 见第四节：**`usesCleartextTraffic` 放开明文 HTTP** + `DEV_BASE_URL` 选对地址 + 放行防火墙 |
| 5 | Android 设备 | ⬜ 待你准备 | 真机或模拟器都可以 |
| 6 | 正式签名 vs 调试签名 | ⚠️ 注意 | **上架必须用上面的正式 keystore**；自定义调试基座（包名 `io.dcloud.uniappx`）绝不可用于上架 |

---

## 二、出包

1. HBuilderX → 文件 → 打开目录 → 选 **`D:/hbuild/lifearchive`**
2. 选中项目 → 发行 → App-Android/iOS → 云打包（或本地打包）
3. 证书处填写：
   - 证书文件路径：`D:\certs\android\com.lifearchive.app.keystore`
   - 证书别名：`LifeArchiveKey`
   - 证书私钥密码：（口令文件里的那个）
   - **勾选「使用自有证书」**，不要用 DCloud 公用证书
4. 出包前先跑一遍 `docs/release/build-checklist.md`，任何一项打不了勾就**停止出包**

---

## 三、装到设备

### 3.1 真机（USB）

```bash
# 手机开「开发者选项 → USB 调试」，用数据线连电脑
"E:/HBuilderX/plugins/launcher-tools/tools/adbs/adb.exe" devices
#   → 看到设备号且状态是 device 才继续；unauthorized 需在手机上点「允许调试」

"E:/HBuilderX/plugins/launcher-tools/tools/adbs/adb.exe" install -r <产出的 .apk 路径>
```

### 3.2 模拟器

没有真机就用 Android 模拟器（HBuilderX 可直接「运行到手机或模拟器 → 模拟器」）。
模拟器能覆盖矩阵里的**小屏 / 大屏 / 折叠屏展开态**（用可调整分辨率的 AVD），
但**覆盖不了**：刘海与灵动岛的真实安全区、Home Indicator、真实性能数据（冷启动/耗电）。

---

## 四、让设备访问后端（这一步不做，主流程全挂）

这一节有四道坎，**漏任何一道都会表现为「App 打不开 / 一直转圈 / 列表全空」，而且看不出原因**。
四道都要做。

### 4.0（最容易漏）先放开明文 HTTP

`frontend/manifest.json:37` 是 `"usesCleartextTraffic": false`，
而 `targetSdkVersion` 是 34 —— **Android 9 起默认拦截所有 `http://` 请求**，这条是强制的。
本项目的 dev 后端是 `http://` 不是 `https://`，所以**不改这个，IP 写对了也连不上**。

出包前在 **D: 副本**临时改成 `true`：

```jsonc
// frontend/manifest.json 第 37 行
"usesCleartextTraffic": true,     // ← 仅 dev 出包；正式出包前必须改回 false
```

> ★ 正式上架的包要走 HTTPS，这一项**必须回到 `false`**。

### 4.1 选一个「电脑在你设备眼里叫什么」

`frontend/core/env/env.ts` 第 36 行 `DEV_BASE_URL` 默认 `http://127.0.0.1:3000`。
**真机上的 `127.0.0.1` 是手机自己**，所以必须换成下面三种之一：

| 场景 | 该填什么 | 额外条件 |
|---|---|---|
| **真机 + 同一 WiFi**（最省事，推荐） | `http://<你的局域网IP>:3000`<br>（你电脑的局域网 IP） | 手机与电脑同 WiFi；需放行防火墙（4.2） |
| **真机 + 仅 USB 线**（不想开防火墙） | 保持 `http://127.0.0.1:3000` 不变 | 每次连上 USB 后执行 `adb reverse tcp:3000 tcp:3000`，把手机的 3000 端口隧道到电脑 |
| **Android 模拟器** | `http://10.0.2.2:3000` | 模拟器里 `10.0.2.2` 就代表宿主机，这是固定值 |

改法（**只改 D: 副本，绝不改 C: 源**）：

```ts
const DEV_BASE_URL: string = 'http://<你的局域网IP>:3000'   // ← 按上表选一个
```

### 4.2 放行 Windows 防火墙（仅 WiFi 方案需要）

**以管理员身份**打开 PowerShell（开始菜单搜 PowerShell → 右键 → 以管理员身份运行），粘贴：

```powershell
netsh advfirewall firewall add rule name="LifeArchive Dev 3000" dir=in action=allow protocol=TCP localport=3000
```

看到「确定。」就成了。不想用命令就走图形界面：
Windows 安全中心 → 防火墙和网络保护 → 高级设置 → 入站规则 → 新建规则 → 端口 → TCP → 特定本地端口填 `3000` → 允许连接 → 全勾选 → 名称填 `LifeArchive Dev 3000`。

### 4.3 验证

后端确认在监听所有网卡（已经是 `0.0.0.0:3000`）：

```
netstat -ano | findstr :3000
```

然后**在手机浏览器里**打开 `http://<你的局域网IP>:3000/docs` —— 能出 Swagger 页面就通了。
手机浏览器也打不开的话，App 里一定也打不开，先别往下走。

> 查本机局域网 IP：`ipconfig | findstr /i "IPv4"`
> 多个网卡时挑 **WLAN** 那个（挑 WLAN/以太网那块；
> `198.18.x` 是 VPN 虚拟网卡、`172.30.x` 是 WSL，都不对）。

---

## 五、验完必须还原（否则会带进正式包）

第四节那两处改动是**临时**的，正式包绝不能带。因为它们只存在于 **D: 副本**，还原就是一条命令：

```bash
cd /d/hbuild/lifearchive
git checkout -- frontend/manifest.json frontend/core/env/env.ts
git diff --stat        # ← 应为空
```

还原后要确认这两处回到了：

- `frontend/manifest.json:37` → `"usesCleartextTraffic": false`
- `frontend/core/env/env.ts:36` → `const DEV_BASE_URL: string = 'http://127.0.0.1:3000'`

★ 正式出包前把 `build-checklist.md` 再走一遍，**签名要用正式 keystore**，
不要用调试基座（包名 `io.dcloud.uniappx`）。

## 六、按矩阵逐项填表

打开 `docs/release/test-matrix.md`，每测完一行就把「验证状态」从 `未覆盖` 改成
`已通过` 或 `有缺陷`，缺陷行在备注里记**缺陷编号 + 复现步骤**，
并在「四、验证记录」追加一行（日期 / 设备 / 端 / 覆盖用例组 / 结果 / 验证人）。

优先级建议（决定审核生死的先测）：

1. **折叠屏展开/折叠 10 次** —— 07 号禁止事项第 9 条：监听器必须 `offWindowResize`，漏了会越切越卡
2. **深色模式全页面截图** —— 无白块、对比度达标；深浅两套都要归档
3. **弱网 / 断网 / 超时** —— 第一屏要给用户看的离线提示，不能是报错堆栈
4. **401 并发刷新** —— 10 个并发 401 只能触发 1 次 refresh，需抓包证据
5. **冷启动首帧** ≤1100ms、热启动 ≤800ms —— **必须用 release 包测**，debug 数据不作数
6. **大字体**（系统字体调到最大）与**横竖屏切换 10 次**

---

## 七、已知的坑

| 坑 | 现象 | 处理 |
|---|---|---|
| **真机连不上后端，IP 明明是对的** | 列表全空 / 一直转圈 / 无报错 | 99% 是 `usesCleartextTraffic: false` 拦了 `http://`，见 4.0 |
| 真机白屏但 H5 正常 | 多半是 `DEV_BASE_URL` 没配对 | 按 4.1 的表选地址 |
| 改了后端但 H5 页面行为没变 | H5 走同源、由 manifest 代理转发到 `:3000` | 重启 3000 上的实例，否则命中旧逻辑，表现为莫名其妙的 400 |
| 鸿蒙出包必挂 | `cannot find record '&@dcloudio/uni-app-harmony/index&1.0.0'` | 根路径含中文所致，用 `D:/hbuild/lifearchive` 出包 |
| 真机白屏但 H5 正常 | 多半是 `DEV_BASE_URL` 没改成局域网 IP | 按第四节处理 |
| 折叠几次后越来越卡 | `onWindowResize` 没配对解绑 | 走 `npm run lint:platforms` 只能查 `#ifdef`，这条要靠真机 + `check:redlines` 规则 4 |
| 用手机构建号当 release 数据 | 商店驳回 / 数据失真 | 性能专项必须在 release 包上测 |

---

## 八、相关文档

- [`./test-matrix.md`](./test-matrix.md) —— 要填的那张表
- [`./build-checklist.md`](./build-checklist.md) —— 出包前逐条打勾
- [`./signing-ledger.md`](./signing-ledger.md) —— 证书台账（口令不入库）
- [`./h5-smoke.md`](./h5-smoke.md) —— H5 无头巡检（先于真机发现大部分渲染问题）
- [`../project/工程红线自检.md`](../project/工程红线自检.md) —— 路径整改
- [`../prompts/07-三端测试体系.md`](../prompts/07-三端测试体系.md) —— 达标线来源
