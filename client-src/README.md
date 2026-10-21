# 网页版前端源码（client-src/）

> 从平台应用（妙搭 fullstack）经平台应用助手**逐字导出**的网页版前端源码，与线上网页版功能一致。
> 本目录**未编译验证**，供开源参考 / 二次开发使用；桌面版安装包内的前端为构建产物（见仓库根 `client/`）。

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
3. **构建依赖**：`@lark-apaas/*`（client-toolkit / fullstack-presets / coding-preset-vite-react）为平台私有包，
   本地独立构建需要平台环境或等价依赖；别名约定：`@/` → `client/src`、`@client/*` → `client/*`、`@shared/*` → `shared/*`（`shared/` 在仓库根，含 API 接口类型）。

## 与桌面版的关系

- 网页版（本目录源码）→ 构建产物 → 桌面版 `client/`（Electron 直接加载）；
- 桌面版后端为 `server/`（NestJS + PGlite 本地库），数据离线存储，与网页版 API 兼容；
- 数据同步：新资料可桌面版「数据导入」即时导入；线上题库更新后由新安装包增量同步。
