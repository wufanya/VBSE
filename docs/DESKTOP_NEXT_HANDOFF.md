# VBSE 发票教学工具 —— 下一位 Agent 开发交接（Windows 桌面版）

> 交接时间：2026-09-26 ｜ 仓库：`G:\AAAAAAAAAAAA\fapiao`（master）
> 相关提交：`ea159af`（桌面版主体）→ `fc37fa2`（业务流冒烟 + 本地运行时打包）→ `ad60d78`（交付汇总文档）
> 原始任务书：`docs/WINDOWS_EXE_HANDOFF.md`；实测记录：`docs/DESKTOP_VERIFICATION.md`；用户文档：`README.md`
> 阅读建议：先看 §0–§2 上手，动手前看 §4、§5、§9，遇到怪问题直接查 §7。

## 0. 一句话现状

Windows 桌面版**已经实现、已经打包、已经在 Windows 11 实机通过安装/升级/卸载与功能冒烟验收**，
可以继续在此基线上做发布加固或功能扩展；**没有半成品功能隐藏在代码里**（占位图标已于 2026-09-26 替换为正式品牌图标，见 §8 P0-1）。

## 1. 已交付产物（均为实机核实）

| 项 | 值 |
| --- | --- |
| 安装包 | `G:\AAAAAAAAAAAA\fapiao\release\VBSE-发票教学工具-Setup-1.0.0.exe`（111,796,678 字节，Windows x64 NSIS） |
| 构建命令 | `npm install` → `npm run desktop:pack`；产物目录 `release/`（已 gitignore） |
| 开发命令 | `npm run desktop:dev` |
| 冒烟命令 | `npm run desktop:smoke`（7 个阶段：basic/write/read/flow/io/print 常规 + badio 边界，约 10s） |
| 回归命令 | `npm run verify` = `build:mp` + 小程序单测 + 桌面冒烟 → 当前**全绿**（7/7 + 1/1） |
| 运行数据 | `%APPDATA%\VBSE发票教学工具\invoice-store.json`（`.bak` 备份） |
| 安装位置 | `%LOCALAPPDATA%\Programs\vbse-invoice-miniprogram\`（目录名取自 package.json `name`，非中文名） |

### 已实测通过（不要再重复踩坑，可直接引用）

- 静默安装 `/S` → 快捷方式（桌面 + 开始菜单）→ GUI 启动 → 数据写入 → 关闭重开数据仍在。
- 同版本覆盖安装（升级）后数据不变；卸载后安装目录/快捷方式/注册表项移除、**用户数据保留**。
- 打印：`Microsoft Print to PDF` 在打印机列表中；`printToPDF` 输出 A4 横向 PDF；打印版式截图人工核对无裁切溢出。
- 离线：主进程阻断全部 `http/https/ws/wss` 请求 + CSP，页面与二维码无网络仍正常。

### 明确未验证 / 未做（交接给下一位）

- 打印对话框里**手动点选打印机并保存文件**的图形交互（打印管线与 PDF 输出已验证）。
- 代码签名（当前未签名，SmartScreen 表现因机器信誉而异）。
- 干净虚拟机级别的隔离安装测试（本轮在开发机上执行，安装前该应用未安装过）。
- ~~正式品牌图标~~（2026-09-26 已完成：源图 `desktop/assets/icon-source.png`，`npm run icons` 生成多尺寸 ICO）。
- CI（2026-09-26 已完成：`.github/workflows/ci.yml` + `release.yml`，发布流程见 `docs/RELEASE.md`；Actions 首次运行结果待观察）。
- 自动更新、macOS/Linux 目标、企业库维护 UI、数据导入导出。

## 2. 快速上手（约 10 分钟）

```bash
npm install                 # 会安装 electron / electron-builder（约 300 包）
npm run verify              # 期望：build:mp 成功 + 7/7 单测 + 1/1 桌面冒烟
npm run desktop:dev         # 期望：打开窗口，标题“VBSE发票教学工具”，表单已填入示例
npm run desktop:pack        # 期望：release/VBSE-发票教学工具-Setup-1.0.0.exe
```

注意事项（都是本轮踩过的）：

- **必须在有桌面会话的 Windows 上跑**（Electron 需要真实窗口；`desktop:smoke` 的 print 阶段会短暂弹出窗口）。
- 打包首次需要联网下载 NSIS 工具链（缓存于 `%LOCALAPPDATA%\electron-builder\Cache`）；Electron 二进制已通过
  `build.electronDist` 指向本地 `node_modules/electron/dist`，**不再下载**。
- 终端工具调用有 30 秒上限，`npm install` / `desktop:pack` 请后台执行并轮询日志（见 §7 坑 1）。

## 3. 仓库地图（关键位置，含行号，行号以 `ad60d78` 为准）

### 3.1 页面（同时服务网页版与桌面版）

`VBSE发票小程序（2.2版).html`（1788 行，单文件，**无任何外部资源**）

| 位置 | 内容 |
| --- | --- |
| L6 | `<meta http-equiv="Content-Security-Policy" ...>`：`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; frame-src 'none'` |
| L62 | `.teaching-badge` 样式（红框教学标注徽标） |
| L799 | 顶栏教学标注：教学样票，不作为真实开票或报销凭证 |
| L969 | 票面页脚教学标注（打印可见） |
| L986–988 | `STORAGE_NEXT_NUMBER` / `STORAGE_HISTORY` / `DEFAULT_INVOICE_NUMBER`（`26412000001304072701`） |
| L995 | **存储适配层**：有 `window.vbseStorage`（桌面版）就用桥，否则回退 `localStorage` |
| L1431 / L1437 / L1507 | `saveHistory` / `getHistory` / `clearHistory`（历史上限 100 条） |
| L1544 / L1554 | `printInvoice` / `window.print()` |
| L632+ | `@media print` 打印样式（L633 `@page A4 landscape`、隐藏表单与历史） |

> 页面是被两个交付物共用的：**改页面 = 同时影响微信网页版与桌面版**，改完至少要跑一次 `npm run desktop:smoke`。

### 3.2 桌面版

`desktop/main.cjs`（425 行，CommonJS，主进程）

| 段落 | 行号 | 职责 |
| --- | --- | --- |
| 常量 | L11–17 | `APP_TITLE`、`HTML_NAME`、`STORE_FILENAME`、`STORE_KEYS`、`MAX_STORE_JSON`、`SMOKE_PHASE` |
| 存储 | L21–96 | `storeFile/sanitizeValues/quarantine/loadValues/writeStoreAtomic` + 两个 IPC（`vbse-store:load` 同步、`vbse-store:save` 异步） |
| 安全 | L99–122 | `resolveHtmlFile`（多候选路径，兼容开发/asar）、`guardWebContents`（拒新窗口、拒导航、拒 webview） |
| 窗口 | L124–162 | `createWindow`：1440×940、`show:false`、`ready-to-show` 显示、`did-finish-load` 后设置标题（并按需触发冒烟） |
| 冒烟 | L164–393 | `incrementDigits`、`sleep/emitSmoke/failSmoke`、三段注入脚本常量、`runSmoke`（阶段分发）、`runPrintSmoke` |
| 启动 | L395–427 | `setName`/`setPath('userData')`（支持 `VBSE_USER_DATA_DIR` 覆盖）、单实例锁、`Menu.setApplicationMenu(null)`、网络阻断、权限拒绝、`window-all-closed` |

`desktop/preload.cjs`（37 行，沙箱 + contextIsolation）

- `ipcRenderer.sendSync('vbse-store:load')` 启动时同步取全量数据到内存；
- 暴露 `window.vbseStorage = { getItem, setItem, removeItem }`，**只允许两个业务键**（`ALLOWED_KEYS`），其余键直接忽略；
- 写操作 `ipcRenderer.send('vbse-store:save', { values })`，无返回值（页面不等待落盘）。

### 3.3 测试与工具

| 文件 | 说明 |
| --- | --- |
| `tests/run-desktop-smoke.ts`（256 行） | 两个用例：常规 6 阶段（flow 内含与 `invoice.ts` 基准的金额口径断言；io 为导出/导入往返）+ 边界韧性用例（损坏/超大 store、.bak 恢复、非法导入校验矩阵），用 `assert` 校验；用 `mkdtemp` 隔离数据目录 |
| `tests/invoice.test.ts` + `tests/run-tests.ts` | 原有小程序单测（7 个），未改动 |
| `tools/build-miniprogram.mjs` | 小程序 TS/SCSS 构建（未改动） |
| `tools/generate-icons.mjs` + `tools/resize-icon.ps1` | 从 `icon-source.png` 生成正式图标（PS 高质量缩放 + Node 组装 ICO），`npm run icons` |

### 3.4 文档

`README.md`（用户向）、`docs/DESKTOP_VERIFICATION.md`（验证记录）、`docs/DEVELOPMENT.md`（小程序开发）、
`docs/WINDOWS_EXE_HANDOFF.md`（原始任务书）、`docs/DESKTOP_NEXT_HANDOFF.md`（本文件）。

## 4. 架构与设计决策（改代码前先读，避免走回头路）

1. **用 Electron 封装单文件 HTML，而不是重写桌面 UI**：网页版已具备录入/计算/预览/二维码/历史/打印，
   封装后行为一致、无服务端、天然离线。代价是页面被两个交付物共用（见 §9 约束）。
2. **持久化选“userData JSON + 窄作用域 IPC”（方案 B），不用 localStorage**：
   - 数据可读可备份（一个 JSON 文件），便于教学环境运维；
   - 原子写入（`tmp` + `rename`）+ `.bak` 备份 + 损坏隔离（`invoice-store.<时间戳>.corrupt.json`）+ 从备份恢复；
   - 键白名单 + 单值大小上限（`MAX_STORE_JSON = 5MB`）避免页面写入任意内容。
   - 页面侧只加了一层 `storage` 适配对象，网页版仍走 localStorage，行为不变。
3. **安全基线**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webviewTag: false`、
   拒绝 `will-navigate` / 新窗口、`setPermissionRequestHandler` 全部拒绝、
   `webRequest.onBeforeRequest` 取消 `http/https/ws/wss`（首版必须离线且不外传票据数据）、CSP 见 §3.1。
   **不要为了调试方便放宽这些项**；调试请用 `npm run desktop:dev` 的开发窗口（未打包时 `devTools` 可用）。
4. **冒烟测试钩子内嵌在主进程**（`VBSE_SMOKE` 环境变量 + `VBSE_USER_DATA_DIR` 覆盖数据目录）：
   - 生产运行零影响（不设置环境变量时不进入任何冒烟分支）；
   - 无需 Playwright/Spectron 等额外依赖，直接用 `executeJavaScript` + `getPrintersAsync` + `printToPDF` + CDP；
   - 因此 `main.cjs` 里会看到测试相关代码，这是**有意设计**，不要删除。
5. **不改动 `miniprogram/`**：小程序构建与 7 个单测保持原样，`npm run verify` 同时守护两端。

## 5. 数据契约（改动必须向后兼容）

`%APPDATA%\VBSE发票教学工具\invoice-store.json`：

```json
{
  "version": 1,
  "values": {
    "vbseInvoiceNextNumber": "26412000001304072778",
    "vbseInvoiceHistory": "[ { ...发票记录... } ]"
  }
}
```

- `values` 的值**一律是字符串**（与 localStorage 语义一致）；`vbseInvoiceHistory` 是 JSON 字符串数组。
- 发票记录字段：`id, savedAt, invoiceNumber, invoiceDate, buyerName, buyerTax, sellerName, sellerTax,
  drawer, remark, lines[{name,unit,qty,price,taxRate,amount,taxAmount}], qrPayload, totalAmount, totalTax, grandTotal`。
- 历史上限 100 条（`saveHistory` 内 `slice(0, 100)`）；号码为纯数字字符串，自增保持位宽
  （`incrementDecimalString`，页面与主进程冒烟各有一份等价实现，改一处要同步）。
- 载入时 `sanitizeValues` 只接受白名单键 + 字符串值；文件损坏 → 隔离 + 尝试 `.bak` → 再失败则空数据启动（不崩溃）。
- `version` 字段目前仅写入未使用；**若做数据迁移，请在此扩展并保留旧文件**。
- 明确不支持：浏览器旧 `localStorage` 自动迁移（跨源）；需要就做“粘贴/导入 JSON”功能。

## 6. 验证体系与如何扩展

```bash
npm run desktop:smoke     # 常规 6 阶段 + badio 边界用例（损坏/超大 store、非法导入）
npm run verify            # 小程序构建 + 小程序单测 + 桌面冒烟
```

单跑某个阶段（排障时非常有用）：

```powershell
$exe = Join-Path (Get-Location) 'node_modules\electron\dist\electron.exe'
$env:VBSE_SMOKE='flow'; $env:VBSE_USER_DATA_DIR="$env:TEMP\vbse-dbg"
& $exe desktop\main.cjs    # 主进程会打印 SMOKE_RESULT {json}
```

阶段语义：`basic` 启动/安全桥/离线渲染检查；`write` 写入并落盘；`read` 新进程回读（模拟关开）；
`flow` 生成→自增→回填→打印历史→清空（测试内替换 `window.confirm/print` 以免阻塞）；`print` 打印机枚举 + PDF + 打印媒体截图。

新增阶段的做法（4 步）：

1. `main.cjs` 里加一段注入脚本常量（参考 `FLOW_SCRIPT`），**不要用 ES2020+ 语法**（注入代码按 IIFE/var 风格写，兼容性最好）；
2. 在 `runSmoke` 里加 `else if (phase === '…')` 分支，返回 `{ phase, ok, … }` 并 `app.exit(ok ? 0 : 1)`；
3. `tests/run-desktop-smoke.ts` 里 `await runPhase('…', userDataDir)` 并断言；
4. 若该阶段需要截图/对话框，记得窗口要可见（`createWindow` 的 `ready-to-show` 里有 `print/dialog` 白名单，需同步加）。

## 7. 环境与工具坑（本轮踩过，务必先看，能省 1 小时）

1. **命令 30 秒超时**：`npm install`、`npm run desktop:pack`、`npm run desktop:smoke` 都可能超 30s。
   做法：`Start-Process -FilePath "cmd.exe" -ArgumentList '/c','... > log.txt 2>&1' -WorkingDirectory <repo> -NoNewWindow`
   然后 `Start-Sleep` + `Get-Content log.txt -Tail n` 轮询。
2. **不要用 `Get-Content | Set-Content` 改文本文件**：Windows PowerShell 会用 ANSI(GBK) 读 UTF-8 中文，导致文件里出现
   `VBSE鍙戠エ灏忕▼搴張...` 这类乱码（本轮曾把 `main.cjs` 头部弄坏）。请用编辑器工具或 Node 写文件。
3. **`electron-builder` v26 的 `nsis.setupIcon` 不存在**：schema 报错信息很迷惑（只有 `configuration.nsis should be one of these: null`）。
   校验字段可查 `node_modules/app-builder-lib/scheme.json` 的 `definitions.NsisOptions.properties`。
4. **打包时下载 Electron 二进制会 `ECONNRESET`**：已通过 `build.electronDist = "node_modules/electron/dist"` 规避；
   但 NSIS/7zip 工具链仍走网络，第一次打包需要网络。
5. **隐藏窗口下 CDP `Page.captureScreenshot` 会永久挂起**：需要截图/打印对话框的冒烟阶段必须让窗口可见（`mainWindow.show()`）。
6. **`webRequest` 的 URL pattern 不能写 `ftp://*`**：会抛 `Invalid url pattern ftp://*: Empty path`，必须写 `http://*/*` 形式。
7. **`window.confirm` / `window.print` 在自动化里会阻塞**：冒烟脚本内先替换为桩函数再调用业务函数（见 `FLOW_SCRIPT`）。
8. **主进程语法错误时 Electron 静默退出、无任何 stdout**：排查顺序是 `node --check desktop/main.cjs`；
   必要时加 `fs.appendFileSync` 文件日志探针（stdout 重定向会丢）。
9. **`npm run verify` 依赖桌面会话**：在没有交互桌面的 CI 上，`test:desktop` 很可能失败；上 CI 时要么用 Windows runner +
   允许 GUI，要么把 `test:desktop` 单独拆成可跳过的任务（不要直接删断言）。
10. **安装目录名不是中文**：`%LOCALAPPDATA%\Programs\vbse-invoice-miniprogram`（取自 package.json `name`）；
   显示名/快捷方式/窗口标题才是“VBSE发票教学工具”。若想统一，改 `name` 会连带影响小程序工程，谨慎。
11. **不要动未跟踪目录** `diagram/`、`video_work/`（前序 agent 遗留，任务书明确要求保留）。

## 8. 下一位 Agent 的工作建议（按优先级）

### P0 发布加固（不改业务逻辑，风险最低）

1. ~~**替换正式图标**~~（2026-09-26 已完成）
   - 做法：源图存为 `desktop/assets/icon-source.png`；新脚本 `tools/generate-icons.mjs`（PS 缩放 + Node 组装，`npm run icons`）
     生成 16–128px BMP 条目 + 256px PNG 条目的 `icon.ico` 与 256px `icon.png`；`desktop/main.cjs` 开发模式窗口加了 `icon` 选项。
   - 验收：ICO 结构程序化校验通过；重新打包成功（见 `docs/DESKTOP_VERIFICATION.md` §补充记录）。
2. **代码签名**（用户已决定暂不购买证书，见 `docs/RELEASE.md` §3；若后续购买按以下方式接入）
   - 做法：在 electron-builder `win` 配置加入 `certificateFile`/`certificatePassword`（或用环境变量 `CSC_LINK`/`CSC_KEY_PASSWORD`），
     并确保安装器、主程序、卸载器都被签名。
   - 验收：`signtool verify /pa <exe>` 通过；在干净机器首次运行无 SmartScreen 红色警告；README 的 SmartScreen 说明同步更新。
3. **CI 流水线（GitHub Actions, windows-latest）**
   - 做法：`npm ci` → `npm run build:mp && npm test`（桌面冒烟可单列 job，允许失败或仅在带桌面的 runner 上跑）→ `npm run desktop:pack` → 上传 artifact。
   - 验收：推送 tag 后自动产出 `VBSE-发票教学工具-Setup-<version>.exe` 并附校验和（SHA256）。
4. **版本号与发布流程**
   - `package.json` 的 `version` 决定安装包文件名；建议每次发布 bump，并在 `CHANGELOG.md` 记录（该文件目前编码为乱码，可顺手修复为 UTF-8）。

### P1 体验与健壮性

5. **应用内“导出 PDF”**（把打印里的人工步骤变成一键）
   - 做法：主进程 `dialog.showSaveDialog` + `webContents.printToPDF`，通过窄 IPC 暴露 `vbseExportPdf()`；页面加一个按钮。
   - 验收：默认文件名含发票号码；取消时无副作用；离线可用；冒烟新增断言（生成文件存在且 >5KB）。
6. **数据导入/导出（弥补不支持跨源迁移）**
   - 做法：导出把 store JSON 复制到用户选择路径；导入读取 JSON → 校验（键白名单、JSON 可解析、条数 ≤100）→ 原子写入并备份旧文件。
   - 验收：错误文件被拒绝且原数据不变；导入后历史与下一号码正确；README 的迁移说明更新。
7. **数据文件版本迁移框架**：把 `version` 真正用起来（`migrate(values, fromVersion)`），验收：旧文件自动升级且原文件备份。
8. **卸载可选删除数据**：NSIS 自定义宏（`customRemoveFiles`/`include`）或卸载时提示；验收：默认保留（与 README 一致），勾选后删除 `%APPDATA%\VBSE发票教学工具`。
9. **企业库维护（若产品需要）**
   - 现状：23 家内置预设硬编码在页面 `COMPANY_OPTIONS` 与 `miniprogram/utils/invoice.ts`（`miniprogram` 不要改）。
   - 若做：新增 store 键（**必须同步 `preload.cjs` 的 `ALLOWED_KEYS` 与 `main.cjs` 的 `STORE_KEYS`**）+ 页面管理面板 + 导出/导入。
   - 验收：增删改后重启仍在；手动输入不受影响；小程序侧行为不变。

### P2 可选扩展

10. **自动更新**（electron-updater + 已配置的 NSIS）：验收：手动“检查更新”可用、失败时有明确提示、不外传票据数据。
11. ~~**多语言安装器 UI**~~（2026-09-26 已完成：删除 `nsis.language: 1033` 强制英文配置，安装器语言跟随学生电脑的 Windows 显示语言（electron-builder 默认行为）；重新打包生效，下次安装时可目视确认向导为中文）。
12. **跨平台**（macOS/Linux）：需重新验证打印、字体与数据目录；验收：目标平台可安装/启动/打印。
13. **口径统一**：把金额/税额计算抽成页面与小程序共享模块（避免两处 `incrementDecimalString` 等重复逻辑），验收：两端测试一致通过。
    （2026-09-26 短期缓解已落地：`tests/run-desktop-smoke.ts` 现将页面渲染的明细金额/税额/合计/大写与 `invoice.ts` 基准逐项比对，口径漂移会直接挂冒烟；共享模块抽取仍未做。已发现未裁决的漂移：页面 `￥`/小程序 `¥` 货币符号、页面"宣传单"/小程序"宣传册"示例名。）

## 9. 硬性约束（违反即视为破坏性改动）

1. **教学用途标注必须保留**：顶栏徽标（HTML L799）与**票面页脚**（HTML L969）都要有“教学样票，不作为真实开票或报销凭证”；
   任何文档/UI 不得把“打印 PDF”描述成真实电子发票开具。
2. **不放宽安全基线**：不放 `nodeIntegration`、不删 CSP、不放开网络请求、不向页面暴露通用文件系统/命令执行能力。
   （票据导出/导入的 `vbse-io:export`/`vbse-io:import` 两个固定通道是唯一例外：单文件 JSON、512KB 上限、读写全部在主进程；不得扩展为通用文件读写。）
3. **不改 `miniprogram/` 的业务逻辑与既有测试**；两端业务规则以 `miniprogram/utils/invoice.ts` + 现有页面行为为准。
4. **新增持久化键必须三处同步**：`desktop/main.cjs` 的 `STORE_KEYS`、`desktop/preload.cjs` 的 `ALLOWED_KEYS`、`tests/run-desktop-smoke.ts` 的断言。
5. **不提交** `release/`、`node_modules/`、`screenshots/`、`*.log`、测试数据（`%APPDATA%\VBSE发票教学工具`）；提交前跑 `git status --short` 核对。
6. **保留未跟踪目录** `diagram/`、`video_work/`，不要清理或覆盖。
7. **票据数据不外传、不写日志**：企业名称、税号、历史票据属本地敏感数据；主进程异常分支刻意不打印内容，请保持。
8. 文档中区分“已验证 / 未验证”；没有实际跑过的功能不要写成已通过。

## 10. 开工自检清单（可直接复制执行）

- [ ] `npm install` 成功（`node_modules\electron\dist\electron.exe` 存在）
- [ ] `npm run verify` 全绿（build:mp + 7/7 + 1/1）
- [ ] `npm run desktop:dev` 打开窗口、标题为“VBSE发票教学工具”、表单有示例数据
- [ ] `npm run desktop:pack` 产出 `release\VBSE-发票教学工具-Setup-1.0.0.exe`
- [ ] 安装包验收：安装 → 启动 → 生成发票 → 关闭重开数据仍在 → 覆盖安装数据仍在 → 卸载后数据仍保留（步骤见 `docs/DESKTOP_VERIFICATION.md` §二）
- [ ] `git status --short` 仅剩 `diagram/`、`video_work/` 两个未跟踪目录
- [ ] 修改完成后，把新结果补进 `docs/DESKTOP_VERIFICATION.md`（只写真实结论）

## 11. 本轮变更清单（便于 code review 与回滚）

| 提交 | 内容 |
| --- | --- |
| `ea159af` | 桌面版主体：`desktop/main.cjs`、`desktop/preload.cjs`、占位图标、package.json（脚本 + electron-builder 配置）、HTML（CSP/教学标注/存储适配层）、`tests/run-desktop-smoke.ts`、`docs/DESKTOP_VERIFICATION.md`、README 重写 |
| `fc37fa2` | 新增 `flow` 冒烟阶段（生成/自增/回填/打印历史/清空历史）；`build.electronDist` 改为本地运行时避免下载失败 |
| `ad60d78` | 验证记录补充交付汇总 |

回滚提示：桌面版是**纯新增**（除 HTML 的 3 处修改、package.json/.gitignore/README 外），若需移除桌面版：
删 `desktop/`、`tests/run-desktop-smoke.ts`、`tools/generate-icons.mjs`、`tools/resize-icon.ps1`、`docs/DESKTOP_*.md`、`docs/RELEASE.md`，
并把 HTML 的 `storage` 适配层还原为 `localStorage`、移除 CSP meta 与教学徽标、package.json 去掉 `main`/`build`/桌面脚本。

## 12. 参考命令速查

```powershell
# 后台跑长命令并轮询
Start-Process -FilePath "cmd.exe" -ArgumentList '/c','npm run desktop:pack > pack.log 2>&1' -WorkingDirectory "G:\AAAAAAAAAAAA\fapiao" -NoNewWindow
Get-Content pack.log -Tail 20

# 单阶段冒烟
$env:VBSE_SMOKE='flow'; $env:VBSE_USER_DATA_DIR="$env:TEMP\vbse-dbg"; & node_modules\electron\dist\electron.exe desktop\main.cjs

# 查看应用真实数据
notepad "$env:APPDATA\VBSE发票教学工具\invoice-store.json"

# 安装/升级/卸载（静默）
& "release\VBSE-发票教学工具-Setup-1.0.0.exe" /S
& "$env:LOCALAPPDATA\Programs\vbse-invoice-miniprogram\Uninstall VBSE发票教学工具.exe" /S

# 语法自检（主进程静默失败先跑这个）
node --check desktop\main.cjs
```

