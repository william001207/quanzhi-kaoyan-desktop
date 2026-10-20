# 全职高手考研系统 · 桌面版

基于「全职高手考研系统」网页版（妙搭 fullstack：NestJS + Drizzle + PostgreSQL）完整改造的**本地化桌面应用**：
功能与网页版完全一致，全部数据迁移到本地数据库，**脱离平台、离线可用**。

## 下载安装

在仓库 **Releases** 页（`https://github.com/william001207/quanzhi-kaoyan-desktop/releases`）下载对应安装包：

| 平台 | 安装包 | 说明 |
|---|---|---|
| macOS | `全职高手考研系统-1.0.0.dmg` | 未签名构建，**首次打开请右键 → 打开**（或在「系统设置 → 隐私与安全性」中允许） |
| Windows | `全职高手考研系统 Setup 1.0.0.exe` | NSIS 安装包，可自定义安装目录 |

安装后首次启动自动完成「建表 → 导入全量数据」（约 1 分钟），之后**完全离线使用**，无需登录、无需网络。

## 特性

- **本地数据**：1708 道真题、1123 个知识点、875 个章节、8 科目、复习计划/错题本/模拟卷等全部业务数据落在本机（PGlite 嵌入式 PostgreSQL）
- **本地服务**：应用启动时在本机回环地址（127.0.0.1:17890）拉起服务端，不对外暴露、不依赖网络
- **本地前端**：网页构建产物已本地化（资源全部随包内置，无 CDN 依赖）
- **功能一致**：章节树 / 知识点 / 真题 / 每日计划 / 间隔复习 / 错题本 / 统计看板 / 模拟考试 / 全局搜索 / 数据导入 与网页版一致
- **应用图标**：以「全」字为主体的立体流光设计，由 CI 自动从 CDN 拉取生成（`scripts/fetch_icon.py`），macOS / Windows 安装包与启动加载页同步使用
- **持续导入**：后续追加广东多校考研真题与大纲，直接通过「数据导入」功能写入本地库

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron |
| 服务端 | NestJS + Drizzle ORM（源码复用网页版后端） |
| 数据库 | PGlite（PostgreSQL WASM 嵌入式，数据文件在用户数据目录） |
| 前端 | 网页版构建产物（本地化） |

## 目录结构

```
quanzhi-kaoyan-desktop/
├── electron/          # Electron 主进程：窗口、本地服务拉起、PGlite 初始化
├── server/            # 服务端：源码还原脚本 + 平台兼容层 + schema + 数据导入 + 构建产物
├── client/            # 前端本地化产物 + 启动加载页（loading.html）
├── build/             # 图标 + electron-builder 配置
├── scripts/           # fetch_source / export_data / fetch_client / fetch_icon
└── .github/workflows/ # CI：macOS dmg / Windows exe 自动打包并上传 Release
```

## 构建与发布（CI）

本地 Linux 无法直接产出 macOS dmg（需 hdiutil）与 Windows exe（需 wine），因此走 GitHub Actions：

1. 源码：`scripts/fetch_source.py` 从网页版导出页拉取还原（62 个服务端源文件）
2. 数据：`scripts/export_data.py` 从网页版 API 导出全量业务数据（真题/知识点/章节/科目/计划/错题/模拟卷）
3. 前端：`scripts/fetch_client.py` 从 CDN 拉取网页版构建产物并本地化（资源改本地相对路径）
4. 图标：`scripts/fetch_icon.py` 从 CDN 拉取应用图标，生成标准 PNG（filter0，兼容 icns）
5. 打包：electron-builder 产出 dmg / exe
6. 发布：`softprops/action-gh-release` 将安装包上传到 GitHub Release

发布新版本流程：删除旧 Release 与 tag → 重建同名 tag（如 `v1.0.0`）→ 两个 workflow 自动触发构建并上传安装包。

## 数据口径

- 真题 **1708** 道、知识点 **1123** 个、章节 **875** 个、科目 **8** 个、模拟卷模板 **1** 套（深大模拟卷）
- 每日计划默认 **80** 项（40 知识点 + 40 真题）
- 数据以网页版当前数据库为准，持续追加广东多校真题与大纲

## 本地开发与调试

```bash
# 安装依赖
npm install && cd server && npm install

# 还原源码与数据
python3 scripts/fetch_source.py
python3 scripts/export_data.py
cd server && npm run build

# 启动（开发模式）
node electron/main.js
```

## 常见问题

- **首次启动慢**：首次启动需导入全量数据（约 1 分钟），期间显示加载页；之后每次启动约 10-20 秒（PGlite WASM 冷启动 + 服务初始化固有耗时）。
- **macOS 打不开**：未签名构建，请右键图标 → 「打开」，或到「系统设置 → 隐私与安全性」允许。
- **数据位置**：本地数据库文件在用户数据目录（`~/Library/Application Support/全职高手考研系统/pglite-data`，Windows 为 `%APPDATA%` 下对应目录）。
