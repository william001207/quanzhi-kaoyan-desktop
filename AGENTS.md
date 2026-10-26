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
client/                 前端构建产物（由 client-src 构建而来，勿手改；改界面去 client-src）
client-src/            前端可维护源码（vite 构建，私有包已用本地替身绕开，能独立 npm install && build）
build/                  electron-builder 配置 + 图标
scripts/                verify_repo(自检) / sync_index(索引对齐) / build-desktop(打包) / setup-repo(入库)
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
- **`data-export/` 里每种内容都有两层文件，别改错也别只改一层**：
  - 详情层 `*_details.json` —— 真正的题库内容（题干/答案/卡片/章节路径），**启动同步只读这一层**；
  - 索引层 `knowledge_points.json` / `exam_questions.json` —— 同一批条目的精简投影 + 学习统计字段，
    运行时和前端都不读，只给导出/导入脚本用。
  手改详情层（加题、改章节、补备注）后索引层不会自动变，条数会落后（曾出现知识点索引停在 1052
  而详情已 1196，被误判成「仓库是旧数据」）。**改完详情层必须跑一次**：
  ```
  python3 scripts/sync_index.py          # 对齐（幂等，可反复跑）
  python3 scripts/sync_index.py --check  # 只检查，有差异退出码 1
  ```
  `verify_repo.py` 已加入强制校验：两层条数或标题/章节对不上就中止构建。
  索引层不参与启动同步，**对齐它不需要改 `DATA_VERSION`**。
- 服务监听 `127.0.0.1` 的**随机端口**：`listen(0)` 由系统分配，实际端口通过
  `DESKTOP_SERVER_READY <port>` 回传给主进程（主进程按行解析，不要改回按 chunk 匹配）。
  **不要再写死端口**——17890 时代已结束，残留进程、Hyper-V 保留段都会抢占它。
- CORS 只放行本机回环来源（任意端口），不要再改回 `origin: true`，也不要用写死端口做白名单。
- **单实例保护**（`server/main.ts` 的 `claimInstance`）：用 `pglite-data/instance.json`
  + `O_EXCL` 原子创建做锁，抢不到 = 已有实例在跑（退出码 2，主进程杀掉旧进程后重拉）。
  - 过期记录的接管**必须用 rename 挪走，不能用 unlink**：两个进程同时判定「记录过期」时，
    后一个 unlink 会把前一个刚建好的新锁删掉，两边都以为抢到了 → 又是两个服务开同一个数据库。
  - `instance.json.takeover`（接管锁）自己的残留清理同理：走 `breakStaleTakeover()`，
    先 `rename` 到唯一墓碑名（只有一个进程能挪成功），再比对挪走的内容是不是当初判定那条，
    不是就用 `link` 放回去。**不能直接 `unlink`**——那会把别人刚建的新锁删掉，
    两个进程同时进临界区，互斥彻底失效。
  - 判断接管锁能不能清，看「持有者 PID 还活不活」，文件年龄只作兜底
    （PID 被复用时无从判断）。只看年龄会误删活锁；只看年龄又会「持有者已死但文件还新」
    时死等 10 秒，表现为用户连续启动都失败。
  - 主进程端**不能只凭 PID 就 kill**：`inspectProcessIdentity()` 会核实该 PID 到底是不是
    本应用的服务，确认是别人的进程时改走「强制接管」而不是杀。
    Windows 侧**只认可执行文件绝对路径**（`process.execPath` 精确比对）：
    `server\dist\main.js` 这种通配片段只能得出「像我们的、但不是这一份」，
    绝不能据此判 `ours` —— 另一个安装目录（同名 exe、共用同一个数据目录）的服务
    会被认成自己而遭结束。命令行里的中文路径必须先用 UTF-8 输出再比对，否则乱码导致
    永远匹配不上，就会退回宽松匹配的老毛病。
  - 已知边界：从**没有指纹文件的老版本**（v1.1.5 及更早）升级时，老进程留下的锁无从判断。
    这条靠外部手段兜底——Windows 安装脚本在装之前 `taskkill` 掉旧进程；macOS 上正在运行的
    `.app` 无法被覆盖替换，必须先退出（退出即清理子进程）。


## 六、关于前端能力（容易误判，务必注意）

历史上 `client/` 是构建产物、**没有源码**，所以曾得出"前端不能改"的结论。
**现在情况已变**：`client-src/` 是真正可维护的前端源码，且能独立构建——

- `client-src/vite.config.ts` 已把平台私有包 `@lark-apaas/*` 全部 alias 到本地 `src/platform/` 替身；
- `client-src/package.json` 里**没有**任何 `@lark-apaas/*` 依赖，所以 `npm install` 只装公开包即可；
- 实测 `cd client-src && npm run build` 约 8 秒出包（输出到 `tmp-build`）。

**改前端界面的标准流程**（本仓库已验证）：
1. 改 `client-src/src` 里的源码；
2. `cd client-src && npm run build`（产物在 `tmp-build`）；
3. `cp -R tmp-build/. client/` 把产物同步回 `client/`；
4. 提交 `client-src/` 和 `client/` 两处改动。
> 注意：一键构建脚本 `scripts/build-desktop.sh` **不会**自动跑 vite，它只编译 server + 打包已有的 `client/`。所以前端改动必须手动走上面 2-3 步，否则装出来还是旧界面。

**仍然成立的一条**：不要靠搜索压缩 bundle 来推断"某个功能是否存在"——
已有功能在 bundle 里是完整的，文案可能由变量拼接、API 路径在共享模块、压缩后改名，搜字面量常失效。
判断界面上有没有某个操作，**直接问用户**（他是实际使用者）或让他截图最稳。

> 踩过的坑：曾两次断言"真题题干不可编辑""难度不可编辑"，实际答题卡片里两者都能改。
> 都是因为只搜字面量没搜字段名和组件 props 才漏掉。

## 七、沟通方式

- 用中文，用大白话。不要假设对方懂 TypeScript、git、命令行。
- 需要主人动手时，**给可以直接复制粘贴的完整命令**，并说明成功时长什么样。
- 报告问题先说「会不会影响他正常使用」，再说技术细节。
