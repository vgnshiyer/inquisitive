// The chat end to end, with real clicks and typing: written answers, drawings, places, what was looked at, copy, again, rename, delete, starters, a long chat summarised, an older database brought up.
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { startMock } from './helpers/aimock.mjs';
import { start } from './helpers/base.mjs';
const S = import.meta.dirname, out = S + '/out/chatfull';
const STATE = S + '/out/fake'; mkdirSync(STATE, { recursive: true }); process.env.INQUISITIVE_TEST_STATE = STATE; // where the stand-ins note down how they were run
rmSync(out, { recursive: true, force: true }); cpSync(S + '/fixtures/library', out + '/library', { recursive: true }); mkdirSync(out + '/claude-config');
const profile = os.tmpdir() + '/inquisitive-test'; for (const f of ['assistant.json', 'connections.json']) rmSync(profile + '/' + f, { force: true });
const fake = S + '/fake/claude', sdkCalls = STATE + '/sdk-calls.jsonl', cliCalls = STATE + '/calls.jsonl';
writeFileSync(STATE + '/state.json', JSON.stringify({ signedIn: true })); rmSync(cliCalls, { force: true }); rmSync(sdkCalls, { force: true }); chmodSync(fake, 0o755);
const lines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const CODEX = Boolean(process.env.CODEX);
const db = out + '/library/chats.db';
const sql = (query) => execFileSync('sqlite3', [db, query]).toString().trim();
// A database as the first layout had it, with a chat in it: to be brought up to this layout when it is opened.
sql(`CREATE TABLE chats (id TEXT PRIMARY KEY, file TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', made INTEGER NOT NULL, used INTEGER NOT NULL); CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE, role TEXT NOT NULL, text TEXT NOT NULL, quote TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'whole', model TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL); CREATE INDEX chats_of ON chats (file, used); CREATE INDEX messages_of ON messages (chat, id); INSERT INTO chats VALUES ('old-1', 'PDFs/The Test Paper.pdf', 'An old chat', 'Claude', 1, 2); INSERT INTO messages (chat, role, text, at) VALUES ('old-1', 'user', 'An old question', 1), ('old-1', 'assistant', 'An old **answer**, kept before.', 2); PRAGMA user_version = 1;`);
const mock = await startMock();
Object.assign(process.env, { INQUISITIVE_AI_ISSUER: mock.base, INQUISITIVE_AI_RESOURCE: mock.base + '/v1', INQUISITIVE_AI_CODEX: mock.base + '/codex', INQUISITIVE_AI_CLAUDE: fake, CLAUDE_CONFIG_DIR: out + '/claude-config', INQUISITIVE_AI_SDK: S + '/fake/agent-sdk.mjs' });
const { wait, run, send, stop, logs, shot, scheme } = await start(S + '/..', out, { sample: false });
const show = (name, value) => console.log(name + '	' + JSON.stringify(value));
const api = (call) => run(`window.api.${call}.then((r) => JSON.stringify(r ?? null), (e) => JSON.stringify({ threw: e.message }))`).then(JSON.parse);
const box = (sel) => run(`JSON.stringify((() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })())`).then(JSON.parse);
const press = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await wait(150); };
const click = async (sel) => { const b = await box(sel); if (!b) throw new Error('nothing to click: ' + sel); await press((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); };
const type = (text) => send('Input.insertText', { text });
const key = async (k) => { const base = { key: k, code: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0 }; await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }); if (k === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...base }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); await wait(80); };
const busy = () => run(`document.querySelector('#chat-form').hasAttribute('data-busy')`);
const settle = async (ms = 9000) => { for (let t = 0; t < ms && (await busy()); t += 50) await wait(50); await wait(150); };
const thread = () => run(`JSON.stringify([...document.querySelector('#chat-thread').children].map((n) => [n.className, (n.querySelector('.chat-looked')?.textContent ?? ''), (n.querySelector('.chat-words') ?? n).textContent.replace(/\\s+/g, ' ').trim().slice(0, 70), [...n.querySelectorAll('.chat-act')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.dataset.act + ':' + getComputedStyle(b.parentElement).opacity)]))`).then(JSON.parse);
// Asks by typing; while the answer comes, notes what the line over it says and whether a drawing's place is kept.
const ask = async (text) => {
  await click('#chat-field'); await type(text); await key('Enter');
  const seen = [];
  for (let t = 0; t < 12000; t += 15) {
    const now = await run(`JSON.stringify((() => { const n = [...document.querySelectorAll('#chat-thread .chat-answer')].at(-1); if (!n) return null; const l = n.querySelector('.chat-looked'); return [l && !l.hidden ? (l.querySelector('.tick') ? '* ' : '') + l.textContent.replace(/^\\*/, '') : '', n.querySelector('.chat-drawing.coming') ? 'drawing…' : n.querySelector('.chat-drawing svg') ? 'drawn' : '']; })())`).then(JSON.parse);
    for (const word of now ?? []) if (word && seen.at(-1) !== word && !seen.slice(-2).includes(word)) seen.push(word);
    if (!(await busy())) break;
    await wait(15);
  }
  await wait(150);
  return seen;
};
const openItem = async (kind) => { await run(`(typeof shut === 'function' && open ? shut() : 0, 0)`); await wait(500); await run(`[...document.querySelectorAll('.card')].find((c) => c.item.kind === ${JSON.stringify(kind)}).click()`); await wait(1800); await run(`document.body.dataset.bar = 'shown'`); await wait(250); await click('[data-tool="ask"]'); await wait(700); };
const menu = () => run(`JSON.stringify([...document.querySelectorAll('.menu > *')].map((n) => (n.classList.contains('menu-line') ? '—' : n.textContent) + (n.classList.contains('on') ? '*' : '')))`).then(JSON.parse);
const pick = async (name) => { await run(`[...document.querySelectorAll('.menu .menu-item')].find((n) => n.textContent === ${JSON.stringify(name)}).click()`); await wait(350); };
const answer = (pick = 'at(-1)') => `[...document.querySelectorAll('#chat-thread .chat-answer')].${pick}`;
try {
  for (let i = 0; i < 40 && !(await run(`typeof choose === 'function' && document.readyState === 'complete' && items.length > 0`)); i++) await wait(100);
  await scheme('light');
  if (CODEX) {
    await run(`(window.__signed = undefined, window.api.assistant.signIn('codex').then((r) => (window.__signed = r)), 0)`);
    { let url = null; for (let i = 0; i < 40 && !url; i++) { await wait(50); url = await run(`window.api.assistant.pending()`); } await (await fetch(url)).text(); for (let i = 0; i < 60 && (await run(`window.__signed === undefined`)); i++) await wait(50); }
  } else { await api(`connections.connect('k1')`); await api(`connections.model('claude', 'sonnet')`); }
  await run(`relink().then(() => 0)`);
  show('0 in use, sees', [(await api(`connections.view()`)).model.name, await api(`chats.sees()`)]);

  // 1. A database from the first layout is brought up, and its chat shows as it was kept, written out.
  await openItem('pdf');
  show('1 older database', { version: sql('PRAGMA user_version'), columns: sql(`SELECT group_concat(name) FROM pragma_table_info('messages')`), chat: sql(`SELECT summary || '|' || summed FROM chats`) });
  show('1 its chat', await thread()); show('1 written', await run(`${answer()}.querySelector('.chat-words').innerHTML`));

  // 2. A book with no chat yet: what can be asked with a click; one is asked.
  await openItem('book');
  show('2 starters', await run(`JSON.stringify([...document.querySelectorAll('.chat-start')].map((b) => b.textContent))`));
  await shot('full-empty', { x: 826, y: 0, width: 354, height: 780, scale: 2 });
  await click('.chat-start'); await settle(); show('2 asked with a click', (await thread()).map((r) => r.slice(0, 3)));
  await click('[data-chat="new"]'); await wait(200);

  // 3. An answer written in Markdown: what it is made of; the place it points to is gone to.
  await ask('MARKDOWN please');
  show('3 made of', await run(`JSON.stringify((() => { const w = ${answer()}.querySelector('.chat-words'); const count = (s) => w.querySelectorAll(s).length; return { p: count('p'), strong: count('strong'), em: count('em'), ol: count('ol > li'), table: [count('th'), count('td')], code: count('code'), quote: count('blockquote'), links: [...w.querySelectorAll('a')].map((a) => [a.className, a.getAttribute('href'), a.textContent]), wraps: getComputedStyle(w).whiteSpace }; })())`));
  show('3 before going', await run(`placeNow().section + 1`));
  await click('#chat-thread a.chat-place'); await wait(900); show('3 gone to section', await run(`placeNow().section + 1`));
  // 4. What is not to be let through, is not.
  await ask('UNSAFE words');
  show('4 cleaned', await run(`JSON.stringify((() => { const w = ${answer()}.querySelector('.chat-words'); return { html: w.innerHTML, pwned: window.__pwned ?? null, imgs: w.querySelectorAll('img').length, scripts: w.querySelectorAll('script').length, handlers: [...w.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on|^style$|^class$|^data-/.test(a.name))).length }; })())`));
  // 5. A drawing: its place is kept while it comes; then it is drawn, cleaned.
  show('5 as it came', await ask('DRAW it'));
  show('5 drawn', await run(`JSON.stringify((() => { const f = ${answer()}.querySelector('.chat-drawing'); const s = f.querySelector('svg'); const r = s.getBoundingClientRect(); const col = ${answer()}.querySelector('.chat-words').getBoundingClientRect(); return { viewBox: s.getAttribute('viewBox'), width: s.getAttribute('width'), size: [Math.round(r.width), Math.round(r.height)], column: Math.round(col.width), shapes: [...s.querySelectorAll('*')].map((n) => n.localName).join(' '), bad: s.querySelectorAll('script, style, image, a, [style], [onload]').length, onload: s.hasAttribute('onload'), pwned: window.__pwned ?? null, before: f.previousElementSibling?.textContent, after: f.nextElementSibling?.textContent, ink: getComputedStyle(s.querySelector('text')).fill }; })())`));
  await shot('full-drawing', { x: 826, y: 0, width: 354, height: 780, scale: 2 });
  // 6. What was looked at: said as it is looked at, then over the answer, and kept.
  show('6 as it came', await ask('CONTENTS then READ 3 then SEARCH "lazy dog" then PLACE then HIGHLIGHTS'));
  show('6 over the answer', (await thread()).at(-1).slice(0, 2));
  show('6 kept', sql(`SELECT looked FROM messages ORDER BY id DESC LIMIT 1`));
  await ask('MARKDOWN again, after READ 99'); show('6 nothing there to read', [(await thread()).at(-1)[1], sql(`SELECT looked FROM messages ORDER BY id DESC LIMIT 1`)]);
  // 7. Copy; then the last answer asked for again: it gives way, the question stays, nothing is added.
  show('7 acts', (await thread()).slice(-3).map((r) => [r[0], r[3]]));
  await run(`(Object.defineProperty(Clipboard.prototype, 'writeText', { configurable: true, value: (t) => ((window.__copied = t), Promise.resolve()) }), 0)`);
  await click(`#chat-thread .chat-answer:last-child .chat-act[data-act="copy"]`); show('7 copied', [await run(`(window.__copied ?? '').slice(0, 60)`), await run(`${answer()}.querySelector('[data-act="copy"]').classList.contains('done')`)]);
  { const before = sql('SELECT count(*) FROM messages'); const was = sql('SELECT max(id) FROM messages'); await click(`#chat-thread .chat-answer:last-child .chat-act[data-act="again"]`); await wait(100); show('7 asked again: coming', (await thread()).slice(-2).map((r) => r[0])); await settle(); show('7 asked again', { messages: [before, sql('SELECT count(*) FROM messages')], newAnswer: sql('SELECT max(id) FROM messages') !== was, thread: (await thread()).slice(-2).map((r) => [r[0], r[2].slice(0, 30)]), asked: CODEX ? null : lines(sdkCalls).at(-1).last.slice(0, 40) }); }
  // 8. An answer that fails can be tried again; one that is stopped too.
  await ask('FAIL here'); show('8 failed', (await thread()).slice(-3).map((r) => [r[0], r[2].slice(0, 50), r[3]]));
  await click(`#chat-thread .chat-acts.shown .chat-act`); await settle(); show('8 tried again', (await thread()).slice(-3).map((r) => [r[0], r[2].slice(0, 50), r[3]]));
  // 9. Renamed where its name stands; Escape leaves it; deleted, asked twice.
  await click('[data-chat="list"]'); await wait(300); show('9 menu', await menu()); await pick('Rename'); await type('Foxes and dogs'); await key('Enter'); await wait(300);
  show('9 renamed', [await run(`document.querySelector('#chat-title').textContent`), sql(`SELECT title FROM chats ORDER BY used DESC LIMIT 1`), await run(`document.querySelector('#chat-title').isContentEditable`)]);
  await click('[data-chat="list"]'); await wait(300); await pick('Rename'); await type('Never this'); await key('Escape'); await wait(300); show('9 Escape leaves it', [await run(`document.querySelector('#chat-title').textContent`), await run(`'chat' in document.body.dataset`)]);
  { const before = sql('SELECT count(*) FROM chats'); await click('[data-chat="list"]'); await wait(300); await pick('Delete'); await wait(300); show('9 asked twice', await menu()); await pick('Keep it'); show('9 kept', [before, sql('SELECT count(*) FROM chats')]);
    await click('[data-chat="list"]'); await wait(300); await pick('Delete'); await wait(300); await pick('Delete'); await wait(500); show('9 deleted', { chats: [before, sql('SELECT count(*) FROM chats')], now: await run(`document.querySelector('#chat-title').textContent`), thread: (await thread()).length }); }
  // 10. A chat grown long: after an answer its older part is summarised; the next question carries the summary and only the later messages; the thread says where.
  await click('[data-chat="new"]'); await wait(200); await ask('The first of a long chat'); 
  { const id = sql(`SELECT id FROM chats ORDER BY used DESC LIMIT 1`); const big = 'A long passage of talk. '.repeat(650); for (let i = 0; i < 5; i++) sql(`INSERT INTO messages (chat, role, text, at, looked) VALUES ('${id}', 'user', 'Question ${i}: ${big}', ${10 + i * 2}, '[]'), ('${id}', 'assistant', 'Answer ${i}: ${big}', ${11 + i * 2}, '[]')`);
    show('10 before', { letters: sql(`SELECT sum(length(text)) FROM messages WHERE chat = '${id}'`), messages: sql(`SELECT count(*) FROM messages WHERE chat = '${id}'`), summed: sql(`SELECT summed FROM chats WHERE id = '${id}'`) });
    await ask('One more, to tip it over'); for (let t = 0; t < 40 && sql(`SELECT summed FROM chats WHERE id = '${id}'`) === '0'; t++) await wait(100);
    show('10 summarised', { summed: sql(`SELECT summed FROM chats WHERE id = '${id}'`), ids: sql(`SELECT group_concat(id) FROM messages WHERE chat = '${id}'`), summary: sql(`SELECT substr(summary, 1, 80) FROM chats WHERE id = '${id}'`), keptAll: sql(`SELECT count(*) FROM messages WHERE chat = '${id}'`) });
    if (CODEX) { const r = mock.seen.codexResponses.findLast((x) => /You keep the notes/.test(JSON.stringify(x.body.input.slice(0, 2)))); show('10 the summary was asked for', { told: JSON.stringify(r.body.input.find((i) => i.role === 'developer' && !i.type).content).slice(0, 60), letters: JSON.stringify(r.body.input).length, tools: r.body.input.some((i) => i.type === 'additional_tools') }); }
    else { const c = lines(cliCalls).at(-1); show('10 the summary was asked for', { system: c.args[c.args.indexOf('--system-prompt') + 1].slice(0, 60), begins: c.prompt.slice(0, 40), ends: c.prompt.slice(-90), letters: c.prompt.length }); }
    await ask('And after the summary');
    if (!CODEX) { const c = lines(sdkCalls).at(-1); show('10 what goes now', { letters: c.asked.length, questions: (c.asked.match(/The reader asked:/g) ?? []).length, summaryTold: /Its earlier part, in summary:\nFrom Claude Code/.test(c.system), drawingTold: /fenced code block marked svg/.test(c.system), markdownTold: /Write in Markdown/.test(c.system) }); }
    else { const r = mock.seen.codexResponses.at(-1); show('10 what goes now', { items: r.body.input.length, summaryTold: /Its earlier part, in summary:/.test(JSON.stringify(r.body.input[1])) }); }
    await click('[data-chat="list"]'); await wait(300); await run(`[...document.querySelectorAll('.menu .menu-item')].find((n) => n.classList.contains('on')).click()`); await wait(600);
    show('10 the thread says where', (await thread()).map((r) => r[0] + (r[0] === 'chat-divide' ? ':' + r[2] : '')).join(' ')); }
  // 11. How it looks, light and dark.
  await click('[data-chat="new"]'); await wait(200); await ask('CONTENTS READ 3 MARKDOWN'); await ask('DRAW after SEARCH "fox"');
  await run(`(document.querySelector('#chat-thread').scrollTop = 0, 0)`); await wait(200); await shot('full-light', { x: 826, y: 0, width: 354, height: 780, scale: 2 });
  await run(`(document.querySelector('#chat-thread').scrollTop = 1e6, 0)`); await wait(200); await shot('full-light-end', { x: 826, y: 0, width: 354, height: 780, scale: 2 });
  // 12. The thread runs under the chat's head, with the mist between: at rest nothing is touched; scrolled, what passes under is blurred and the head stays readable.
  show('12 at rest', await run(`JSON.stringify((() => { const t = document.querySelector('#chat-thread'); t.scrollTop = 0; const first = t.firstElementChild.getBoundingClientRect(); const head = document.querySelector('#chat-head').getBoundingClientRect(); const mist = getComputedStyle(document.querySelector('#chat-inner'), '::before'); return { thread: Math.round(t.getBoundingClientRect().top), firstLine: Math.round(first.top), head: [Math.round(head.top), Math.round(head.bottom)], mist: [mist.height, mist.backdropFilter, mist.zIndex], headOver: getComputedStyle(document.querySelector('#chat-head')).zIndex }; })())`));
  await run(`(document.querySelector('#chat-thread').scrollTop = 150, 0)`); await wait(250); await shot('full-mist', { x: 826, y: 0, width: 354, height: 160, scale: 3 });
  await run(`(document.querySelector('#chat-thread').scrollTop = 1e6, 0)`); await wait(200);
  await scheme('dark'); await wait(500); await run(`(document.querySelector('#chat-thread').scrollTop = 150, 0)`); await wait(250); await shot('full-mist-dark', { x: 826, y: 0, width: 354, height: 160, scale: 3 }); await run(`(document.querySelector('#chat-thread').scrollTop = 1e6, 0)`); await wait(200); await shot('full-dark-end', { x: 826, y: 0, width: 354, height: 780, scale: 2 }); await scheme('light');
  show('logs', JSON.stringify(logs.slice(0, 6)));
} finally { await stop(); mock.close(); for (const f of ['assistant.json', 'connections.json']) rmSync(profile + '/' + f, { force: true }); }
