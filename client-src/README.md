# 网页版前端源码（client-src/）

> 从平台应用（妙搭 fullstack）经平台应用助手**逐字导出**的网页版前端源码，与线上网页版功能一致。
> **本目录可以独立构建**（已实测通过）：平台私有包 `@lark-apaas/*` 在 `vite.config.ts` 里被别名到本地替身 `src/platform/`，
> `package.json` 中不含这些私有依赖，因此不需要平台环境。

## 独立构建（改界面的标准流程）

```bash
cd client-src
npm install
npm run dev      # 开发服务器，调界面用
npm run build    # 产物输出到仓库根 tmp-build/（约 1 秒）
```

构建产物同步进桌面版的 `client/`：

```bash
cd ..                      # 回到仓库根
cp -R tmp-build/. client/  # 覆盖同步（不删旧文件，旧 chunk 由下面命令清理）
npm run verify             # 构建前自检
```

一键构建脚本（`scripts/build-desktop.sh`）只编译 server 并打包 `client/`，**不会自动跑 vite**，
所以改了 `client-src/` 必须手动执行上面两步。

清理历史构建残留（可选，`client/assets` 里会积攒旧 chunk）：

```bash
comm -23 <(ls client/assets | sort) <(ls tmp-build/assets | sort) | xargs -I{} rm "client/assets/{}"
```

## 目录结构

```
client-src/
├── package.json            # 平台工程依赖与脚本（原样）
├── vite.config.ts          # Vite 配置（@ 别名 → client/src）
├── tailwind.config.ts      # Tailwind 4 预设
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── postcss.config.js       # 本地独立构建补充（平台内置 preset 自带 postcss）
└── src/
    ├── index.tsx           # 入口（BrowserRouter + AppContainer + ErrorBoundary）
    ├── app.tsx             # 路由表
    ├── index.css / tailwind-theme.css / typography.css
    ├── api/                # 13 个接口层（章节/计划/真题/知识点/模拟卷/复习/搜索/设置/统计/科目/错题/导入）
    ├── pages/              # 25 个页面（今日/模拟卷/导入/复习队列/设置/仪表盘/大纲/知识点/错题本/真题/404 等）
    ├── components/
    │   ├── Layout.tsx      # 应用外壳（侧边栏 + 顶栏）
    │   ├── ChapterPathBadges.tsx / KeepAliveOutlet.tsx
    │   ├── knowledge-card/ # 知识点卡片（编辑器/查看器/真题卡片）
    │   ├── question-difficulty.tsx / question-tags.tsx
    │   └── ui/             # shadcn 风格组件库（56 组件 + README）+ icons/（23 个彩色文件类型图标）
    ├── hooks/              # use-mobile / use-stats-refresh / use-example
    ├── lib/utils.ts
    ├── types/              # common.ts / global.d.ts / index.ts
    └── utils/              # mastery 熟练度计算、weak-mark-bus 弱项标记、img-resources 占位图
```

## 已知限制（重要）

1. **`components/business-ui/` 未取回**：平台模板自带的 83 个企业业务组件（chats / departments / user-profiles / users / 各类选择器），
   本应用代码**没有任何引用**（已 grep 验证），属平台模板脚手架而非应用自有代码，故不纳入本目录。
2. **`assets/logo.png` 未取回**：平台内为二进制 PNG（2048×2048，深蓝渐变 + 立体「全」字图标），无法经文本通道逐字导出。
   桌面版已使用用户选定的同款图标（安装包内 `build/icon.png`），如需原始文件可从安装包资源中提取。
3. **平台私有包已替换为本地替身**：`@lark-apaas/*`（client-toolkit / fullstack-presets / coding-preset-vite-react）
   在 `vite.config.ts` 中被别名到 `src/platform/` 下的本地实现（logger、AppContainer、ErrorRender、axios 等），
   `package.json` 中不含这些依赖，`npm run build` 已实测可编译通过。
   项目内部别名：`@/` → `src/`、`@client/*` → 本目录、`@shared/*` → `../server/shared/`（API 接口类型）。
   注意 `npm run type:check` 存在历史遗留的类型报错（lucide-react 缺类型声明等），**以 `npm run build` 通过为准**。

## 与桌面版的关系

- 网页版（本目录源码）→ `npm run build` → 产物同步进桌面版 `client/`（Electron 直接加载）；
- 桌面版后端为 `server/`（NestJS + PGlite 本地库），数据离线存储，与网页版 API 兼容；
- 数据同步：新资料可桌面版「数据导入」即时导入；线上题库更新后由新安装包增量同步。
- 因此**改界面是可行的**：改 `src/` → `npm run build` → `cp -R tmp-build/. client/` → 重新打包安装包。
  一键构建脚本不会自动跑 vite，这两步要手动做（见上方「独立构建」）。
