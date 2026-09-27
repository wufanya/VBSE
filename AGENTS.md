# AGENTS.md — VBSE 发票教学工具

会计实训用的电子发票开具练习工具（模拟数电发票票面，纯离线、无后端）。单代码库产出三端：
网页版（单文件 HTML）、微信小程序（`miniprogram/`）、Windows 桌面版（Electron 壳加载**同一份 HTML**）。

## 常用命令

```bash
npm run build:shared        # 从 shared/invoice-core.ts 生成两端业务产物（改业务规则后必跑）
npm run check:generated     # 生成产物过期检测（CI 已接入；过期 = 有产物忘重新生成）
npm test                    # 小程序单测（7 个，直接测生成产物 = 共享核心）
npm run test:web-regression # 网页版零变化回归（golden 截图 + 布局/行为/打印态/CSS 隔离断言）
npm run desktop:smoke       # 桌面冒烟（8 个阶段，Windows-only，会真实弹出 Electron 窗口）
npm run verify              # 全链：build:mp + 单测 + 网页回归 + 桌面冒烟（交付前必须全绿）
npm run desktop:pack        # NSIS 安装包 → release/（改 HTML/main.cjs 后重打包，否则用户装的旧包掩盖修复）
```

环境坑：本机直连 registry.npmjs.org 可能僵死——装依赖用 `npm install --prefer-offline --fetch-timeout=60000`；Electron 二进制已缓存于 `%LOCALAPPDATA%\electron\Cache`。

## 架构边界（改动前必读）

1. **业务规则只有一个源**：`shared/invoice-core.ts`（零 import 纯函数）。改业务规则只改它，
   然后 `npm run build:shared`。以下两个是生成产物，**禁止手工修改**（`check:generated` + CI 会拦）：
   `miniprogram/utils/invoice.ts`（小程序 API 保持兼容，调用方零改动）与
   共享 HTML 的 `INVOICE-CORE:BEGIN/END` 标记块（`window.VBSECore`，29 个导出）。
2. **网页版零变化是硬约束**：桌面专属样式只准写在 HTML 样式表尾部 `html.vbse-desktop` 作用域下；
   网页版渲染/行为由 `tests/run-desktop-smoke.ts` 的 `WEB_BASELINE`/`WEB_PRINT_BASELINE` 金标准 +
   golden 截图（`tests/web-golden/`）+ CSS 静态隔离检查自动把关，任何偏离即测试失败。
   "有意识地改网页版"必须更新基线并写 CHANGELOG，不得为过测试放宽断言。
3. **入口显隐模式**：两端都有逻辑、入口只给桌面 = 共享 CSS `display:none` + 桌面作用域 `inline-block`
   （现有 `.io-btn`、`.history-delete`）。
4. **存储三处同步**：新增持久化键必须同时改 `desktop/main.cjs STORE_KEYS`、`desktop/preload.cjs
   ALLOWED_KEYS`、`tests/run-desktop-smoke.ts` 断言。存储文件读写双侧均有 5MB 尺寸上限。
5. **导入 JSON 顺序契约**：`JSON.parse → validateImportedInvoice(原始对象) → normalize → 应用`，
   不得把 normalize（含 finiteOrZero 容错）提到校验前。
6. 小程序构建是逐文件 transpileModule（无打包），TS 源之间用无扩展名相对导入；测试侧
   （--experimental-strip-types）导入必须带 `.ts` 扩展名。

## 不可破坏的约束

- 顶栏教学徽标与票面页脚"教学样票，不作为真实开票或报销凭证"必须保留。
- Electron 安全基线（contextIsolation/sandbox/nodeIntegration:false/全断网/导航拒绝/IPC 白名单）
  不放宽；新增 IPC 只能是窄作用域固定用途通道。
- 安装包**未签名是用户的明确决策**（不购买证书），不要重提签名方案。
- **除非存在明确 bug、测试缺口、实际维护痛点或用户需求，否则不得主动提出架构重构**
  （含拆分单文件 HTML、换整数分金额模型、重构 main.cjs 等，均属独立目标）。
- 三项双端历史漂移：#3 舍入语义已统一为"每行先按分舍入再汇总"（roundMoney 已导出）；
  #1 ￥/¥ 货币符号、#2 "宣传单/宣传册"示例名由适配层保持两级行为待裁决——勿顺手统一，
  裁决后各删一行适配即可（见验证记录 §十三）。
- **工程治理已冻结**（2026-09-27）：护栏/核心统一/仓库卫生均已收官；后续只按真实教学
  反馈、bug 或明确产品需求迭代。

## 测试与验收

- 每轮改动后 `npm run verify` 全绿才算完成；golden 截图对比阈值收紧（>64 通道差 ≤0.1%）。
- 冒烟含口径基准断言：页面渲染结果必须与 `invoice.ts` 基准逐项一致，双端口径漂移会直接挂测试。
- 推送由用户在自己终端执行（本机 Mimosa git-gate 钩子会拦截 agent 的 commit/push 且 --no-verify
  无效）；推送成败以 `api.github.com/repos/wufanya/VBSE/actions/runs` 的 CI 结论为准（github.com:443
  直连不稳，api.github.com 基本可达）。

## 必读文档

- `docs/README.md` — 文档导航入口（每份文档一句话定位，先看这个）。
- `docs/DESKTOP_NEXT_HANDOFF.md` — 最全交接：§9 硬性约束、§8 待办与优先级、§11 回滚。
- `docs/DESKTOP_VERIFICATION.md` — 历轮验证记录（§一~§十三），含所有"未验证项"的如实清单。
- `docs/RELEASE.md` — 发版流程（tag v* → 冒烟硬门禁 → NSIS → draft Release）。
- `docs/PROJECT_AUDIT_BRIEF.md` — 给外部审计/新 agent 的项目自包含简报。
