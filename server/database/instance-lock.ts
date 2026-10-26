/**
 * 实例锁 —— 防止两个服务进程同时打开同一个 PGlite 数据库
 *
 * 背景：覆盖安装时旧版的服务进程可能没被干净收掉，成为继续占着数据目录的
 * 「孤儿进程」。旧代码靠固定端口被占来兜底（起不来 → 弹窗），误报率极高
 * （Hyper-V、别的程序都可能占端口）。现在改用数据目录里的锁文件：
 *
 *   instance.json      主锁。用 O_CREAT|O_EXCL 原子创建，内核保证同一时刻
 *                      只有一个进程能建成 —— 这是唯一的互斥来源。
 *   instance.takeover  接管锁。只在「清掉一条过期或损坏的记录」时短暂持有，
 *                      把「判断 → 删 → 换我建」串行化。
 *
 * 为什么必须有 takeover 这层：
 *   只靠 rename 把过期记录挪走并不互斥。可能发生这样的顺序 ——
 *   A、B 都读到同一条过期记录；B 先挪走旧记录并建好自己的新锁；A 依据之前
 *   的判断继续执行，把 B 的新锁也挪走，再建自己的锁。结果 A、B 都认为成功。
 *   现在接管者必须先拿到 takeover 锁，进临界区后**重读并比对记录身份**
 *   （pid + token），发现已被别人换过就退出重来，因此不会挪掉别人的新锁。
 *   清理 takeover 锁本身的残留时同样不能直接 unlink（两人同时删，会把对方
 *   刚建的新锁也删掉，两个进程于是同时进临界区），改用 rename 独占 + 内容校验，
 *   详见 breakStaleTakeover()。
 *
 * 记录内容：pid + 随机 token + 启动时间 + 心跳时间。
 * 心跳只作**辅助**证据：首次启动导数据时事件循环被占满，心跳可能十几秒不更新，
 * 所以「心跳过期」绝不能反推「进程已死」—— 那会让新进程去抢一个正在写数据库
 * 的实例。这里只做「PID 还在不在」这一件事，「这个 PID 是不是我们的进程」
 * 由 Electron 主进程用系统命令核实。
 */
import * as fs from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const INSTANCE_FILE = 'instance.json';
/** 接管锁紧贴主锁命名（instance.json.takeover），两者必须同目录才能保证原子性 */
const TAKEOVER_SUFFIX = 'takeover';
const HEARTBEAT_INTERVAL_MS = 3000;
/**
 * 锁文件存在但内容解析不出来时，先给写入方这么久的时间。
 * 「创建文件」和「写完内容」之间有个极短窗口，读到的可能是空文件；
 * 把这种正常情况当成「文件损坏」去抢锁，就等于绕过了互斥。
 */
const WRITE_GRACE_MS = 2000;
/**
 * 接管锁本身的残留时限。临界区只有几毫秒，超过这个时间必然是上次崩溃留下的。
 * 注意它只是**兜底**：正常判断看「持有者 PID 还活不活」，
 * 时间只用于「PID 被别的程序复用后无从判断」这一种场合。
 */
const TAKEOVER_TTL_MS = 10000;
/** 抢锁轮次与间隔：总和约 0.6 秒，覆盖「别人正在接管」的等待 */
const CLAIM_ROUNDS = 10;
const CLAIM_RETRY_MS = 60;

/** 本进程的身份标识：判断锁文件是不是自己写的，避免误删/误接管别人的记录 */
const instanceToken = randomUUID();
const instanceStartedAt = new Date().toISOString();
let heartbeatTimer: NodeJS.Timeout | null = null;

export interface InstanceRecord {
  pid: number;
  token: string;
  startedAt: string;
  heartbeatAt: string;
}

export interface ClaimResult {
  ok: boolean;
  /** reason='running' 时被占用的 PID（可能未知，为 0） */
  existingPid?: number;
  /**
   * running   —— 已有活实例在跑，应退出码 2 交给主进程处理
   * busy      —— 多轮重试后仍被并发接管挤住，同样按「有实例」处理
   * lock-error —— 锁文件根本写不了（权限/只读盘），必须报错停启动
   */
  reason?: 'running' | 'busy' | 'lock-error';
  error?: unknown;
}

function instanceFilePath(dbDir: string): string {
  return join(dbDir, INSTANCE_FILE);
}

function buildRecord(): InstanceRecord {
  return {
    pid: process.pid,
    token: instanceToken,
    startedAt: instanceStartedAt,
    heartbeatAt: new Date().toISOString(),
  };
}

/** 同步睡眠：抢占锁的阶段不需要异步，避免把 lock 逻辑拆成回调地狱 */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readSnapshot(file: string): { raw: string; mtimeMs: number } | null {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const st = fs.statSync(file);
    return { raw, mtimeMs: st.mtimeMs };
  } catch (_) {
    // 不存在 / 读不了：都当作「现在没有锁」，下一轮 O_EXCL 会给出最终答案
    return null;
  }
}

// 注意：tsconfig 里 strict=false（strictNullChecks 关闭）时 TS 不会对
// 判别联合做类型收窄，所以这里用「可空字段 + ok 标志」的写法，不用联合类型。
interface Parsed {
  ok: boolean;
  rec: InstanceRecord | null;
  reason?: 'empty' | 'malformed';
}

function parseRecord(raw: string): Parsed {
  if (!raw || raw.trim() === '') return { ok: false, rec: null, reason: 'empty' };
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return { ok: false, rec: null, reason: 'malformed' };
  }
  const pid = Number(data && data.pid);
  if (!Number.isFinite(pid) || pid <= 0) return { ok: false, rec: null, reason: 'malformed' };
  return {
    ok: true,
    rec: {
      pid,
      token: typeof data.token === 'string' ? data.token : '',
      startedAt: typeof data.startedAt === 'string' ? data.startedAt : '',
      heartbeatAt: typeof data.heartbeatAt === 'string' ? data.heartbeatAt : '',
    },
  };
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

function inspectInstanceRecord(rec: InstanceRecord): { live: boolean; reason: string } {
  if (!pidAlive(rec.pid)) {
    return { live: false, reason: `pid ${rec.pid} 已退出` };
  }
  const beat = rec.heartbeatAt ? Date.parse(rec.heartbeatAt) : NaN;
  const ageText = Number.isFinite(beat) ? `，心跳 ${Math.round((Date.now() - beat) / 1000)} 秒前` : '';
  return { live: true, reason: `pid ${rec.pid} 仍在运行${ageText}` };
}

/** 原子替换：先写临时文件再改名，避免读到写了一半的 JSON。 */
function writeRecord(file: string, rec: InstanceRecord): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec), 'utf8');
  fs.renameSync(tmp, file);
}

/** 定时续心跳。文件被别人接管或删掉就停，不再抢回来。 */
function startHeartbeat(file: string): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    try {
      const snap = readSnapshot(file);
      if (!snap) {
        stopHeartbeat();
        return;
      }
      const parsed = parseRecord(snap.raw);
      if (!parsed.ok || !parsed.rec || parsed.rec.token !== instanceToken) {
        stopHeartbeat();
        return;
      }
      writeRecord(file, buildRecord());
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

/**
 * 以 O_EXCL 创建锁文件。成功返回 true，已存在返回 false，其余错误抛出。
 * 写入失败时把自己创建的空文件删掉，别留一个「内容为空」的锁挡住下次启动。
 */
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
  } catch (e) {
    try { fs.closeSync(fd); } catch (_) { /* ignore */ }
    try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
    throw e;
  }
  try {
    // 落盘：否则断电后可能留下一个 0 字节的锁文件，下次启动会被当成「损坏」。
    // 个别文件系统不支持 fsync，那种情况不该因此拒绝启动（此时内容已进页缓存）。
    fs.fsyncSync(fd);
  } catch (_) {
    /* ignore */
  }
  fs.closeSync(fd);
  return true;
}

/**
 * 抢接管权（takeover 锁）。拿到才允许删/换主锁。
 * 返回 false 表示「别人正在接管」，调用方稍后重试即可。
 */
function acquireTakeover(lockPath: string): boolean {
  // 最多三轮：清掉一条残留后马上重抢；被别人抢先就放弃，由调用方整体重试
  for (let i = 0; i < 3; i++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      } finally {
        fs.closeSync(fd);
      }
      return true;
    } catch (e: any) {
      if (!e || e.code !== 'EEXIST') return false;
      // 残留的接管锁（上一个接管者在临界区内崩了）：判断能不能清掉再试。
      //
      // 判定依据是「持有者进程是否还活着」，不再只看文件年龄 ——
      // 文件年龄新不代表持有人活着（刚崩），年龄旧也不代表持有人死了（临界区卡住）。
      // 时间只在两种场合兜底：内容读不出来、以及 PID 被别的程序复用后无从判断。
      const holder = readTakeoverHolder(lockPath);
      if (!holder) continue; // 刚好被释放，立刻重抢
      const readable = holder.pid > 0;
      const holderAlive = readable && pidAlive(holder.pid);
      if (!readable) {
        // 别人刚 open、正要把 pid 写进去：这个窗口是正常的，给宽容期，绝不抢
        if (holder.ageMs < WRITE_GRACE_MS) return false;
        // 宽容期过了还读不出 pid：文件确实损坏，按残留处理
      } else if (holderAlive && holder.ageMs <= TAKEOVER_TTL_MS) {
        // 持有者活着且没过期：正常接管中，等它
        return false;
      }
      // 走到这里只有三种情况：持有者已死 / 内容损坏 / 持有者活着但早已超时
      // （后者是 PID 被复用的迹象，不清理会让应用永久卡在「已有实例」上）
      console.warn(
        `[instance] 清理残留接管锁（pid ${holder.pid || '?'}，${Math.round(holder.ageMs)} 毫秒前）`,
      );
      breakStaleTakeover(lockPath, holder.raw);
      continue;
    }
  }
  return false;
}

/**
 * 读接管锁的持有者信息。返回 null 表示文件已不在（或读不了）。
 * pid = 0 表示内容还没写完 / 已损坏。
 */
function readTakeoverHolder(lockPath: string): { raw: string; ageMs: number; pid: number } | null {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
    let pid = 0;
    try {
      const data = JSON.parse(raw);
      const n = Number(data && data.pid);
      if (Number.isFinite(n) && n > 0) pid = n;
    } catch (_) {
      /* 内容还没写完或已损坏：pid 留 0 */
    }
    return { raw, ageMs, pid };
  } catch (_) {
    return null;
  }
}

/**
 * 把一条已判定为残留的接管锁**原子地**挪走，并校验挪走的确实是当初那一条。
 *
 * 为什么不能直接 unlink：
 *   A、B 可能同时判定「这条锁过期了」。A 删掉并马上建好了自己的新锁，
 *   B 却还在执行它那一步 unlink —— 删掉的是 A 刚建的新锁。于是两人都能
 *   open(O_EXCL) 成功、同时进入临界区，互斥彻底失效（这正是此前留下的缺口）。
 *
 * 用 rename 而不是 unlink：
 *   同一个文件只有一个进程能 rename 成功，输的一方收到 ENOENT 直接退出。
 *   万一把目标换成了别人的新锁（rename 前它刚好被替换），挪走的内容就和
 *   当初读到的不一致 —— 这时用 link 放回原位。link 在目标已存在时会失败，
 *   天然不会覆盖别人，所以「放回去」这一步本身也是安全的。
 */
function breakStaleTakeover(lockPath: string, expectedRaw: string): void {
  const burial = `${lockPath}.stale.${process.pid}.${randomUUID()}`;
  try {
    fs.renameSync(lockPath, burial);
  } catch (_) {
    // 别人先挪走了，或文件已不存在：交给下一轮 O_EXCL 决定胜负
    return;
  }
  let same = false;
  try {
    same = fs.readFileSync(burial, 'utf8') === expectedRaw;
  } catch (_) {
    same = false;
  }
  if (!same) {
    // 挪错了：这不是当初判定的那条残留，而是别人刚建好的新锁，放回去
    try {
      fs.linkSync(burial, lockPath);
    } catch (_) {
      // 硬链接不可用（exFAT 等）或原位已被占：用不覆盖的复制兜底
      try {
        fs.copyFileSync(burial, lockPath, fs.constants.COPYFILE_EXCL);
      } catch (_) {
        /* 原位已被别人占住，那就该由他持有，丢弃即可 */
      }
    }
  }
  try {
    fs.unlinkSync(burial);
  } catch (_) {
    /* ignore */
  }
}

/**
 * 释放接管锁：只删自己写的那一条。
 * 万一我们的锁被误判清掉、位置又被别人重建了，这里不能把人家的删掉。
 */
function releaseTakeover(lockPath: string): void {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    let pid = 0;
    try {
      const data = JSON.parse(raw);
      const n = Number(data && data.pid);
      if (Number.isFinite(n) && n > 0) pid = n;
    } catch (_) {
      /* ignore */
    }
    if (pid === process.pid) fs.unlinkSync(lockPath);
  } catch (_) {
    /* 文件已不在：正常 */
  }
}

/**
 * 在接管锁的保护下清掉旧记录并换上自己的。
 *
 * @param expected 调用方刚才读到的那条记录的身份（pid + token）。
 *                 进临界区后重读，身份对不上说明别人已经换过锁，直接退出重来 —
 *                 这一步就是「A 不能挪走 B 的新锁」的保证。
 *                 传 null 表示旧记录已损坏、没有身份可比。
 */
function takeOverAndClaim(
  file: string,
  expected: { pid: number; token: string } | null,
  forceClaim: boolean,
): ClaimResult | 'retry' {
  const takeoverPath = `${file}.${TAKEOVER_SUFFIX}`;
  if (!acquireTakeover(takeoverPath)) return 'retry';
  try {
    const snap = readSnapshot(file);
    if (!snap) {
      // 锁已经空出来了：直接在临界区里补建，省得再从头抢一轮
      try {
        if (tryCreateExclusive(file, buildRecord())) {
          startHeartbeat(file);
          return { ok: true };
        }
      } catch (e) {
        return { ok: false, reason: 'lock-error', error: e };
      }
      return 'retry';
    }

    const parsed = parseRecord(snap.raw);
    if (parsed.ok && parsed.rec) {
      // 目标必须是「调用方刚才判定过的那条记录」。身份对不上有两种情况：
      //   a) 别人已经接管并写了自己的新锁 → 那是活的，交给下一轮重新判断；
      //   b) 本次是来处理损坏文件的（expected 为 null），进临界区却读到一条
      //      完整记录 → 说明别人刚好重建好了，同样不能动它。
      // 这两条合起来保证：forceClaim 只能忽略「刚才核实过」的那条记录，
      // 绝不会顺手删掉一条此刻才冒出来的活锁。
      const sameTarget =
        !!expected && parsed.rec.pid === expected.pid && parsed.rec.token === expected.token;
      if (!sameTarget) return 'retry';
      const view = inspectInstanceRecord(parsed.rec);
      if (view.live && !forceClaim) {
        return { ok: false, reason: 'running', existingPid: parsed.rec.pid };
      }
    } else {
      // 内容仍读不出来：再确认一次「不是别人正在写」
      if (Date.now() - snap.mtimeMs < WRITE_GRACE_MS) return 'retry';
    }

    // 临界区内「删 + 建」，别的接管者进不来，所以不会互相顶掉
    try {
      fs.unlinkSync(file);
    } catch (e: any) {
      if (!e || e.code !== 'ENOENT') {
        return { ok: false, reason: 'lock-error', error: e };
      }
    }
    try {
      if (tryCreateExclusive(file, buildRecord())) {
        startHeartbeat(file);
        return { ok: true };
      }
    } catch (e) {
      return { ok: false, reason: 'lock-error', error: e };
    }
    return 'retry';
  } finally {
    releaseTakeover(takeoverPath);
  }
}

/**
 * 占用实例。ok=true 才可以继续启动。
 *
 * forceClaim = 主进程用系统命令核实过「那条记录里的 PID 根本不是本应用的进程」
 * （PID 被系统回收后分给了别人），此时允许忽略这条记录直接接管。
 * 它绝不用于「疑似活着的实例」——那种情况要停下来问用户。
 */
export function claimInstance(dbDir: string, options: { forceClaim?: boolean } = {}): ClaimResult {
  const forceClaim = options.forceClaim === true;
  const file = instanceFilePath(dbDir);
  let lastExistingPid: number | undefined;

  for (let round = 0; round < CLAIM_ROUNDS; round++) {
    if (round > 0) sleepSync(CLAIM_RETRY_MS);

    let created: boolean;
    try {
      created = tryCreateExclusive(file, buildRecord());
    } catch (e) {
      // 锁都写不了就别启动。这里绝不能「假装成功」：
      // 不能假设「锁文件写不了，数据库一定也写不了」—— 两者权限可能不同，
      // 放行等于把这层数据库互斥保护整个关掉。
      return { ok: false, reason: 'lock-error', error: e };
    }
    if (created) {
      if (round > 0) console.log('[instance] 接管完成，已写入本进程指纹');
      startHeartbeat(file);
      return { ok: true };
    }

    const snap = readSnapshot(file);
    if (!snap) continue; // 刚被别人清掉，下一轮直接抢

    const parsed = parseRecord(snap.raw);
    if (!parsed.ok) {
      // 内容读不出来有两种可能：别人刚建好还没写完（等一会儿就好），
      // 或者文件真损坏了。后者必须能自愈，否则这个文件会永久挡住启动 ——
      // 重启电脑也不会好，因为文件一直在。
      const stillWriting = Date.now() - snap.mtimeMs < WRITE_GRACE_MS;
      if (stillWriting) continue;
      console.warn(`[instance] 锁文件无法解析（${parsed.reason === 'empty' ? '内容为空' : '格式损坏'}），按损坏处理并接管`);
      const taken = takeOverAndClaim(file, null, forceClaim);
      if (taken !== 'retry') return taken;
      continue;
    }

    const record = parsed.rec!;
    const view = inspectInstanceRecord(record);
    if (view.live && !forceClaim) {
      return { ok: false, reason: 'running', existingPid: record.pid };
    }
    lastExistingPid = record.pid;
    if (view.live) {
      console.warn(`[instance] 主进程核实后要求忽略这条记录（${view.reason}）`);
    } else {
      console.log(`[instance] 清理过期记录（${view.reason}）`);
    }

    const taken = takeOverAndClaim(file, { pid: record.pid, token: record.token }, forceClaim);
    if (taken !== 'retry') return taken;
  }

  // 多轮都没抢到：如实报告当前占用人（可能已被并发接管者写入）
  const rival = readSnapshot(file);
  if (rival) {
    const parsed = parseRecord(rival.raw);
    if (parsed.ok && parsed.rec && inspectInstanceRecord(parsed.rec).live) {
      return { ok: false, reason: 'running', existingPid: parsed.rec.pid };
    }
  }
  return { ok: false, reason: 'busy', existingPid: lastExistingPid };
}

/** 退出时清理指纹。只删自己那条，绝不误删别人的。 */
export function releaseInstance(dbDir: string): void {
  stopHeartbeat();
  try {
    const file = instanceFilePath(dbDir);
    const snap = readSnapshot(file);
    if (!snap) return;
    const parsed = parseRecord(snap.raw);
    if (!parsed.ok || !parsed.rec) return;
    // token 对得上 = 这条记录是我们写的；旧格式没有 token 时退回比 PID
    const mine = parsed.rec.token ? parsed.rec.token === instanceToken : parsed.rec.pid === process.pid;
    if (mine) fs.unlinkSync(file);
  } catch (_) {
    /* ignore */
  }
}
