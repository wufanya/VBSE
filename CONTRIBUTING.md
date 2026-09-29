# 贡献说明

> 详细文档导航见 [docs/README.md](docs/README.md)。本文件只讲贡献流程。

## 关键原则

- `shared/invoice-core.ts` 是金额/税额/格式化/大写/号码/企业/示例数据等**业务规则的唯一人工维护源**。
- 生成产物**禁止手工编辑**：`miniprogram/utils/invoice.ts`、`miniprogram/**.js/.wxss`、
  共享 HTML 的 `INVOICE-CORE` 块、`desktop/assets/icon.ico/icon.png`。改对应源文件后重新生成。
- 网页版行为零变化：桌面专属改动只走 `html.vbse-desktop` 作用域。

## 开发流程

```bash
# 改业务规则（shared/invoice-core.ts）后：
npm run build:shared

# 改小程序 TS/SCSS 源后：
npm run build:mp

# 改图标源图后：
npm run icons
```

## 提交前验证

```bash
npm run verify        # 主入口：build:shared + build:mp + 单测 + 网页回归 + 桌面冒烟
npm run check:generated   # 生成产物是否过期（CI 也会检测）
```

`npm run verify` 全绿才能提交。

## 提交内容

- 源文件与对应的生成产物**一起提交**（小程序 `.js/.wxss` 需入库供微信开发者工具直开）。
- 不提交：`release/`、`node_modules/`、本地日志与压缩包（见 `.gitignore`）。

## 工程治理状态

工程治理已冻结（2026-09-27）。没有真实 bug、明确产品需求或维护痛点时，
不主动做架构重构；硬约束清单见 [AGENTS.md](AGENTS.md)。
