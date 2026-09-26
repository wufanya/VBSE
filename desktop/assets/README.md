# 临时图标素材（发布前必须替换）

本目录中的 `icon.ico` / `icon.png` 是由 `npm run icons`（`tools/generate-temp-icon.mjs`）
生成的**临时占位素材**，仅用于让安装包、快捷方式能显示图标，

**不是 VBSE 正式品牌素材**，正式发布前必须替换为设计方提供的图标。

替换步骤：

1. 准备 ≥256×256 的正式图标。
2. 覆盖 `icon.ico`（NSIS/应用图标）与 `icon.png`（预览）。
3. 重新执行 `npm run desktop:pack`。
