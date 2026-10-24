import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from './platform';
import { initializeDatabase, closeDb } from './database/local-db';
import { join, resolve } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
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
// （Hyper-V、别的程序都可能占端口）。现在的做法：
//   1. 用 O_EXCL 原子创建 instance.json 占用实例，抢不到就说明已有实例；
//   2. 记录 pid + 随机 token + 启动时间，之后每 3 秒更新一次心跳；
//   3. 主进程收到「已有实例」后，先用系统命令核实那个 PID 到底是不是本应用的服务进程，
//      是才杀；不是（PID 被系统回收后分给了别的程序）就改走强制接管，绝不误杀；
//   4. 退出时只删自己那条（token 对得上）。
//
// 心跳的作用是**辅助**证据，不是判据：首次启动导数据时事件循环被占满，
// 心跳可能十几秒不更新，所以「心跳过期」不能反推「进程已死」；
// 它只在主进程查不出进程身份时作为「敢不敢下手」的参考。
// ---------------------------------------------------------------------------
const INSTANCE_FILE = 'instance.json';
const HEARTBEAT_INTERVAL_MS = 3000;
// 本进程的身份标识：判断指纹文件是不是自己写的，避免误删/误接管别人的记录
const instanceToken = randomUUID();
const instanceStartedAt = new Date().toISOString();
let heartbeatTimer: NodeJS.Timeout | null = null;

interface InstanceRecord {
  pid: number;
  token: string;
  startedAt: string;
  heartbeatAt: string;
}

function instanceFilePath(dbDir: string): string {
  return join(dbDir, INSTANCE_FILE);
}

function buildInstanceRecord(): InstanceRecord {
  return {
    pid: process.pid,
    token: instanceToken,
    startedAt: instanceStartedAt,
    heartbeatAt: new Date().toISOString(),
  };
}

function readInstanceRecord(file: string): InstanceRecord | null {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pid = Number(raw && raw.pid);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return {
      pid,
      token: typeof raw.token === 'string' ? raw.token : '',
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
      heartbeatAt: typeof raw.heartbeatAt === 'string' ? raw.heartbeatAt : '',
    };
  } catch (_) {
    // 文件损坏/读不了：当作没有记录，后面会覆盖写
    return null;
  }
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
 * 判断这条指纹记录对应的实例是否还活着。
 *
 * 注意：这里**故意不看心跳是否新鲜**。首次启动要把上万条数据写进 PGlite，
 * 导入期间事件循环会被占满，心跳定时器可能十几秒甚至更久不触发；
 * 若把「心跳过期」当作「实例已死」，会让新进程去抢一个正在跑（且正在写数据库）
 * 的实例，那才是真正的数据损坏风险。所以这里只做「PID 还在不在」这一件事，
 * 「这个 PID 是不是我们的进程」交给主进程用系统命令核实。
 */
function inspectInstanceRecord(rec: InstanceRecord): { live: boolean; reason: string } {
  if (!pidAlive(rec.pid)) {
    return { live: false, reason: `pid ${rec.pid} 已退出` };
  }
  const beat = rec.heartbeatAt ? Date.parse(rec.heartbeatAt) : NaN;
  const ageText = Number.isFinite(beat) ? `，心跳 ${Math.round((Date.now() - beat) / 1000)} 秒前` : '';
  return { live: true, reason: `pid ${rec.pid} 仍在运行${ageText}` };
}

/** 原子替换：先写临时文件再改名，避免主进程读到写了一半的 JSON。 */
function writeInstanceRecord(file: string, rec: InstanceRecord): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec), 'utf8');
  fs.renameSync(tmp, file);
}

/** 定时续心跳。文件被别人接管或删掉就停，不再抢回来。 */
function startHeartbeat(file: string): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    try {
      const cur = readInstanceRecord(file);
      if (!cur || (cur.token && cur.token !== instanceToken)) {
        stopHeartbeat();
        return;
      }
      writeInstanceRecord(file, buildInstanceRecord());
    } catch (_) {
      // 心跳写失败不阻塞服务：主进程还有 PID 判断兜底
    }
  }, HEARTBEAT_INTERVAL_MS);
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/** 尝试以 O_EXCL 创建锁文件。成功返回 true，已存在返回 false（其余错误抛出）。 */
function tryCreateExclusive(file: string, rec: InstanceRecord): boolean {
  let fd: number;
  try {
    // 'wx' = O_CREAT|O_EXCL：文件已存在就失败，内核保证同一时刻只有一个进程能建成
    fd = fs.openSync(file, 'wx');
  } catch (e: any) {
    if (e && e.code === 'EEXIST') return false;
    throw e;
  }
  try {
    fs.writeSync(fd, JSON.stringify(rec));
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/**
 * 占用实例。
 * 返回 { ok: true } 可以继续启动；{ ok: false, existingPid } 表示检测到活实例。
 *
 * 抢锁流程（关键是**不要「先删再建」**）：
 *   1. 直接 O_EXCL 创建。成功即成锁，内核保证互斥。
 *   2. 失败 = 已有文件。读出来判断对方是否活着。
 *   3. 对方活着 → 让主进程去处理（退出码 2）。
 *   4. 对方是过期记录 → **用 rename 把它挪走**再重新抢。
 *      这一步不能用 unlink：两个进程同时判定「记录过期」时，
 *      后一个 unlink 会把前一个刚建好的新锁删掉，两边都以为抢到了，
 *      结果又是两个服务开同一个数据库。rename 只有一个能成功，
 *      失败的那个直接重试，天然串行化。
 */
function claimInstance(dbDir: string): { ok: boolean; existingPid?: number } {
  const file = instanceFilePath(dbDir);
  // 主进程判定记录不可信时会带这个环境变量，让我们跳过旧记录直接接管
  const forceClaim = process.env.DESKTOP_FORCE_CLAIM === '1';
  let lastExistingPid: number | undefined;

  // 两轮足够：第一轮抢锁/挪走过期记录，第二轮抢到
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (tryCreateExclusive(file, buildInstanceRecord())) {
        if (attempt > 0) console.log('[instance] 接管完成，已写入本进程指纹');
        startHeartbeat(file);
        return { ok: true };
      }
    } catch (e) {
      // 写不了指纹（目录只读等极端情况）不阻塞启动，退化为旧行为。
      // 这种情况下数据库本身多半也打不开，真实故障会在后面 initializeDatabase 暴露。
      console.error('[instance] 写指纹文件失败：', e);
      return { ok: true };
    }

    const existing = readInstanceRecord(file);
    if (!existing) {
      // 文件刚被别的进程挪走/删掉，直接进入下一轮重抢
      continue;
    }
    const view = inspectInstanceRecord(existing);
    if (view.live && !forceClaim) {
      lastExistingPid = existing.pid;
      return { ok: false, existingPid: existing.pid };
    }
    if (view.live) {
      console.warn(`[instance] 主进程核实后要求强制接管（${view.reason}），跳过旧记录继续启动`);
    } else {
      console.log(`[instance] 清理过期记录（${view.reason}）`);
    }

    // 原子地把过期记录挪开（不是删），挪成功才继续抢
    const aside = `${file}.stale.${process.pid}.${Date.now()}`;
    try {
      fs.renameSync(file, aside);
    } catch (_) {
      // 别人先挪走了：这一轮算白跑，下一轮重新抢
      continue;
    }
    try {
      fs.unlinkSync(aside);
    } catch (_) {
      /* 删不掉也无所谓，名字带 pid+时间戳不会冲突 */
    }
  }

  // 两轮都没抢到：如实报告占用人
  const rival = readInstanceRecord(file);
  if (rival && inspectInstanceRecord(rival).live) {
    return { ok: false, existingPid: rival.pid };
  }
  return { ok: false, existingPid: lastExistingPid };
}

/** 退出时清理指纹。只删自己那条，绝不误删别人的。 */
function releaseInstance(dbDir: string): void {
  stopHeartbeat();
  try {
    const file = instanceFilePath(dbDir);
    const rec = readInstanceRecord(file);
    if (!rec) return;
    // token 对得上 = 这条记录是我们写的；旧格式没有 token 时退回比 PID
    const mine = rec.token ? rec.token === instanceToken : rec.pid === process.pid;
    if (mine) fs.unlinkSync(file);
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
