import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from './platform';
import { initializeDatabase, closeDb } from './database/local-db';
import { join, resolve } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hbs = require('hbs');

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// 保存应用实例，供退出时优雅关闭使用
let httpApp: NestExpressApplication | null = null;
let shuttingDown = false;

async function bootstrap() {
  // 先确保本地数据库就绪（建表 + 数据导入）
  await initializeDatabase();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });
  httpApp = app;
  await configureApp(app, {
    disableSwagger: true,
  });
  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || '127.0.0.1';
  const port = Number(process.env.SERVER_PORT || '17890');

  // 客户端静态资源目录（index.html + assets/）
  const clientDir = process.env.CLIENT_DIR || join(process.cwd(), '..', 'client');

  // 静态资源优先（存在即返回，否则落到路由）
  app.useStaticAssets(clientDir);

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  app.setBaseViewsDir(clientDir);
  app.setViewEngine('html');
  app.engine('html', hbs.__express);

  // SPA 兜底：非 /api 的 GET 请求一律返回 index.html。
  // 否则在新窗口里直接加载 /mock-exam/print/xxx 这类前端路由会 404
  // （试卷预览、打印都是 window.open 打开这种地址）。
  const expressInstance = app.getHttpAdapter().getInstance();
  const indexHtml = resolve(clientDir, 'index.html');
  expressInstance.use((req: any, res: any, next: any) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/assets/')) return next();
    // sendFile 要求绝对路径，CLIENT_DIR 可能是相对的（打包后是绝对路径）
    res.sendFile(indexHtml);
  });

  await app.listen(port, host);
  logger.log(`Server running on http://${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
  // Electron 主进程等待该标记后打开窗口
  console.log('DESKTOP_SERVER_READY');
}

/**
 * 优雅关闭：先停 HTTP 服务，再关数据库。
 * 关窗时 Electron 会发 SIGTERM 过来，走这里才能保证数据落盘。
 */
async function shutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] 收到 ${reason}，正在安全关闭…`);
  try {
    // 先取到局部变量再 await，避免 TypeScript 在 await 之后丢失类型收窄
    const app = httpApp;
    if (app) await app.close();
  } catch (e) {
    console.error('[shutdown] 关闭 HTTP 服务时出错：', e);
  }
  try {
    await closeDb();
  } catch (e) {
    console.error('[shutdown] 关闭数据库时出错：', e);
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// 启动失败必须打印原因并以非 0 退出，否则父进程只会看到「窗口一闪而过」
bootstrap().catch((err) => {
  console.error('[fatal] 本地服务启动失败：', err);
  process.exit(1);
});
