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
/** 接管锁本身的残留时限。临界区只有几毫秒，超过这个时间必然是上次崩溃留下的。 */
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

function fileAgeMs(file: string): number | null {
  try {
    return Date.now() - fs.statSync(file).mtimeMs;
  } catch (_) {
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
  for (let i = 0; i < 2; i++) {
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
      // 残留的接管锁（上一个接管者在临界区内崩了）：过期就清掉再试。
      // 这里允许并发删除：删的是同一个文件，谁删成功都一样，
      // 随后的 O_EXCL 仍然只有一个进程能赢。
      const age = fileAgeMs(lockPath);
      if (age !== null && age > TAKEOVER_TTL_MS) {
        try { fs.unlinkSync(lockPath); } catch (_) { /* ignore */ }
        continue;
      }
      return false;
    }
  }
  return false;
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
    try { fs.unlinkSync(takeoverPath); } catch (_) { /* ignore */ }
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
