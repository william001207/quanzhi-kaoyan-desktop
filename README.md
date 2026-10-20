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

- **本地数据**：1708 道真题、1129 个知识点（含真题引用补录）、875 个章节、8 科目、复习计划/错题本/模拟卷等全部业务数据落在本机（PGlite 嵌入式 PostgreSQL）
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
├── electron/          # Electron 主进程（拉起服务、开窗、进程管理）
├── server/            # 本地服务端（62 个后端源码文件 + 兼容层 + 建表 DDL + 数据导入）
│   ├── src/           # 后端 TypeScript 源码（含 platform/ 平台兼容层）
│   ├── database/      # schema.sql 建表 DDL + local-db.ts（PGlite 导入）
│   ├── data-export/   # 全量业务数据 JSON（首次启动导入，幂等）
│   └── dist/          # tsc 编译产物
├── client/            # 本地化前端构建产物（index.html + assets/）
├── build/             # 图标 + electron-builder 配置
├── scripts/           # 构建与还原脚本（见下）
└── .github/workflows/ # macOS / Windows 安装包 CI（推 tag 自动发布 Release）
```

### scripts/ 说明

| 脚本 | 用途 |
|---|---|
| `fetch_source.py` | 从源码导出中转页还原 62 个服务端源文件（base64 解码 + 平台别名改写 + 类型补丁），CI 与本地均使用 |
| `export_data.py` | 从线上 API 实时导出全量业务数据到 `server/data-export/`（含失败补拉，保证完整性） |
| `fetch_client.py` | 从 CDN 拉取前端构建分块到 `client/assets/` |
| `fetch_icon.py` | 从 CDN 拉取应用图标生成标准 PNG（CI 打包与加载页共用） |
| `build.sh` | 本地 Linux 打包（AppImage / deb） |

## 本地开发运行

```bash
# 1. 服务端
cd server && npm install && npm run build
# 启动（首次会自动建表并导入全量数据）
node dist/main.js
# 浏览器打开 http://127.0.0.1:17890/app/app_17g1b8sj7x4/

# 2. Electron 壳
cd .. && npm install
npm start
```

## 打包与发布

```bash
bash scripts/build.sh        # Linux：AppImage + deb，产物在 release/
```

- **Linux**：本机直接产出（AppImage / deb）
- **Windows / macOS**：dmg 只能在 macOS 上构建、nsis 需 wine，本机无法直接产出 → 已配置 GitHub Actions CI：

  | Workflow | 触发方式 | 产物 |
  |---|---|---|
  | `build-windows` | 推 `v*` tag，或仓库 Actions 页手动 `Run workflow` | nsis 安装包 |
  | `build-macos` | 同上 | dmg 安装包 |

  **推 tag 时**（如 `v1.0.0`）：CI 构建完成后自动创建/更新 GitHub Release 并上传安装包；
  **手动触发时**：产物作为 Actions Artifact 下载。

  CI 全流程（自动完成，仓库保持无大文件）：
  1. `fetch_source.py`：还原服务端源码 → `npm run build`（tsc 编译）
  2. `export_data.py`：从线上 API 实时导出全量业务数据到 `server/data-export/`
  3. `fetch_client.py`：从 CDN 拉取前端构建分块到 `client/assets/`
  4. `fetch_icon.py`：拉取应用图标生成 `build/icon.png`
  5. `electron-builder` 打包（`--publish never`，发布由 `softprops/action-gh-release` 完成）

## 数据说明

- 首次启动自动完成「建表 → 导入 data-export/ 全量数据」（幂等，重复启动不会重复导入）
- **数据自动更新**：线上题库内容更新（如知识点补卡）时，新版应用启动会自动做增量内容同步，**保留你的学习进度**（掌握度/错题/复习记录不受影响）
- 用户学习数据（错题、复习记录、模拟卷记录等）保存在系统用户数据目录 `userData/pglite-data`
- 数据口径：真题 1708 / 知识点 1129（含真题引用补录）/ 章节 875 / 科目 8 / 模拟卷模板 1（深大模拟卷）/ 今日计划默认 80 项（40 知识点 + 40 真题）
- 数据文件（`server/data-export/*.json`，共约 18MB）按开源惯例**不入 git**，由 `scripts/export_data.py` 实时导出（本地安装包内已内置完整数据）

## 数据导入（追加广东多校真题/大纲）

应用内「数据导入」模块支持：
- 大纲/章节导入（syllabus）
- 真题批量导入（questions，支持按知识点关联）

导入预览 → 确认执行，数据写入本地库，与网页版行为一致。

## License

MIT
