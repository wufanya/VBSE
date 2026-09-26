# Windows 桌面安装版验证记录

> 本文档记录 VBSE 发票教学工具（Electron 封装网页版）的实际验证结果。
> 原则：只记录真实执行过的步骤与输出；未执行的项目明确标注“未验证”。

## 测试环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Microsoft Windows 11 家庭版 中文版（10.0.26200.0） |
| Node.js | v24.15.0 |
| npm | 11.12.1 |
| Electron | 44.4.5 |
| electron-builder | 26.15.3 |
| 测试日期 | 2026-09-26 |

## 一、自动化冒烟测试（已通过）

命令：

```bash
npm run desktop:smoke      # 单独执行
npm run verify             # 小程序构建 + 7 个原有单测 + 桌面冒烟
```

结果：`npm run verify` 全部通过（build:mp 成功；原有测试 7/7 pass；桌面冒烟 1/1 pass，耗时约 4.3s）。

冒烟覆盖内容（`tests/run-desktop-smoke.ts` 驱动 `desktop/main.cjs` 的 5 个阶段）：

| 阶段 | 验证点 | 结果 |
| --- | --- | --- |
| basic | 页面加载、`window.vbseStorage` 桥存在、企业下拉 24 项（23 家 + 手动输入）、二维码 canvas 像素非空、教学标注文案在页面上、桌面版未写入 localStorage、发票预览无横向溢出 | ✅ |
| write | 写入下一发票号 `26412000001304072777` 与 1 条历史，`invoice-store.json` 落盘 | ✅ |
| read | **关闭进程后重新启动**，历史与下一号码完整回读 | ✅ |
| flow | 完整业务流：生成发票（号码自增 `…777` → `…778`）、历史 +1、保存号码与票面一致、`loadHistory` 回填购方/销方名称与税号（下拉回到企业预设索引 7，而非“手动输入”）、打印历史触发 `window.print()` 1 次、清空历史后内存与落盘均为 0 条 | ✅ |
| print | 打印机列表、printToPDF、打印媒体仿真截图 | ✅ |

### 打印能力（已验证）

- `getPrintersAsync()` 返回本机 6 台打印机，**包含 `Microsoft Print to PDF`**。
- `printToPDF({ landscape: true, preferCSSPageSize: true })` 输出 425 KB PDF（A4 横向，遵循页面 `@page` 设置），路径见冒烟输出 `vbse-smoke-print.pdf`。
- 打印媒体（`Emulation.setEmulatedMedia media:print`）截图人工核对（`vbse-smoke-print-media.png`）：
  - 三行明细税率 13% / 6% / 6%；
  - 金额合计 ¥2,866.00 + 税额合计 ¥193.38 = 价税合计 ¥3,059.38，与 `miniprogram/utils/invoice.ts` 计算口径一致（`npm test` 7/7 通过）；
  - 购销方信息、明细表、合计行、大写金额、备注、二维码、页脚教学标注**完整显示，无裁切、无文字溢出**；
  - 票面水印“实训样票”保留。
- 说明：以上验证了 Electron 打印管线与 PDF 输出能力；**在系统打印对话框中手动选择 “Microsoft Print to PDF” 并保存文件的交互步骤未自动化**，由安装验收（见下文）补充。

### 离线（已验证）

主进程对 `http/https/ws/wss` 所有请求调用 `cancel`，CSP `default-src 'none'; connect-src 'none'`，冒烟全程无网络仍完整渲染页面与二维码；无任何外部资源引用（HTML 为单文件，无 CDN/字体/图片外链）。

## 二、安装包验收（已执行）

| 项 | 结果 |
| --- | --- |
| 安装包 | `G:\AAAAAAAAAAAA\fapiao\release\VBSE-发票教学工具-Setup-1.0.0.exe`（111,796,678 字节，Windows x64 NSIS） |
| 测试日期 | 2026-09-26 |
| 静默安装（`/S`） | ✅ exit=0；安装至 `%LOCALAPPDATA%\Programs\vbse-invoice-miniprogram\`，生成 `VBSE发票教学工具.exe` |
| 快捷方式 | ✅ 开始菜单与桌面均生成 `VBSE发票教学工具.lnk` |
| 注册表卸载项 | ✅ `HKCU\...\Uninstall` 出现 `VBSE发票教学工具 1.0.0` |
| 正常启动 | ✅ 进程主窗口标题 `VBSE发票教学工具`，发票表单正常渲染（截图 `screenshots/installed-app-2.png`） |
| 断网启动 | ✅ 主进程阻断全部 http(s)/ws 请求 + CSP，冒烟全程无网络可用 |
| 数据持久化（安装版） | ✅ write 阶段写入 `%APPDATA%\VBSE发票教学工具\invoice-store.json` → 关闭进程 → read 阶段回读：历史 1 条、下一号码 `26412000001304072777` |
| 升级覆盖安装 | ✅ 再次运行安装包 `/S`，exit=0；升级前后数据一致（`26412000001304072777\|1`），升级后 read 阶段 ok |
| 卸载 | ✅ `Uninstall VBSE发票教学工具.exe /S`，exit=0；安装目录、开始菜单/桌面快捷方式、注册表卸载项全部移除 |
| 卸载保留用户数据 | ✅ `%APPDATA%\VBSE发票教学工具\invoice-store.json` 卸载后仍存在（历史与下一号码完整） |
| SmartScreen | ⚠️ 本次测试中静默安装与启动**未观察到** SmartScreen 拦截（本机可能已有信誉积累）；**未签名包在其他/干净机器上仍可能弹出提示**，已在 README 如实说明 |
| 桌面版打印交互 | ⚠️ 已验证打印机列表含 Microsoft Print to PDF 且 printToPDF 成功；**在打印对话框中手动选打印机并保存的交互未自动化**，需人工抽查 |

测试完成后已删除本机 `%APPDATA%\VBSE发票教学工具` 测试数据与安装（避免污染真实使用）。

## 三、数据存储位置

| 场景 | 位置 |
| --- | --- |
| 桌面版历史与下一发票号 | `%APPDATA%\VBSE发票教学工具\invoice-store.json`（备份 `invoice-store.json.bak`） |
| 网页版（浏览器打开 HTML） | 该浏览器的 `localStorage`（键 `vbseInvoiceHistory`、`vbseInvoiceNextNumber`） |
| 迁移 | **不支持自动迁移**。浏览器中的旧数据不会进入桌面版，需手工导出/录入。 |

## 五、测试命令与工件

| 命令 | 用途 | 结果 |
| --- | --- | --- |
| `npm run build:mp` | 小程序 TS/SCSS 构建 | ✅ 成功 |
| `npm test` | 小程序单元测试 | ✅ 7/7 pass |
| `npm run desktop:smoke` | 桌面冒烟（5 阶段） | ✅ 1/1 pass（约 4.8s） |
| `npm run verify` | 上述三项串联 | ✅ 全部通过 |
| `npm run desktop:pack` | NSIS 安装包 | ✅ `release/VBSE-发票教学工具-Setup-1.0.0.exe` |

冒烟产生的工件（位于临时目录，不提交）：

- `%TEMP%\vbse-smoke-print.pdf`：打印管线输出的 A4 横向 PDF（约 425 KB）
- `%TEMP%\vbse-smoke-print-media.png`：打印媒体仿真截图（版式核对用）

安装验收产生的截图：`screenshots/installed-app.png`、`screenshots/installed-app-2.png`（该目录已被 `.gitignore` 忽略）。

### 打包环境注意事项

- `electron-builder` 默认需要联网下载 Electron 运行时与 NSIS 工具链；本次打包中出现过 `read ECONNRESET`（网络抖动）导致失败。
  为提高可重复性，`package.json` 的 `build.electronDist` 已指向本地已解压运行时 `node_modules/electron/dist`，打包不再依赖下载 Electron 二进制（NSIS 工具链仍走 `%LOCALAPPDATA%\electron-builder\Cache` 缓存）。

- 打印对话框中选择 “Microsoft Print to PDF” 并保存的**图形交互**未自动化验证（打印管线、PDF 输出、打印机枚举已自动化验证）。
- 安装包未签名：SmartScreen 表现因机器信誉而异。
- 未做“干净虚拟机”级别的隔离安装测试；本次在开发机（Windows 11 家庭中文版 10.0.26200.0）执行，安装前该应用未安装过。
- 浏览器旧 localStorage 数据不迁移至桌面版。
- 企业库为内置 23 家固定预设，不支持用户维护或云同步。
