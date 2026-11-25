const { contextBridge } = require('electron');

// What the window may ask of the main process. Nothing yet.
contextBridge.exposeInMainWorld('api', {});
