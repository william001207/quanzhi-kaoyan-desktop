# 全职高手考研系统 · 桌面版

基于「全职高手考研系统」网页版（妙搭 fullstack：NestJS + Drizzle + PostgreSQL）完整改造的**本地化桌面应用**：
功能与网页版完全一致，全部数据迁移到本地数据库，**脱离平台、离线可用**。

## 特性

- **本地数据**：1708 道真题、1123 个知识点、875 个章节、8 科目、复习计划/错题本/模拟卷等全部业务数据落在本机（PGlite 嵌入式 PostgreSQL）
- **本地服务**：应用启动时在本机回环地址（127.0.0.1:17890）拉起服务端，不对外暴露、不依赖网络
- **本地前端**：网页构建产物已本地化（资源全部随包内置，无 CDN 依赖）
- **功能一致**：章节树 / 知识点 / 真题 / 每日计划 / 间隔复习 / 错题本 / 统计看板 / 模拟考试 / 全局搜索 / 数据导入 与网页版一致
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
├── scripts/build.sh   # 一键打包脚本
└── .github/workflows/ # Windows 安装包 CI
```

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

## 打包安装程序

```bash
bash scripts/build.sh        # Linux：AppImage + deb，产物在 release/
```

- **Linux**：本机直接产出（AppImage / deb）
- **Windows**：本机无 wine 无法直接产出，推 tag（`v*`）或手动触发 GitHub Actions `build-win.yml`，在 Windows runner 上产出 nsis 安装包（构建后从 Actions Artifacts 下载）
- **macOS**：需 macOS 实机/CI runner 执行 `npm run pack:mac`

## 数据说明

- 首次启动自动完成「建表 → 导入 data-export/ 全量数据」（幂等，重复启动不会重复导入）
- 用户学习数据（错题、复习记录、模拟卷记录等）保存在系统用户数据目录 `userData/pglite-data`
- 数据口径：真题 1708 / 知识点 1123 / 章节 875 / 科目 8 / 模拟卷模板 1（深大模拟卷）
- 大体积数据文件（exam_question_details 8MB 等）见 `server/data-export/README.md` 说明

## 数据导入（追加广东多校真题/大纲）

应用内「数据导入」模块支持：
- 大纲/章节导入（syllabus）
- 真题批量导入（questions，支持按知识点关联）

导入预览 → 确认执行，数据写入本地库，与网页版行为一致。

## License

MIT
