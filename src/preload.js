const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  showSaveDialog: (ext) => ipcRenderer.invoke('show-save-dialog', ext),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  deleteFile: (path) => ipcRenderer.invoke('delete-file', path),
  fileExists: (path) => ipcRenderer.invoke('file-exists', path),
  getSources: () => ipcRenderer.invoke('get-sources'),
  startSaving: (path) => ipcRenderer.send('start-saving', path),
  saveChunk: (chunk) => ipcRenderer.send('save-chunk', chunk),
  stopSaving: () => ipcRenderer.send('stop-saving'),
  recordingStarted: (source) => ipcRenderer.send('recording-started', source),
  recordingStopped: () => ipcRenderer.send('recording-stopped'),
  stopRecordingFromToolbar: () => ipcRenderer.send('stop-recording-from-toolbar'),
  onStopRecording: (callback) => {
    ipcRenderer.removeAllListeners('stop-recording');
    ipcRenderer.on('stop-recording', callback);
  },
  setDrawMode: (mode) => ipcRenderer.send('set-draw-mode', mode),
  onDrawMode: (callback) => {
    ipcRenderer.removeAllListeners('draw-mode');
    ipcRenderer.on('draw-mode', (event, mode) => callback(mode));
  },
  toggleCursor: (visible) => ipcRenderer.send('toggle-cursor-from-toolbar', visible),
  onToggleCursor: (callback) => {
    ipcRenderer.removeAllListeners('toggle-cursor-request');
    ipcRenderer.on('toggle-cursor-request', callback);
  },
  setDrawingAvailable: (avail) => ipcRenderer.send('set-drawing-available', avail),
  onDrawingAvailable: (callback) => {
    ipcRenderer.removeAllListeners('drawing-available');
    ipcRenderer.on('drawing-available', (e, avail) => callback(avail));
  },
  revertToMouse: () => ipcRenderer.send('revert-to-mouse'),
  onRevertToMouse: (callback) => {
    ipcRenderer.removeAllListeners('revert-to-mouse');
    ipcRenderer.on('revert-to-mouse', callback);
  },
  onConversionStarted: (callback) => {
    ipcRenderer.removeAllListeners('conversion-started');
    ipcRenderer.on('conversion-started', callback);
  },
  onConversionDone: (callback) => {
    ipcRenderer.removeAllListeners('conversion-done');
    ipcRenderer.on('conversion-done', (event, filePath) => callback(filePath));
  },
  closeMainWindow: () => ipcRenderer.send('close-main-window'),
  minimizeMainWindow: () => ipcRenderer.send('minimize-main-window'),
  pauseRecording: () => ipcRenderer.send('pause-recording'),
  resumeRecording: () => ipcRenderer.send('resume-recording'),
  onPauseRecording: (callback) => {
    ipcRenderer.removeAllListeners('pause-recording-request');
    ipcRenderer.on('pause-recording-request', callback);
  },
  onResumeRecording: (callback) => {
    ipcRenderer.removeAllListeners('resume-recording-request');
    ipcRenderer.on('resume-recording-request', callback);
  },
});
