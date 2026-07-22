const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

// --- 单实例锁 ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;
const stateFile = path.join(app.getPath('userData'), 'window-state.json');
const configPath = path.join(app.getPath('userData'), 'appsettings.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch {
    return { width: 1024, height: 768 };
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const isMax = mainWindow.isMaximized();
  fs.writeFileSync(stateFile, JSON.stringify({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: isMax,
  }));
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('close', () => {
    saveWindowState();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('maximize-change', false);
  });
}

app.whenReady().then(() => {
  // ================= 核心修改：绕过 Google 浏览器安全检查 =================
  // 1. 获取当前默认的 User-Agent
  let currentUA = session.defaultSession.getUserAgent();

  // 2. 利用正则精准剔除 Electron 及其版本号
  let cleanUA = currentUA.replace(/Electron\/[a-zA-Z0-9.-]+\s?/, '');

  // 3. 全局设置 Fallback，这将应用于后续创建的所有 BrowserWindow 和 <webview>
  app.userAgentFallback = cleanUA;
  session.defaultSession.setUserAgent(cleanUA);

  // 4. 拦截 HTTP 请求，清理可能被 Google 嗅探到的底层环境标头 (sec-ch-ua)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = cleanUA;
    // 移除暴露应用身份的特有标头
    delete details.requestHeaders['sec-ch-ua'];
    callback({ requestHeaders: details.requestHeaders });
  });
  // =====================================================================

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('get-app-config', () => {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    const bundledPath = path.join(__dirname, '..', '..', 'appsettings.json');
    const config = JSON.parse(fs.readFileSync(bundledPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return config;
  }
});

ipcMain.handle('get-window-state', () => {
  return { isMaximized: mainWindow.isMaximized() };
});

ipcMain.on('window-close', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['是', '否'],
    defaultId: 0,
    title: '提示',
    message: '是否关闭？',
  });
  if (response === 0) {
    mainWindow.close();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.handle('save-app-config', (_event, config) => {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});