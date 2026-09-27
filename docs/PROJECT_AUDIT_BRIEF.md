# VBSE 发票教学工具 · 项目审计简报

> 供外部 agent / 工程师对本项目做全面审计使用。自包含，不依赖任何对话历史。
> 基准时间：2026-09-27。所有"未验证/待裁决"均为如实标注，请审计时优先复核这些点。

## 1. 项目是什么

面向会计实训教学的**电子发票开具练习工具**（模拟数电发票票面），单代码库产出三个端：

| 端 | 载体 | 状态 |
| --- | --- | --- |
| 网页版 | 单文件 HTML `VBSE发票小程序（2.2版).html`（约 1950 行，内联 CSS/JS） | 生产使用 |
| 微信小程序 | `miniprogram/`（TS + SCSS，构建脚本 `tools/build-miniprogram.mjs`） | 生产使用 |
| Windows 桌面版 | Electron 壳直接加载**同一份 HTML**，NSIS 安装包 | v1.0.0 已实机验收 |

核心业务闭环：选择企业（23 家内置预设）→ 填写票据（明细行金额/税额自动计算）→ 实时预览票面 → 打印/导出 PDF → 历史。纯离线，无任何网络请求，无后端。

**产品定位硬约束（违反即破坏性改动，审计时请当作验收标准）：**
1. 教学标注必须保留：顶栏徽标与票面页脚"教学样票，不作为真实开票或报销凭证"；
2. 界面/行为改动只允许影响桌面版，**网页版必须保持零变化**（用户明确要求，有既定隔离机制，见 §3）；
3. 不放宽安全基线（见 §4）；
4. 用户已明确决定**不购买代码签名证书**，安装包保持未签名——不要再把"上签名"当作改进建议。

## 2. 仓库结构速查

```text
VBSE发票小程序（2.2版).html   # 网页版+桌面版共用页面（单文件，含全部样式与逻辑）
desktop/main.cjs              # Electron 主进程：窗口/安全/存储 IPC/导出导入 IPC/冒烟阶段（约 500 行）
desktop/preload.cjs           # 预加载：vbseStorage 桥 + vbseIO 桥 + vbse-desktop 标识类（约 70 行）
desktop/assets/               # 正式品牌图标（icon-source.png 源图 → npm run icons 生成）
miniprogram/                  # 小程序源码；utils/invoice.ts 是小程序端的业务规则实现
tests/invoice.test.ts         # 小程序端单测（7 个，只测 invoice.ts）
tests/run-desktop-smoke.ts    # 桌面冒烟驱动（spawn Electron，断言在 TS 侧与 main.cjs 两侧）
tools/generate-icons.mjs + resize-icon.ps1  # 图标生成管线（Node 组装 ICO + PS 缩放）
docs/DESKTOP_NEXT_HANDOFF.md  # 最全的交接文档（§9 硬性约束、§8 待办、§11 回滚）
docs/DESKTOP_VERIFICATION.md  # 历轮验证记录（§一~§十，含未验证项）
docs/RELEASE.md               # 发布流程
.github/workflows/ci.yml      # CI：build-and-test(ubuntu) + desktop-smoke(windows, continue-on-error)
.github/workflows/release.yml # tag v* → 构建+单测 → 桌面冒烟（硬门禁）→ NSIS + SHA256 + draft Release
release/                      # 打包输出（已 gitignore）
```

## 3. 桌面版与网页版的隔离机制（审计重点之一）

- `desktop/preload.cjs` 在 DOMContentLoaded 给 `<html>` 注入 `vbse-desktop` 类；
- 所有桌面专属样式写在 HTML 样式表尾部 `html.vbse-desktop` 作用域下（含打印复位）；
- "两端都有的功能、入口只给桌面"用固定模式：共享 CSS `display:none` + 桌面作用域 `inline-block`（如 `.history-delete`、`.io-btn`）；
- 桌面版发票缩放 `updateInvoiceScale` 有桌面分支（扣面板内边距、缩放下限 0.28），并在 boot 里追加了 DCL 重算以对冲 preload 注入晚于 boot 首算的时序问题——**该时序依赖是脆弱点，改动 preload/boot 需回归**；
- 验证网页版未变的方法：无类渲染 1440×940，面板高 1013px、stage 981px。

## 4. 安全模型（审计重点之二）

- `contextIsolation` + `sandbox` + `nodeIntegration:false`；拒绝导航/新窗口/webview；
- `session.webRequest` 阻断全部 http/https/ws；权限请求一律拒绝；页面含 CSP；
- 持久化走窄作用域 IPC：`vbseStorage` 仅 2 个白名单键（`vbseInvoiceHistory`/`vbseInvoiceNextNumber`），主进程侧校验、原子写、`.bak` 备份、损坏隔离（改名 `.corrupt-*`）、5MB 上限（**读取与写入双侧尺寸检查**，超大文件不进内存）；
- 票据导出/导入：`vbse-io:export`/`vbse-io:import` 两个固定通道，单文件 JSON、512KB 上限，文件读写全部在主进程（dialog 选路径；冒烟时由环境变量直连路径绕过对话框）——这是"不暴露通用文件能力"约束下**唯一批准的例外**；
- 新增持久化键必须三处同步：`main.cjs STORE_KEYS`、`preload ALLOWED_KEYS`、`run-desktop-smoke.ts` 断言。

## 5. 已知的最大架构债：双端两份业务实现

业务规则存在**两份手工维护的实现**：HTML 内联 JS 与 `miniprogram/utils/invoice.ts`。`COMPANY_OPTIONS`（23 家企业）、`incrementDecimalString`、`formatMoney`、`toChineseUpperMoney`、示例数据等均重复。单测只覆盖小程序那份，页面那份此前零测试。

**2026-09-27 目标 04 起架构已统一**：唯一人工业务源为 `shared/invoice-core.ts`（零 import 纯函数）；`miniprogram/utils/invoice.ts` 与共享 HTML 的 `INVOICE-CORE` 块均为 `npm run build:shared` 的生成产物（过期由 `npm run check:generated` + CI 检测）。网页版函数为 VBSECore 薄适配，web regression 含 source-of-truth 守卫（HTML 中重现第二份实现会直接失败）。三项历史漂移以显示约定适配层保持现状、待产品裁决：#1 ￥/¥ 货币符号、#2 示例"宣传单/宣传册"、#3 行金额舍入语义（网页原始浮点 vs 核心按分舍入，极端输入展示可差 1 分）。共享模块抽取（交接文档 P2-13）**机制已完成**，裁决漂移后即完全统一。

**当前已发现、待用户裁决的双端漂移（测试已归一规避，两处都原样保留）：**
1. 货币符号：页面渲染 `￥`（全角 U+FFE5），`invoice.ts` 渲染 `¥`（半角 U+00A5）；
2. 示例明细名：页面 `sampleLines` 为"*印刷服务*宣传单"，`invoice.ts` 为"宣传册"。

## 6. 测试与验证现状

- `npm test`：小程序单测 7/7（node:test + strip-types）；
- `npm run desktop:smoke`：三个用例依次 spawn Electron——常规 6 阶段（basic 桥/二维码/教学标注、write→read 跨进程持久化、flow 生成→号码自增→历史回填→打印→清空 + 金额口径断言、io 导出/导入往返、print 打印机 + PDF ≥5KB + 打印媒体截图）+ 边界韧性用例（损坏/超大 store 隔离、`.bak` 恢复、非法导入校验矩阵、失败不污染断言）+ **网页版零变化回归**（无 preload 渲染共享 HTML、固定 1440×940 视口，布局/字体/入口显隐/存储路径/业务结果对 `WEB_BASELINE` 金标准逐项断言）；
- `npm run verify` = build:mp + npm test + desktop:smoke；
- 最近一次全绿：2026-09-27（单测 7/7、冒烟全绿）。

**如实标注的未验证项：**
- 两条 GitHub Actions 工作流**从未真实运行过**（含 tag 触发路径）；
- 票据导入/导出的**真实文件对话框**路径未自动化（冒烟走环境变量），需人工点一次；
- 1366×768 教学机上的窗口初始尺寸（逻辑上有工作区约束，仅高分辨率开发机实测）；
- 已安装环境下任务栏/快捷方式图标刷新（Windows 图标缓存可能延迟）；
- 桌面双栏布局（预览在左 sticky）在低分辨率实机的最终目视效果。

## 7. 版本与发布状态

- `package.json` version 1.0.0；安装包约 103.1MB（99.9% 是 Electron 44 运行时，应用 asar 仅 69KB；已做 `electronLanguages:["zh-CN"]` + `compression:"maximum"`），冷启动实测 1.59s/热 0.67s——**性能无瓶颈，不需要优化建议**；
- 安装器配置： assisted 安装（非一键）、per-user（免管理员）、可改目录、卸载保留数据、语言跟随系统（已删除强制英文的 `language:1033`）；
- **工作区存在大量未提交变更**（图标管线、CI/发布工作流、文档、界面调整、导入导出功能全部未 commit），审计 diff 时请以工作区为准而非 HEAD；
- 远程：github（github.com/wufanya/VBSE）+ 两个微信 git；CI 首跑会在下次 push 时发生。

## 8. 建议的审计切入点（按价值排序）

1. **双端口径**：逐个比对 HTML 内联函数与 `invoice.ts` 同名实现（不止 §5 已发现的两处漂移，找新的）；
2. **网页版零变化承诺**：检查共享 CSS/JS 改动是否真的对无 `vbse-desktop` 类的环境无副作用（含 `@media print`）；
3. **IPC 面**：`vbse-io:*` 与 `vbse-store:*` 的输入校验是否可被滥用（超长字符串、路径注入、JSON 炸弹）；
4. **工作流正确性**：ci.yml/release.yml 从未实跑，静态审查触发条件、缓存、产物路径、`continue-on-error` 的语义影响；
5. **冒烟盲区**：损坏/超大 store 与非法导入已由边界韧性用例覆盖（2026-09-27）；剩余盲区如并发实例、长期存储增长、真实文件对话框路径——可作审计深挖点；
6. **单文件 HTML 的可维护性**：1950 行内联代码的拆分利弊（注意：桌面打包依赖单文件，拆分需构建管线，勿轻率建议）。

## 9. 审计时可运行的命令

```bash
npm test                 # 小程序单测（需 Node ≥22.6，--experimental-strip-types）
npm run desktop:smoke    # 桌面冒烟（会真实启动 Electron 窗口，Windows only）
npm run verify           # 两者合一
npm run build:mp         # 小程序构建
npm run desktop:pack     # NSIS 打包（输出 release/，勿在无准备时运行）
npm run icons            # 重新生成图标（依赖 PowerShell/System.Drawing，Windows only）
```

环境注意：Windows 10/11 + Node 24 实测通过（CI 用 Node 22）；本机直连 registry.npmjs.org 可能僵死，装依赖建议 `npm install --prefer-offline` 并带短 `--fetch-timeout`；Electron 44.4.5 二进制已缓存于 `%LOCALAPPDATA%\electron\Cache`。
