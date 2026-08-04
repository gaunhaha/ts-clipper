import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { MpvController } from './mpv-controller';
import { FfmpegRunner } from './ffmpeg-runner';
import { resolveBin } from './bin-paths';

const isDev = process.env.NODE_ENV === 'development';

// Required so mpv's child HWND isn't occluded by Chromium's DirectComposition
// layer when embedded via --wid. UI rendering becomes software, but mpv keeps
// its own GPU pipeline so video stays hardware-accelerated.
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let videoWindow: BrowserWindow | null = null;
let mpv: MpvController | null = null;
let ffmpeg: FfmpegRunner | null = null;

function createWindows() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0d10',
    title: 'TS Clipper',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  videoWindow = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#000000',
    webPreferences: { sandbox: true },
  });
  // Let drag-drop and UI hit-testing reach the main window under the embed.
  videoWindow.setIgnoreMouseEvents(true);
  videoWindow.loadURL(
    'data:text/html,<html><body style="margin:0;background:#000;"></body></html>',
  );

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    videoWindow?.destroy();
    videoWindow = null;
    mpv?.dispose();
    mpv = null;
  });

  mainWindow.on('move', syncVideoBounds);
  mainWindow.on('resize', syncVideoBounds);
  mainWindow.on('minimize', () => videoWindow?.hide());
  mainWindow.on('restore', () => {
    if (lastBounds) videoWindow?.show();
  });
}

let lastBounds: { x: number; y: number; width: number; height: number } | null = null;

function syncVideoBounds() {
  if (!mainWindow || !videoWindow || !lastBounds) return;
  const main = mainWindow.getContentBounds();
  videoWindow.setBounds({
    x: main.x + lastBounds.x,
    y: main.y + lastBounds.y,
    width: Math.max(1, lastBounds.width),
    height: Math.max(1, lastBounds.height),
  });
}

function getVideoWindowHwnd(): string {
  if (!videoWindow) throw new Error('video window not ready');
  const buf = videoWindow.getNativeWindowHandle();
  // Windows: HWND is pointer-sized. Buffer is 4 or 8 bytes.
  if (buf.length === 8) return buf.readBigUInt64LE(0).toString();
  return buf.readUInt32LE(0).toString();
}

function registerIpc() {
  ipcMain.handle('dialog:openTs', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '選擇 TS 檔案',
      properties: ['openFile'],
      filters: [
        { name: 'MPEG-TS', extensions: ['ts', 'm2ts', 'mts'] },
        { name: '所有檔案', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:saveMp4', async (_e, defaultName: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '輸出 MP4',
      defaultPath: defaultName,
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('dialog:saveImage', async (_e, defaultName: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '儲存截圖',
      defaultPath: defaultName,
      filters: [
        { name: 'PNG', extensions: ['png'] },
        { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('mpv:screenshot', async (_e, filePath: string) => {
    if (!mpv) throw new Error('mpv not started');
    const ext = filePath.toLowerCase().endsWith('.jpg') || filePath.toLowerCase().endsWith('.jpeg')
      ? 'jpg'
      : 'png';
    await mpv.setProperty('screenshot-format', ext);
    await mpv.command(['screenshot-to-file', filePath, 'video']);
    return filePath;
  });

  ipcMain.handle('video:setBounds', (_e, bounds: typeof lastBounds) => {
    lastBounds = bounds;
    if (!videoWindow) return;
    if (!bounds || bounds.width < 2 || bounds.height < 2) {
      videoWindow.hide();
      return;
    }
    syncVideoBounds();
    if (!videoWindow.isVisible()) videoWindow.show();
  });

  ipcMain.handle('mpv:load', async (_e, filePath: string) => {
    if (!mpv) {
      mpv = new MpvController({
        mpvPath: resolveBin('mpv.exe'),
        wid: getVideoWindowHwnd(),
        onEvent: (evt) => mainWindow?.webContents.send('mpv:event', evt),
      });
      await mpv.start();
    }
    await mpv.loadFile(filePath);
    return true;
  });

  ipcMain.handle('mpv:command', async (_e, command: unknown[]) => {
    if (!mpv) throw new Error('mpv not started');
    return mpv.command(command);
  });

  ipcMain.handle('mpv:setProperty', async (_e, name: string, value: unknown) => {
    if (!mpv) throw new Error('mpv not started');
    return mpv.setProperty(name, value);
  });

  ipcMain.handle('ffmpeg:probe', async (_e, filePath: string) => {
    const runner = new FfmpegRunner({
      ffmpegPath: resolveBin('ffmpeg.exe'),
      ffprobePath: resolveBin('ffprobe.exe'),
    });
    const [info, encoders] = await Promise.all([
      runner.probe(filePath),
      runner.detectHwEncoders(),
    ]);
    return { ...info, encoders };
  });

  ipcMain.handle(
    'ffmpeg:export',
    async (
      _e,
      opts: {
        input: string;
        output: string;
        inSec: number;
        outSec: number;
        mode: 'copy' | 'reencode';
        encoder?: string;
        videoBitrateK?: number;
      },
    ) => {
      ffmpeg?.cancel();
      ffmpeg = new FfmpegRunner({
        ffmpegPath: resolveBin('ffmpeg.exe'),
        ffprobePath: resolveBin('ffprobe.exe'),
      });
      return ffmpeg.export(opts, (progress) => {
        mainWindow?.webContents.send('ffmpeg:progress', progress);
      });
    },
  );

  ipcMain.handle('ffmpeg:cancel', () => {
    ffmpeg?.cancel();
    return true;
  });

  ipcMain.handle('shell:revealFile', (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindows();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  mpv?.dispose();
  ffmpeg?.cancel();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  mpv?.dispose();
  ffmpeg?.cancel();
});
