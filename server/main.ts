import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from './platform';
import { initializeDatabase, closeDb } from './database/local-db';
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
// 实例指纹：防止两个服务进程同时打开同一个数据库
//
// 背景：覆盖安装时旧版的服务进程可能没被干净收掉，成为继续占着数据目录的
// 「孤儿进程」。旧代码靠固定端口被占来兜底（起不来 → 弹窗），误报率极高
// （Hyper-V、别的程序都可能占端口）。现在改为：启动时在数据目录写一个指纹
// 文件记录自己的 PID；发现旧 PID 仍活着就拒绝启动（退出码 2），由主进程
// 杀掉旧进程后重新拉起。退出时指纹文件清掉。
// ---------------------------------------------------------------------------
const INSTANCE_FILE = 'instance.json';

function instanceFilePath(dbDir: string): string {
  return join(dbDir, INSTANCE_FILE);
}

/** 探测 PID 是否活着。信号 0 不杀进程，只问「在吗」。 */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // ESRCH = 不存在；EPERM = 存在但无权发信号，同样算活着
    return !!e && e.code === 'EPERM';
  }
}

/**
 * 检查并占用实例。
 * 返回 { ok: true } 可以继续启动；{ ok: false, existingPid } 表示检测到活实例。
 */
function claimInstance(dbDir: string): { ok: boolean; existingPid?: number } {
  const file = instanceFilePath(dbDir);
  let existingPid: number | undefined;
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const pid = Number(raw && raw.pid);
      if (Number.isFinite(pid) && pid > 0 && pidAlive(pid)) {
        existingPid = pid;
      }
      // PID 已死 = 上次崩溃/断电留下的烂账，覆盖掉继续走
    }
  } catch (_) {
    // 指纹文件损坏/读不了：当作没有处理
  }
  if (existingPid) {
    return { ok: false, existingPid };
  }
  try {
    fs.writeFileSync(
      file,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      'utf8',
    );
  } catch (e) {
    // 写不了指纹不阻塞启动（极端情况：目录只读），退化为旧行为
    console.error('[instance] 写指纹文件失败：', e);
  }
  return { ok: true };
}

/** 退出时清理指纹。只删自己那条，绝不误删别人的。 */
function releaseInstance(dbDir: string): void {
  try {
    const file = instanceFilePath(dbDir);
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && Number(raw.pid) === process.pid) {
      fs.unlinkSync(file);
    }
  } catch (_) {
    /* ignore */
  }
}

async function bootstrap() {
  // 先做实例指纹检查：发现旧实例还活着就直接退出（退出码 2），
  // 由主进程杀掉残留进程后重新拉起，避免两个服务抢同一个数据库
  const dbDir = process.env.DB_DIR;
  if (dbDir) {
    const claim = claimInstance(dbDir);
    if (!claim.ok) {
      // 用同步写而不是 console.log：stdout 是管道时 Node 按块缓冲，
      // 紧接着 process.exit 会丢掉没刷出的内容，主进程就收不到这个标记。
      fs.writeSync(1, `DESKTOP_INSTANCE_RUNNING ${claim.existingPid}\n`);
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
  process.exit(1);
});
