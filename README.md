# VBSE 发票教学小程序

VBSE 发票教学小程序是一个面向课堂实训的微信小程序项目，用于演示电子发票的录入、预览、生成、保存图片和历史回填流程。项目由原 HTML 版发票工具改造而来，保留了发票成品感，同时优化为更适合手机端操作的分段表单。

## 功能特性

- 发票基础信息录入：发票号码、开票日期、开票人、备注。
- 购买方和销售方快速选择：内置 `VBSE企业基本信息.xlsx` 中的 23 家企业，并保留手动输入。
- 明细行管理：支持添加、删除、税率选择、金额和税额自动计算。
- 发票预览：在小程序内展示接近真实票面的教学版发票预览。
- 本地历史：使用 `wx.setStorageSync` / `wx.getStorageSync` 保存发票历史，可回填或重复生成。
- 二维码和导出：使用小程序 canvas 生成二维码和保存用发票图片。

## 技术栈

- 微信小程序原生框架
- TypeScript
- SCSS
- Canvas 2D
- Node.js 构建脚本
- `node:test` 单元测试

## 快速开始

```bash
npm install
npm run build:mp
npm test
```

然后使用微信开发者工具打开项目根目录。项目配置文件是 `project.config.json`，小程序源码目录是 `miniprogram/`。

## 常用命令

```bash
npm run build:mp
```

编译 `miniprogram/**/*.ts` 到 `.js`，编译 `miniprogram/**/*.scss` 到 `.wxss`。

```bash
npm test
```

运行发票金额、税额、历史记录、企业库匹配等核心逻辑测试。

## 项目结构

```text
.
├── miniprogram/
│   ├── pages/index/          # 首页：录入、预览、生成、保存图片
│   ├── pages/logs/           # 历史页：查看、回填、重复生成、清空
│   ├── components/           # 小程序自定义组件
│   └── utils/                # 发票计算、二维码、本地存储工具
├── tests/                    # 单元测试
├── tools/                    # 构建和开发辅助脚本
├── typings/                  # 微信小程序类型声明
├── VBSE企业基本信息.xlsx      # 企业预设来源表
└── VBSE发票小程序（2.2版).html # 原 HTML 版参考文件
```

## 开发说明

- 日常修改优先编辑 `.ts` 和 `.scss` 源文件。
- 修改后运行 `npm run build:mp`，生成微信开发者工具实际加载的 `.js` 和 `.wxss` 文件。
- 本仓库提交了生成后的 `.js` / `.wxss`，方便微信开发者工具直接打开和编译。
- 企业预设维护在 `miniprogram/utils/invoice.ts` 的 `COMPANY_OPTIONS` 中，当前数据来自 `VBSE企业基本信息.xlsx`。
- 保存图片使用隐藏 canvas 绘制，不依赖网页打印或 PDF。

## 微信开发者工具

1. 打开微信开发者工具。
2. 导入项目根目录。
3. 确认 `miniprogramRoot` 为 `miniprogram/`。
4. 编译运行。

如果只修改了 TypeScript 或 SCSS，请先运行：

```bash
npm run build:mp
```

## 测试重点

- 完整录入一张发票，检查金额、税额、价税合计。
- 切换购买方和销售方企业预设，检查名称和税号自动回填。
- 生成发票后进入历史页，检查回填和重复生成。
- 保存图片，检查导出发票顶部、购销方、明细、备注区域是否完整。

## 说明

本项目用于 VBSE 教学实训场景，生成内容为教学样票，不作为真实发票开具或报销凭证。
