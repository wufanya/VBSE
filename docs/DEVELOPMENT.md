# 开发说明

## 环境要求

- Node.js 18 或更高版本
- npm
- 微信开发者工具

## 安装依赖

```bash
npm install
```

## 本地开发流程

1. 修改 `miniprogram/` 下的 `.ts`、`.scss` 或 `.wxml` 文件。
2. 运行构建命令：

```bash
npm run build:mp
```

3. 在微信开发者工具中编译预览。
4. 运行测试：

```bash
npm test
```

## 源文件和生成文件

项目采用 TypeScript 和 SCSS 作为主要开发源文件：

- `.ts` 会编译为 `.js`
- `.scss` 会编译为 `.wxss`

微信开发者工具实际加载 `.js` 和 `.wxss`，所以提交代码时需要同时提交源文件和生成文件。

## 核心模块

- `miniprogram/pages/index/index.ts`：首页交互、表单、发票生成、保存图片。
- `miniprogram/pages/index/index.scss`：首页样式。
- `miniprogram/pages/logs/logs.ts`：历史记录页。
- `miniprogram/utils/invoice.ts`：企业库、金额计算、发票校验、历史记录标准化。
- `miniprogram/utils/storage.ts`：本地存储封装。
- `miniprogram/utils/qr.ts`：二维码矩阵和 canvas 绘制。
- `tools/build-miniprogram.mjs`：本地构建脚本。

## 企业库维护

企业预设来自 `VBSE企业基本信息.xlsx`，在代码中维护于：

```text
miniprogram/utils/invoice.ts
```

字段结构：

```ts
export interface CompanyOption {
  name: string
  taxId: string
}
```

新增或修改企业后，需要运行：

```bash
npm run build:mp
npm test
```

## 发布前检查

```bash
npm run build:mp
npm test
```

建议同时在微信开发者工具中执行一次编译，确认 WXML、WXSS 和运行时逻辑都正常。
