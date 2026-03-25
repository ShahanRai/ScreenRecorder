/**
 * MIT License
 *
 * Copyright (c) 2026 [Your Name or Organization]
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

let mainWindow;
let toolbarWindow;
let overlayWindow;
let isDrawingAvailable = true;

/**
 * Robust PowerShell runner with logging and error handling
 */
function runPowerShell(script, args = []) {
  const fullCommand = script.replace(/\n/g, ' ').trim();
  try {
    const output = execFileSync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      fullCommand
    ], { 
      encoding: 'utf8', 
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'] // Capture both stdout and stderr
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    console.error(`PowerShell Error for script: ${fullCommand}`);
    console.error(`Stderr: ${error.stderr}`);
    console.error(`Message: ${error.message}`);
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * Spawn-based PowerShell runner for long-running processes (polling)
 */
function spawnPowerShell(script) {
  const fullCommand = script.replace(/\n/g, ' ').trim();
  return require('child_process').spawn('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    fullCommand
  ]);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    transparent: false,
    autoHideMenuBar: true,
    hasShadow: true
  });
  mainWindow.loadFile('src/renderer/index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('show-save-dialog', async (event, ext = 'webm') => {
  const isMp4 = ext === 'mp4';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultBase = `Screenrecord-${timestamp}`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Recording',
    defaultPath: `${defaultBase}.${ext}`,
    filters: [
      { name: isMp4 ? 'MP4 Video' : 'WebM Video', extensions: [ext] }
    ]
  });
  return result.filePath;
});

ipcMain.handle('open-path', async (event, filePath) => {
  await shell.openPath(filePath);
});

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('file-exists', (event, filePath) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('delete-file', (event, filePath) => {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  return false;
});

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({ 
    types: ['screen', 'window'], 
    thumbnailSize: { width: 400, height: 400 }
  });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    display_id: source.display_id,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

let writeStream = null;
let tempWebmPath = '';
let targetMp4Path = '';

ipcMain.on('start-saving', (event, filePath) => {
  if (filePath.endsWith('.mp4')) {
    targetMp4Path = filePath;
    tempWebmPath = filePath + '.webm.tmp';
    writeStream = fs.createWriteStream(tempWebmPath);
  } else {
    targetMp4Path = '';
    writeStream = fs.createWriteStream(filePath);
  }
});

ipcMain.on('save-chunk', (event, buffer) => {
  if (writeStream) {
    writeStream.write(Buffer.from(buffer));
  }
});

ipcMain.on('stop-saving', () => {
  if (writeStream) {
    writeStream.end();
    writeStream = null;

    if (targetMp4Path && tempWebmPath) {
      if (mainWindow) mainWindow.webContents.send('conversion-started');
      
      let ffmpegPath = ffmpeg;
      if (ffmpegPath.includes('app.asar')) {
        ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
      }

      if (!fs.existsSync(ffmpegPath)) {
        console.error("FFmpeg not found at:", ffmpegPath);
        if (mainWindow) mainWindow.webContents.send('conversion-done');
        return;
      }
      
      // Convert to MP4 using H.264
      execFile(ffmpegPath, ['-y', '-i', tempWebmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'faster', '-crf', '18', '-movflags', '+faststart', targetMp4Path], (error) => {
        if (error) console.error("FFmpeg Error:", error);
        
        fs.unlink(tempWebmPath, () => {});
        if (mainWindow) mainWindow.webContents.send('conversion-done', targetMp4Path);
        targetMp4Path = '';
      });
    } else {
      if (mainWindow) mainWindow.webContents.send('conversion-done');
    }
  }
});

/// Windows management
ipcMain.on('recording-started', (event, source) => {
  mainWindow.minimize();

  let targetDisplay = screen.getDisplayMatching(mainWindow.getBounds());
  const isApp = source.id.startsWith('window:');
  let appBounds = null;
  let overlayBounds = null;
  
  // 1. Determine target display and initial bounds
  if (source.id.startsWith('screen:')) {
    const displays = screen.getAllDisplays();
    const sourceDisplayId = source.display_id;
    const found = displays.find(d => d.id.toString() === sourceDisplayId);
    if (found) {
      targetDisplay = found;
      overlayBounds = targetDisplay.bounds;
    } else {
      overlayBounds = targetDisplay.bounds;
    }
  } else if (isApp) {
    try {
      if (process.platform === 'win32') {
        const hwndStr = source.id.split(':')[1];
        const hwndInt = hwndStr.toLowerCase().startsWith('0x') ? parseInt(hwndStr, 16) : parseInt(hwndStr, 10);
        
        const psScript = `
          Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W32 { [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect); [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute); [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } }';
          $hwnd = [IntPtr]${hwndInt};
          $rect = New-Object W32+RECT;
          $hr = [W32]::DwmGetWindowAttribute($hwnd, 9, [ref]$rect, 16);
          if ($hr -ne 0) { [W32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null };
          Write-Output "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)";
        `;
        
        const res = runPowerShell(psScript);
        if (res.success) {
          const [l, t, r, b] = res.output.split(',').map(Number);
          if (!isNaN(l) && !isNaN(r) && r > l && b > t) {
            const physCenter = { x: l + (r - l) / 2, y: t + (b - t) / 2 };
            const displays = screen.getAllDisplays();
            targetDisplay = displays.find(d => {
              const pX = d.bounds.x * d.scaleFactor;
              const pY = d.bounds.y * d.scaleFactor;
              const pW = d.bounds.width * d.scaleFactor;
              const pH = d.bounds.height * d.scaleFactor;
              return physCenter.x >= pX && physCenter.x < pX + pW && physCenter.y >= pY && physCenter.y < pY + pH;
            }) || screen.getPrimaryDisplay();
            
            const sf = targetDisplay.scaleFactor;
            const logicalX = targetDisplay.bounds.x + (l - (targetDisplay.bounds.x * sf)) / sf;
            const logicalY = targetDisplay.bounds.y + (t - (targetDisplay.bounds.y * sf)) / sf;
            const logicalWidth = (r - l) / sf;
            const logicalHeight = (b - t) / sf;
            appBounds = { x: Math.round(logicalX), y: Math.round(logicalY), width: Math.round(logicalWidth), height: Math.round(logicalHeight) };
            overlayBounds = appBounds;
          }
        }
      } else if (process.platform === 'darwin') {
        const parts = source.name.split(/\s+-\s+|\s+—\s+|\s+\|\s+/);
        const appName = parts.length > 1 ? parts.pop().trim() : source.name.trim();
        const out = execFileSync('osascript', ['-e', `tell application "System Events" to get bounds of window 1 of process "${appName}"`], { encoding: 'utf8', timeout: 5000 }).trim();
        const [l, t, r, b] = out.split(',').map(n => parseInt(n.trim(), 10));
        if (!isNaN(l) && !isNaN(r) && r > l && b > t) {
          appBounds = { x: l, y: t, width: r - l, height: b - t };
          targetDisplay = screen.getDisplayMatching(appBounds);
          overlayBounds = appBounds;
        }
      }
    } catch (e) {
      console.log('Failed to fetch initial app bounds:', e.message);
    }
  }

  // Fallback if bounds fetch failed
  if (!overlayBounds) overlayBounds = targetDisplay.bounds;

  // 2. Create overlay and toolbar windows
  overlayWindow = new BrowserWindow({
    x: overlayBounds.x,
    y: overlayBounds.y,
    width: overlayBounds.width,
    height: overlayBounds.height,
    frame: false,
    transparent: true,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'pop-up-menu');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile('src/renderer/overlay.html');

  const { x: dx, y: dy, width: dWidth, height: dHeight } = targetDisplay.workArea;

  toolbarWindow = new BrowserWindow({
    parent: overlayWindow || null,
    width: 450,
    height: 60,
    x: dx + Math.floor((dWidth - 450) / 2),
    y: dy + dHeight - 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  toolbarWindow.setContentProtection(true);
  toolbarWindow.setAlwaysOnTop(true, 'screen-saver');
  toolbarWindow.loadFile('src/renderer/toolbar.html');
  
  toolbarWindow.webContents.on('did-finish-load', () => {
    toolbarWindow.webContents.send('drawing-available', isDrawingAvailable, isApp);
  });

  // 3. Set up boundary tracking for apps
  let boundsTrackerProcess = null;
  if (isApp && appBounds) {
    if (process.platform === 'win32') {
      const hwndStr = source.id.split(':')[1];
      const hwndInt = hwndStr.toLowerCase().startsWith('0x') ? parseInt(hwndStr, 16) : parseInt(hwndStr, 10);
      const psScript = `
        Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W32 { [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect); [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute); [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindow(IntPtr hWnd); [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsIconic(IntPtr hWnd); [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } }';
        $hwnd = [IntPtr]${hwndInt};
        $rect = New-Object W32+RECT;
        while ($true) {
          if (-not [W32]::IsWindow($hwnd)) { Write-Output "CLOSED"; break };
          if ([W32]::IsIconic($hwnd)) { 
            Write-Output "MINIMIZED";
            Start-Sleep -Milliseconds 500;
            continue;
          };
          $hr = [W32]::DwmGetWindowAttribute($hwnd, 9, [ref]$rect, 16);
          if ($hr -ne 0) { [W32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null };
          [Console]::WriteLine("$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)");
          Start-Sleep -Milliseconds 150;
        }
      `;
      
      boundsTrackerProcess = spawnPowerShell(psScript);
      boundsTrackerProcess.stdout.on('data', (data) => {
        if (!boundsTrackerProcess) return;
        if (!overlayWindow || overlayWindow.isDestroyed()) return boundsTrackerProcess.kill();
        const lines = data.toString().trim().split(/\r?\n/);
        const lastLine = lines[lines.length - 1].trim();
        if (!lastLine) return;
        
        if (lastLine === "CLOSED") {
           if (mainWindow) mainWindow.webContents.send('stop-recording');
           return boundsTrackerProcess?.kill();
        }
        
        if (lastLine === "MINIMIZED") {
           if (overlayWindow && overlayWindow.isVisible()) overlayWindow.hide();
           return;
        }

        const [l, t, r, b] = lastLine.split(',').map(Number);
        
        if (!isNaN(l) && !isNaN(r) && r > l && b > t) {
          if (overlayWindow && !overlayWindow.isVisible()) overlayWindow.show();
          
          const physCenter = { x: l + (r - l) / 2, y: t + (b - t) / 2 };
          const displays = screen.getAllDisplays();
          const currentDisp = displays.find(d => {
            const pX = d.bounds.x * d.scaleFactor;
            const pY = d.bounds.y * d.scaleFactor;
            const pW = d.bounds.width * d.scaleFactor;
            const pH = d.bounds.height * d.scaleFactor;
            return physCenter.x >= pX && physCenter.x < pX + pW && physCenter.y >= pY && physCenter.y < pY + pH;
          }) || targetDisplay;
          
          const sf = currentDisp.scaleFactor;
          const logicalX = Math.round(currentDisp.bounds.x + (l - (currentDisp.bounds.x * sf)) / sf);
          const logicalY = Math.round(currentDisp.bounds.y + (t - (currentDisp.bounds.y * sf)) / sf);
          const logicalWidth = Math.round((r - l) / sf);
          const logicalHeight = Math.round((b - t) / sf);
          
          const newBounds = { x: logicalX, y: logicalY, width: logicalWidth, height: logicalHeight };
          
          if (newBounds.x !== appBounds.x || newBounds.y !== appBounds.y || newBounds.width !== appBounds.width || newBounds.height !== appBounds.height) {
            appBounds = newBounds;
            overlayWindow.setBounds(appBounds);
            
            if (currentDisp.id !== targetDisplay.id) {
              targetDisplay = currentDisp;
              const { x: ddx, y: ddy, width: ddWidth, height: ddHeight } = targetDisplay.workArea;
              if (toolbarWindow && !toolbarWindow.isDestroyed()) {
                toolbarWindow.setBounds({ x: ddx + Math.floor((ddWidth - 450) / 2), y: ddy + ddHeight - 80, width: 450, height: 60 });
              }
            }
          }
        }
      });
    } else if (process.platform === 'darwin') {
      const parts = source.name.split(/\s+-\s+|\s+—\s+|\s+\|\s+/);
      const appName = parts.length > 1 ? parts.pop().trim() : source.name.trim();
      const osaScript = `repeat\ntry\ntell application "System Events"\nset p to process "${appName}"\nif not (exists p) then\nlog "CLOSED"\nexit repeat\nend if\nset b to bounds of window 1 of p\nlog (item 1 of b as string) & "," & (item 2 of b as string) & "," & (item 3 of b as string) & "," & (item 4 of b as string)\nend tell\non error\nlog "CLOSED"\nexit repeat\nend try\ndelay 0.2\nend repeat`;
      boundsTrackerProcess = require('child_process').spawn('osascript', ['-e', osaScript]);
      boundsTrackerProcess.stdout.on('data', (data) => {
        if (!boundsTrackerProcess) return;
        if (!overlayWindow || overlayWindow.isDestroyed()) return boundsTrackerProcess.kill();
        const lines = data.toString().trim().split(/\r?\n/);
        const lastLine = lines[lines.length - 1].trim();
        if (lastLine === "CLOSED") {
           if (mainWindow) mainWindow.webContents.send('stop-recording');
           return boundsTrackerProcess?.kill();
        }
      });
      boundsTrackerProcess.stderr.on('data', (data) => {
        if (!boundsTrackerProcess) return;
        if (!overlayWindow || overlayWindow.isDestroyed()) return boundsTrackerProcess.kill();
        const lines = data.toString().trim().split(/\r?\n/);
        const lastLine = lines[lines.length - 1].trim();
        if (!lastLine || lastLine === "CLOSED") return;
        const [l, t, r, b] = lastLine.split(',').map(n => parseInt(n.trim(), 10));
        if (!isNaN(l) && !isNaN(r) && r > l && b > t) {
          const newBounds = { x: l, y: t, width: r - l, height: b - t };
          if (newBounds.x !== appBounds.x || newBounds.y !== appBounds.y || newBounds.width !== appBounds.width || newBounds.height !== appBounds.height) {
            appBounds = newBounds;
            overlayWindow.setBounds(appBounds);
            const newDisplay = screen.getDisplayMatching(appBounds);
            if (newDisplay.id !== targetDisplay.id) {
              targetDisplay = newDisplay;
              const { x: ddx, y: ddy, width: ddWidth, height: ddHeight } = targetDisplay.workArea;
              if (toolbarWindow && !toolbarWindow.isDestroyed()) {
                toolbarWindow.setBounds({ x: ddx + Math.floor((ddWidth - 450) / 2), y: ddy + ddHeight - 80, width: 450, height: 60 });
              }
            }
          }
        }
      });
    }

    if (boundsTrackerProcess) {
      overlayWindow.on('closed', () => {
        if (boundsTrackerProcess) {
          boundsTrackerProcess.kill();
          boundsTrackerProcess = null;
        }
      });
    }
  }

  // 4. Focus the selected app
  if (isApp && process.platform === 'win32') {
    const hwndStr = source.id.split(':')[1];
    const hwndInt = hwndStr.toLowerCase().startsWith('0x') ? parseInt(hwndStr, 16) : parseInt(hwndStr, 10);
    runPowerShell(`
      Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetForegroundWindow(IntPtr hWnd); }';
      [Win32]::SetForegroundWindow([IntPtr]${hwndInt});
    `);
  } else if (isApp && process.platform === 'darwin') {
    const parts = source.name.split(/\s+-\s+|\s+—\s+|\s+\|\s+/);
    const appName = parts.length > 1 ? parts.pop().trim() : source.name.trim();
    execFile('osascript', ['-e', `tell application "${appName}" to activate`], (err) => {});
  }
});

ipcMain.on('pause-recording', () => {
  if (mainWindow) mainWindow.webContents.send('pause-recording-request');
});

ipcMain.on('resume-recording', () => {
  if (mainWindow) mainWindow.webContents.send('resume-recording-request');
});

ipcMain.on('recording-stopped', () => {
  if (toolbarWindow) {
    toolbarWindow.close();
    toolbarWindow = null;
  }
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
  }
});

// Communication between windows
ipcMain.on('stop-recording-from-toolbar', () => {
  if (mainWindow) mainWindow.webContents.send('stop-recording');
});

ipcMain.on('set-draw-mode', (event, mode) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('draw-mode', mode);
    if (mode === 'none') {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
        // Force toolbar above overlay to ensure toolbar controls remain clickable
      if (toolbarWindow) {
        toolbarWindow.setAlwaysOnTop(true, 'screen-saver');
        toolbarWindow.moveTop();
      }
    }
  }
});

ipcMain.on('toggle-cursor-from-toolbar', (event, visible) => {
  if (mainWindow) mainWindow.webContents.send('toggle-cursor-request', visible);
});

ipcMain.on('revert-to-mouse', () => {
  if (toolbarWindow) toolbarWindow.webContents.send('revert-to-mouse');
});

ipcMain.on('set-drawing-available', (e, avail) => {
  isDrawingAvailable = avail;
  if (toolbarWindow) toolbarWindow.webContents.send('drawing-available', avail);
});

ipcMain.on('close-main-window', () => app.quit());
ipcMain.on('minimize-main-window', () => mainWindow?.minimize());
