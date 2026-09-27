# 发布流程（Windows 桌面版）

> 本文档描述从代码变更到产出可分发安装包的标准流程。CI 于 2026-09-26 新增，
> 首次真实 tag 发布后请把实际运行结果补进 `docs/DESKTOP_VERIFICATION.md`（只写真实结论）。

## 1. 工作流总览

| 工作流 | 触发 | 内容 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push / PR 到 main、master | `npm ci` → `build:mp` → 小程序单测；桌面冒烟单列 job 且 `continue-on-error: true`（需要真实桌面会话，允许失败但断言不删） |
| `.github/workflows/release.yml` | 推送 `v*` tag | `npm ci` → 构建 + 单测 → **桌面冒烟（硬门禁）** → `desktop:pack` → SHA256 → 上传 artifact + 创建 **draft** GitHub Release |

发布产物：`VBSE-发票教学工具-Setup-<version>.exe` + `SHA256SUMS.txt`。

## 2. 发布步骤

1. 确认 `npm run verify` 本地全绿（build:mp + 7/7 单测 + 1/1 桌面冒烟）。
2. 更新 `CHANGELOG.md`：新增一节，日期 + 版本，只写真实变更。
3. bump 版本号：`package.json` 的 `version` 决定安装包文件名（`artifactName`）。
4. 提交并推送：
   ```bash
   git add -A && git commit -m "release: v1.0.x"
   git push github master --follow-tags
   ```
5. 打 tag 并推送（触发 release 工作流）：
   ```bash
   git tag v1.0.x && git push github v1.0.x
   ```
6. 在 GitHub Actions 确认 Release 工作流成功，到 Releases 页检查 **draft**、
   下载 exe 与 SHA256SUMS 并核对校验和，确认无误后 publish。

## 3. 代码签名（可选，未配置时自动跳过）

在 GitHub 仓库 Secrets 配置：

- `CSC_LINK`：`.pfx` 证书（base64 内容或 URL）
- `CSC_KEY_PASSWORD`：证书密码

electron-builder 会自动签名安装器/主程序/卸载器。验收标准见
`docs/DESKTOP_NEXT_HANDOFF.md` §8（`signtool verify /pa` 通过、干净机器无 SmartScreen 红框）。

## 4. 已知限制

- CI 的 `desktop-smoke` job 依赖 runner 提供交互桌面；GitHub windows-latest 通常可用，
  但属 runner 环境行为，失败不阻塞合并（`continue-on-error`）。若要强约束，请在自托管
  Windows runner（带桌面会话）上运行并把该开关去掉。
- release 工作流在 `desktop:pack` **之前**运行桌面冒烟，且为**硬门禁**（无 `continue-on-error`）：
  冒烟失败则整个 job 失败，不产出安装包、不创建 Release（fail-closed）。若 runner 缺交互桌面
  导致冒烟失败，应修复 runner 环境，而不是放宽门禁。发布前仍建议本地 `npm run verify`。
- 教学标注、离线与数据本地化等硬性约束见 `docs/DESKTOP_NEXT_HANDOFF.md` §9，发布不受影响。
