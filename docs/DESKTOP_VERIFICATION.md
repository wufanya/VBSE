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

冒烟覆盖内容（`tests/run-desktop-smoke.ts` 驱动 `desktop/main.cjs` 的 6 个阶段；io 阶段为 2026-09-27 新增并补跑通过，见 §十）：

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
| `npm run desktop:smoke` | 桌面冒烟（6 阶段现状；本表记录的 2026-09-26 回归尚未加入 io 阶段，见 §十） | ✅ 1/1 pass（约 4.8s） |
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

口径断言当轮发现的**既有双端漂移**（测试已归一/规避，待裁决统一）：
1. 货币符号：页面渲染 `￥`（全角），`invoice.ts` 渲染 `¥`（半角）；
2. 示例明细名：页面 `sampleLines` 为"*印刷服务*宣传单"，`invoice.ts` `SAMPLE_LINES` 为"*印刷服务*宣传册"。

未验证项：真实文件对话框路径（保存/打开）未自动化验证，仅冒烟环境变量路径已验证；教师侧批量核收 JSON 的使用流程未做实机演练。
