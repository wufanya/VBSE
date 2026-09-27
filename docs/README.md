# VBSE 项目文档导航

> 未来 agent / 新开发者从这里找权威资料。每份文档一句话定位，先看哪个不再靠猜。

## 开发

- [DEVELOPMENT.md](DEVELOPMENT.md) — 环境要求、安装、构建与测试方法（长期有效）。
- [../AGENTS.md](../AGENTS.md) — agent 硬约束速查：shared core 修改流程、生成产物规则、安全基线、工程治理状态。
- [../shared/invoice-core.ts](../shared/invoice-core.ts) — 唯一人工维护的业务核心（改后必须 `npm run build:shared`）。

## 桌面版

- [DESKTOP_NEXT_HANDOFF.md](DESKTOP_NEXT_HANDOFF.md) — 桌面版完整交接：§9 硬性约束、§8 待办、架构与回滚说明。
- [DESKTOP_VERIFICATION.md](DESKTOP_VERIFICATION.md) — 历轮验证记录（§一~§十三），含未验证项的如实清单。
- [../desktop/main.cjs](../desktop/main.cjs) — 主进程（窗口/安全/存储 IPC/冒烟阶段）。

## 发布

- [RELEASE.md](RELEASE.md) — 发版流程（verify 全绿 → tag → 冒烟硬门禁 → NSIS → draft Release）与签名决策。

## 项目状态

- [PROJECT_AUDIT_BRIEF.md](PROJECT_AUDIT_BRIEF.md) — 当前状态快照（架构、测试矩阵、已知漂移、给审计者的切入点）。
- [../CHANGELOG.md](../CHANGELOG.md) — 按日期的变更记录。

## 历史资料

- [archive/WINDOWS_EXE_HANDOFF.md](archive/WINDOWS_EXE_HANDOFF.md) — 桌面版立项时的原始任务书（已完成，仅供追溯）。
- `../tests/web-golden/` — 网页版 golden 截图基线（视觉回归用，禁止随手更新）。
