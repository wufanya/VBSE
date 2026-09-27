# Windows 桌面安装版验证记录

> 本文档记录 VBSE 发票教学工具（Electron 封装网页版）的实际验证结果。
> 原则：只记录真实执行过的步骤与输出；未执行的项目明确标注“未验证”。

## 交付汇总

| 项 | 内容 |
| --- | --- |
| 安装包 | `G:\AAAAAAAAAAAA\fapiao\release\VBSE-发票教学工具-Setup-1.0.0.exe`（约 106.6 MB，Windows x64 NSIS） |
| 构建命令 | `npm install` → `npm run desktop:pack`（产物目录 `release/`） |
| 开发运行 | `npm run desktop:dev` |
| 回归命令 | `npm run verify`（小程序构建 + 小程序单测 + 桌面冒烟） |
| 数据位置 | `%APPDATA%\VBSE发票教学工具\invoice-store.json`（升级与卸载均保留） |
| 主要限制 | 安装包未签名（可能触发 SmartScreen）；浏览器旧数据不迁移；打印对话框手选打印机为人工步骤 |

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

冒烟覆盖内容（`tests/run-desktop-smoke.ts` 驱动 `desktop/main.cjs` 的常规 6 个阶段 + 2026-09-27 新增 badio 边界阶段，见 §十一）：

| 阶段 | 验证点 | 结果 |
| --- | --- | --- |
| basic | 页面加载、`window.vbseStorage` 桥存在、企业下拉 24 项（23 家 + 手动输入）、二维码 canvas 像素非空、教学标注文案在页面上、桌面版未写入 localStorage、发票预览无横向溢出 | ✅ |
| write | 写入下一发票号 `26412000001304072777` 与 1 条历史，`invoice-store.json` 落盘 | ✅ |
| read | **关闭进程后重新启动**，历史与下一号码完整回读 | ✅ |
| flow | 完整业务流：生成发票（号码自增 `…777` → `…778`）、历史 +1、保存号码与票面一致、`loadHistory` 回填购方/销方名称与税号（下拉回到企业预设索引 7，而非“手动输入”）、打印历史触发 `window.print()` 1 次、清空历史后内存与落盘均为 0 条；页面渲染金额与 `miniprogram/utils/invoice.ts` 基准逐项比对一致（2026-09-27 增补） | ✅ |
| io | 导出当前票据 JSON → 破坏表单 → 导入回放 → 逐字段断言回填一致（2026-09-27 新增） | ✅ |
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
| `npm run desktop:smoke` | 桌面冒烟（本表记录的 2026-09-26 回归时尚无 io/badio 阶段；现为常规 6 阶段 + 边界用例，见 §十、§十一） | ✅ 1/1 pass（约 4.8s） |
| `npm run verify` | 上述三项串联 | ✅ 全部通过 |
| `npm run desktop:pack` | NSIS 安装包 | ✅ `release/VBSE-发票教学工具-Setup-1.0.0.exe` |

冒烟产生的工件（位于临时目录，不提交）：

- `%TEMP%\vbse-smoke-print.pdf`：打印管线输出的 A4 横向 PDF（约 425 KB）
- `%TEMP%\vbse-smoke-print-media.png`：打印媒体仿真截图（版式核对用）

安装验收产生的截图：`screenshots/installed-app.png`、`screenshots/installed-app-2.png`（该目录已被 `.gitignore` 忽略）。

### 打包环境注意事项

- `electron-builder` 默认需要联网下载 Electron 运行时与 NSIS 工具链；本次打包中出现过 `read ECONNRESET`（网络抖动）导致失败。
  为提高可重复性，`package.json` 的 `build.electronDist` 已指向本地已解压运行时 `node_modules/electron/dist`，打包不再依赖下载 Electron 二进制（NSIS 工具链仍走 `%LOCALAPPDATA%\electron-builder\Cache` 缓存）。

## 六、已知限制

- 打印对话框中选择 “Microsoft Print to PDF” 并保存的**图形交互**未自动化验证（打印管线、PDF 输出、打印机枚举已自动化验证）。
- 安装包未签名：SmartScreen 表现因机器信誉而异。
- 未做“干净虚拟机”级别的隔离安装测试；本次在开发机（Windows 11 家庭中文版 10.0.26200.0）执行，安装前该应用未安装过。
- 浏览器旧 localStorage 数据不迁移至桌面版。
- 企业库为内置 23 家固定预设，不支持用户维护或云同步。

## 七、正式图标替换（2026-09-26 补充记录）

| 项 | 结果 |
| --- | --- |
| 图标源图 | `desktop/assets/icon-source.png`（1233×1234 PNG，用户提供的正式品牌图，蓝色文件 + VBSE + 绿色对勾） |
| 生成命令 | `npm run icons`（`tools/generate-icons.mjs`：PowerShell System.Drawing 高质量缩放 → Node 组装 ICO） |
| 产物 | `icon.ico`（175,496 字节：16/24/32/48/64/128px 32bpp BMP 条目 + 256px PNG 条目）、`icon.png`（256px） |
| 结构校验 | 程序化解析 ICO：7 个条目偏移与签名全部有效 |
| 打包 | `npm run desktop:pack` 成功，新安装包 111,897,331 字节 |
| 实图核对 | 用 System.Drawing 提取 `release/win-unpacked/VBSE发票教学工具.exe` 与安装包 exe 的关联图标，均为新图（截图 `screenshots/exe-icon.png`、`screenshots/installer-icon.png`） |
| 回归 | `npm run verify` 全绿（build:mp + 单测 7/7 + 桌面冒烟 1/1） |
| 顺带改动 | `desktop/main.cjs` 的 `createWindow` 增加开发模式 `icon` 选项（打包后仍由 exe 图标承担）；删除 `tools/generate-temp-icon.mjs` |

未验证项：任务栏/快捷方式图标在**已安装环境**的刷新表现（Windows 图标缓存可能延迟刷新；本轮仅验证 exe/安装包内嵌图标与打包回归）。

## 八、桌面版界面样式调整（2026-09-26 补充记录）

改动原则：只影响桌面版（exe），网页版渲染结果零变化。实现方式为 `desktop/preload.cjs` 给页面注入
`html.vbse-desktop` 标识类，全部新样式写在主 HTML 样式表尾部的 `html.vbse-desktop` 作用域下。

| 项 | 结果 |
| --- | --- |
| 预览区空白 | 发票经 transform 缩放后布局盒不收缩（原始 981px 占位），桌面作用域下改为绝对定位 + 既有 JS 缩放高度；预览面板高度实测 1013px → 585px |
| 预览与表单对调 | 桌面作用域交换栅格列并让预览面板 `order: -1`：宽窗口预览在左、表单在右（用户 1366×768@125% 屏逻辑宽约 1090px，原布局下预览被挤到表单下方，即"右边的预览没有了"的原因） |
| 预览固定 + 表单滚动 | 用户后续要求"预览图始终在可视范围内、信息栏上下滚动"：桌面版改为**始终双栏**（移除单列堆叠），预览面板 `position: sticky; top: 12px`；实测 1092×648 滚动 700px 后预览仍钉在视口顶部（getBoundingClientRect().top = 12），表单/历史正常滚动 |
| 预览加宽 | 用户要求"预览区大一点、压缩表单宽度"：栅格统一为 `minmax(480px, 1fr) minmax(500px, 640px)`（原 520-1fr / 620-720 两档），发票实测 1092 宽下 407→447px、1440 宽下 633→713px；明细编辑器桌面作用域恒为横向滚动（表单列压缩后所需） |
| 窄窗口缩放 | 桌面版缩放下限由 0.45 放宽到 0.28：发票按列宽缩小而不是被裁剪（1092 宽下 447px 完整显示） |
| 发票右侧裁剪 | 缩放计算原用 `panel.clientWidth`（含左右内边距 32px），而发票原点在内边距之后，右缘溢出被 `overflow-x: hidden` 裁掉（改动前即存在，缩放小不明显）；桌面模式下改扣内边距，实测左右留白对称（0px 裁剪），1440 与 1092 宽度均验证 |
| 缩放时序 | preload 在 DOMContentLoaded 才注入标识类，`boot()` 先于此执行导致初始缩放按网页版宽度计算；页面在 boot 中追加同一事件的监听（注册顺序在 preload 之后），类注入后重算一次；网页版重算结果不变 |
| 监制章位置 | 由压住"电子发票（普通发票）"标题文字改为对齐标题列中心、骑在标题分隔线上（`top: 58px; left: 509px`），与真实票面版式一致 |
| 字体 | 桌面作用域 body 改为 Microsoft YaHei UI（Windows 原生），并让 input/select/textarea/button 继承页面字体（原先表单控件为系统默认字体） |
| 窗口尺寸 | `desktop/main.cjs` 初始尺寸改为不超过屏幕工作区（`Math.min(1440/940, workArea)`），兼容 1366×768 教学机 |
| 网页版回归 | 无标识类时实测：表单在左/预览在右、面板 1013px、缩放 0.5636、字体栈与改动前完全一致（1440×940 截图比对无差异） |
| 购销方表单精简 | 用户要求：选企业后名称/税号冗余应隐藏、三行压缩。共享 JS 新增 `updateCompanyFields`（`applyCompany` 与 `syncCompanySelect` 两条路径都调用，按下拉值切换 section 的 `manual-company` 类）；名称/税号字段加 `company-manual-field` 类。桌面 CSS：非手动时隐藏（选企业=1 行下拉），手动时两字段并排一行（共 2 行）。网页版无对应 CSS 规则，字段始终显示、上下堆叠，行为与改动前一致（已实测两种选择状态） |
| 历史单条删除 | 用户要求：此前只能"清空历史"全删。每条历史卡片新增红色"删除"按钮 + 共享 `deleteHistory(id)`（confirm 确认 → 过滤该条 → 原子写回 → 重渲染 + toast）；按钮在共享 CSS 中默认 `display: none`，桌面作用域 `inline-block` 显示——网页版 DOM 中存在该按钮但不渲染（已实测），其余两按钮渲染不变。桌面端实测：生成 1 条 → 点删除 → 卡片消失、空态恢复、toast 提示 |
| 打印回归 | 桌面作用域在 `@media print` 内恢复 `position: static`（发票与预览面板）与原印章位置；冒烟 print 阶段产出的打印媒体截图人工核对与改动前版式一致 |
| 自动化回归 | `node --check`（main/preload）通过；`npm run desktop:smoke` 全绿（1/1，含 flow 与 print 阶段） |

未验证项：1366×768 实机上的窗口初始尺寸表现（逻辑上由工作区尺寸约束，本轮仅有高分辨率开发机）。

## 九、安装包体积优化（2026-09-26 补充记录）

起因：用户反馈安装包体积过大、启动缓慢。实测排查结论——应用自身（app.asar 69KB、4 个文件、零运行时依赖）无资源冗余；
冷启动实测 1.59s、热启动 0.67s（basic 冒烟阶段），应用代码无启动热点；体积 99.9% 来自 Electron 44 运行时
（解压 367.4MB，其中主 exe 246MB 不可配置缩减）。

| 项 | 结果 |
| --- | --- |
| 改动 | `package.json` build 增加 `"electronLanguages": ["zh-CN"]`（语言包 55 个→1 个，解压 48.3MB→0.56MB）与 `"compression": "maximum"` |
| 安装包实测 | 111,897,451 → 103,079,537 字节（**-8.8MB，-7.9%**），低于此前估算（-15%~22%）——语言包 .pak 对 LZMA 压缩率约 5:1，实际在安装包内仅占约 9MB，估算偏差如实记录 |
| 解压体积 | 367.7MB / 76 文件 → 320.0MB / 22 文件 |
| 打包产物回归 | `win-unpacked` exe 跑 basic 冒烟：ok=true（页面加载/存储桥/离线检查通过，发票号码与历史节点正常） |
| 源码回归 | `npm run desktop:smoke` 全绿（1/1） |

后续可选（未做）：换 WebView2 轻壳（预期安装包 <5MB，需重写桌面壳，Win7 不可用，偏离既定架构决策）；afterPack 裁剪
dxcompiler/dxil（WebGPU 专用，27.2MB 解压，需 GPU 回退场景回归验证）；教学机房将安装目录加入杀软排除列表缓解未签名程序首启扫描。

## 十、票据导出/导入与页面端口径断言（2026-09-26 补充记录）

| 项 | 结果 |
| --- | --- |
| 功能 | 顶栏新增"导入票据 / 导出当前票据"（`.io-btn`，沿用"入口只给桌面"显隐模式；网页版 DOM 有按钮但不渲染、无 vbseIO 时函数安全提示） |
| 实现 | `desktop/preload.cjs` 暴露 `vbseIO`（仅两个固定通道）；`desktop/main.cjs` 新增 `vbse-io:export` / `vbse-io:import`（dialog 选路径 + 512KB 上限，文件读写只在主进程）；页面 `exportInvoice()`/`importInvoice()` 复用 `collectInvoiceData`/`normalizeHistoryItem`/`fillForm`/`renderInvoice` |
| 冒烟 | 新增 `io` 阶段（冒烟环境变量直连文件路径，绕过对话框）：导出 → 破坏表单 → 导入回放 → 逐字段断言；`flow` 阶段新增页面渲染金额捕获 |
| 口径基准 | 页面渲染的明细金额/税额/合计/税额合计/价税合计/大写金额与 `miniprogram/utils/invoice.ts`（`buildInvoiceLine`/`formatMoney`/`toChineseUpperMoney`）逐一比对一致 |
| 回归 | `npm test` 7/7；`npm run desktop:smoke` 全绿（含新用例） |

口径断言当轮发现的**既有双端漂移**（测试已归一/规避；#3 已于同日裁决统一，#1/#2 仍待裁决）：
1. 货币符号：页面渲染 `￥`（全角），`invoice.ts` 渲染 `¥`（半角）；
2. 示例明细名：页面 `sampleLines` 为"*印刷服务*宣传单"，`invoice.ts` `SAMPLE_LINES` 为"*印刷服务*宣传册"。

未验证项：真实文件对话框路径（保存/打开）未自动化验证，仅冒烟环境变量路径已验证；教师侧批量核收 JSON 的使用流程未做实机演练。

## 十一、输入与持久化边界加固（2026-09-27 补充记录）

| 项 | 结果 |
| --- | --- |
| store 读取侧 | `loadValues()` 在 `readFile/JSON.parse` **之前** `statSync` 检查尺寸，超 5MB 直接隔离（不读入内存）；损坏/非法 JSON 同样隔离后走 `.bak` 恢复 |
| store 写入侧 | `writeStoreAtomic` 上限改按 `Buffer.byteLength`（UTF-8 字节）校验，防中文 3 字节展开绕过字符数上限 |
| 数值边界 | 页面 `readLineItems`/`updateLineTotals`/`readTaxRate`/`normalizeHistoryItem` 的数值入口统一 `finiteOrZero`（`Number.isFinite` 回落），`1e999`/NaN 不再传染金额计算；正常输入行为不变 |
| 导入校验 | 新增页面级 `validateImportedInvoice(record)`：对象形状、日期（含 2026-02-31 类无效日期回转校验）、字段长度上限、明细 1~200 行、qty/price/taxRate/amount/taxAmount 的有限性与合理边界；任何不合法整体拒绝并 toast 原因，绝不写入表单/历史 |
| 冒烟 | 新增 `badio` 阶段 + 韧性测试用例：损坏 store 启动并隔离、超大 store（6MB）隔离、`.bak` 自动恢复（数据不丢）、主进程拒绝 >512KB 导入文件、12 个非法导入用例全部拒绝且合法用例放行、失败前后表单与历史逐字段一致 |
| 回归 | `npm test` 7/7；`npm run desktop:smoke` 2/2 全绿（含全部既有阶段） |

如实声明：非法导入的"主进程拒绝超大文件"由环境变量路径覆盖；页面级校验矩阵通过直调 `validateImportedInvoice` 覆盖（导入对话框交互仍无法自动化）；`quarantine` 隔离产物命名为 `invoice-store.corrupt-<时间戳>.json`（既有行为，测试已按此断言）。

### §十一 补遗：业务一致性校验与顺序契约（2026-09-27 第二轮，评审意见落实）

| 项 | 结果 |
| --- | --- |
| 顺序契约 | `importInvoice` 固定为 `JSON.parse → validateImportedInvoice(原始对象) → normalizeHistoryItem → 应用`，已写入代码注释；normalize 的 finiteOrZero 定位为历史数据读取容错，不得前置于导入校验（否则非法值被洗成 0 绕过边界） |
| 业务一致性 | 校验器新增：明细 `amount == formatMoney(qty×price)`、`taxAmount == formatMoney(amount×taxRate)`、`totalAmount/totalTax == 明细和`、`grandTotal == totalAmount+totalTax`；比较复用 formatMoney 分位舍入语义（与票面展示同一套规则），未引入第三套金额算法；汇总三字段必填（导出方固定携带） |
| 冒烟 | 矩阵扩至 17 用例：新增 totals 不一致、行金额不一致、行税额与税率不一致、**洗白陷阱**（price/amount/taxAmount/汇总全部传 `5e999` 字符串——若顺序错为先 normalize 后校验会全被洗成 0 而放行，现被整体拒绝） |
| io 往返 | 导出→导入回放现在同时断言 `validateImportedInvoice(导出内容) === ""`（导出文件必须能通过自己的校验器） |
| 回归 | `node --check` ✓；`npm test` 7/7；`npm run desktop:smoke` 2/2 全绿 |

## 十二、网页版零变化回归护栏（2026-09-27 补充记录）

| 项 | 结果 |
| --- | --- |
| 目的 | 未来抽取共享业务核心会直接修改约 1950 行共享 HTML；先建"网页版零变化"金标准，再动重构——任何改变网页版渲染/行为的改动都会被 `npm run desktop:smoke` 拦截 |
| 实现 | `desktop/main.cjs` 新增 `web` 阶段：BrowserWindow **不带 preload**（等价纯浏览器：无 `vbse-desktop` 类、无 vbseStorage/vbseIO、存储走 localStorage），调试器固定 1440×940 视口（与屏幕/窗口无关）后采集特征快照；发布路径 preload 恒在，安全模型不变 |
| 基线 | `tests/run-desktop-smoke.ts` 的 `WEB_BASELINE`（2026-09-27 实测）：字体栈 `"Microsoft YaHei", "PingFang SC", sans-serif`、栅格 `720px 666.667px`（表单左/预览右）、`.invoice` relative、`.preview-panel` static、监制章 `38px/563.333px`、`.io-btn`/`.history-delete` 均 `none`、表单面板 1339px/预览面板 1015px、缩放占位 552.852px |
| 业务断言 | 示例票金额/税额/价税合计与大写与 `invoice.ts` 基准一致（大写含 ⓧ 前缀）；历史 +1、号码自增 `…701→…702`、**localStorage 被写入**（网页版存储路径，与桌面版"不写 localStorage"断言互为镜像）；发票无横向溢出 |
| 回归 | `npm test` 7/7；`npm run desktop:smoke` **3/3** 全绿（web 用例 0.8s） |

如实声明：基线在开发机 Electron 44 实测，字体栈断言依赖系统中文字体（GitHub runner 与教学机均含雅黑，若环境缺字体导致失败会在 font 断言处显式报错而非静默）；基线更新必须伴随 CHANGELOG 说明，属于"有意识地改变网页版"的显式动作。

### §十二 补遗：完整规格实现（2026-09-27 第二轮，按目标 03 详细规格补齐）

第一轮 `web` 阶段仅覆盖布局/行为快照；本轮按规格补齐六项并实测：

| 交付 | 实现 | 结果 |
| --- | --- | --- |
| 1 纯网页入口 | 无 preload Electron 窗口（零新增依赖），无 `vbse-desktop` 类 | class=""、无桥 ✓ |
| 2 行为基线 | A 教学标识（顶栏徽标+票面声明）、B 企业 fixture（24 项名单逐字对齐 `invoice.ts` 基准+选企业回填）、C 金额流程（oracle 比对）、D 号码（初始→递增→回填）、E 历史生成/点击/恢复、F localStorage 必写 | 全部断言通过 |
| 3 布局基线 | 人工基线复核：`面板高 1013px` 为早期口径，当前实测预览面板 1015px/表单 1339px；几何断言 ±2px 容差（滚动条与亚像素实测可差 3px，桌面泄漏为数十~数百 px 级，不会掩盖）；栅格列/监制章 left 为像素派生值，同走 ±2px | 通过 |
| 4 视觉回归 | golden：`tests/web-golden/web-1440x940.png`（144KB，1440×940）；固定号码/日期/企业/明细/QR（测试内固定 Math.random），比较经 Electron nativeImage 像素差分，阈值 >64 通道差 ≤0.1% 且 8~64 差 ≤2%；缺 golden/更新基线置红强制人工核对 | 本机比对 0.0000%/0.0000% |
| 5 CSS 隔离 | 静态检查：共享区 `vbse-desktop` 规则仅限三处打印复位；sticky/桌面栅格禁止出现在共享区；`.io-btn`/`.history-delete` 共享区仅一条 display:none；桌面区 12 条规则全部挂前缀 | 通过 |
| 6 打印回归 | print 媒体仿真：顶栏隐藏、桌面入口不可见、监制章 25px、票面结构 8 行、教学声明在、价税合计一致 | 通过 |
| 8 CI | 新增 `web-regression` job（windows，**无 continue-on-error**，required）；`npm run test:web-regression`；`npm run verify` = build:mp + 单测 + 网页回归 + 桌面冒烟 | yml 已解析验证 |

稳定性处理：等待窗口可见与双 rAF 替代固定 sleep；视觉装置固定号码/日期/QR；每用例独立 mkdtemp 存储；实测发现并修复测量时序竞态（show 晚于测量导致滚动条态漂移 3px）。

未覆盖/如实声明：golden 对 OS 级字体渲染差异敏感（阈值收紧后依赖 runner 含雅黑——windows runner 与基线同源；若未来跨 Linux 运行需重建基线并记录）；真实浏览器（Chrome/Firefox）渲染差异不在护栏内；golden 更新必须人工核对图像并在 CHANGELOG 说明（`npm run test:web-golden-update` 生成）。

## 十三、双端业务核心统一（2026-09-27 目标 04 补充记录）

| 项 | 结果 |
| --- | --- |
| 架构 | 唯一人工源 `shared/invoice-core.ts`（零 import 纯函数，禁 DOM/window/wx/文件系统）→ `npm run build:shared`（tools/build-shared.mjs）生成两端产物：① `miniprogram/utils/invoice.ts`（小程序 TS 模块，API 与迁移前完全一致，调用方零改动）；② 共享 HTML 的 `INVOICE-CORE` 标记块（`window.VBSECore` IIFE，29 个导出） |
| 页面适配层 | `incrementDecimalString`/`formatDateCn`/`formatMoney`/`formatUnitPrice`/`formatTaxPercent`/`toChineseUpperMoney`/`ensureQrPayload`/`today` 改为 VBSECore 薄适配；`COMPANY_OPTIONS`/`sampleLines` 取自核心 |
| 漂移处理 | 漂移以"显示约定适配层"落地、不改变任何一端当前行为：#1 ￥/¥ → 网页 formatMoney 适配层 replace；#2 宣传单/宣传册 → sampleLines 适配层 replace。两项均为一行可删的显式约定，产品裁决后即可逐字统一 |
| 新发现漂移 #3 | **舍入语义**：核心 `buildInvoiceLine` 行金额按分四舍五入（含 EPSILON），网页版 collectInvoiceData 为原始浮点直算、展示时才定格到分——对含超两位小数的极端输入两者展示可差 1 分。按规格未擅自统一；**已于 2026-09-27 裁决为"每行先舍入再汇总"并统一（网页 readLineItems/updateLineTotals 走 VBSECore.roundMoney）** |
| 守卫 | web regression 新增 source-of-truth 静态守卫：生成块恰一个；核心块之外禁止重现 `const COMPANY_OPTIONS = [`、大写数字表字面量；8 个页面函数必须为 VBSECore 薄适配（防第二份实现回归） |
| 生成管理 | `npm run check:generated`（build → git 比对逻辑内置）；CI build-and-test 新增"生成产物过期检测"步骤 |
| 回归 | `npm test` 7/7（直接测生成产物=核心）；`test:web-regression` 1/1（golden 0.0000% 差异）；`desktop:smoke` 3/3；`npm run verify` 全链绿 |

未覆盖/待裁决（#3 已裁决统一）：#1 符号、#2 示例名仍待产品裁决，裁决后均为删一行适配的小改动，护栏会自动验证统一后的行为。

### §十三 补遗：漂移 #3 已裁决（2026-09-27）

用户裁决：**每行先按分舍入再汇总**（与核心/小程序口径一致）。落实：
- `shared/invoice-core.ts` 导出 `roundMoney`（原私有函数加导出，逻辑未变）；
- 网页版 `readLineItems`/`updateLineTotals` 改用 `VBSECore.roundMoney(qty×price)`、`roundMoney(金额×税率)`——行内预览、票面、导出 JSON、历史写入从此与小程序同口径；
- 历史**旧记录不迁移不重算**（存储金额原样展示，兼容）；
- 回归：样本票展示逐像素不变（golden 0.0000%）、单测 7/7、verify 全链绿。

漂移状态更新：#3 已解决；#1（￥/¥ 显示约定）维持适配层方案；#2（宣传单/宣传册）仍待产品裁决。

### §十二 补遗 2：跨机器稳定化（2026-09-27 第三轮，依据 runner 实测证据）

Run #6/#7/#8 的证据链：本地全分辨率 golden 比对 0.0000%，但 GitHub runner 失败——注解实测
runner 布局在容差内（面板 1340/1017 vs 本地 1339/1015，字体二进制版本差 2px；栅格/监制章/字体栈一致），
故根因为**跨机器字体光栅化噪声**（ClearType/Gamma/GPU 差异），非 UI 回归。按规格"优先设计稳定化
方案"落实：

| 项 | 变更 | 理由 |
| --- | --- | --- |
| golden 比对 | 全分辨率逐像素 → **4× 降采样块均值比对**（阈值：>60 通道差块 ≤0.5%，20~60 块 ≤4%）；全分辨率差分保留为诊断数据不作为门禁 | 降采样平均化字形边缘噪声；结构性回归（元素隐藏/移位/换色）仍产生成片大差异 |
| 几何容差 | ±2px → ±3px | 实测跨机器字体版本差 2~3px（本地 1015 vs runner 1017） |
| 横向溢出 | clientWidth+1 → +3px | 同上，亚像素滚动宽度抖动 |
| 打印 sealLeft | 精确 → ±2px | 像素派生值 |
| 诊断 | web 失败消息压缩至 CI 注解 1KB 上限内（布局/差异/打印/业务关键数值）；CI 失败行转 `::error::` 注解（run 页面 404 的替代诊断通道） | runner 日志需 admin 权限，注解走公开 API |

已知限制：4× 降采样对"单个字符级"文本变化敏感度下降——该层由 DOM/契约断言（金额字符串、号码、
企业名单、教学标识逐项断言）覆盖，三层合力无盲区。
