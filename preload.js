const { contextBridge, ipcRenderer } = require('electron');

// What the window may ask of the main process.
contextBridge.exposeInMainWorld('api', {
  /** Show or hide the window buttons (close, minimise, zoom). */
  windowButtons: (show) => ipcRenderer.send('window-buttons', Boolean(show)),
  /** Start or stop being told where the pointer is: 'top', 'foot' or 'none'. */
  watchPointer: (on) => ipcRenderer.send('watch-pointer', Boolean(on)),
  onPointer: (told) => ipcRenderer.on('pointer', (event, zone) => told(zone)),
});
