const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
    /** The page at a web address: { html, address }, or { error }. */
    page: (address) => ipcRenderer.invoke('library:page', address),
    /** Save an article ({ title, html, pictures }) into the library: { file }, or { error }. */
    keep: (article) => ipcRenderer.invoke('library:keep', article),
    /** Add the files dropped on the window (File objects); they are copied in as chosen ones are. */
    drop: (files) => ipcRenderer.invoke('library:drop', [...files].map((file) => webUtils.getPathForFile(file)).filter(Boolean)),
    /** The text of a file inside a book. */
    text: (file, name) => ipcRenderer.invoke('library:text', file, name),
    /** A whole file of the library's, as bytes. */
    bytes: (file) => ipcRenderer.invoke('library:bytes', file),
    /** The size of every file inside a book. */
    sizes: (file) => ipcRenderer.invoke('library:sizes', file),
    /** What is highlighted in an item, and the notes on it. */
    highlights: (file) => ipcRenderer.invoke('library:highlights', file),
    /** Keep an item's highlights. */
    keepHighlights: (file, title, list) => ipcRenderer.invoke('library:keep-highlights', file, title, list),
    /** Put a book's file in the Trash. */
    discard: (file) => ipcRenderer.invoke('library:discard', file),
    /** Tell the reader something, in a dialog. */
    notify: (message) => ipcRenderer.invoke('library:notify', message),
    /** Open a web address in the browser. */
    out: (address) => ipcRenderer.send('library:out', address),
  },
});
