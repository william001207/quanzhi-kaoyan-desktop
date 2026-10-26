/**
 * 全职高手考研系统 —— Electron 主进程
 *
 * 职责：
 * 1. 以 ELECTRON_RUN_AS_NODE 方式拉起本地服务端（server/dist/main.js，PGlite 本地库）
 * 2. 等待服务端打印 DESKTOP_SERVER_READY 后创建主窗口
 * 3. 窗口关闭时结束服务端进程并退出应用
 * 4. 数据目录持久化在系统用户数据目录（userData/pglite-data）
 */
const { app, BrowserWindow, shell, dialog, Tray, Menu } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_HOST = '127.0.0.1';
const APP_BASE_PATH = '/app/app_17g1b8sj7x4';
const READY_MARK = 'DESKTOP_SERVER_READY';
// 服务端退出码 2 = 发现旧实例还在运行（指纹文件检测到活的旧 PID），
// 不是故障。主进程会杀掉残留进程后重新拉起，用户全程无感。
const EXIT_INSTANCE_RUNNING = 2;
// 服务端退出码 3 = 实例锁文件根本写不了（数据目录只读、权限被改）。
// 这时不能假设「锁写不了，数据库一定也写不了」——两者权限可能不同，
// 放行等于关掉数据库互斥保护，所以必须报错停下。
const EXIT_INSTANCE_LOCK_ERROR = 3;
// 检测到残留实例时最多自动重启几次（1 = 首次失败后再试一次）。
// 不设上限的话，「旧进程杀不掉」会让应用无限重启，表现为窗口闪着闪着永远进不去。
const MAX_INSTANCE_RETRIES = 1;
// 指纹里的心跳超过这个时间没更新，就认为那条记录不可信（进程已死，或 PID 已被别的程序复用）
const INSTANCE_HEARTBEAT_TTL_MS = 15000;

let serverProc = null;
let mainWindow = null;
let tray = null;
let serverReady = false;
let appLoaded = false;
// 服务实际监听端口：启动时由操作系统随机分配，READY 标记回传，不再写死
let serverPort = null;
// 已经自动重启过几次（检测到残留实例时用），成功进入主界面后清零
let instanceRetries = 0;
// 主动退出流程标志：区分「用户主动关应用」和「服务自己崩了」。
// 主动退出时服务是被我们请退的，绝不能弹「服务意外退出」。
let appQuitting = false;
// 服务端输出的最后若干行：退出码 3 时用来把真实原因带进弹窗，
// 否则用户只看到「启动失败」四个字，无从排查。
const serverLogTail = [];

/** 应用基地址。端口就绪前返回 null（窗口先显示 loading 页，不碰服务）。 */
function appBaseUrl() {
  if (!serverPort) return null;
  return `http://${SERVER_HOST}:${serverPort}${APP_BASE_PATH}/`;
}

function appOrigin() {
  if (!serverPort) return null;
  return `http://${SERVER_HOST}:${serverPort}`;
}

/** 打包后 server/client 位于 resources/ 下；开发模式下位于工程根 */
function resolveDirs() {
  if (app.isPackaged) {
    return {
      serverDir: path.join(process.resourcesPath, 'server'),
      clientDir: path.join(process.resourcesPath, 'client'),
      iconPath: path.join(process.resourcesPath, 'icon.png'),
    };
  }
  return {
    serverDir: path.join(__dirname, '..', 'server'),
    clientDir: path.join(__dirname, '..', 'client'),
    iconPath: path.join(__dirname, '..', 'build', 'icon.png'),
  };
}

/** 处理服务端 stdout 的一整行：目前只关心就绪标记。 */
function handleServerLine(line, dirs) {
  if (serverReady) return;
  if (!line.includes(READY_MARK)) return;
  const m = line.match(/DESKTOP_SERVER_READY\s+(\d+)\s*$/);
  if (!m) return;
  const port = Number(m[1]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
  serverPort = port;
  serverReady = true;
  instanceRetries = 0; // 服务正常起来了，重试计数归零
  loadApp(dirs);
}

/** 留住服务端最后几行输出，启动失败时把真实原因显示给用户 */
function rememberServerLine(line) {
  const text = String(line || '').trim();
  if (!text) return;
  serverLogTail.push(text);
  if (serverLogTail.length > 30) serverLogTail.shift();
}

/** 从捕获的输出里取出服务端报告的实例锁错误 */
function extractInstanceError() {
  const hit = serverLogTail.find((l) => l.includes('DESKTOP_INSTANCE_ERROR'));
  if (!hit) return '';
  return hit.replace(/^.*DESKTOP_INSTANCE_ERROR\s*/, '').trim();
}

function startServer(dirs, options = {}) {
  if (serverProc) return;
  serverLogTail.length = 0;
  // 强制接管：仅在「指纹记录已不可信」时使用，让服务端跳过旧记录直接占用，
  // 避免为了清一条过期记录去杀一个可能已被系统分配给别的程序的 PID。
  const forceClaim = options && options.forceClaim === true;
  const mainJs = path.join(dirs.serverDir, 'dist', 'main.js');
  if (!fs.existsSync(mainJs)) {
    console.error('[desktop] server dist not found:', mainJs);
    dialog.showErrorBox(
      '启动失败：找不到服务端程序',
      '缺少文件：\n' + mainJs + '\n\n' +
        '原因通常是：安装包不完整，或本地修改代码后没有重新编译服务端。\n' +
        '处理办法：重新安装应用；若在本地开发，先在 server 目录执行 npm run build 再启动。',
    );
    app.exit(1);
    return;
  }

  const dbDir = path.join(app.getPath('userData'), 'pglite-data');
  fs.mkdirSync(dbDir, { recursive: true });

  // 端口不再写死：不传 SERVER_PORT，服务端用 0 让操作系统随机分配，
  // 实际端口通过 READY 标记回传。开发调试时可在环境里手动指定 SERVER_PORT。
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    DB_DIR: dbDir,
    CLIENT_DIR: dirs.clientDir,
    SERVER_HOST,
  };
  if (process.env.SERVER_PORT) env.SERVER_PORT = String(process.env.SERVER_PORT);
  if (forceClaim) env.DESKTOP_FORCE_CLAIM = '1';

  serverProc = spawn(process.execPath, [mainJs], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // 管道不保证一次 data 就是完整一行：READY 标记可能被切成两段
  // （前半截 "DESKTOP_SERVER_READY 54"、后半截 "321"）。
  // 直接对每个 chunk 做正则，轻则把端口读成 54、连到错误地址，
  // 重则两半都不含完整标记，永远等不到就绪、卡在加载页。
  // 所以这里按换行切分，只处理完整的行，剩下的半行留到下一次。
  let stdoutBuffer = '';
  serverProc.stdout.on('data', (d) => {
    const chunk = d.toString();
    process.stdout.write('[server] ' + chunk);
    stdoutBuffer += chunk;
    let nl;
    while ((nl = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, nl).replace(/\r$/, '');
      stdoutBuffer = stdoutBuffer.slice(nl + 1);
      rememberServerLine(line);
      handleServerLine(line, dirs);
    }
    // 异常情况下可能长时间没有换行，别让缓冲区无限增长
    if (stdoutBuffer.length > 65536) stdoutBuffer = stdoutBuffer.slice(-4096);
  });
  serverProc.stderr.on('data', (d) => {
    const text = d.toString();
    process.stderr.write('[server:err] ' + text);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) rememberServerLine(line);
    }
  });
  serverProc.on('exit', (code) => {
    // 记录退出前服务是否已经就绪，用于区分「启动失败」和「运行中崩溃」
    const neverReady = !serverReady;
    serverProc = null;
    serverReady = false;
    // 端口必须一起清掉：重新拉起服务后端口会换一个新的，
    // 留着旧值会让 appBaseUrl() / will-navigate 判断连到一个已经不存在的地址。
    serverPort = null;
    if (code !== 0 && code !== null) {
      console.error('[desktop] server exited with code', code);
    }
    // 主动退出（关窗 / Cmd+Q）：服务是被我们请退的，属于正常流程，不提示任何错误。
    // 之前漏了这个判断，导致 Cmd+Q 退出时会误弹「本地服务已停止」。
    if (appQuitting) {
      return;
    }
    // 退出码 3 = 实例锁文件写不了：不能当作「无所谓」放行，
    // 否则两个实例可能同时打开数据库。如实报错并退出。
    if (code === EXIT_INSTANCE_LOCK_ERROR) {
      showLockWriteErrorDialog(extractInstanceError());
      return;
    }
    // 退出码 2 = 服务端发现旧实例还活着（指纹文件）。
    // 这是覆盖安装后的残留进程在占着数据库，核实身份后再决定怎么处理。
    // 旧版靠固定端口被占来暴露这个问题，会弹吓人的「启动失败」，现在自动处理。
    if (code === EXIT_INSTANCE_RUNNING) {
      // 重试次数用独立计数器累加，不能每轮清零 —— 否则「杀不掉旧进程」时会无限重启
      if (instanceRetries >= MAX_INSTANCE_RETRIES) {
        console.error('[desktop] 已重试 ' + instanceRetries + ' 次仍未拿到实例，停止重试');
        showInstanceBlockedDialog('retry-exhausted');
        return;
      }
      instanceRetries += 1;
      const stale = readStaleInstance();
      console.warn(
        '[desktop] 发现残留实例记录 pid=' + (stale && stale.pid ? stale.pid : '?') +
          '，第 ' + instanceRetries + ' 次尝试',
      );
      // 读不到记录（文件已清掉或内容已损坏）：不带强制接管重启。
      // 让服务端自己判断 —— 它现在能识别并清理损坏的锁文件，
      // 而「强制接管」只应该用在确认过 PID 无关的场合。
      if (!stale || !stale.pid) {
        setTimeout(() => restartServer(false), 300);
        return;
      }
      // 关键一步：先核实这个 PID 到底是不是我们的服务进程，再决定怎么办。
      // 只凭「PID 还活着」就动手，可能杀掉一个刚好复用了该编号的无关程序。
      inspectProcessIdentity(stale.pid, dirs, (identity) => {
        if (appQuitting || serverProc) return;
        if (identity === 'ours') {
          // 确认为本应用的服务进程：结束它，再正常拉起
          killPid(stale.pid, (result) => {
            console.warn('[desktop] 结束残留服务进程结果：' + result);
            restartServer(false);
          });
          return;
        }
        if (identity === 'other') {
          // 确认不是本应用的任何进程（PID 被系统回收后分给了别人）：
          // 不杀它，只让新服务忽略那条过期记录
          console.warn('[desktop] pid ' + stale.pid + ' 与本应用无关，忽略过期记录');
          restartServer(true);
          return;
        }
        // 'other-app'：是本应用的进程，但入口路径对不上（可能是另一个安装位置/
        // 更早的版本）。'unknown'：系统命令查不出来。
        // 这两种都**不结束进程** —— 心跳新鲜不能证明 PID 没被复用，
        // 万一是正在写数据库的实例，杀它就是数据损坏。交给用户处理。
        showInstanceBlockedDialog(identity);
      });
      return;
    }
    // 出问题时必须让用户看见原因，否则窗口一闪而过、无从排查
    if (neverReady) {
      dialog.showErrorBox(
        '启动失败：本地服务没能起来',
        '应用启动时本地服务意外退出，常见原因：\n' +
          '· 数据库文件损坏或被占用（可先重启电脑再试）\n' +
          '· 有旧版应用仍在后台运行（重启电脑可清除）\n' +
          '· 安装包不完整，或缺少题库数据文件\n\n' +
          '若反复出现，请把终端里的 [server:err] 输出发给维护者。',
      );
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        '本地服务已停止',
        '后台服务意外退出，应用将关闭。\n你的学习记录已保存在本机，重新打开应用即可继续。',
      );
    }
    // 服务意外退出时退出应用，避免出现死窗口。
    // 不判断 mainWindow 是否存在：启动失败时窗口往往还没建出来，
    // 只按「窗口存在」才退出会留下没有窗口的空进程。
    // 被动退出也要放行窗口关闭，否则会被 close 拦截逻辑挡住、退不出去
    appQuitting = true;
    app.quit();
  });
}

/**
 * 读服务端留下的指纹文件。返回 { pid, heartbeatFresh } 或 null。
 * heartbeatFresh 只作为「这个进程确实是我们的服务」的**辅助**证据 ——
 * 首次启动导数据时事件循环被占满，心跳可能长时间不更新，
 * 所以「心跳不新鲜」不能反推「进程不是我们的」。
 */
function readStaleInstance() {
  try {
    const file = path.join(app.getPath('userData'), 'pglite-data', 'instance.json');
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pid = Number(raw && raw.pid);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const beat = raw && raw.heartbeatAt ? Date.parse(raw.heartbeatAt) : NaN;
    const heartbeatFresh = Number.isFinite(beat) && Date.now() - beat <= INSTANCE_HEARTBEAT_TTL_MS;
    return { pid, heartbeatFresh };
  } catch (_) {
    return null;
  }
}

// 服务进程的入口脚本（打包后是 resources/server/dist/main.js）。
// 注意：这个片段只能用来判断「像我们但不是这一份安装」，**绝不能用来判 ours** ——
// 另一份安装（甚至别的项目）也可能有 server/dist/main.js 这个入口。
const SERVER_ENTRY_HINT = 'server/dist/main.js';
// 打包后的可执行文件名（build/electron-builder.yml 的 productName）
const APP_EXE_HINT = '全职高手考研系统';
const APP_EXE_LOWER = APP_EXE_HINT.toLowerCase();

/** 本机这份安装的服务端入口绝对路径（ps / 命令行里就是这一串） */
function expectedServerEntry(dirs) {
  return path.join(dirs.serverDir, 'dist', 'main.js');
}

/** Windows 路径统一成小写 + 反斜杠，去掉可能带的首尾引号，用于精确比对 */
function normalizeWinPath(p) {
  return String(p || '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/\//g, '\\')
    .toLowerCase();
}

function winBasename(p) {
  const s = String(p || '');
  const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
  return (i >= 0 ? s.slice(i + 1) : s).toLowerCase();
}

/**
 * POSIX：按 ps 输出的命令行判定身份。
 *   命令行里出现「本机这份安装」的入口绝对路径 → ours
 *   只出现应用名（是我们的应用，但入口不是这份安装）→ other-app
 *   只出现 server/dist/main.js（别的项目同名入口）→ other-app
 *   都不像 → other（PID 被系统回收后分给了别人）
 */
function classifyPosixCommand(cmd, expectedLower) {
  const text = String(cmd || '').trim();
  if (!text) return 'unknown';
  const lower = text.toLowerCase();
  if (lower.includes(expectedLower)) return 'ours';
  if (lower.includes(APP_EXE_LOWER)) return 'other-app';
  if (lower.includes(SERVER_ENTRY_HINT)) return 'other-app';
  return 'other';
}

/**
 * Windows：判定身份。imageName 可空（有 detail.exe 时不必依赖 tasklist）。
 *
 * 关键改动：**「哪一份安装」只认可执行文件的绝对路径**。
 * 以前拿 `server\dist\main.js` 这个通配片段 + 镜像名判 ours，另一个安装目录
 * （同名 exe、同样入口文件名、共用同一个数据目录）的服务进程会被认成「本机这份」，
 * 从而被结束掉 —— 它可能正在写数据库。现在：
 *   · exe 路径与本机 process.execPath 一致 → 才是 ours
 *   · exe 路径不同但镜像名是本应用 → other-app（另一处安装，绝不结束）
 *   · 拿不到 exe 路径时，只有命令行含**本机入口绝对路径**才判 ours；
 *     通配片段只能得出 other-app（保守：不杀，交给用户处理）
 */
function classifyWindowsProcess(imageName, detail, expectedLower) {
  const selfExe = normalizeWinPath(process.execPath);
  const exe = normalizeWinPath(detail && detail.exe);
  const cmd = normalizeWinPath(detail && detail.cmd);
  const image = String(imageName || '').toLowerCase() || winBasename(exe);
  const isAppImage = !!image && image.includes(APP_EXE_LOWER);
  // 入口文件名片段（纯 ASCII，不受中文路径编码影响）：只能证明「是某个服务的入口」
  const hasEntryHint = cmd.includes('server\\dist\\main.js') || cmd.includes('server/dist/main.js');
  // 本机这一份安装的入口绝对路径：这是唯一能判 ours 的命令行证据
  const hasOwnEntry = !!expectedLower && cmd.includes(expectedLower);

  if (exe) {
    if (exe === selfExe) {
      // 同一份安装的可执行文件。再确认它跑的是服务入口，
      // 避免把本应用的其它进程（如主进程、渲染进程）当成服务进程结束掉。
      if (!cmd || hasEntryHint || hasOwnEntry) return 'ours';
      return 'other-app';
    }
    // 可执行文件不是这一份：同名 exe = 另一处安装 → 绝不结束；否则是无关进程
    return isAppImage ? 'other-app' : 'other';
  }

  // 拿不到可执行文件路径（权限受限、WMI 不可用）：退化为命令行比对
  if (!cmd) return isAppImage ? 'other-app' : 'unknown';
  if (hasOwnEntry) return 'ours';
  if (isAppImage || hasEntryHint) return 'other-app';
  return 'other';
}

/**
 * Windows：一次拿到进程的可执行文件路径与命令行。
 * 输出统一转成 UTF-8 —— 中文安装路径在默认代码页下会变乱码，
 * 那样路径比对永远不成立（以前正是因此才退回宽松的片段匹配）。
 */
function windowsProcessDetail(pid, cb) {
  const script =
    '$ErrorActionPreference="SilentlyContinue";' +
    'try{[Console]::OutputEncoding=[Text.Encoding]::UTF8}catch{};' +
    `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}";` +
    'if($p){ConvertTo-Json -Compress -InputObject ([pscustomobject]@{exe=$p.ExecutablePath;cmd=$p.CommandLine})}';
  try {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err) return cb(null);
        const text = String(stdout || '').trim();
        if (!text) return cb(null);
        try {
          const data = JSON.parse(text);
          cb({
            exe: typeof data.exe === 'string' ? data.exe : '',
            cmd: typeof data.cmd === 'string' ? data.cmd : '',
          });
        } catch (_) {
          cb(null);
        }
      },
    );
  } catch (_) {
    cb(null);
  }
}

/**
 * 核实某个 PID 是不是本应用的本地服务进程。
 * 回调参数：
 *   'ours'      —— 确认是「本机这份安装」的服务进程（exe 路径或入口绝对路径对得上）
 *   'other-app' —— 是本应用的进程，但路径对不上（另一个安装位置 / 更早的版本）
 *   'other'     —— 与本应用无关（PID 被系统回收后分给了别的程序）
 *   'unknown'   —— 查不出来（命令不可用、超时、编码问题）
 *
 * 为什么分这么细：只有 'ours' 才允许结束进程；'other' 才可以忽略那条记录。
 * 其余情况一律停下来问用户 —— 心跳新鲜不能证明 PID 没被复用，
 * 杀错一个正在写数据库的实例代价远大于让用户手动关一次。
 */
function inspectProcessIdentity(pid, dirs, cb) {
  if (!Number.isInteger(pid) || pid <= 0) {
    cb('unknown');
    return;
  }
  const expectedLower = expectedServerEntry(dirs).toLowerCase();

  if (process.platform === 'win32') {
    windowsProcessDetail(pid, (detail) => {
      if (detail) {
        cb(classifyWindowsProcess('', detail, expectedLower));
        return;
      }
      // WMI 查不到时退回 tasklist 只取镜像名：此时没有路径证据，
      // 只能得出「是我这份 / 不是我这份」，不会误杀
      try {
        execFile(
          'tasklist',
          ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'],
          { windowsHide: true, timeout: 5000 },
          (err, stdout) => {
            if (err) return cb('unknown');
            const line = String(stdout || '').trim();
            if (!line || /没有运行的任务|No tasks are running/i.test(line)) return cb('unknown');
            const m = line.match(/^"([^"]+)"/);
            if (!m) return cb('unknown');
            cb(classifyWindowsProcess(m[1], null, expectedLower));
          },
        );
      } catch (_) {
        cb('unknown');
      }
    });
    return;
  }

  try {
    execFile('ps', ['-p', String(pid), '-o', 'command='], { timeout: 5000 }, (err, stdout) => {
      // 查不出来（命令被拦、超时）时返回 unknown：宁可让用户手动处理，
      // 也不能因为「查不到」就默认「不是我们的」而放行接管。
      if (err) return cb('unknown');
      cb(classifyPosixCommand(stdout, expectedLower));
    });
  } catch (_) {
    cb('unknown');
  }
}

/** 实例锁文件写不了：数据目录权限异常，必须让用户看到原因 */
function showLockWriteErrorDialog(detail) {
  dialog.showErrorBox(
    '启动失败：无法锁定数据目录',
    '本地服务无法在数据目录写入实例锁文件，已停止启动以避免两个实例同时打开数据库。\n\n' +
      (detail ? '系统返回：' + detail + '\n\n' : '') +
      '常见原因：数据目录被设为只读、被安全软件拦截，或磁盘已满。\n\n' +
      '数据目录：\n' + path.join(app.getPath('userData'), 'pglite-data') + '\n\n' +
      '处理办法：检查该目录的「显示简介 → 共享与权限」，确认当前用户有读写权限后重开应用。',
  );
  appQuitting = true;
  app.quit();
}

/** 「实例被占用且自动清理失败」的统一提示 */
function showInstanceBlockedDialog(reason) {
  const tail =
    reason === 'other-app'
      ? '检测到本应用还有其他实例在后台运行（可能是旧版本或另一份安装），' +
        '但无法确认它是不是同一个数据目录的服务进程，因此没有自动结束它。\n\n'
      : reason === 'unknown'
        ? '检测到有进程正占用数据目录，但查不出它到底是什么程序，' +
          '为避免误杀正在写数据库的进程，应用没有自动结束它。\n\n'
        : '本地服务发现另一个实例仍在使用数据目录，自动结束它没有成功。\n\n';
  dialog.showErrorBox(
    '启动失败：已有后台实例在占用数据库',
    tail +
      '处理办法（任选其一）：\n' +
      '· 打开「活动监视器 / 任务管理器」，结束所有「全职高手考研系统」进程，再重开应用\n' +
      '· 重启电脑后重开应用\n\n' +
      '为保护题库与学习记录，应用不会同时开两个实例。',
  );
  // 无论窗口有没有建出来都要退出：这个弹窗出现在「服务也起不来」的时刻，
  // 此时窗口通常还没创建，若只按「窗口存在」才退出，会留下一个没有窗口、
  // 只剩 Dock/托盘图标的空进程，用户以为没关干净。
  appQuitting = true;
  app.quit();
}

/** 重新拉起本地服务；forceClaim = 跳过那条已确认无主的指纹记录直接占用 */
function restartServer(forceClaim) {
  if (appQuitting || serverProc) return;
  startServer(resolveDirs(), { forceClaim: forceClaim === true });
}

/**
 * 结束指定 PID 的进程：先 SIGTERM 好言好语，1.5 秒后还在就 SIGKILL。
 * done 会收到结束结果：
 *   'gone'   —— 进程本来就已经退出（正常情况，继续重启）
 *   'denied' —— 没权限结束它（继续重启大概率还会失败，由重试上限兜底报错）
 *   'killed' —— 强杀过了
 */
function killPid(pid, done) {
  let finished = false;
  // timer 必须在 finish 之前声明成可赋值的变量。
  // 进程恰好自己退出时 finish 会先被调用，若此时 timer 还是 const 的
  // 暂时性死区状态，clearTimeout 会抛
  // ReferenceError: Cannot access 'timer' before initialization，
  // 整个「清残留 → 重启」流程就断在这里了。
  let timer = null;
  const finish = (result) => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    done(result);
  };
  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    // ESRCH = 进程已经不在了；EPERM = 存在但没权限
    return finish(e && e.code === 'EPERM' ? 'denied' : 'gone');
  }
  timer = setTimeout(() => {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (_) {
      /* 已经没了，正常 */
    }
    finish('killed');
  }, 1500);
  if (typeof timer.unref === 'function') timer.unref();
}

let serverStopping = false;
function stopServer() {
  // 只要走到这里，就说明是我们在主动结束服务（关窗 / Cmd+Q / 退出），
  // 打上标记，让 exit 回调知道这不是崩溃。
  appQuitting = true;
  if (!serverProc || serverStopping) return;
  serverStopping = true;
  const proc = serverProc;
  // 先发 SIGTERM，让服务端有机会把数据库缓冲区刷盘（closeDb）
  try { proc.kill('SIGTERM'); } catch (_) { /* ignore */ }
  // 兜底：2 秒内没退出就强杀，避免残留进程占着端口导致下次启动失败
  const timer = setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
  }, 2000);
  if (typeof timer.unref === 'function') timer.unref();
  // 注意：这里不把 serverProc 置空，交给 exit 事件统一处理。
  // 否则 before-quit 无法判断「是否还在等服务端收尾」，等待逻辑会失效。
}

/**
 * 打开应用内的子窗口（试卷预览、打印页）。
 * 这些页面由前端用 window.open 打开，是一个独立的打印视图，
 * 必须放在应用内新窗口里，交给系统浏览器会拿不到本地服务地址。
 */
function openInnerWindow(url) {
  const win = new BrowserWindow({
    width: 1000,
    height: 1200,
    title: '试卷',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 把子窗口的报错转发到主进程输出，出问题时能直接看到原因
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.error('[print-window]', message);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
    console.error('[print-window] 加载失败', code, desc, failedUrl);
  });

  // 子窗口也支持 Cmd+Option+I / F12 打开开发者工具
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const combo =
      process.platform === 'darwin'
        ? input.meta && input.alt && key === 'i'
        : key === 'f12';
    if (combo) {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });

  win.loadURL(url);
  return win;
}

function createWindow(dirs) {
  if (mainWindow) return;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '全职高手考研系统',
    icon: dirs.iconPath,
    autoHideMenuBar: true,
    backgroundColor: '#f5f6fa',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 先显示本地加载页，避免服务就绪前出现白屏/空白窗口
  mainWindow.loadFile(path.join(dirs.clientDir, 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.setMenuBarVisibility(false);
  // 页面内新窗口一律交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const origin = appOrigin();
    if (!origin) return { action: 'deny' };

    // 应用内页面（试卷预览 / 打印）：前端传的是相对路径（如 /mock-exam/print/xxx），
    // 要补上基路径才能命中服务端的 SPA 路由，然后在应用内新窗口打开。
    if (url.startsWith('/')) {
      openInnerWindow(`${origin}${APP_BASE_PATH}${url}`);
      return { action: 'deny' };
    }
    if (url.startsWith(origin)) {
      openInnerWindow(url);
      return { action: 'deny' };
    }

    // 外部网址交给系统浏览器
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 同一窗口里的跳转也拦一道：只允许本机服务地址，外部网址用系统浏览器打开
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const origin = appOrigin();
    if (origin && /^https?:/i.test(url) && !url.startsWith(origin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  // 点红叉 = 把窗口收起来，应用继续运行，服务也继续运行。
  // mac：应用留在 Dock，点 Dock 图标瞬间恢复（页面状态都还在，不用重新加载数据库）。
  // win：窗口收进系统托盘，点托盘图标恢复；托盘右键「退出」才是彻底退出。
  // ---- 侧边栏品牌位：在「全」字前面补上应用图标 ----
  // 背景：前端是构建产物，组件里写死了「收起显示『全』/ 展开显示『全职高手考研』」，
  // 没有源码改不了组件。
  //
  // 关键：组件用 aside 的 class 区分状态（收起 w-14 / 展开 w-60），可写纯 CSS 精确命中。
  // 设计原则：这里只做「最小副作用」的改动 —— 不设 max-width、不用 overflow、
  // 不加 transition，避免在 aside 自身的 200ms 宽度动画期间引发反复重排（表现为整块抖动）。
  //   · 原文字字号恒为 0（不可见，但仍在 DOM 里，React 改它没有视觉过程）
  //   · 图标由 ::before 画
  //   · 收起态 ::after 直接 content:none（不生成文字节点），展开态才输出文字
  const SIDEBAR_CSS = `
    /* aside 自带 transition-all duration-200，宽度动画期间浏览器每帧重排整个侧边栏，
       叠加内部 justify-center / px-4 的瞬间切换，观感就是「整块抖一下」。
       直接关掉过渡：切换瞬间完成，不再有中间态。 */
    aside {
      transition: none !important;
    }
    aside > div:first-child > span.text-base.font-semibold {
      font-size: 0 !important;
      display: inline-flex;
      align-items: center;
    }
    aside > div:first-child > span.text-base.font-semibold::before {
      content: '';
      display: block;
      flex: none;
      width: 20px;
      height: 20px;
      background: url("/icon.png") center / contain no-repeat;
    }
    aside.w-14 > div:first-child > span.text-base.font-semibold::after {
      content: none;
    }
    aside.w-60 > div:first-child > span.text-base.font-semibold::after {
      content: '全职高手考研';
      font-size: 16px;
      font-weight: 600;
      line-height: 1.4;
      margin-left: 8px;
      white-space: nowrap;
    }
  `;

  // 在 dom-ready 注入（比 did-finish-load 早），这样 React 首次渲染时样式已就位，
  // 启动瞬间也不会看到原文字。每次页面加载都注入一份，重复注入相同规则无副作用。
  mainWindow.webContents.on('dom-ready', async () => {
    if (!mainWindow || !mainWindow.webContents.getURL().includes('/app/')) return;
    try {
      await mainWindow.webContents.insertCSS(SIDEBAR_CSS);
    } catch (e) {
      // 装饰失败不影响任何功能，静默跳过
      console.error('[desktop] 侧边栏图标样式注入失败：', e && e.message);
    }
  });

  // 开发者工具快捷键：Cmd+Option+I（Mac）/ F12（Windows）。
  // 界面出问题时可以自己打开控制台看报错，不用再猜。
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const combo =
      process.platform === 'darwin'
        ? input.meta && input.alt && key === 'i'
        : key === 'f12';
    if (combo) {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('close', (event) => {
    if (appQuitting) return; // 正在退出：放行，让窗口正常关闭
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    // 这里不再 stopServer()：关窗不等于退出应用，服务要跟着应用活着
  });
}

/** 服务就绪后切入应用主界面；窗口尚未创建则先创建（加载页），随后跳转 */
function loadApp(dirs) {
  if (!mainWindow) createWindow(dirs);
  const url = appBaseUrl();
  if (!url) return;
  if (!appLoaded) {
    appLoaded = true;
    mainWindow.loadURL(url);
  }
}

// ---------------------------------------------------------------------------
// 系统托盘（仅 Windows）
// mac 上点红叉 = 窗口收进 Dock、点 Dock 图标恢复，这套已经工作，不再加托盘图标。
// win 上点红 = 隐藏到托盘（应用不退，后台服务继续跑），
// 单击托盘图标恢复窗口，右键菜单「显示主窗口 / 退出」。
// ---------------------------------------------------------------------------
function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const dirs = resolveDirs();
  createWindow(dirs);
  const url = appBaseUrl();
  if (url) {
    mainWindow.loadURL(url);
  } else if (!serverProc) {
    startServer(dirs);
  }
}

function createTray(dirs) {
  if (tray) return;
  try {
    tray = new Tray(dirs.iconPath);
  } catch (e) {
    // 图标加载失败不该影响主流程，只是没有托盘图标而已
    console.error('[desktop] 托盘图标创建失败：', e && e.message);
    return;
  }
  tray.setToolTip('全职高手考研系统');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]),
  );
  // 左键单击：恢复窗口（win 用户对托盘的第一预期）
  tray.on('click', showMainWindow);
}

// 只允许运行一个实例。
// 原因：两个实例会同时打开同一个数据库目录，可能造成数据损坏；也会抢同一个端口导致启动失败。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 用户重复点图标时，把已有窗口拉到前面来，而不是再开一个
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const dirs = resolveDirs();
    // Windows：创建托盘（点红叉收到托盘，右键可退出）
    if (process.platform === 'win32') createTray(dirs);
    // 立即创建窗口并显示本地加载页（白屏期也有内容），服务就绪后 loadApp 切入
    createWindow(dirs);
    startServer(dirs);
  });
}

// 点 Dock 图标：把收起来的窗口叫回来；万一窗口已被销毁则重建
app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const dirs = resolveDirs();
  createWindow(dirs);
  if (serverReady) {
    // 服务还在跑，直接进主界面，不用再看加载页
    const url = appBaseUrl();
    if (url) mainWindow.loadURL(url);
  } else {
    startServer(dirs);
  }
});

// 所有窗口都没了（只有窗口被真正销毁才会走到这里，点红叉只是 hide 不会触发）
app.on('window-all-closed', () => {
  // macOS 惯例：关窗不退出应用，留在 Dock 里
  if (process.platform === 'darwin') return;
  appQuitting = true;
  stopServer();
  app.quit();
});

// 退出前给本地服务一点时间把数据写完（最多等 1.5 秒）。
// 直接杀掉进程有可能丢掉刚写入的最后几条记录，这里改成「先等它自己收尾，超时才走」。
let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !serverProc) return;
  event.preventDefault();
  const proc = serverProc;
  stopServer();
  const finish = () => {
    if (quitting) return;
    quitting = true;
    app.quit();
  };
  proc.once('exit', finish);
  // 比 stopServer 里的强杀时间（2 秒）略长，保证「先等它自己退，再强杀，最后才放行」
  const timer = setTimeout(finish, 2500);
  if (typeof timer.unref === 'function') timer.unref();
});

app.on('will-quit', () => stopServer());
