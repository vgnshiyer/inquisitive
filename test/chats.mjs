// The chat store, on a test library and against a stand-in for OpenAI: asking keeps the question and the answer in chats.db.
import { cpSync, rmSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { startMock } from './helpers/aimock.mjs';
import { start } from './helpers/base.mjs';
const S = import.meta.dirname, out = S + '/out/chats';
rmSync(out, { recursive: true, force: true }); cpSync(S + '/fixtures/library', out + '/library', { recursive: true });
const keptFile = os.tmpdir() + '/inquisitive-test/assistant.json'; rmSync(keptFile, { force: true });
for (const d of ['elsewhere', 'third', 'fourth']) mkdirSync(out + '/' + d);
const mock = await startMock();
process.env.INQUISITIVE_AI_ISSUER = mock.base; process.env.INQUISITIVE_AI_RESOURCE = mock.base + '/v1'; process.env.INQUISITIVE_AI_CODEX = mock.base + '/codex';
const { wait, run, stop, logs } = await start(S + '/..', out, { sample: false });
const show = (name, value) => console.log(name + '	' + JSON.stringify(value));
let lib = out + '/library';
const sql = (query) => execFileSync('sqlite3', [lib + '/chats.db', query]).toString().trim();
const api = (call) => run(`window.api.${call}.then((r) => JSON.stringify(r ?? null), (e) => JSON.stringify({ threw: e.message }))`).then(JSON.parse);
const signIn = async (way) => {
  await run(`(window.__signed = undefined, window.api.assistant.signIn(${JSON.stringify(way ?? 'plan')}).then((r) => (window.__signed = r)), 0)`);
  let url = null; for (let i = 0; i < 40 && !url; i++) { await wait(50); url = await run(`window.api.assistant.pending()`); }
  await (await fetch(url)).text();
  for (let i = 0; i < 60 && (await run(`window.__signed === undefined`)); i++) await wait(50);
  return JSON.parse(await run(`JSON.stringify(window.__signed)`)).signedIn;
};
const ask = (id, request) => run(`(window.__parts ??= {}, window.__heard ??= (window.api.chats.onPart((id, part) => (window.__parts[id] ??= []).push(part)), true), window.api.chats.ask(${JSON.stringify(id)}, ${JSON.stringify(request)}), 0)`);
const parts = async (id, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const p = JSON.parse(await run(`JSON.stringify(window.__parts?.[${JSON.stringify(id)}] ?? [])`)); if (p.some((x) => x.done || x.error || x.stopped)) return p; await wait(100); } return JSON.parse(await run(`JSON.stringify(window.__parts?.[${JSON.stringify(id)}] ?? [])`)); };
const brief = (m) => m && { role: m.role, text: m.text.slice(0, 40), quote: m.quote, state: m.state, model: m.model };
const BOOK = 'Books/The Test Book.epub', PAPER = 'PDFs/The Test Paper.pdf';
try {
  for (let i = 0; i < 40 && !(await run(`typeof choose === 'function' && document.readyState === 'complete' && items.length > 0`)); i++) await wait(100);
  // 1. Nothing yet: looking makes no file.
  show('1 none yet', [await api(`chats.list(${JSON.stringify(BOOK)})`), await api(`chats.list()`), await api(`chats.read('nope')`), 'file', existsSync(lib + '/chats.db')]);
  await ask('e0', { file: BOOK, text: '   ' }); show('1 nothing to ask', [(await parts('e0')).at(-1), 'file', existsSync(lib + '/chats.db')]);
  // 2. A first question, of a passage: a new chat about the book.
  show('2 signed in', await signIn());
  await ask('a1', { file: BOOK, text: 'What does this   mean, and why does the author put it here rather than later on in the chapter?', quote: 'It was a dark night.\nThe rain fell.' });
  const a1 = await parts('a1'); const chat = a1[0].chat;
  show('2 parts', { first: Object.keys(a1[0]), deltas: a1.filter((x) => x.delta).length, last: { done: a1.at(-1).done, answer: brief(a1.at(-1).answer) } });
  show('2 chat', { id: /^[0-9a-f-]{36}$/.test(chat.id), file: chat.file, title: chat.title, length: chat.title.length });
  show('2 question', brief(a1[0].question));
  { const r = mock.seen.responses.at(-1); show('2 what went out', { input: r.body.input, model: r.body.model, thread: r.headers['session-id'] === chat.id, store: r.body.store }); }
  show('2 file', { made: existsSync(lib + '/chats.db'), beside: readdirSync(lib).filter((n) => n.startsWith('chats')), version: sql('PRAGMA user_version') });
  show('2 listed', (await api(`chats.list(${JSON.stringify(BOOK)})`)).map((c) => ({ title: c.title.slice(0, 20), model: c.model, messages: c.messages, used: c.used >= c.made })));
  show('2 for another item', await api(`chats.list(${JSON.stringify(PAPER)})`));
  // 3. A second question in it: the whole conversation goes out, to the model it last asked.
  await ask('a2', { chat: chat.id, text: 'And then?' }); const a2 = await parts('a2');
  { const r = mock.seen.responses.at(-1); show('3 what went out', { roles: r.body.input.map((m) => m.role), last: r.body.input.at(-1).content, model: r.body.model }); }
  show('3 read', (await api(`chats.read(${JSON.stringify(chat.id)})`)).messages.map((m) => [m.id, m.role, m.state, m.text.slice(0, 14)]));
  show('3 models asked for', mock.seen.models);
  // 4. Stopped, failed, refused.
  await ask('s1', { chat: chat.id, text: 'SLOW' }); await wait(500);
  await ask('s2', { chat: chat.id, text: 'while it answers' }); show('4 one at a time', (await parts('s2')).at(-1));
  await run(`window.api.chats.stop('s1')`); { const p = await parts('s1'); show('4 stopped', { deltas: p.filter((x) => x.delta).length, stopped: p.at(-1).stopped, answer: brief(p.at(-1).answer) }); }
  await ask('f1', { chat: chat.id, text: 'FAIL please' }); show('4 failed midway', (({ answer, ...rest }) => ({ ...rest, answer: brief(answer) }))((await parts('f1')).at(-1)));
  await ask('f2', { chat: chat.id, text: 'LIMIT' }); show('4 over the limit', (await parts('f2')).at(-1));
  await ask('f3', { chat: 'no-such-chat', text: 'hello' }); show('4 a chat not kept', (await parts('f3')).at(-1));
  show('4 kept', sql(`SELECT group_concat(role || ':' || state, ' ') FROM messages`));
  // 5. Another chat about the book, one about the paper, one about nothing.
  await ask('b1', { file: BOOK, text: 'A second chat' }); await parts('b1');
  await ask('p1', { file: PAPER, text: 'About the paper' }); const paper = (await parts('p1'))[0].chat;
  await ask('n1', { text: 'About nothing in particular' }); await parts('n1');
  show('5 by item', { book: (await api(`chats.list(${JSON.stringify(BOOK)})`)).map((c) => c.title.slice(0, 16)), paper: (await api(`chats.list(${JSON.stringify(PAPER)})`)).length, none: (await api(`chats.list('')`)).length, all: (await api(`chats.list()`)).length });
  // 6. Renamed, taken away.
  show('6 renamed', [(await api(`chats.rename(${JSON.stringify(paper.id)}, '  The paper  ')`)).title, (await api(`chats.rename(${JSON.stringify(paper.id)}, '   ')`)).title, await api(`chats.rename('nope', 'x')`)]);
  { const b = (await api(`chats.list(${JSON.stringify(BOOK)})`))[0]; await api(`chats.remove(${JSON.stringify(b.id)})`); show('6 taken away', { chats: sql('SELECT count(*) FROM chats'), itsMessages: sql(`SELECT count(*) FROM messages WHERE chat = '${b.id}'`), read: await api(`chats.read(${JSON.stringify(b.id)})`) }); }
  // 7. The library moves: the chats go with it, and are asked in where it now is.
  show('7 moved', await api(`settings.move(${JSON.stringify(out + '/elsewhere')})`));
  lib = out + '/elsewhere/library';
  show('7 after', { left: existsSync(out + '/library'), there: readdirSync(lib).filter((n) => n.startsWith('chats')), chats: (await api(`chats.list()`)).length });
  await ask('m1', { chat: chat.id, text: 'After the move' }); show('7 asked there', brief((await parts('m1')).at(-1).answer));
  // 8. The book is taken out of the library: its chats go, the others stay.
  await api(`library.discard(${JSON.stringify(BOOK)})`);
  show('8 book taken out', { book: (await api(`chats.list(${JSON.stringify(BOOK)})`)).length, all: (await api(`chats.list()`)).map((c) => c.title), messages: sql('SELECT count(*) FROM messages') });
  // 9. Asking signed out: the question stays, there is no answer.
  await run(`window.api.assistant.signOut()`); await wait(300);
  await ask('o1', { chat: paper.id, text: 'Signed out' }); show('9 signed out', (await parts('o1')).at(-1));
  show('9 kept', (await api(`chats.read(${JSON.stringify(paper.id)})`)).messages.map((m) => [m.role, m.text.slice(0, 16)]));
  // 10. A database from a later Inquisitive is left alone. (A move lets go of the file first.)
  await api(`settings.move(${JSON.stringify(out + '/third')})`); lib = out + '/third/library'; sql('PRAGMA user_version = 99');
  show('10 a later layout', { list: await api(`chats.list()`), chats: sql('SELECT count(*) FROM chats') }); sql('PRAGMA user_version = 2');
  // 11. One that cannot be read is set aside; looking makes no new one, asking does.
  await api(`settings.move(${JSON.stringify(out + '/fourth')})`); lib = out + '/fourth/library';
  writeFileSync(lib + '/chats.db', 'this is not a database at all, not even a little, and it goes on for more than a hundred bytes so that a header can be read from it');
  show('11 unreadable', { list: await api(`chats.list()`), beside: readdirSync(lib).filter((n) => n.startsWith('chats')).map((n) => n.replace(/\d{10,}/, 'TIME')) });
  await signIn(); await ask('z1', { file: PAPER, text: 'Begun again' }); show('11 begun again', { answer: brief((await parts('z1')).at(-1).answer), beside: readdirSync(lib).filter((n) => n.startsWith('chats')).map((n) => n.replace(/\d{10,}/, 'TIME')).sort(), chats: sql('SELECT count(*) FROM chats') });
  show('logs', JSON.stringify(logs.slice(0, 4)));
} finally { await stop(); mock.close(); rmSync(keptFile, { force: true }); }
