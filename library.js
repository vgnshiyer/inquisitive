// The library: one folder that holds the books themselves and a file saying what is known
// about them. Everything the app keeps goes through here.
//
//   <library>/library.json   the items, where you are in each, and the collections
//   <library>/chats.db       what was asked about them, and answered (chats.js)
//   <library>/Books/…        the books (EPUBs), copied in when they are added
//   <library>/PDFs/…         the PDFs, likewise
//   <library>/Articles/…     the articles saved from the web: a folder each, holding the
//                            cleaned page (article.html) and its pictures
//
// The folder is ~/Documents/Inquisitive, or wherever INQUISITIVE_LIBRARY says. A test run
// (INQUISITIVE_HEADLESS) keeps its own, apart from the real one.

const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const headless = Boolean(process.env.INQUISITIVE_HEADLESS);

// Where the library is kept: in Documents, unless it has been moved (main.js keeps where
// to, and says at the start; a move in this run says so itself).
let placed = null;
const usual = () => path.join(app.getPath('documents'), 'Inquisitive');
const folder = () => placed || process.env.INQUISITIVE_LIBRARY || (headless ? path.join(app.getPath('temp'), 'inquisitive-test', 'Library') : usual());
/** Says where the library was moved to in an earlier run. */
const place = (where) => (placed = where ? path.resolve(String(where)) : null);
const record = () => path.join(folder(), 'library.json');

/** The full path of a file in the library, given its path within it. Nothing outside the
    library folder can be named this way. */
function within(file) {
  const root = path.resolve(folder());
  const full = path.resolve(root, String(file));
  if (!full.startsWith(root + path.sep)) throw new Error('outside the library');
  return full;
}

// ---------- what is kept ----------

/** What the library file holds; an empty library if there is none yet. One that is there
    but could not be opened is said to be unreadable (the window then shows nothing and keeps
    nothing, so that it is not written over); one whose words make no sense is set aside,
    not written over. */
function load() {
  let text;
  try {
    text = fs.readFileSync(record(), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { items: [], collections: [], read: {} }; // none yet
    return { unreadable: true };
  }
  try {
    const kept = JSON.parse(text);
    return { items: Array.isArray(kept.items) ? kept.items : [], collections: Array.isArray(kept.collections) ? kept.collections : [], read: days(kept.read) };
  } catch {
    fs.renameSync(record(), path.join(folder(), `library.unreadable-${Date.now()}.json`));
    return { items: [], collections: [], read: {} };
  }
}

/** How long was read on each day, in seconds: { '2026-11-26': 1840 }. Only what is a day and
    a length of time is kept. */
function days(read) {
  const kept = {};
  if (read && typeof read === 'object') {
    for (const [day, seconds] of Object.entries(read)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(seconds) && seconds > 0) kept[day] = Math.round(seconds);
    }
  }
  return kept;
}

/** Writes the library file: to one side first, then into place, so a crash midway cannot
    leave half a file. */
function save(state) {
  if (!state || !Array.isArray(state.items) || !Array.isArray(state.collections)) return;
  fs.mkdirSync(folder(), { recursive: true });
  // A library with things in it is never written over by one with nothing in it without a
  // copy of it being kept beside it first.
  if (!state.items.length) {
    try {
      if (JSON.parse(fs.readFileSync(record(), 'utf8')).items?.length) fs.copyFileSync(record(), path.join(folder(), `library.before-emptying-${Date.now()}.json`));
    } catch {
      // (none there, or none that can be read: nothing to keep a copy of)
    }
  }
  const aside = record() + '.writing';
  fs.writeFileSync(aside, JSON.stringify({ version: 1, items: state.items, collections: state.collections, read: days(state.read) }, null, 2));
  fs.renameSync(aside, record());
}

// ---------- moving the library ----------

/** Every file under a folder, by its path within it, with its size. */
function filesOf(root, under = '') {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, under), { withFileTypes: true })) {
    const name = path.join(under, entry.name);
    if (entry.isDirectory()) found.push(...filesOf(root, name));
    else if (entry.name !== '.DS_Store') found.push(name + ' ' + fs.statSync(path.join(root, name)).size);
  }
  return found.sort();
}

/** Moves the library into another folder: the whole of it, as a folder of the same name
    there. On the same disk it is simply moved. On another, it is copied across, the copy is
    checked against it file by file, and only then is it taken away from where it was; if
    anything goes wrong it stays where it is. Gives where it now is, or why it was not moved. */
function move(into) {
  const from = path.resolve(folder());
  const parent = path.resolve(String(into));
  const to = path.join(parent, path.basename(from));
  if (to === from || parent === from) return { why: 'The library is already there.' };
  if ((parent + path.sep).startsWith(from + path.sep)) return { why: 'The library cannot be moved into itself.' };
  try {
    if (!fs.statSync(parent).isDirectory()) return { why: 'That is not a folder.' };
    const there = fs.existsSync(to) ? fs.readdirSync(to).filter((name) => name !== '.DS_Store') : null;
    if (there?.length) return { why: `There is already a folder called “${path.basename(to)}” there, with things in it.` };
    if (there) fs.rmSync(to, { recursive: true }); // (an empty one: it gives way)
    if (!fs.existsSync(from)) fs.mkdirSync(to, { recursive: true }); // nothing kept yet: there is only somewhere to choose
    else {
      try {
        fs.renameSync(from, to);
      } catch (error) {
        if (error.code !== 'EXDEV') throw error;
        try {
          fs.cpSync(from, to, { recursive: true, preserveTimestamps: true });
          if (filesOf(from).join('\n') !== filesOf(to).join('\n')) throw new Error('the copy is not the same');
        } catch (failed) {
          fs.rmSync(to, { recursive: true, force: true });
          throw failed;
        }
        fs.rmSync(from, { recursive: true, force: true });
      }
    }
  } catch (error) {
    return { why: `The library could not be moved there, and is where it was. (${error.message})` };
  }
  placed = to;
  return { folder: to };
}

// ---------- highlights ----------
// What is highlighted in an item, and the notes written on it, are kept in a file of their
// own in the library folder: Highlights/<the item's file name>.json. It is written only when
// one of them changes, and is gone when the last of them is.

const lights = (file) => within(path.join('Highlights', path.basename(within(file)) + '.json'));

/** An item's highlights; none if it has no file of them. A file that cannot be read is set
    aside, not written over. */
function highlights(file) {
  let text;
  try {
    text = fs.readFileSync(lights(file), 'utf8');
  } catch {
    return [];
  }
  try {
    const kept = JSON.parse(text);
    return Array.isArray(kept.highlights) ? kept.highlights : [];
  } catch {
    fs.renameSync(lights(file), lights(file).replace(/\.json$/, `.unreadable-${Date.now()}.json`));
    return [];
  }
}

/** Writes an item's highlights: to one side first, then into place. */
function keepHighlights(file, title, list) {
  const to = lights(file);
  if (!Array.isArray(list) || !list.length) return void fs.rmSync(to, { force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to + '.writing', JSON.stringify({ version: 1, title: String(title ?? ''), highlights: list }, null, 2));
  fs.renameSync(to + '.writing', to);
}

// ---------- inside a book ----------
// An EPUB is a zip. This reads one: the list of what is in it from the directory at its end,
// then any file in it on request. (Zips of more than 4GB, which use another form, are not read.)

const opened = new Map(); // the last few books read from: their bytes and what is in them

function unzip(file) {
  if (opened.has(file)) return opened.get(file);
  const bytes = fs.readFileSync(within(file));
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip');
  const entries = new Map();
  let at = bytes.readUInt32LE(end + 16);
  for (let i = 0, count = bytes.readUInt16LE(end + 10); i < count; i++) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) throw new Error('zip directory damaged');
    const name = bytes.toString('utf8', at + 46, at + 46 + bytes.readUInt16LE(at + 28));
    entries.set(name, { method: bytes.readUInt16LE(at + 10), packed: bytes.readUInt32LE(at + 20), size: bytes.readUInt32LE(at + 24), local: bytes.readUInt32LE(at + 42) });
    at += 46 + bytes.readUInt16LE(at + 28) + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  const book = { bytes, entries };
  opened.set(file, book);
  if (opened.size > 3) opened.delete(opened.keys().next().value);
  return book;
}

/** One file from inside a book, as bytes. Its name is matched exactly, or failing that
    without regard to case, which some books need. (An article is a folder, not a zip: its
    files are read as they lie, and none from outside it.) */
function inside(file, name) {
  const whole = within(file);
  if (fs.statSync(whole).isDirectory()) {
    const full = path.resolve(whole, String(name));
    if (!full.startsWith(whole + path.sep)) throw new Error('outside the article');
    return fs.readFileSync(full);
  }
  const { bytes, entries } = unzip(file);
  const entry = entries.get(name) ?? [...entries].find(([other]) => other.toLowerCase() === name.toLowerCase())?.[1];
  if (!entry) throw new Error('not in the book: ' + name);
  const start = entry.local + 30 + bytes.readUInt16LE(entry.local + 26) + bytes.readUInt16LE(entry.local + 28);
  const data = bytes.subarray(start, start + entry.packed);
  if (entry.method === 0) return data;
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error('packed in a way that is not read');
}

/** How big each file in a book is, unpacked: the reader's measure of how far through you are. */
const sizes = (file) => Object.fromEntries([...unzip(file).entries].map(([name, entry]) => [name, entry.size]));

const KINDS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };

// A book's pictures are fetched by address: book://b/<the book's file>/<the picture's path>.
protocol.registerSchemesAsPrivileged([{ scheme: 'book', privileges: { standard: true, secure: true } }]);

// ---------- adding ----------

/** Copies books and PDFs into the library and says where each went and which it is. With no
    paths given the files are chosen in a dialog. What is neither an EPUB nor a PDF is left
    out and named among the failures. */
async function add(window, paths) {
  if (!paths) {
    const chosen = await dialog.showOpenDialog(window, {
      title: 'Add to library',
      buttonLabel: 'Add',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Books and PDFs', extensions: ['epub', 'pdf'] }],
    });
    paths = chosen.canceled ? [] : chosen.filePaths;
  }
  const added = [];
  const failed = [];
  for (const from of paths) {
    const { name, ext } = path.parse(from);
    const kind = ext.toLowerCase() === '.pdf' ? 'pdf' : 'book';
    const shelf = kind === 'pdf' ? 'PDFs' : 'Books';
    fs.mkdirSync(path.join(folder(), shelf), { recursive: true });
    // The same name as one already there gets a number after it.
    let file = path.join(shelf, name + ext);
    for (let n = 2; fs.existsSync(within(file)); n++) file = path.join(shelf, `${name} ${n}${ext}`);
    try {
      fs.copyFileSync(from, within(file));
      // A PDF says so in its first bytes; an EPUB has this file in it. Anything else is neither.
      if (kind === 'pdf') {
        const start = Buffer.alloc(1024);
        const handle = fs.openSync(within(file), 'r');
        fs.readSync(handle, start, 0, 1024, 0);
        fs.closeSync(handle);
        if (!start.includes('%PDF-')) throw new Error('not a PDF');
      } else inside(file, 'META-INF/container.xml');
      added.push({ file, name, kind });
    } catch {
      opened.delete(file);
      fs.rmSync(within(file), { force: true });
      failed.push(name + ext);
    }
  }
  return { added, failed };
}

// ---------- an article ----------
// An article is saved from the web once, and read from the library after that. The page is
// fetched here; the window finds the article in it and cleans it (renderer/article.js); then
// its pictures are fetched and the lot is written into a folder of its own.

const PAGE = 'article.html';
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

/** Fetches a web address: its bytes, what it says it is, and where it turned out to be after
    being sent on. Nothing a site sets (cookies and the like) is kept, nothing over `most`
    bytes is taken, and nothing is waited on for more than 20 seconds. */
function fetched(address, most) {
  return new Promise((resolve, reject) => {
    let at = new URL(address).href;
    if (!/^https?:/i.test(at)) throw new Error('not a web address');
    // Each sending-on is followed by hand, so that the address arrived at is known.
    const request = net.request({ url: at, partition: 'articles', credentials: 'omit', redirect: 'manual' }); // (a partition kept in memory only)
    const fail = (error) => {
      clearTimeout(patience);
      request.abort();
      reject(error);
    };
    const patience = setTimeout(() => fail(new Error('took too long')), 20000);
    let hops = 0;
    request.on('redirect', (status, method, to) => {
      if (++hops > 10 || !/^https?:/i.test(to)) return fail(new Error('sent astray'));
      at = to;
      request.followRedirect();
    });
    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode > 299) return fail(new Error('answered ' + response.statusCode));
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        if ((size += chunk.length) > most) return fail(new Error('too big'));
        chunks.push(chunk);
      });
      response.on('end', () => {
        clearTimeout(patience);
        resolve({ bytes: Buffer.concat(chunks), type: String([response.headers['content-type']].flat()[0] ?? '').toLowerCase(), address: at });
      });
      response.on('error', fail);
    });
    request.on('error', fail);
    request.end();
  });
}

/** A page's bytes as text, in the lettering the page says it is in. */
function lettered(bytes, type) {
  const named = /charset=["']?([\w-]+)/.exec(type)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytes.toString('latin1', 0, 4096))?.[1];
  try {
    return new TextDecoder(named || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

/** The page at a web address, as text, and the address it was found at. */
async function page(address) {
  const got = await fetched(String(address), 10e6);
  if (got.type && !/html/.test(got.type)) throw new Error('not a page');
  return { html: lettered(got.bytes, got.type), address: got.address };
}

/** Saves an article: a folder named for it, its pictures fetched into it, and the page
    written with each picture's stand-in address ("picture-3.inq") changed for the file's
    name. A picture that cannot be had is left without an address. Gives the folder. */
async function keep({ title, html, pictures }) {
  if (typeof html !== 'string' || html.length > 20e6 || !Array.isArray(pictures)) throw new Error('not an article');
  const name = String(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+/, '').slice(0, 80).trim() || 'Article';
  fs.mkdirSync(path.join(folder(), 'Articles'), { recursive: true });
  let file = path.join('Articles', name);
  for (let n = 2; fs.existsSync(within(file)); n++) file = path.join('Articles', `${name} ${n}`);
  fs.mkdirSync(within(file));
  try {
    const names = new Array(Math.min(pictures.length, 200)).fill('');
    let next = 0;
    const fetching = async () => {
      for (let index = next++; index < names.length; index = next++) {
        try {
          const got = await fetched(String(pictures[index]), 15e6);
          const ext = TYPES[got.type.split(';')[0].trim()];
          if (!ext) continue;
          fs.writeFileSync(within(path.join(file, `${index + 1}.${ext}`)), got.bytes);
          names[index] = `${index + 1}.${ext}`;
        } catch {
          // left out: the article is saved without it
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, fetching)); // six at a time
    fs.writeFileSync(within(path.join(file, PAGE)), html.replace(/"picture-(\d+)\.inq"/g, (all, index) => `"${names[index] ?? ''}"`));
    return { file };
  } catch (error) {
    fs.rmSync(within(file), { recursive: true, force: true });
    throw error;
  }
}

// ---------- what the window may ask ----------

let gone = null; // who is told when an item is taken out of the library
/** Has `hear` told of each item taken out of the library, by its file within it. */
const discarded = (hear) => (gone = hear);

function listen() {
  ipcMain.handle('library:load', () => load());
  ipcMain.on('library:save', (event, state) => save(state));
  // A test run may name the files to add; otherwise they are always chosen in the dialog.
  ipcMain.handle('library:add', (event, paths) => add(BrowserWindow.fromWebContents(event.sender), headless && Array.isArray(paths) ? paths : null));
  // Files dropped on the window: the window's own side works out where they are (preload.js).
  ipcMain.handle('library:drop', (event, paths) => add(BrowserWindow.fromWebContents(event.sender), Array.isArray(paths) ? paths.map(String) : []));
  ipcMain.handle('library:text', (event, file, name) => inside(file, name).toString('utf8').replace(/^﻿/, ''));
  ipcMain.handle('library:sizes', (event, file) => sizes(file));
  ipcMain.handle('library:bytes', (event, file) => fs.readFileSync(within(file))); // a whole file, for a PDF
  // An article: the page at an address, and then the article found in it, saved. What goes
  // wrong is told in the answer, not thrown: { error }.
  ipcMain.handle('library:page', (event, address) => page(address).catch((error) => ({ error: error.message })));
  ipcMain.handle('library:keep', (event, article) => keep(article ?? {}).catch((error) => ({ error: error.message })));
  // Taking a book out of the library puts its file in the Trash, where it can be got back.
  // (A test run deletes it outright, so as not to fill the real Trash, and shows no dialogs.)
  // Its highlights go with it, and so does whatever else is told of its going (its chats).
  ipcMain.handle('library:discard', async (event, file) => {
    opened.delete(file);
    try {
      gone?.(file);
    } catch {
      // (the book goes all the same)
    }
    for (const gone of [lights(file), within(file)]) {
      if (headless) fs.rmSync(gone, { recursive: true, force: true });
      else if (fs.existsSync(gone)) await shell.trashItem(gone).catch(() => {});
    }
  });
  ipcMain.handle('library:highlights', (event, file) => highlights(file));
  ipcMain.handle('library:keep-highlights', (event, file, title, list) => keepHighlights(file, title, list));
  ipcMain.handle('library:notify', (event, message) => (headless ? null : dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), { type: 'info', message: String(message) })));
  // A link in a book that leads out to the web opens in the browser.
  ipcMain.on('library:out', (event, address) => {
    if (/^(https?:|mailto:)/i.test(address)) shell.openExternal(address);
  });

  protocol.handle('book', (request) => {
    try {
      const [file, ...rest] = new URL(request.url).pathname.slice(1).split('/').map(decodeURIComponent);
      const name = rest.join('/');
      return new Response(inside(file, name), { headers: { 'content-type': KINDS[path.extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream' } });
    } catch {
      return new Response('', { status: 404 });
    }
  });
}

module.exports = { listen, folder, place, usual, move, discarded };
