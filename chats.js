// The chats: what was asked about what you read, and what was answered. They are kept here,
// in the library, because nothing of them is kept on ChatGPT's side: every question goes
// out with the whole of its conversation (connections.js), and this is the only copy.
//
//   <library>/chats.db   a database (SQLite) of two tables:
//
//     chats      one row for each conversation: the item it is about (its file within the
//                library), what it is called, the model that last answered, when it was begun and
//                when it was last added to; and, once it has grown long, a summary of its
//                older part with the last message that summary takes in
//     messages   one row for each question and each answer, in the order they came: whose
//                it is, its text, the passage a question was asked of, whether an answer is
//                whole, was stopped, or failed partway, and what was looked at in the book
//                to give it
//
// The file is made when the first question is asked, not before. Between writes it is one
// file with nothing beside it, so the library can be moved or copied as it stands; it is
// closed while the library moves. A book's chats go when the book is taken out.

const { ipcMain } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { z } = require('zod');
const library = require('./library.js');
const connections = require('./connections.js');

const VERSION = 2; // of how the tables are laid out
const TITLE = 60; // a chat is called by its first question, cut to this many letters
const UNREADABLE = [11, 26]; // what SQLite says of a file that is damaged, or is no database

const LAYOUT = `
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    file TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    made INTEGER NOT NULL,
    used INTEGER NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    summed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    quote TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'whole',
    model TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL,
    looked TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS chats_of ON chats (file, used);
  CREATE INDEX IF NOT EXISTS messages_of ON messages (chat, id);
`;
// What each later layout added to the one before it: [1] is what the second added to the first.
const ADDED = {
  1: `
    ALTER TABLE chats ADD COLUMN summary TEXT NOT NULL DEFAULT '';
    ALTER TABLE chats ADD COLUMN summed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE messages ADD COLUMN looked TEXT NOT NULL DEFAULT '[]';
  `,
};

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
      // A new one is laid out whole; one from an earlier Inquisitive is brought up to this one, a layout at a time.
      if (version < 1) db.exec(`BEGIN; ${LAYOUT} PRAGMA user_version = ${VERSION}; COMMIT;`);
      else if (version < VERSION) db.exec(`BEGIN; ${Array.from({ length: VERSION - version }, (_, i) => ADDED[version + i]).join('\n')} PRAGMA user_version = ${VERSION}; COMMIT;`);
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
// (What was looked at is kept as a list, written out.)
const listed = (text) => {
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
};
const messagesOf = (id) => store(false)?.prepare('SELECT id, role, text, quote, state, model, at, looked FROM messages WHERE chat = ? ORDER BY id').all(String(id)).map((row) => ({ ...row, looked: listed(row.looked) })) ?? [];

/** A chat and everything said in it, oldest first: { chat, messages }; null if it is not kept. */
function read(id) {
  const chat = chatOf(id);
  return chat ? { chat, messages: messagesOf(chat.id) } : null;
}

/** Adds a message to a chat, and gives it back as kept. */
function add(chat, role, text, { quote = '', state = 'whole', model = '', looked = [] } = {}) {
  const db = store(true);
  const at = Date.now();
  const { lastInsertRowid } = db.prepare('INSERT INTO messages (chat, role, text, quote, state, model, at, looked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(chat, role, text, quote, state, model, at, JSON.stringify(looked));
  db.prepare('UPDATE chats SET used = ? WHERE id = ?').run(at, chat);
  return { id: Number(lastInsertRowid), role, text, quote, state, model, at, looked };
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

// ---------- what the model may look at ----------
// The model is told only what is being read: its title, and who wrote it. The rest it asks
// for itself, when a question needs it, with these. The window that has the book open
// answers (renderer/app.js), since it is the one that has read it.

const LOOKS = [
  { name: 'contents', description: 'The contents of what the reader has open: how many sections it has, and its chapters in order, each with the number of the section it begins in. In a PDF, the sections are its pages.', input: {} },
  {
    name: 'read',
    description: 'The words of one section of what the reader has open, by its number (in a PDF, a page). A long section comes a part at a time: the reply says where the next part begins.',
    input: {
      section: z.number().int().min(1).describe('The number of the section, counting from 1.'),
      from: z.number().int().min(0).optional().describe('Where in the section to begin, in letters from its start: for a part after the first.'),
    },
  },
  {
    name: 'search',
    description: 'Looks through the whole of what the reader has open for a word or an exact phrase, whatever its capitals or accents, and gives the places it is found: each with its section and the words around it. One telling word finds more than a phrase does.',
    input: { query: z.string().min(1).describe('The word or phrase to look for.') },
  },
  { name: 'place', description: 'Where the reader is now in what they have open: the section (in a PDF, the page), the chapter it is in, and the words on their screen. For when they ask about "this page", "here", "this part", or what they are reading just now.', input: {} },
  { name: 'highlights', description: 'What the reader has highlighted in what they have open, in the order it comes: each passage with its section, and the note they wrote beside it if they wrote one.', input: {} },
];
const LOOKING =
  'You can look at what they are reading with your tools: its contents, the words of any section of it, a search through the whole of it, where the reader is in it now, and what they have highlighted and noted in it. Look before you answer whenever the answer depends on what it says or on where they are, and do not guess at its words. When you point to a place in it, make that a link to its section, like [Chapter 3](#section-5) (in a PDF, [page 12](#section-12)), so that the reader can go there.';
const LOOK_WAIT = 60e3; // how long the window has to answer

/** What a tool takes, as JSON Schema. */
function schemaOf(input) {
  const { $schema, ...schema } = z.toJSONSchema(z.object(input));
  return schema;
}

const looks = new Map(); // what has been asked of a window and not yet answered, by its key

/** Asks the window an ask came from to look something up in the book it has open: resolves
    with { text, label }: what it found, in words (or why it could not), and what it looked
    at, in a few words for the reader (none, if it looked at nothing). */
function lookAt(sender, id, name, input) {
  return new Promise((resolve) => {
    if (sender.isDestroyed()) return resolve({ text: 'The book is no longer open.', label: '' });
    const key = crypto.randomUUID();
    const done = (text, label = '') => {
      clearTimeout(timer);
      looks.delete(key);
      resolve({ text, label });
    };
    const timer = setTimeout(() => done('The book took too long to answer.'), LOOK_WAIT);
    looks.set(key, done);
    sender.send('chats:look', key, id, name, input ?? {});
  });
}

// ---------- what the model is told of its part ----------

const BRIEF =
  'You are a well-read companion to someone reading a book, an article or a paper. Answer plainly and briefly. Write in Markdown, and lightly: a short list or a small table where it truly helps, and no headings.';
// (A drawing is an SVG in the answer's own words: the window draws it, and it is kept with the answer.)
const DRAWING =
  'When a picture would explain something better than words (a family tree, a timeline, how an argument is built, who stands where), draw one: a single SVG in a fenced code block marked svg, with a line of words before it. Give it a viewBox about 600 wide and no width or height. It is shown on pale paper. Use only shapes, lines, paths and text, coloured by fill and stroke attributes: currentColor (a dark ink) for lines and words, and at most three soft, pale colours beside it. No styles, classes, scripts, images or links. Keep its words few, and at least 13 units high. Draw only when it earns its place.';

// ---------- long chats ----------
// A chat is sent whole with every question, so one that has grown long is cut down for the
// model: its older part is summarised once (by the model in use, after an answer, when the
// part not yet summarised passes COMPACT_AT), and from then on the summary goes in place of
// those messages. Nothing is taken from what is kept, or from what the reader sees. The way
// of it is pi's (its coding agent's compaction): the latest of the conversation is left as it
// is, the cut falls where a question begins, and a summary already made is added to, not
// made again.

const COMPACT_AT = 120e3; // letters not yet summarised, at which the older part is (about 30,000 tokens)
const KEPT_WHOLE = 40e3; // letters of the latest conversation left as they are (about 10,000 tokens)
const SUMMARY = `The messages above are a conversation between a reader and you, about what they are reading. Write the summary of it that you will be given later in place of these messages, so that the conversation can go on.

Use this format:

## What the reader is after
[What they want from the book and from you, as far as it has shown.]

## What has been said
- [Each thing asked and what was answered, with the chapter or section it rests on.]

## Still open
- [Questions left unanswered, or "(none)".]

## How they like to be answered
- [Anything they have asked for: length, manner, what to leave out. Or "(none)".]

Keep it short. Keep names, chapter and section numbers and quotations exact.`;
const SUMMARY_ON = `The messages above are NEW messages of the conversation, to be taken into the summary given in <previous-summary> tags. Keep what is there, add what is new, and leave out only what no longer matters. Use the same format, and keep names, chapter and section numbers and quotations exact.`;

const summing = new Set(); // the chats being summarised just now

// A message as it is set down for the summary.
const spoken = (one) => `${one.role === 'assistant' ? 'You' : 'The reader'}:\n${sent(one)}`;

/** Summarises the older part of a chat that has grown long (see above). It is done after an
    answer, out of the reader's way; if it cannot be done, it is tried again after the next. */
async function shorten(id) {
  const chat = chatOf(id);
  if (!chat || summing.has(chat.id)) return;
  const fresh = messagesOf(chat.id).filter((one) => one.id > chat.summed);
  const size = (list) => list.reduce((sum, one) => sum + sent(one).length, 0);
  if (size(fresh) < COMPACT_AT) return;
  // The cut: back from the end until enough is left whole, then on to where a question begins.
  let cut = fresh.length;
  for (let whole = 0; cut > 0 && whole < KEPT_WHOLE; cut--) whole += sent(fresh[cut - 1]).length;
  while (cut < fresh.length && fresh[cut].role !== 'user') cut++;
  const older = fresh.slice(0, cut);
  if (!older.length || cut === fresh.length) return;
  summing.add(chat.id);
  try {
    const text = `${chat.summary ? `<previous-summary>\n${chat.summary}\n</previous-summary>\n\n` : ''}${older.map(spoken).join('\n\n')}\n\n${chat.summary ? SUMMARY_ON : SUMMARY}`;
    const made = await connections.once('summary-' + chat.id, { system: 'You keep the notes of a conversation, so that it can go on when its older messages are put away.', text });
    // (A summary is kept only if it is one: the chat may also have been taken away meanwhile.)
    if (made.ok && made.text.trim() && chatOf(chat.id)) store(false)?.prepare('UPDATE chats SET summary = ?, summed = ? WHERE id = ?').run(made.text.trim(), older.at(-1).id, chat.id);
  } catch {
    // not this time
  } finally {
    summing.delete(chat.id);
  }
}

/** What of a chat goes to the model: the messages its summary does not take in, and that
    summary as a line more to tell it. Should the summary not have been made (the model could
    not be asked, say) and the chat be very long, the oldest of it is left out. */
function spokenTo(chat) {
  let list = messagesOf(chat.id).filter((one) => one.id > chat.summed);
  for (let size = list.reduce((sum, one) => sum + sent(one).length, 0); size > 2 * COMPACT_AT && list.length > 2; list = list.slice(1)) size -= sent(list[0]).length;
  while (list.length > 1 && list[0].role !== 'user') list = list.slice(1);
  return { messages: list.map((one) => ({ role: one.role, text: sent(one) })), summary: chat.summary ? `This conversation has gone on for a while. Its earlier part, in summary:\n${chat.summary}` : '' };
}

// ---------- asking ----------

const answering = new Set(); // the chats with a question out: one at a time in each

/** What the model is told of what is being read: its title, and who wrote it. */
function reading(about) {
  const title = String(about?.title ?? '').trim();
  const author = String(about?.author ?? '').trim();
  return title ? `The reader is reading “${title}”${author ? ` by ${author}` : ''}.` : '';
}

// A question as it is sent: the passage it was asked of first, set apart, then the question.
const sent = (message) => (message.quote ? message.quote.split('\n').map((line) => '> ' + line).join('\n') + '\n\n' + message.text : message.text);

/** Asks a question in a chat, and keeps both it and what comes back. `chat` names the chat;
    without it a new one is begun, about `file` (an item's file within the library) if that
    is given, and called by the question. `quote` is the passage the question is asked of,
    and `about` what is being read ({ title, author }), which the model is told.

    It tells of what happens as it does: first { chat, question }, once the question is kept;
    then { delta } for each piece of the answer; then one of { done, answer }, { stopped,
    answer } or { error, code, answer }. `answer` is the answer as kept. What had come of one
    that was stopped or failed is kept too, marked so; if nothing had, there is no answer
    (null), and the question stays.

    `look` is how the model's tools reach the book: (name, input), giving { text, label }. With
    it, in a chat about an item, the model may look at the item as it answers; each time it
    does, { looking: the tool's name } is told, and the answer's words begin again. What it
    looked at is kept with the answer (`looked`, a few words for each).

    With `again`, nothing new is asked: the chat's last question is asked once more, and the
    answer it had (if it had one) gives way to the new one. */
async function ask(id, { chat: into, file, text, quote, about, again }, tell, look) {
  const asked = String(text ?? '').trim();
  if (!asked && !again) return void tell({ error: 'There is nothing to ask.', code: 'empty' });
  // (With no model to ask, nothing is kept: the question would only sit there unanswered.)
  if (!(await connections.model().catch(() => null))) return void tell({ error: 'No model is connected. Connect one in Settings.', code: 'no-model' });
  let chat = null;
  let question = null;
  try {
    const db = store(true);
    chat = into ? chatOf(into) : null;
    if (into && !chat) return void tell({ error: 'That chat is no longer kept.', code: 'no-chat' });
    if (chat && answering.has(chat.id)) return void tell({ error: 'This chat is still being answered.', code: 'busy' });
    if (again && !chat) return void tell({ error: 'That chat is no longer kept.', code: 'no-chat' });
    db.exec('BEGIN');
    try {
      if (again) {
        const said = messagesOf(chat.id);
        if (said.at(-1)?.role === 'assistant') db.prepare('DELETE FROM messages WHERE id = ?').run(said.pop().id);
        question = said.at(-1)?.role === 'user' ? said.at(-1) : null;
        if (!question) throw new Error('there is no question to ask again');
      } else {
      if (!chat) {
        const now = Date.now();
        const title = asked.replace(/\s+/g, ' ');
        chat = { id: crypto.randomUUID(), file: String(file ?? ''), title: title.length > TITLE ? title.slice(0, TITLE - 1).trimEnd() + '…' : title, model: '', made: now, used: now, summary: '', summed: 0 };
        db.prepare('INSERT INTO chats (id, file, title, model, made, used) VALUES (?, ?, ?, ?, ?, ?)').run(chat.id, chat.file, chat.title, chat.model, chat.made, chat.used);
      }
      question = add(chat.id, 'user', asked, { quote: String(quote ?? '').trim() });
      }
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

  // The conversation goes out, oldest first (its older part in summary, once it has grown
  // long). How it ended is the last thing heard.
  let end = null;
  const looked = []; // what was looked at in the book for this answer
  try {
    const { messages, summary } = spokenTo(chat);
    const seen = async (name, input) => {
      const { text: found, label } = await look(name, input);
      if (label && looked.at(-1) !== label) looked.push(label);
      return found;
    };
    // (What each takes is given both ways it is asked for: as zod has it, and as JSON Schema.)
    const tools = look && chat.file ? { note: LOOKING, list: LOOKS.map((one) => ({ ...one, schema: schemaOf(one.input), run: (input) => seen(one.name, input) })) } : null;
    await connections.ask(id, { messages, thread: chat.id, system: BRIEF, about: [reading(about), DRAWING, summary].filter(Boolean).join(' '), tools }, (part) => (part.delta || part.looking ? tell(part) : (end = part)));
  } catch (error) {
    end = { error: `The question could not be asked (${error.message}).`, code: 'not-asked' };
  } finally {
    answering.delete(chat.id);
  }
  end ??= { error: 'The answer stopped before it was finished.', code: 'cut-short' };

  let answer = null;
  try {
    // (The chat may have been taken away while it was being answered: then there is nowhere to keep it.)
    if (end.text && chatOf(chat.id)) answer = add(chat.id, 'assistant', end.text, { state: end.done ? 'whole' : end.stopped ? 'stopped' : 'failed', model: end.model ?? '', looked });
    if (end.model) store(false)?.prepare('UPDATE chats SET model = ? WHERE id = ?').run(end.model, chat.id);
  } catch (error) {
    return void tell({ error: `The answer could not be kept (${error.message}).`, code: 'not-kept', answer: null });
  }
  if (end.done) shorten(chat.id); // (a chat grown long is summarised for the next question, out of the way of this answer)
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
    ask(String(id), request ?? {}, tell, (name, input) => lookAt(event.sender, String(id), name, input));
  });
  ipcMain.on('chats:looked', (event, key, text, label) => looks.get(String(key))?.(String(text ?? ''), String(label ?? '')));
  // Whether the model in use can look at the book itself (so the window knows what to offer).
  ipcMain.handle('chats:sees', () => connections.sees().catch(() => false));
  ipcMain.on('chats:stop', (event, id) => connections.stop(id));
  library.discarded(forget);
}

module.exports = { listen, close };
