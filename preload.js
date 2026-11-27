const { contextBridge, ipcRenderer, webUtils } = require('electron');

// What the window may ask of the main process.
contextBridge.exposeInMainWorld('api', {
  /** Show or hide the window buttons (close, minimise, zoom). */
  windowButtons: (show) => ipcRenderer.send('window-buttons', Boolean(show)),
  /** Start or stop being told where the pointer is: 'top', 'foot' or 'none'. */
  watchPointer: (on) => ipcRenderer.send('watch-pointer', Boolean(on)),
  onPointer: (told) => ipcRenderer.on('pointer', (event, zone) => told(zone)),

  // The Settings page: what it shows of the app, and what it changes.
  settings: {
    /** The app's version, whether it is light or dark ('system', 'light' or 'dark'), and where the library is. */
    load: () => ipcRenderer.invoke('settings:load'),
    /** Make the app light or dark, or have it follow the Mac. */
    appearance: (look) => ipcRenderer.send('settings:appearance', String(look)),
    /** Show the library's folder in the Finder. */
    reveal: () => ipcRenderer.send('settings:reveal'),
    /** Move the library into a folder you are asked to choose: gives { folder } (where it now is), { why } (why it did not move) or { none } (nothing chosen). */
    move: (into) => ipcRenderer.invoke('settings:move', into),
  },

  // The assistant (assistant.js): signing in with ChatGPT, and asking it things.
  assistant: {
    /** How things stand: { signedIn, way ('plan' or 'codex'), email, name, waiting }. */
    status: () => ipcRenderer.invoke('assistant:status'),
    /** Sign in, in the browser: with your ChatGPT plan ('plan'), or as Codex does ('codex'). Gives how things stand after, { why } if it did not happen, or { none } if it was given up. */
    signIn: (way) => ipcRenderer.invoke('assistant:sign-in', way),
    /** Give up a sign-in that is waiting on the browser. */
    cancel: () => ipcRenderer.send('assistant:cancel'),
    /** Sign out: gives how things stand after, with whether OpenAI confirmed it. */
    signOut: () => ipcRenderer.invoke('assistant:sign-out'),
    /** The models that can be asked: { models: [{ id, name }] }, or { why }. */
    models: () => ipcRenderer.invoke('assistant:models'),
    /** Ask: `request` is { model, instructions, messages: [{ role, text }], thread }. The answer comes to `onPart` under this id. */
    ask: (id, request) => ipcRenderer.send('assistant:ask', String(id), request),
    /** Stop an ask that is under way. */
    stop: (id) => ipcRenderer.send('assistant:stop', String(id)),
    /** Hear of answers as they come: (id, part), where part is { delta }, { done, text }, { error, code } or { stopped }. */
    onPart: (hear) => ipcRenderer.on('assistant:part', (event, id, part) => hear(id, part)),
    /** Open ChatGPT's own page for how much of your plan apps may use. */
    usage: () => ipcRenderer.send('assistant:usage'),
    /** (A test run only: where the browser would have been sent.) */
    pending: () => ipcRenderer.invoke('assistant:pending'),
  },

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
