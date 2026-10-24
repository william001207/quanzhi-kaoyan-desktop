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
// 主动退出时服务是被我们请退的，绝不能再弹「服务意外退出」。
let appQuitting = false;

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

function startServer(dirs, options = {}) {
  if (serverProc) return;
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
      handleServerLine(line, dirs);
    }
    // 异常情况下可能长时间没有换行，别让缓冲区无限增长
    if (stdoutBuffer.length > 65536) stdoutBuffer = stdoutBuffer.slice(-4096);
  });
  serverProc.stderr.on('data', (d) => process.stderr.write('[server:err] ' + d.toString()));
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
    // 退出码 2 = 服务端发现旧实例还活着（指纹文件）。
    // 这是覆盖安装后的残留进程在占着数据库，杀掉它再拉一次即可，不算故障。
    // 旧版靠固定端口被占来暴露这个问题，会弹吓人的「启动失败」，现在自动处理。
    if (code === EXIT_INSTANCE_RUNNING) {
      // 重试次数用独立计数器累加，不能每轮清零 —— 否则「杀不掉旧进程」时会无限重启
      if (instanceRetries >= MAX_INSTANCE_RETRIES) {
        console.error('[desktop] 已重试 ' + instanceRetries + ' 次仍未拿到实例，停止重试');
        showInstanceBlockedDialog();
        return;
      }
      instanceRetries += 1;
      const stale = readStaleInstance();
      console.warn(
        '[desktop] 发现残留实例记录 pid=' + (stale && stale.pid ? stale.pid : '?') +
          '，第 ' + instanceRetries + ' 次尝试',
      );
      if (!stale || !stale.pid) {
        setTimeout(() => restartServer(true), 300);
        return;
      }
      // 关键一步：先核实这个 PID 到底是不是我们的服务进程，再决定怎么办。
      // 只凭「PID 还活着」就动手，可能杀掉一个刚好复用了该编号的无关程序。
      inspectProcessIdentity(stale.pid, (identity) => {
        if (appQuitting || serverProc) return;
        if (identity === 'other') {
          // 明确不是我们的进程：不杀它，只让新服务接管那条过期记录
          console.warn('[desktop] pid ' + stale.pid + ' 不是本应用进程，改走强制接管');
          restartServer(true);
          return;
        }
        if (identity === 'ours') {
          killPid(stale.pid, (result) => {
            console.warn('[desktop] 结束残留服务进程结果：' + result);
            restartServer(false);
          });
          return;
        }
        // 无法核实身份（系统命令不可用）：只有心跳新鲜时才敢动手，
        // 否则宁可停下报错，也不冒「顶掉一个正在写数据库的实例」的风险
        if (stale.heartbeatFresh) {
          killPid(stale.pid, (result) => {
            console.warn('[desktop] 结束残留服务进程结果（心跳新鲜）：' + result);
            restartServer(false);
          });
          return;
        }
        showInstanceBlockedDialog();
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

// 服务进程的入口脚本，打包后是 resources/server/dist/main.js
const SERVER_ENTRY_HINT = 'server/dist/main.js';
// 打包后的可执行文件名（build/electron-builder.yml 的 productName）
const APP_EXE_HINT = '全职高手考研系统';

/**
 * 核实某个 PID 是不是本应用的本地服务进程。
 * 回调参数：'ours'（是我们的）/ 'other'（不是）/ 'unknown'（查不出来）
 *
 * 为什么要查：进程崩溃后 PID 会被系统回收再分配，指纹文件里那个数字
 * 可能已经属于任何别的程序，照着它 kill 就是误杀。
 */
function inspectProcessIdentity(pid, cb) {
  if (!Number.isInteger(pid) || pid <= 0) {
    cb('unknown');
    return;
  }
  if (process.platform === 'win32') {
    // tasklist 的 CSV 输出形如： "镜像名","PID","会话名","会话#","内存"
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
        cb(m[1].toLowerCase().includes(APP_EXE_HINT.toLowerCase()) ? 'ours' : 'other');
      },
    );
    return;
  }
  execFile('ps', ['-p', String(pid), '-o', 'command='], { timeout: 5000 }, (err, stdout) => {
    if (err) return cb('unknown');
    const cmd = String(stdout || '').trim();
    if (!cmd) return cb('unknown');
    cb(cmd.includes(SERVER_ENTRY_HINT) ? 'ours' : 'other');
  });
}

/** 「实例被占用且自动清理失败」的统一提示 */
function showInstanceBlockedDialog() {
  dialog.showErrorBox(
    '启动失败：已有后台实例在占用数据库',
    '本地服务发现另一个实例仍在使用数据目录，自动结束它没有成功。\n\n' +
      '处理办法（任选其一）：\n' +
      '· 打开「任务管理器」，结束所有「全职高手考研系统」进程，再重开应用\n' +
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
