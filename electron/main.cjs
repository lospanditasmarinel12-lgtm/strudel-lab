const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');


let mainWindow;
let activeDownload = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Strudel Lab',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      sandbox: false,
    },
    backgroundColor: '#0a0a14',
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Resolve paths: dev vs packaged
const isDev = !app.isPackaged;
// preloadPath: __dirname resolves inside app.asar, but asarUnpack extracts the file
// to app.asar.unpacked/electron/preload.cjs — point directly to the real file in production
const preloadPath = isDev
  ? path.join(__dirname, 'preload.cjs')
  : path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'preload.cjs');
const ytDlpName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const ytDlpPath = isDev
  ? path.join(__dirname, '..', 'extraResources', ytDlpName)
  : path.join(process.resourcesPath, ytDlpName);

// YouTube download handler — spawns yt-dlp for best-quality audio extraction
// Uses native audio format (m4a AAC) to avoid needing ffmpeg for conversion

ipcMain.handle('youtube:download', async (event, url, options) => {
  const { name } = options;
  // Use system temp directory for download
  const tmpDir = require('os').tmpdir();
  const outputTemplate = path.join(tmpDir, `${name}.%(ext)s`);

  const args = [
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '-o', outputTemplate,
    '--no-playlist',
    '--progress',
    '--newline',
    url,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, args);
    activeDownload = proc;
    let outputFile = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      // Capture output filename from "[download] Destination: /path/to/file"
      const destMatch = line.match(/^\[download\] Destination:\s+(.+)$/);
      if (destMatch) {
        outputFile = destMatch[1];
      }
      // Parse progress lines like: "[download]  45.2% of ~42.33MiB at 3.21MiB/s ETA 00:07"
      const progressMatch = line.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        event.sender.send('youtube:progress', parseFloat(progressMatch[1]));
      }
    });

    proc.stderr.on('data', (data) => {
      console.error('[yt-dlp stderr]', data.toString());
    });

    proc.on('close', (code, signal) => {
      activeDownload = null;
      if (signal || code === null) {
        reject(new Error('Download cancelled'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }
      if (!outputFile || !fs.existsSync(outputFile)) {
        reject(new Error('Output file not found'));
        return;
      }
      const buffer = fs.readFileSync(outputFile);
      // Clean up the temp file
      fs.unlinkSync(outputFile);
      resolve(buffer);
    });

    proc.on('error', (err) => {
      activeDownload = null;
      reject(new Error(`Failed to spawn yt-dlp at "${ytDlpPath}": ${err.message}`));
    });
  });
});

ipcMain.handle('youtube:cancel', async () => {
  if (activeDownload) {
    activeDownload.kill('SIGTERM');
    activeDownload = null;
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// Secure key/value store (API keys) using the OS keychain via safeStorage.
// Values are encrypted with the OS-protected key when available; otherwise they
// are stored plaintext as a fallback so the app still works.
// ---------------------------------------------------------------------------

function secureFilePath() {
  return path.join(app.getPath('userData'), 'secure-store.json');
}

function readSecureFile() {
  try {
    return JSON.parse(fs.readFileSync(secureFilePath(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeSecureFile(obj) {
  try {
    fs.writeFileSync(secureFilePath(), JSON.stringify(obj), { mode: 0o600 });
  } catch (err) {
    console.error('[secure-store] write failed:', err.message);
  }
}

ipcMain.handle('secure:set', async (_event, key, value) => {
  if (typeof key !== 'string' || typeof value !== 'string') return false;
  const store = readSecureFile();
  try {
    if (safeStorage.isEncryptionAvailable()) {
      store[key] = { enc: safeStorage.encryptString(value).toString('base64') };
    } else {
      store[key] = { plain: value };
    }
  } catch {
    store[key] = { plain: value };
  }
  writeSecureFile(store);
  return true;
});

ipcMain.handle('secure:get', async (_event, key) => {
  if (typeof key !== 'string') return null;
  const entry = readSecureFile()[key];
  if (!entry) return null;
  if (entry.enc) {
    try {
      return safeStorage.decryptString(Buffer.from(entry.enc, 'base64'));
    } catch {
      return null;
    }
  }
  return entry.plain ?? null;
});

ipcMain.handle('secure:clear', async (_event, key) => {
  if (typeof key !== 'string') return false;
  const store = readSecureFile();
  delete store[key];
  writeSecureFile(store);
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
