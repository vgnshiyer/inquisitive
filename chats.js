// The chats: what was asked about what you read, and what was answered. They are kept here,
// in the library, because nothing of them is kept on ChatGPT's side: every question goes
// out with the whole of its conversation (connections.js), and this is the only copy.
//
//   <library>/chats.db   a database (SQLite) of two tables:
//
//     chats      one row for each conversation: the item it is about (its file within the
//                library), what it is called, the model that last answered, when it was begun and
//                when it was last added to
//     messages   one row for each question and each answer, in the order they came: whose
//                it is, its text, the passage a question was asked of, and whether an
//                answer is whole, was stopped, or failed partway
//
// The file is made when the first question is asked, not before. Between writes it is one
// file with nothing beside it, so the library can be moved or copied as it stands; it is
// closed while the library moves. A book's chats go when the book is taken out.

const { ipcMain } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const library = require('./library.js');
const connections = require('./connections.js');

const VERSION = 1; // of how the tables are laid out
const TITLE = 60; // a chat is called by its first question, cut to this many letters
const UNREADABLE = [11, 26]; // what SQLite says of a file that is damaged, or is no database

const LAYOUT = `
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    file TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    made INTEGER NOT NULL,
    used INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    quote TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'whole',
    model TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chats_of ON chats (file, used);
  CREATE INDEX IF NOT EXISTS messages_of ON messages (chat, id);
`;

// ---------- the database ----------

let open = null; // the database in use, and the file it is: { file, db }

const where = () => path.join(library.folder(), 'chats.db');

/** Lets go of the database. It is opened again when next wanted, wherever the library then is. */
function close() {
  try {
    open?.db.close();
  } catch {
    // (already closed)
  }
  open = null;
}

/** The database, opened if it was not; with `make`, made if there is none yet. Without it,
    null where there is none: nothing is written just for looking. One that cannot be read is
    set aside, not written over, and a new one begun. One laid out by a later Inquisitive is
    left alone. */
function store(make) {
  const file = where();
  if (open?.file === file && fs.existsSync(file)) return open.db;
  close();
  if (!make && !fs.existsSync(file)) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const first of [true, false]) {
    let db = null;
    try {
      db = new DatabaseSync(file);
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (version > VERSION) throw new Error('these chats were kept by a later Inquisitive');
      db.exec('PRAGMA foreign_keys = ON');
      if (version < VERSION) db.exec(`BEGIN; ${LAYOUT} PRAGMA user_version = ${VERSION}; COMMIT;`);
      open = { file, db };
      return db;
    } catch (error) {
      try {
        db?.close();
      } catch {
        // (never opened)
      }
      if (!first || !UNREADABLE.includes(error.errcode)) throw error;
      fs.renameSync(file, path.join(path.dirname(file), `chats.unreadable-${Date.now()}.db`));
      if (!make) return null;
    }
  }
}

// (A row comes from the database as a bare object; this makes it an ordinary one, to send on.)
const plain = (row) => (row ? { ...row } : null);

// ---------- what is kept ----------

/** The chats about an item (its file within the library), the one last added to first; with
    no item named, all of them. Each says how many messages it has. */
function list(file) {
  const db = store(false);
  if (!db) return [];
  const all = file === undefined || file === null;
  const found = db.prepare(`SELECT chats.*, (SELECT count(*) FROM messages WHERE messages.chat = chats.id) AS messages FROM chats ${all ? '' : 'WHERE file = ?'} ORDER BY used DESC, made DESC`);
  return (all ? found.all() : found.all(String(file))).map(plain);
}

const chatOf = (id) => plain(store(false)?.prepare('SELECT * FROM chats WHERE id = ?').get(String(id)));
const messagesOf = (id) => store(false)?.prepare('SELECT id, role, text, quote, state, model, at FROM messages WHERE chat = ? ORDER BY id').all(String(id)).map(plain) ?? [];

/** A chat and everything said in it, oldest first: { chat, messages }; null if it is not kept. */
function read(id) {
  const chat = chatOf(id);
  return chat ? { chat, messages: messagesOf(chat.id) } : null;
}

/** Adds a message to a chat, and gives it back as kept. */
function add(chat, role, text, { quote = '', state = 'whole', model = '' } = {}) {
  const db = store(true);
  const at = Date.now();
  const { lastInsertRowid } = db.prepare('INSERT INTO messages (chat, role, text, quote, state, model, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(chat, role, text, quote, state, model, at);
  db.prepare('UPDATE chats SET used = ? WHERE id = ?').run(at, chat);
  return { id: Number(lastInsertRowid), role, text, quote, state, model, at };
}

/** Calls a chat something else. */
function rename(id, title) {
  const named = String(title ?? '').trim();
  if (named) store(false)?.prepare('UPDATE chats SET title = ? WHERE id = ?').run(named, String(id));
  return chatOf(id);
}

/** Takes a chat away, and everything said in it. */
function remove(id) {
  store(false)?.prepare('DELETE FROM chats WHERE id = ?').run(String(id));
}

/** Takes away every chat about an item: it has been taken out of the library. */
function forget(file) {
  store(false)?.prepare('DELETE FROM chats WHERE file = ?').run(String(file));
}

// ---------- asking ----------

const answering = new Set(); // the chats with a question out: one at a time in each

// A question as it is sent: the passage it was asked of first, set apart, then the question.
const sent = (message) => (message.quote ? message.quote.split('\n').map((line) => '> ' + line).join('\n') + '\n\n' + message.text : message.text);

/** Asks a question in a chat, and keeps both it and what comes back. `chat` names the chat;
    without it a new one is begun, about `file` (an item's file within the library) if that
    is given, and called by the question. `quote` is the passage the question is asked of.

    It tells of what happens as it does: first { chat, question }, once the question is kept;
    then { delta } for each piece of the answer; then one of { done, answer }, { stopped,
    answer } or { error, code, answer }. `answer` is the answer as kept. What had come of one
    that was stopped or failed is kept too, marked so; if nothing had, there is no answer
    (null), and the question stays. */
async function ask(id, { chat: into, file, text, quote }, tell) {
  const asked = String(text ?? '').trim();
  if (!asked) return void tell({ error: 'There is nothing to ask.', code: 'empty' });
  let chat = null;
  let question = null;
  try {
    const db = store(true);
    chat = into ? chatOf(into) : null;
    if (into && !chat) return void tell({ error: 'That chat is no longer kept.', code: 'no-chat' });
    if (chat && answering.has(chat.id)) return void tell({ error: 'This chat is still being answered.', code: 'busy' });
    db.exec('BEGIN');
    try {
      if (!chat) {
        const now = Date.now();
        const title = asked.replace(/\s+/g, ' ');
        chat = { id: crypto.randomUUID(), file: String(file ?? ''), title: title.length > TITLE ? title.slice(0, TITLE - 1).trimEnd() + '…' : title, model: '', made: now, used: now };
        db.prepare('INSERT INTO chats (id, file, title, model, made, used) VALUES (?, ?, ?, ?, ?, ?)').run(chat.id, chat.file, chat.title, chat.model, chat.made, chat.used);
      }
      question = add(chat.id, 'user', asked, { quote: String(quote ?? '').trim() });
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    return void tell({ error: `The question could not be kept (${error.message}).`, code: 'not-kept' });
  }
  answering.add(chat.id);
  tell({ chat: { ...chat, used: question.at }, question });

  // The whole conversation goes out, oldest first. How it ended is the last thing heard.
  let end = null;
  try {
    const messages = messagesOf(chat.id).map((one) => ({ role: one.role, text: sent(one) }));
    await connections.ask(id, { messages, thread: chat.id }, (part) => (part.delta ? tell(part) : (end = part)));
  } catch (error) {
    end = { error: `The question could not be asked (${error.message}).`, code: 'not-asked' };
  } finally {
    answering.delete(chat.id);
  }
  end ??= { error: 'The answer stopped before it was finished.', code: 'cut-short' };

  let answer = null;
  try {
    // (The chat may have been taken away while it was being answered: then there is nowhere to keep it.)
    if (end.text && chatOf(chat.id)) answer = add(chat.id, 'assistant', end.text, { state: end.done ? 'whole' : end.stopped ? 'stopped' : 'failed', model: end.model ?? '' });
    if (end.model) store(false)?.prepare('UPDATE chats SET model = ? WHERE id = ?').run(end.model, chat.id);
  } catch (error) {
    return void tell({ error: `The answer could not be kept (${error.message}).`, code: 'not-kept', answer: null });
  }
  if (end.done) tell({ done: true, answer });
  else if (end.stopped) tell({ stopped: true, answer });
  else tell({ error: end.error, code: end.code, answer });
}

// ---------- what the window can ask for ----------

function listen() {
  ipcMain.handle('chats:list', (event, file) => list(file));
  ipcMain.handle('chats:read', (event, id) => read(id));
  ipcMain.handle('chats:rename', (event, id, title) => rename(id, title));
  ipcMain.handle('chats:remove', (event, id) => remove(id));
  ipcMain.on('chats:ask', (event, id, request) => {
    const tell = (part) => !event.sender.isDestroyed() && event.sender.send('chats:part', id, part);
    ask(String(id), request ?? {}, tell);
  });
  ipcMain.on('chats:stop', (event, id) => connections.stop(id));
  library.discarded(forget);
}

module.exports = { listen, close };
