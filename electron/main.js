/**
 * 全职高手考研系统 —— Electron 主进程
 *
 * 职责：
 * 1. 以 ELECTRON_RUN_AS_NODE 方式拉起本地服务端（server/dist/main.js，PGlite 本地库）
 * 2. 等待服务端打印 DESKTOP_SERVER_READY 后创建主窗口
 * 3. 窗口关闭时结束服务端进程并退出应用
 * 4. 数据目录持久化在系统用户数据目录（userData/pglite-data）
 */
const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_PORT = 17890;
const SERVER_HOST = '127.0.0.1';
const BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}/app/app_17g1b8sj7x4/`;
const READY_MARK = 'DESKTOP_SERVER_READY';

let serverProc = null;
let mainWindow = null;
let serverReady = false;
let appLoaded = false;
// 主动退出流程标志：区分「用户主动关应用」和「服务自己崩了」。
// 主动退出时服务是被我们请退的，绝不能再弹「服务意外退出」。
let appQuitting = false;

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

function startServer(dirs) {
  if (serverProc) return;
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

  serverProc = spawn(process.execPath, [mainJs], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DB_DIR: dbDir,
      CLIENT_DIR: dirs.clientDir,
      SERVER_HOST,
      SERVER_PORT: String(SERVER_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.on('data', (d) => {
    const chunk = d.toString();
    process.stdout.write('[server] ' + chunk);
    if (!serverReady && chunk.includes(READY_MARK)) {
      serverReady = true;
      loadApp(dirs);
    }
  });
  serverProc.stderr.on('data', (d) => process.stderr.write('[server:err] ' + d.toString()));
  serverProc.on('exit', (code) => {
    // 记录退出前服务是否已经就绪，用于区分「启动失败」和「运行中崩溃」
    const neverReady = !serverReady;
    serverProc = null;
    serverReady = false;
    if (code !== 0 && code !== null) {
      console.error('[desktop] server exited with code', code);
    }
    // 主动退出（关窗 / Cmd+Q）：服务是被我们请退的，属于正常流程，不提示任何错误。
    // 之前漏了这个判断，导致 Cmd+Q 退出时会误弹「本地服务已停止」。
    if (appQuitting) {
      return;
    }
    // 出问题时必须让用户看见原因，否则窗口一闪而过、无从排查
    if (neverReady) {
      dialog.showErrorBox(
        '启动失败：本地服务没能起来',
        '应用启动时本地服务意外退出，常见原因：\n' +
          '· 数据库文件损坏或被占用（可先重启电脑再试）\n' +
          '· 端口 17890 被其他程序占用\n' +
          '· 安装包不完整，或缺少题库数据文件\n\n' +
          '若反复出现，请把终端里的 [server:err] 输出发给维护者。',
      );
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        '本地服务已停止',
        '后台服务意外退出，应用将关闭。\n你的学习记录已保存在本机，重新打开应用即可继续。',
      );
    }
    // 服务意外退出时，若窗口还开着则退出应用，避免出现死窗口
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 被动退出也要放行窗口关闭，否则会被上面 close 拦截逻辑挡住、退不出去
      appQuitting = true;
      app.quit();
    }
  });
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
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 同一窗口里的跳转也拦一道：只允许本机服务地址，外部网址用系统浏览器打开
  const appOrigin = `http://${SERVER_HOST}:${SERVER_PORT}`;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (/^https?:/i.test(url) && !url.startsWith(appOrigin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  // 点红叉 = 把窗口收起来，应用继续留在 Dock 里，服务也继续运行。
  // 这样下次点 Dock 图标能瞬间恢复（页面状态都还在，不用重新加载、不用重新初始化数据库）。
  // 真正退出应用请用 ⌘Q 或 Dock 右键「退出」。
  // ---- 侧边栏品牌位：在「全」字前面补上应用图标 ----
  // 背景：前端是构建产物，组件里写死了「收起显示『全』/ 展开显示『全职高手考研』」，
  // 没有源码改不了组件。
  //
  // 关键：组件用 aside 的 class 区分收起/展开状态（w-14 / w-60），
  // 所以可以写纯 CSS 选择器精确命中，**不需要 JS 打标记**。
  // 之前的版本靠 MutationObserver 补属性，属性总比 React 更新晚一帧，
  // 于是会看到「原文字 → 消失 → 图标出现」的三段闪动；纯 CSS 后状态切换是原子的，不再闪。
  //
  // 做法：原文字字号恒为 0（看不见但仍在 DOM 里，React 改它不会有视觉过程），
  // 图标与文字全部由伪元素渲染。
  const SIDEBAR_CSS = `
    aside.w-14 > div:first-child > span.text-base.font-semibold,
    aside.w-60 > div:first-child > span.text-base.font-semibold {
      font-size: 0 !important;
      display: inline-flex;
      align-items: center;
    }
    aside.w-14 > div:first-child > span.text-base.font-semibold::before,
    aside.w-60 > div:first-child > span.text-base.font-semibold::before {
      content: '';
      display: block;
      width: 20px;
      height: 20px;
      background: url("/icon.png") center / contain no-repeat;
      flex: none;
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
  if (!appLoaded) {
    appLoaded = true;
    mainWindow.loadURL(BASE_URL);
  }
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
    mainWindow.loadURL(BASE_URL);
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
