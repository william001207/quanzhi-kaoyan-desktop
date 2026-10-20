# 全职高手考研系统 · 桌面版

基于「全职高手考研系统」网页版的本地化桌面应用：**全部数据存放在本机，离线可用，无需登录**。

技术栈：Electron + NestJS + Drizzle ORM + PGlite（嵌入式 PostgreSQL）。

---

## 下载安装

在 [Releases](https://github.com/william001207/quanzhi-kaoyan-desktop/releases) 页面下载对应安装包：

| 平台 | 文件 | 说明 |
|---|---|---|
| macOS（Apple 芯片） | `quanzhi-kaoyan-<版本>-mac-arm64.dmg` | 未使用 Apple 开发者证书签名，首次打开会被系统拦截，见下方指引 |
| Windows | `quanzhi-kaoyan-<版本>-win-x64.exe` | NSIS 安装包，可自定义安装目录 |

首次启动会自动「建表 → 导入题库数据」，约 1–2 分钟；之后每次启动 10–20 秒。

### macOS 首次打开被拦截怎么办

应用未购买 Apple 开发者证书，Gatekeeper 会拦截。任选一种方式绕过一次：

1. **右键打开**：应用程序 → 右键点应用 → 「打开」→ 弹窗再点「打开」
2. **系统设置**：隐私与安全性 → 安全性 → 「仍要打开」
3. **终端命令**（最彻底，之后可正常双击）：

```bash
xattr -dr com.apple.quarantine "/Applications/全职高手考研系统.app"
```

### Windows 提示未知发布者

点「更多信息」→「仍要运行」。

---

## 你的数据在哪，会不会丢

| 场景 | 结果 |
|---|---|
| 关闭应用 / 重启电脑 | ✅ 不丢，数据实时写入本机数据库 |
| **卸载后重装** | ✅ 不丢。数据在 `~/Library/Application Support/全职高手考研系统/pglite-data/`（Windows 在 `%APPDATA%` 下），卸载程序不会删除 |
| **升级到新版本** | ✅ 不丢。启动时自动做增量内容同步，只更新题库内容字段（新真题、新知识点），**明确不覆盖**学习进度：掌握度、复习状态、错题本、收藏、设置、每日计划 |
| **从新版退回旧版** | ⚠️ 进度不丢，但题库内容会被回退成旧版数据（因为旧包里的数据更旧） |

> 想手动备份：把上面那个 `pglite-data` 文件夹整个复制走即可。

---

## 这个仓库包含什么

**完整自包含，克隆下来就能构建，构建过程不联网下载任何东西。**

| 内容 | 位置 | 说明 |
|---|---|---|
| Electron 主进程 | `electron/` | 拉起本地服务、开窗、进程管理 |
| 后端全部源码 | `server/`（62 个 `.ts`） | NestJS + Drizzle，含平台兼容层 `platform/` |
| 数据库建表 DDL | `server/database/schema.sql` | PGlite 建表语句 |
| 题库数据 | `server/data-export/`（22 个 JSON，16MB） | 首次启动导入用的干净快照，**不含任何个人学习记录** |
| 前端构建产物 | `client/` | 已本地化，无 CDN 依赖 |
| 应用图标 | `build/icon.png`、`client/icon.png` | 打包与启动页共用 |
| 构建脚本 | `scripts/` | 自检、本机构建、仓库整理 |
| CI | `.github/workflows/build.yml` | macOS / Windows 自动打包发布 |

> 前端为原网页版的构建产物（打包后的 JS），**不含可编辑的前端源码**。
> 需要改界面的话，改动范围仅限 `client/index.html` 与 `loading.html` 的页面外壳。

---

## 构建

### 在 Mac 上直接出安装包

```bash
npm install
npm --prefix server install
bash scripts/build-desktop.sh mac
```

产物在 `release/`，已做 ad-hoc 签名，可直接安装。

### 发新版到 GitHub（推荐，自动出双平台包）

```bash
# 1. 改 package.json 里的 version，比如 1.0.1
# 2. 提交并推送
git add -A && git commit -m "release: v1.0.1" && git push
# 3. 打 tag 触发自动构建
git tag v1.0.1 && git push --tags
```

推送 tag 后，`build` 工作流会并行构建 macOS 和 Windows 安装包，并自动创建 Release。

**完整操作手册（含出错排查、题库更新、回退方法）见 👉 [docs/发布新版本.md](docs/发布新版本.md)**

### 本地开发运行

```bash
# 服务端（首次会自动建表并导入题库数据）
npm --prefix server install
npm --prefix server run build
node server/dist/main.js

# 另开一个终端，Electron 壳
npm install
npm start

# 或直接用浏览器访问 http://127.0.0.1:17890
```

构建前可以先做一次完整性自检：

```bash
npm run verify
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 31 |
| 服务端 | NestJS 10 + Drizzle ORM |
| 数据库 | PGlite（PostgreSQL 的 WASM 版，数据落在用户数据目录） |
| 前端 | 网页版构建产物（本地化，无外部依赖） |

服务监听 `127.0.0.1:17890`，只在本机回环，不对外暴露。

---

## 功能

章节树 / 知识点卡片 / 真题练习 / 每日计划 / 间隔重复复习 / 错题本 / 统计看板 / 模拟考试 / 全局搜索 / 数据导入。

数据规模：真题 1708 道，章节 875 个（教材 741 + 考纲 134），科目 8 个，知识点 1000+（含从真题关联补录的部分）。

---

## 更新题库

- **小批量补充**：用应用内的「数据导入」功能，支持大纲/章节和真题批量导入，写入本地库。
- **整体替换快照**：替换 `server/data-export/` 后，**必须**同时修改 `server/database/local-db.ts` 里的 `DATA_VERSION`，否则应用不会触发同步。

`scripts/export_data.py` 保留用于从线上 API 重新导出数据，需要 `EXPORT_TOKEN` 环境变量。**日常构建不需要它。**

---

## License

MIT

> 说明：`client/` 下的前端构建产物源自「全职高手考研系统」网页版，其授权状态独立于本仓库的 MIT 声明；如需二次分发请自行确认来源许可。
