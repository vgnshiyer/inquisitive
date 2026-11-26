// The library: one folder that holds the books themselves and a file saying what is known
// about them. Everything the app keeps goes through here.
//
//   <library>/library.json   the items, where you are in each, and the collections
//   <library>/Books/…        the books (EPUBs), copied in when they are added
//   <library>/PDFs/…         the PDFs, likewise
//
// The folder is ~/Documents/Inquisitive, or wherever INQUISITIVE_LIBRARY says. A test run
// (INQUISITIVE_HEADLESS) keeps its own, apart from the real one.

const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const headless = Boolean(process.env.INQUISITIVE_HEADLESS);

const folder = () => process.env.INQUISITIVE_LIBRARY || (headless ? path.join(app.getPath('temp'), 'inquisitive-test', 'Library') : path.join(app.getPath('documents'), 'Inquisitive'));
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

/** What the library file holds; an empty library if there is none yet. One that cannot be
    read is set aside, not written over. */
function load() {
  let text;
  try {
    text = fs.readFileSync(record(), 'utf8');
  } catch {
    return { items: [], collections: [] };
  }
  try {
    const kept = JSON.parse(text);
    return { items: Array.isArray(kept.items) ? kept.items : [], collections: Array.isArray(kept.collections) ? kept.collections : [] };
  } catch {
    fs.renameSync(record(), path.join(folder(), `library.unreadable-${Date.now()}.json`));
    return { items: [], collections: [] };
  }
}

/** Writes the library file: to one side first, then into place, so a crash midway cannot
    leave half a file. */
function save(state) {
  if (!state || !Array.isArray(state.items) || !Array.isArray(state.collections)) return;
  fs.mkdirSync(folder(), { recursive: true });
  const aside = record() + '.writing';
  fs.writeFileSync(aside, JSON.stringify({ version: 1, items: state.items, collections: state.collections }, null, 2));
  fs.renameSync(aside, record());
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
    without regard to case, which some books need. */
function inside(file, name) {
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

// ---------- what the window may ask ----------

function listen() {
  ipcMain.handle('library:load', () => load());
  ipcMain.on('library:save', (event, state) => save(state));
  // A test run may name the files to add; otherwise they are always chosen in the dialog.
  ipcMain.handle('library:add', (event, paths) => add(BrowserWindow.fromWebContents(event.sender), headless && Array.isArray(paths) ? paths : null));
  ipcMain.handle('library:text', (event, file, name) => inside(file, name).toString('utf8').replace(/^﻿/, ''));
  ipcMain.handle('library:sizes', (event, file) => sizes(file));
  ipcMain.handle('library:bytes', (event, file) => fs.readFileSync(within(file))); // a whole file, for a PDF
  // Taking a book out of the library puts its file in the Trash, where it can be got back.
  // (A test run deletes it outright, so as not to fill the real Trash, and shows no dialogs.)
  ipcMain.handle('library:discard', async (event, file) => {
    opened.delete(file);
    if (headless) fs.rmSync(within(file), { force: true });
    else await shell.trashItem(within(file)).catch(() => {});
  });
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

module.exports = { listen, folder };
