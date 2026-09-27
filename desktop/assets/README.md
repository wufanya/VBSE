# 应用图标素材

| 文件 | 用途 |
| --- | --- |
| `icon-source.png` | 正式品牌图标源图（1233×1234，设计方提供，2026-09-26 起生效） |
| `icon.ico` | 由 `npm run icons` 从源图生成：16–128px 为 32bpp BMP 条目，256px 内嵌 PNG 条目 |
| `icon.png` | 由 `npm run icons` 生成的 256px 版本（electron-builder buildResources 预览用） |

日常不需要手工改 `icon.ico` / `icon.png`——更换图标时：

1. 用新的源图覆盖 `icon-source.png`（建议 ≥512×512 正方形 PNG）。
2. 执行 `npm run icons` 重新生成。
3. 执行 `npm run desktop:pack` 重新打包。
