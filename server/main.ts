import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from './platform';
import { initializeDatabase, closeDb } from './database/local-db';
import { claimInstance, releaseInstance } from './database/instance-lock';
import { join, resolve } from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hbs = require('hbs');

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// 保存应用实例，供退出时优雅关闭使用
let httpApp: NestExpressApplication | null = null;
let shuttingDown = false;

// ---------------------------------------------------------------------------
// 实例锁：防止两个服务进程同时打开同一个数据库。
// 具体实现与并发细节见 database/instance-lock.ts（含接管互斥与损坏自愈）。
// 退出码约定：
//   2 = 已有活实例占着数据目录（主进程会核实 PID 身份后决定杀/接管/报错）
//   3 = 锁文件本身写不了（目录只读、权限被改），必须如实报错，不能放行
// ---------------------------------------------------------------------------
async function bootstrap() {
  // 先抢实例锁：已有活实例就退出（退出码 2），由主进程核实 PID 身份后
  // 决定「结束残留进程 / 忽略无关 PID / 报错」；锁文件写不了则退出码 3。
  const dbDir = process.env.DB_DIR;
  if (dbDir) {
    const claim = claimInstance(dbDir, { forceClaim: process.env.DESKTOP_FORCE_CLAIM === '1' });
    if (!claim.ok) {
      // 用同步写而不是 console.log：stdout 是管道时 Node 按块缓冲，
      // 紧接着 process.exit 会丢掉没刷出的内容，主进程就收不到这个标记。
      if (claim.reason === 'lock-error') {
        const msg = claim.error instanceof Error ? claim.error.message : String(claim.error || '未知错误');
        fs.writeSync(1, `DESKTOP_INSTANCE_ERROR ${msg.replace(/[\r\n]+/g, ' ')}\n`);
        process.exit(3);
      }
      fs.writeSync(1, `DESKTOP_INSTANCE_RUNNING ${claim.existingPid ?? 0}\n`);
      process.exit(2);
    }
  }

  // 先确保本地数据库就绪（建表 + 数据导入）
  await initializeDatabase();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
    // 关闭默认 body 解析器，改在 configureApp 里注册带大上限的版本
    // （导入内容/学习数据的 JSON 可能超过默认的 100kb）
    bodyParser: false,
  });
  httpApp = app;
  await configureApp(app, {
    disableSwagger: true,
  });
  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || '127.0.0.1';
  // 端口 0 = 交给操作系统随机分配。写死端口时，残留进程 / Hyper-V 保留段 /
  // 其它程序都可能把它占掉，导致启动失败（win 上出现过这个弹窗）。
  // 实际端口通过 READY 标记回传给主进程。SERVER_PORT 仅在开发调试时手动指定。
  const port = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 0;

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

  const httpServer = await app.listen(port, host);
  const addr = httpServer.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  logger.log(`Server running on http://${host}:${actualPort}`);
  logger.log(`API endpoints ready at http://${host}:${actualPort}/api`);
  // Electron 主进程等待该标记后打开窗口；标记后跟实际端口（随机分配，主进程解析使用）。
  // 同步写：管道缓冲会拖延这个标记的送达，主进程等不到就不切主界面。
  fs.writeSync(1, `DESKTOP_SERVER_READY ${actualPort}\n`);
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
  // 正常退出要清掉自己的指纹文件，下次启动直接进，不用等 PID 失效
  const dbDir = process.env.DB_DIR;
  if (dbDir) releaseInstance(dbDir);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// 启动失败必须打印原因并以非 0 退出，否则父进程只会看到「窗口一闪而过」
bootstrap().catch((err) => {
  console.error('[fatal] 本地服务启动失败：', err);
  // 已经拿到锁却倒在后续步骤（数据库打不开等）：把自己那条记录清掉，
  // 别让一个已死的 PID 留在文件里拖慢下次启动。releaseInstance 只删 token 对得上的那条。
  const dbDir = process.env.DB_DIR;
  if (dbDir) releaseInstance(dbDir);
  process.exit(1);
});
