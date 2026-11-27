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

  // The connections (connections.js): the other ways to a model (Claude through Claude Code,
  // a model added by its address) and which model answers. Each gives back what Settings draws:
  // { providers: [{ id, name, connected, enabled, models, … }], presets, model: { provider, id, name }, effort, levels }.
  connections: {
    /** What is connected; with `quick`, from what is already known, at once. */
    view: (quick) => ipcRenderer.invoke('connections:view', quick),
    /** Look over this Mac for Claude Code (installed, version, signedIn), then what is connected. */
    look: () => ipcRenderer.invoke('connections:look'),
    /** Sign in to Claude with Claude Code's own sign-in, in the browser: { ok }, { ok: false, error } or { cancelled }. */
    signIn: (key) => ipcRenderer.invoke('connections:sign-in', key),
    /** Send Claude one short message; a reply makes it a connection: { ok, ms } or { ok: false, error }. */
    connect: (key) => ipcRenderer.invoke('connections:connect', key),
    /** The models an address lists: `draft` is { id, url, key, model }. Gives { ok, models } or { ok: false, error }. */
    models: (key, draft) => ipcRenderer.invoke('connections:models', key, draft),
    /** Add a model by its address, or change one, once it has answered: { ok, ms } or { ok: false, error }. */
    save: (key, draft) => ipcRenderer.invoke('connections:save', key, draft),
    /** Let a connection go. */
    disconnect: (id) => ipcRenderer.invoke('connections:disconnect', id),
    /** Use a held connection, or rest it. */
    enable: (id, on) => ipcRenderer.invoke('connections:enable', id, Boolean(on)),
    /** Choose the model questions go to. */
    model: (provider, id) => ipcRenderer.invoke('connections:model', provider, id),
    /** Choose how much the model thinks before it answers: 'low', 'medium', 'high', or null for as much as it does by itself. */
    effort: (level) => ipcRenderer.invoke('connections:effort', level),
    /** Ask the model in use one thing, apart from any chat (nothing of it is kept): `request` is { system, text }. Gives { ok: true, text, model }, { ok: false, error }, or { ok: false, cancelled: true } after `cancel(key)`. */
    once: (key, request) => ipcRenderer.invoke('connections:once', String(key), request),
    /** Call off a sign-in, a check, a listing or a one-off question that is under way, by its key. */
    cancel: (key) => ipcRenderer.send('connections:cancel', String(key)),
    /** Open the page Claude Code is to be had from. */
    page: () => ipcRenderer.send('connections:page'),
  },

  // The chats (chats.js): what was asked about what you read, and answered, kept in the library.
  chats: {
    /** The chats about an item (its file), the one last added to first; all of them if none is named. */
    list: (file) => ipcRenderer.invoke('chats:list', file),
    /** A chat and everything said in it: { chat, messages }, or null. */
    read: (id) => ipcRenderer.invoke('chats:read', id),
    /** Ask in a chat, and keep the question and the answer: `request` is { chat, text, quote }, or { file, text, quote } to begin a new chat about an item. The model in use answers (connections). What happens comes to `onPart` under this id. */
    ask: (id, request) => ipcRenderer.send('chats:ask', String(id), request),
    /** Stop an answer that is coming: what had come of it is kept. */
    stop: (id) => ipcRenderer.send('chats:stop', String(id)),
    /** Hear of what happens: (id, part), where part is { chat, question }, { delta }, { done, answer }, { stopped, answer } or { error, code, answer }. */
    onPart: (hear) => ipcRenderer.on('chats:part', (event, id, part) => hear(id, part)),
    /** Call a chat something else. */
    rename: (id, title) => ipcRenderer.invoke('chats:rename', id, title),
    /** Take a chat away. */
    remove: (id) => ipcRenderer.invoke('chats:remove', id),
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
