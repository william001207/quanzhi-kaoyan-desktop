import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ROOT = __dirname;

// 应用内路由基路径：服务端会把 / 重定向到这里，并剥掉前缀后服务静态资源。
// 换部署路径时改这一行（同时改 server/platform/index.ts 里的前缀）。
const APP_BASE_PATH = '/app/app_17g1b8sj7x4';

export default defineConfig({
  plugins: [react()],

  // 必须用绝对路径：相对路径 './' 在深层路由下会解析错
  // （如 /app/xxx/mock-exam/print/1 会把 assets 解析到 .../print/assets/，导致白屏）
  base: `${APP_BASE_PATH}/`,

  define: {
    // index.tsx 里 BrowserRouter 的 basename 读这个值
    'process.env.CLIENT_BASE_PATH': JSON.stringify(APP_BASE_PATH),
  },

  resolve: {
    alias: [
      // ===== 平台私有包 → 本地替身 =====
      // 精确路径必须排在下面的通配规则之前，vite 按数组顺序取第一个匹配
      { find: '@lark-apaas/client-toolkit/logger', replacement: path.resolve(ROOT, 'src/platform/logger.ts') },
      { find: '@lark-apaas/client-toolkit/utils/getAxiosForBackend', replacement: path.resolve(ROOT, 'src/platform/axios-for-backend.ts') },
      { find: '@lark-apaas/client-toolkit/utils/resolveAppUrl', replacement: path.resolve(ROOT, 'src/platform/resolve-app-url.ts') },
      { find: '@lark-apaas/client-toolkit/utils/getEnv', replacement: path.resolve(ROOT, 'src/platform/index.ts') },
      { find: '@lark-apaas/client-toolkit/components/AppContainer', replacement: path.resolve(ROOT, 'src/platform/app-container.tsx') },
      { find: '@lark-apaas/client-toolkit/components/ErrorRender', replacement: path.resolve(ROOT, 'src/platform/error-render.tsx') },
      { find: '@lark-apaas/client-toolkit/components/NotFoundRender', replacement: path.resolve(ROOT, 'src/platform/not-found-render.tsx') },
      { find: '@lark-apaas/client-toolkit/components/UniversalLink', replacement: path.resolve(ROOT, 'src/platform/universal-link.tsx') },
      { find: '@lark-apaas/client-toolkit', replacement: path.resolve(ROOT, 'src/platform/index.ts') },

      // ===== 项目内部别名 =====
      { find: '@client', replacement: ROOT },                                   // @client/src/x → client-src/src/x
      { find: '@shared', replacement: path.resolve(ROOT, '../server/shared') },  // @shared/api.interface → server/shared/
      { find: '@', replacement: path.resolve(ROOT, 'src') },                     // @/components/x → src/components/x
    ],
  },

  build: {
    // 先输出到临时目录，确认产物可用后再同步进 client/
    outDir: path.resolve(ROOT, '../tmp-build'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
