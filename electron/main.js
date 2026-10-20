/**
 * 全职高手考研系统 —— Electron 主进程
 *
 * 职责：
 * 1. 以 ELECTRON_RUN_AS_NODE 方式拉起本地服务端（server/dist/main.js，PGlite 本地库）
 * 2. 等待服务端打印 DESKTOP_SERVER_READY 后创建主窗口
 * 3. 窗口关闭时结束服务端进程并退出应用
 * 4. 数据目录持久化在系统用户数据目录（userData/pglite-data）
 */
const { app, BrowserWindow, shell } = require('electron');
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
    serverProc = null;
    serverReady = false;
    if (code !== 0 && code !== null) {
      console.error('[desktop] server exited with code', code);
    }
    // 服务意外退出时，若窗口还开着则退出应用，避免出现死窗口
    if (mainWindow && !mainWindow.isDestroyed()) {
      app.quit();
    }
  });
}

function stopServer() {
  if (serverProc) {
    try { serverProc.kill(); } catch (_) { /* ignore */ }
    serverProc = null;
  }
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
  mainWindow.on('closed', () => {
    mainWindow = null;
    stopServer();
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

app.whenReady().then(() => {
  const dirs = resolveDirs();
  // 立即创建窗口并显示本地加载页（白屏期也有内容），服务就绪后 loadApp 切入
  createWindow(dirs);
  startServer(dirs);
});

// 关闭全部窗口即退出（含服务进程）
app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('before-quit', () => stopServer());
app.on('will-quit', () => stopServer());
