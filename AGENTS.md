# 给 AI 的工作说明

> 任何人（或 AI）接手这个仓库前，请先读完这一页。
> 仓库主人不写代码，请用**人能听懂的话**沟通。

## 一、最重要的一条：发版前必须确认

**改完功能、推送新版本之前，必须先向仓库主人确认两件事：**

1. **本次改了什么功能**（用人话描述，逐条列出，不要只给 diff）
2. **建议的版本号是多少，为什么**

确认流程：

```
AI：这次改动如下，请确认：
    【功能】
    1. 错题本加了按科目筛选
    2. 修复了筛选后列表不刷新的问题
    【版本号建议】1.0.1 → 1.1.0（新增功能，按语义化版本升次版本号）
    【影响】不影响已有数据，无需迁移

    确认后我再执行：改版本号 → 提交 → 打 tag → 推送触发构建

主人：确认
AI ：（此时才执行 npm version / git tag / git push）
```

**未经确认，不要 push、不要打 tag、不要发 Release。**

---

## 二、绝对不能碰的东西

| 禁止 | 原因 |
|---|---|
| 改 `server/database/schema.sql` 表结构 | 存量用户的库里没有新列，会导致启动即报错。真需要改，必须同时提供迁移脚本（启动时检测列是否存在，不存在就 `ALTER TABLE ADD COLUMN`） |
| 改 `server/data-export/` 里的数据但不同步改 `DATA_VERSION` | 应用靠这个常量判断内容是否有更新，不改就不生效 |
| 把构建流程改回「从 CDN 下载源码/数据/资源」 | 这正是历史上反复构建失败的原因。仓库已自包含，不要退回去 |
| 删除 `server/data-export/*.json` 或把它们加进 `.gitignore` | 这是首次安装时导入题库的唯一来源，删了安装包就是空库 |
| 改动 `client/assets/` 里的文件名 | 这些是带内容 hash 的构建产物，`index.html` 按名字引用。要改必须整体替换并同步改 `index.html` |

---

## 三、改动后必须做的验证

```bash
# 1. 完整性自检（会检查源码 60+、数据 22 个、前端资源 40+、图标）
npm run verify

# 2. 编译验证（改过 .ts 就必须跑）
npm run build:server

# 3. 真机验证（改了核心功能才需要）
bash scripts/build-desktop.sh mac
```

如果有任何一项没过，**不要提交**。

---

## 四、这个项目的结构

```
electron/main.js        Electron 壳：拉起本地服务、开窗、单实例锁、退出时等落库
server/                 NestJS 后端（62 个 .ts）
  main.ts               启动入口，含优雅关闭（SIGTERM → 关库）
  platform/             平台兼容层，替代原来的 aPaaS 运行时
  database/local-db.ts  PGlite 初始化、全量导入、增量同步、DATA_VERSION
  data-export/          题库数据快照（16MB，首次启动导入）
  modules/              17 个业务模块（真题/知识点/复习/错题/计划/模拟考/统计…）
client/                 前端构建产物（无源码，只能改 index.html 外壳）
build/                  electron-builder 配置 + 图标
scripts/                verify_repo(自检) / build-desktop(打包) / setup-repo(入库)
docs/                   发布手册、改动与回退说明
.github/workflows/      build.yml：matrix 构建 mac + win，推 v* tag 触发
```

## 五、技术要点

- 数据库是 **PGlite**（PostgreSQL 的 WASM 版），数据在
  `~/Library/Application Support/全职高手考研系统/pglite-data/`。
- 首次启动导入全量数据约 9400 条 INSERT，逐条串行，**慢（1-2 分钟）但正确**。
  如需优化可改批量插入，但必须实测，别盲改。
- 增量同步只 UPDATE 内容字段（`content`/`summary`/`keywords`/`card_data`），
  明确保留 `mastery_score`/`status`/`review_*`/`is_weak_marked` 等进度字段。**这个语义不能破坏。**
- 服务监听 `127.0.0.1:17890`，CORS 只放行本机来源（不要再改回 `origin: true`）。

## 六、关于前端能力（容易误判，务必注意）

`client/` 是构建产物，**没有源码**。由此得出两个**不同**的结论，千万别混为一谈：

- ✅ **不能新增任何界面**：加按钮、加页面、改布局、改文案——统统做不到
- ❌ **不能由此推断"某个功能不存在"**：已有功能是完整的，只是代码在压缩 bundle 里

**判断"界面上有没有某个操作"，不要靠搜索 bundle 来推断。**
搜字面量（中文文案、API 路径、字段名）经常失效，原因：
- 文案可能由变量拼接，搜不到
- API 路径在共享 api 模块里，组件文件里根本不出现
- 压缩后变量名/组件名全被改写

正确做法：**直接问用户**（他是实际使用者，点一下就知道），或让他截图确认。

> 踩过的坑：曾两次断言"真题题干不可编辑""难度不可编辑"，
> 实际答题卡片里两者都能改——
> 题干是 `onClick:()=>{B(j.questionText),z(!0)}`，
> 难度是 `<DifficultyPicker difficulty editable questionId onUpdate />`。
> 都是因为只搜字面量没搜字段名和组件 props 才漏掉。

## 七、沟通方式

- 用中文，用大白话。不要假设对方懂 TypeScript、git、命令行。
- 需要主人动手时，**给可以直接复制粘贴的完整命令**，并说明成功时长什么样。
- 报告问题先说「会不会影响他正常使用」，再说技术细节。
