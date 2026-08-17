const { app, BrowserWindow, ipcMain, dialog, session, Menu } = require('electron');
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

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    const bundledPath = path.join(__dirname, '..', '..', 'appsettings.json');
    const config = JSON.parse(fs.readFileSync(bundledPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return config;
  }
}

// 应用 HTTP 代理到 defaultSession（所有 <webview> 继承该会话）
async function applyProxy() {
  const proxy = loadConfig().proxy || { enabled: false };
  if (proxy.enabled && proxy.host && proxy.port) {
    const proxyRules = `${proxy.host}:${proxy.port}`;
    await session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules,
      proxyBypassRules: '<local>',
    });
    session.defaultSession.removeAllListeners('login');
    session.defaultSession.on('login', (event, _request, _authInfo, callback) => {
      if (proxy.username) {
        event.preventDefault();
        callback(proxy.username, proxy.password || '');
      }
    });
    console.log(`[Proxy] HTTP 代理已启用: ${proxyRules}`);
  } else {
    await session.defaultSession.setProxy({ mode: 'direct' });
    session.defaultSession.removeAllListeners('login');
    console.log('[Proxy] HTTP 代理已禁用');
  }
}

// 在 webview 内拦截查找快捷键，转发给渲染进程打开查找栏
function setupWebviewFindShortcuts() {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (!mainWindow || mainWindow.isDestroyed()) return;

      const mod = input.control || input.meta;
      const key = input.key.toLowerCase();

      if (mod && key === 'f') {
        event.preventDefault();
        mainWindow.webContents.send('find-command', 'open');
      } else if (key === 'f3' || (mod && key === 'g')) {
        event.preventDefault();
        mainWindow.webContents.send('find-command', input.shift ? 'previous' : 'next');
      }
    });
  });
}

// 为所有 <webview> 添加右键菜单（Electron 默认没有）
function setupWebviewContextMenu() {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;

    contents.on('context-menu', (event, params) => {
      const template = [];

      if (params.isEditable) {
        template.push({ role: 'undo', label: '撤销' });
        template.push({ role: 'redo', label: '重做' });
        template.push({ type: 'separator' });
        template.push({ role: 'cut', label: '剪切' });
        template.push({ role: 'copy', label: '复制' });
        template.push({ role: 'paste', label: '粘贴' });
        template.push({ role: 'selectAll', label: '全选' });
      } else if (params.selectionText && params.selectionText.trim()) {
        template.push({ role: 'copy', label: '复制' });
        template.push({ role: 'selectAll', label: '全选' });
      }

      if (params.linkURL) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push({ role: 'copyLink', label: '复制链接地址' });
      }

      if (params.mediaType === 'image') {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push({
          label: '图片另存为…',
          click: () => contents.downloadURL(params.srcURL),
        });
        template.push({
          label: '复制图片',
          click: () => contents.copyImageAt(params.x, params.y),
        });
      }

      template.push({ type: 'separator' });
      template.push({ role: 'back', label: '后退' });
      template.push({ role: 'forward', label: '前进' });
      template.push({ role: 'reload', label: '重新加载' });

      const win = BrowserWindow.fromWebContents(contents);
      if (win) {
        Menu.buildFromTemplate(template).popup({ window: win });
      }
    });
  });
}

// 启用下载：弹出系统保存对话框
function setupDownloads() {
  session.defaultSession.on('will-download', (event, item) => {
    item.setSaveDialogOptions({
      title: '保存文件',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
      buttonLabel: '保存',
    });
    item.once('done', (_e, state) => {
      if (state === 'completed') {
        console.log(`[Download] 已保存: ${item.getSavePath()}`);
      } else {
        console.log(`[Download] 未完成: ${state}`);
      }
    });
  });
}

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

app.whenReady().then(async () => {
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

  await applyProxy();

  setupWebviewContextMenu();
  setupWebviewFindShortcuts();
  setupDownloads();

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
  return loadConfig();
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

ipcMain.handle('save-app-config', async (_event, config) => {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  await applyProxy();
  return true;
});