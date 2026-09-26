# VBSE 发票教学工具

本仓库包含两个交付物，用途均为 **VBSE 教学实训**：

1. **微信小程序**（`miniprogram/`）——手机端录入、预览、生成、保存图片、历史回填。
2. **Windows 桌面安装版**（`desktop/`）——Electron 封装根目录网页版，交付可安装的 NSIS 安装程序，离线可用，支持打印 / 另存为 PDF。

> **教学样票，不作为真实开票或报销凭证。** 两个版本生成的内容都是教学样票，不构成真实发票开具或报销凭证；桌面版票面与界面均有醒目标注。

## 功能特性

- 发票基础信息录入：发票号码、开票日期、开票人、备注。
- 购买方和销售方快速选择：内置 `VBSE企业基本信息.xlsx` 中的 23 家企业，并保留手动输入。
- 明细行管理：支持添加、删除、税率选择、金额和税额自动计算。
- 发票预览：接近真实票面的教学版发票预览，含二维码。
- 本地历史：保存发票历史，可回填、打印或清空；发票号码自动递增。
- 小程序端另有 canvas 导出发票图片；桌面端使用系统打印（含 Microsoft Print to PDF）。

## 微信小程序

### 技术栈

微信小程序原生框架、TypeScript、SCSS、Canvas 2D、`node:test` 单元测试。

### 快速开始

```bash
npm install
npm run build:mp
npm test
```

然后使用微信开发者工具打开项目根目录。项目配置文件是 `project.config.json`，小程序源码目录是 `miniprogram/`。

### 常用命令

```bash
npm run build:mp   # 编译 miniprogram/**/*.ts → .js、**/*.scss → .wxss
npm test           # 发票金额、税额、历史记录、企业库匹配等核心逻辑测试
```

## Windows 桌面安装版

技术选型：**Electron + electron-builder（NSIS 安装程序）**，封装根目录 `VBSE发票小程序（2.2版).html`，不改动小程序构建与运行。

### 命令

```bash
npm run desktop:dev    # 开发：直接启动桌面窗口（加载仓库根目录 HTML）
npm run desktop:smoke  # 桌面冒烟测试（启动、存储、离线、打印 PDF/截图）
npm run desktop:pack   # 打包 NSIS 安装程序，输出到 release/
npm run icons          # 重新生成【临时占位】图标（发布前必须替换）
npm run verify         # 小程序构建 + 原有单测 + 桌面冒烟
```

构建产物（**不提交仓库**，已在 `.gitignore`）：

```text
release/VBSE-发票教学工具-Setup-<版本>.exe   # 安装程序（Windows x64）
```

### 安装、升级与卸载

- **安装**：运行 `VBSE-发票教学工具-Setup-<版本>.exe`，可选择安装目录；安装后生成桌面与开始菜单快捷方式。
- **升级**：直接运行新版本安装程序覆盖安装，用户数据保留。
- **卸载**：通过“应用和功能”或开始菜单卸载。**卸载默认保留用户数据**（`electron-builder` 配置 `deleteAppDataOnUninstall: false`），需要清理时请手工删除下述数据目录。
- **SmartScreen**：安装包**未做代码签名**，首次运行可能被 Windows SmartScreen 拦截，需点击“仍要运行”。正式分发前应评估代码签名证书。

### 数据存储位置与备份

| 版本 | 数据位置 |
| --- | --- |
| 桌面安装版 | `%APPDATA%\VBSE发票教学工具\invoice-store.json`（同目录 `.bak` 为自动备份） |
| 网页版（浏览器打开 HTML） | 该浏览器 `localStorage`，键 `vbseInvoiceHistory`、`vbseInvoiceNextNumber` |

- 桌面版数据采用原子写入（临时文件 + 重命名），主文件损坏时自动尝试 `.bak` 恢复，无法恢复时隔离为 `invoice-store.corrupt-<时间戳>.json` 并重新开始，不会崩溃。
- 备份：复制 `invoice-store.json`（及 `.bak`）即可；恢复时放回同目录。
- **浏览器旧数据不会自动迁移到桌面版**（跨源限制），需自行导出后手工录入。
- 桌面版历史最多保留 100 条，与网页版一致。

### 安全基线（桌面版）

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 页面 CSP：`default-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'`。
- 主进程阻断全部 `http/https/ws/wss` 请求，拒绝外链导航、新窗口与 webview；不暴露文件系统或命令执行能力。
- 通过窄作用域 IPC 只读写 `vbseInvoiceHistory`、`vbseInvoiceNextNumber` 两个键；企业名称、税号、历史票据仅存本机，不上传、不写入日志。

### 界面与打印说明

- 页面同时服务网页版与桌面版；桌面版通过预加载脚本暴露 `vbseStorage`，网页版自动回退 `localStorage`。
- 打印使用系统打印对话框（`window.print()`），可选择系统打印机或“Microsoft Print to PDF”另存 PDF；这是**打印教学样票**，不是真实电子发票开具。
- 验证记录与已知限制见 `docs/DESKTOP_VERIFICATION.md`。

## 项目结构

```text
.\1
├── miniprogram/             # 微信小程序源码（.ts / .scss / .wxml）
├── desktop/                 # 桌面版主进程、预加载脚本、临时图标
│   ├── main.cjs             # Electron 主进程（窗口、安全、存储 IPC、冒烟阶段）
│   ├── preload.cjs          # 窄作用域存储桥（vbseStorage）
│   └── assets/              # 临时占位图标（发布前替换）
├── tests/                   # 小程序单元测试 + 桌面冒烟测试
├── tools/                   # 小程序构建脚本、图标生成脚本
├── docs/                    # 开发说明、桌面验证记录、交接文档
├── VBSE企业基本信息.xlsx    # 企业预设来源表
└── VBSE发票小程序（2.2版).html  # 网页版（也是桌面版加载的页面）
```

## 发布前待办

- [ ] **替换临时图标**：`desktop/assets/icon.ico` / `icon.png` 由 `npm run icons` 生成，仅为占位素材，非正式品牌资源。
- [ ] **代码签名**：评估证书与签名流程，降低 SmartScreen 误报。
- [ ] 企业库为代码内固定预设（23 家），**不提供**后台管理或云同步。

## 说明

本项目用于 VBSE 教学实训场景，生成内容为**教学样票，不作为真实开票或报销凭证**。
