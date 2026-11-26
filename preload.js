const { contextBridge, ipcRenderer } = require('electron');

// What the window may ask of the main process.
contextBridge.exposeInMainWorld('api', {
  /** Show or hide the window buttons (close, minimise, zoom). */
  windowButtons: (show) => ipcRenderer.send('window-buttons', Boolean(show)),
  /** Start or stop being told where the pointer is: 'top', 'foot' or 'none'. */
  watchPointer: (on) => ipcRenderer.send('watch-pointer', Boolean(on)),
  onPointer: (told) => ipcRenderer.on('pointer', (event, zone) => told(zone)),

  // The library (library.js): what is kept, and the books themselves.
  library: {
    /** The items and collections kept. */
    load: () => ipcRenderer.invoke('library:load'),
    /** Keep these items and collections. */
    save: (state) => ipcRenderer.send('library:save', state),
    /** Choose books to add; they are copied into the library. Gives { added: [{ file, name, kind }], failed: [names] }. */
    add: (paths) => ipcRenderer.invoke('library:add', paths),
    /** The text of a file inside a book. */
    text: (file, name) => ipcRenderer.invoke('library:text', file, name),
    /** A whole file of the library's, as bytes. */
    bytes: (file) => ipcRenderer.invoke('library:bytes', file),
    /** The size of every file inside a book. */
    sizes: (file) => ipcRenderer.invoke('library:sizes', file),
    /** Put a book's file in the Trash. */
    discard: (file) => ipcRenderer.invoke('library:discard', file),
    /** Tell the reader something, in a dialog. */
    notify: (message) => ipcRenderer.invoke('library:notify', message),
    /** Open a web address in the browser. */
    out: (address) => ipcRenderer.send('library:out', address),
  },
});
