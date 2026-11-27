// The model's tools (contents, read, search), with Claude in use: a stand-in for the Agent SDK asks for them, and the page answers.
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { startMock } from './helpers/aimock.mjs';
import { start } from './helpers/base.mjs';
const S = import.meta.dirname, out = S + '/out/tools';
const STATE = S + '/out/fake'; mkdirSync(STATE, { recursive: true }); process.env.INQUISITIVE_TEST_STATE = STATE; // where the stand-ins note down how they were run
rmSync(out, { recursive: true, force: true }); cpSync(S + '/fixtures/library', out + '/library', { recursive: true }); mkdirSync(out + '/claude-config');
const profile = os.tmpdir() + '/inquisitive-test'; for (const f of ['assistant.json', 'connections.json']) rmSync(profile + '/' + f, { force: true });
const fake = S + '/fake/claude', sdkCalls = STATE + '/sdk-calls.jsonl';
writeFileSync(STATE + '/state.json', JSON.stringify({ signedIn: true })); rmSync(STATE + '/calls.jsonl', { force: true }); rmSync(sdkCalls, { force: true }); chmodSync(fake, 0o755);
const calls = () => (existsSync(sdkCalls) ? readFileSync(sdkCalls, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const mock = await startMock();
Object.assign(process.env, { INQUISITIVE_AI_ISSUER: mock.base, INQUISITIVE_AI_RESOURCE: mock.base + '/v1', INQUISITIVE_AI_CODEX: mock.base + '/codex', INQUISITIVE_AI_ANTHROPIC: mock.base + '/anthropic', INQUISITIVE_AI_CLAUDE: fake, CLAUDE_CONFIG_DIR: out + '/claude-config' });
const CODEX = Boolean(process.env.CODEX); // with ChatGPT in use (signed in the Codex way), through pi's loop, in place of Claude
if (!process.env.NO_SDK) process.env.INQUISITIVE_AI_SDK = S + '/fake/agent-sdk.mjs';
const { wait, run, send, stop, logs } = await start(S + '/..', out, { sample: false });
const show = (name, value) => console.log(name + '	' + JSON.stringify(value));
const api = (call) => run(`window.api.${call}.then((r) => JSON.stringify(r ?? null), (e) => JSON.stringify({ threw: e.message }))`).then(JSON.parse);
const box = (sel) => run(`JSON.stringify((() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })())`).then(JSON.parse);
const click = async (sel) => { const b = await box(sel); const x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2; await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await wait(150); };
const type = (text) => send('Input.insertText', { text });
const enter = async () => { const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }; await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }); await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...base }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); await wait(60); };
const busy = () => run(`document.querySelector('#chat-form').hasAttribute('data-busy')`);
const lastOf = () => run(`JSON.stringify((() => { const all = [...document.querySelector('#chat-thread').children]; const n = all.at(-1); return n ? [n.className, n.textContent, Boolean(n.querySelector('.tick'))] : null; })())`).then(JSON.parse);
// Asks by typing, and watches the answer as it comes: each state it passes through (how many letters, whether the asterisk ticks).
const ask = async (text, { watch = false, ms = 9000 } = {}) => {
  await type(text); await enter();
  const seen = [];
  for (let t = 0; t < ms; t += 20) {
    const now = await lastOf();
    if (watch && now?.[0] === 'chat-answer') { const state = now[2] ? 'tick' : /^Let me look/.test(now[1]) ? 'preamble' : 'answer'; if (seen.at(-1) !== state) seen.push(state); }
    if (!(await busy())) break;
    await wait(20);
  }
  await wait(120);
  const thread = await run(`JSON.stringify([...document.querySelector('#chat-thread').children].slice(-2).map((n) => [n.className, n.textContent]))`).then(JSON.parse);
  return { seen, answer: thread.find((r) => r[0] === 'chat-answer')?.[1] ?? null, state: thread.filter((r) => r[0].startsWith('chat-state')).map((r) => r[1]) };
};
const openItem = async (kind) => { await run(`(shut?.(), 0)`); await wait(500); await run(`[...document.querySelectorAll('.card')].find((c) => c.item.kind === ${JSON.stringify(kind)}).click()`); await wait(1800); await run(`document.body.dataset.bar = 'shown'`); await wait(250); await click('[data-tool="ask"]'); await wait(600); await click('[data-chat="new"]'); };
const cut = (text, n = 260) => (text == null ? text : text.length > n ? text.slice(0, n) + ` …(${text.length})` : text);
try {
  for (let i = 0; i < 40 && !(await run(`typeof choose === 'function' && document.readyState === 'complete' && items.length > 0`)); i++) await wait(100);
  // Claude, connected through the stand-in for Claude Code, and in use.
  const ENDPOINT = process.env.ENDPOINT; // with a model added by its address in use: 'anthropic' (a key), 'local' (none wanted), or 'notools' (a local one that takes no tools)
  if (ENDPOINT) {
    const draft = ENDPOINT === 'anthropic' ? { url: mock.base + '/anthropic', key: 'sk-ant-test', model: 'claude-opus-5-5' } : { url: mock.base + '/oai/v1', key: '', model: ENDPOINT === 'notools' ? 'llama3.2' : 'qwen3' };
    show('0 added', await api(`connections.save('k1', ${JSON.stringify(draft)})`));
    const view = await api(`connections.view()`); const added = view.providers.find((p) => p.api); await api(`connections.model(${JSON.stringify(added.id)}, ${JSON.stringify(draft.model)})`); show('0 in use', [(await api(`connections.view()`)).model, await api(`chats.sees()`)]);
  } else if (CODEX) {
    await run(`(window.__signed = undefined, window.api.assistant.signIn('codex').then((r) => (window.__signed = r)), 0)`);
    { let url = null; for (let i = 0; i < 40 && !url; i++) { await wait(50); url = await run(`window.api.assistant.pending()`); } await (await fetch(url)).text(); for (let i = 0; i < 60 && (await run(`window.__signed === undefined`)); i++) await wait(50); }
    show('0 signed in', await run(`JSON.stringify([window.__signed.signedIn, window.__signed.way])`)); show('0 in use', (await api(`connections.view()`)).model);
  } else {
  show('0 connected', await api(`connections.connect('k1')`));
  { const view = await api(`connections.view()`); const claude = view.providers.find((p) => p.id === 'claude'); show('0 claude offers', claude.models.map((m) => m.id)); await api(`connections.model('claude', ${JSON.stringify(claude.models.find((m) => m.id === 'sonnet')?.id ?? claude.models[0].id)})`); show('0 in use', (await api(`connections.view()`)).model); }
  }
  await run(`relink().then(() => 0)`);
  show('0 kinds', await run(`JSON.stringify(items.map((i) => [i.kind, i.title]))`));

  // 1. A book: the contents. The words before the tool was used give way to the asterisk, then to the answer.
  await openItem('book');
  { const r = await ask('CONTENTS please', { watch: true }); show('1 as it came', r.seen); show('1 answer', cut(r.answer, 600)); }
  if (ENDPOINT) { const sent = ENDPOINT === 'anthropic' ? mock.seen.anthropic.slice(-2).map((b) => ({ tools: (b.tools ?? []).map((t) => t.name), messages: b.messages.map((m) => m.role + ':' + (Array.isArray(m.content) ? m.content.map((c) => c.type).join('+') : 'text')), effort: b.output_config ?? null })) : mock.seen.chat.slice(-3).map((c) => ({ auth: c.auth, tools: (c.body.tools ?? []).map((t) => t.function.name), roles: c.body.messages.map((m) => m.role) })); show('1 what went out', sent); }
  else if (CODEX) { const all = mock.seen.codexResponses.slice(-2); const first = all[0], second = all[1]; show('1 two asks went out', all.map((r) => r.body.input.map((i) => i.role ?? i.type))); show('1 ChatGPT was given', { model: first.body.model, headers: first.headers, store: first.body.store, stream: first.body.stream, reasoning: first.body.reasoning ?? null, tool_choice: first.body.tool_choice, verbosity: first.body.text, tools: first.body.input[0].tools.map((t) => [t.name, Object.keys(t.parameters?.properties ?? {})]) }); show('1 it was told', JSON.stringify(first.body.input[1]).slice(0, 900)); show('1 what the tool gave went back', JSON.stringify(second.body.input.at(-1)).slice(0, 200)); }
  else if (!process.env.NO_SDK) { const c = calls().at(-1); show('1 the SDK was given', { model: c.model, tools: c.tools, allowed: c.allowed, strict: c.strict, sources: c.sources, persist: c.persist, turns: c.turns, program: c.program === fake, cwd: c.cwd.replace(os.tmpdir(), 'TMP'), offered: c.offered, app: c.app }); show('1 it was told', c.system); show('1 asked', c.last); }
  // 2. Reading: a section, one that is not there, a part after the first, a wrong kind of number.
  show('2 read 2', cut((await ask('READ 2')).answer, 420));
  show('2 read 99', (await ask('READ 99')).answer);
  show('2 read 2 from 40', cut((await ask('READ 2 FROM 40')).answer, 200));
  show('2 read "two"', (await ask('BADREAD')).answer);
  // 3. Searching: found, not found, nothing asked for.
  show('3 search', cut((await ask('SEARCH "the"')).answer, 700));
  show('3 search capitals', cut((await ask('SEARCH "THE TEST"')).answer, 300));
  show('3 not found', (await ask('SEARCH "zzzzqq"')).answer);
  // 4. Several in one answer; then a second question in the same chat carries the conversation.
  { const r = await ask('CONTENTS then READ 1 then SEARCH "chapter"', { watch: true }); show('4 as it came', r.seen); show('4 answer', cut(r.answer, 200)); }
  if (ENDPOINT) show('4 the next ask carries the chat', 'see 1');
  else if (CODEX) show('4 the next ask carries the chat', mock.seen.codexResponses.at(-1).body.input.map((i) => (i.role ?? i.type) + ':' + JSON.stringify(i.content ?? i.output ?? i.arguments ?? '').length));
  else if (!process.env.NO_SDK) show('4 the next ask carries the chat', cut(calls().at(-1).asked, 200));
  show('4 kept', execFileSync('sqlite3', [out + '/library/chats.db', `SELECT role || ':' || state || ':' || length(text) || ':' || model FROM messages ORDER BY id DESC LIMIT 2`]).toString().trim().split('\n'));
  // 5. No tool used; gone round too often; could not be run; stopped while it was looking.
  show('5 no tool', (await ask('Just say hello')).answer);
  { const r = await ask('CONTENTS LOOP'); show('5 too many turns', [r.answer, r.state]); }
  { const r = await ask('FAIL now'); show('5 failed', [r.answer, r.state]); }
  if (CODEX && !ENDPOINT) { const r = await ask('NOSUCH'); show('5 a tool that is not there', cut(r.answer, 200)); const l = await ask('LIMIT'); show('5 over the limit', [l.answer, l.state]); }
  { await type('SLOW CONTENTS READ 1'); await enter(); await wait(500); show('5 while looking', await lastOf()); await click('#chat-send'); for (let t = 0; t < 40 && (await busy()); t++) await wait(50); await wait(150); show('5 stopped', await run(`JSON.stringify([...document.querySelector('#chat-thread').children].slice(-2).map((n) => [n.className, n.textContent.slice(0, 60)]))`)); }
  // 5b. Where the reader is: read in pages and by scrolling, the words given are the ones on the screen. What is highlighted and noted.
  if (!process.env.NO_SDK) {
    await click('[data-chat="new"]');
    // What the place tool says, and where on the screen the first and last of the letters it names are drawn.
    const placed = async (name) => {
      const a = (await ask('PLACE')).answer; show(name, cut(a, 230)); const m = /letters (\d+) to (\d+)/.exec(a); if (!m) return;
      show(name + ': drawn', await run(`JSON.stringify((() => { const s = placeNow().section; const w = linesOf(rootOf(s)); const box = (i) => { for (let k = i; k < w.text.length; k++) { const [b] = rangeOf(w.nodes, k, k + 1).getClientRects(); if (b && (b.width || b.height)) return [Math.round(b.left), Math.round(b.top), Math.round(b.bottom)]; } return null; }; const back = (i) => { for (let k = i; k >= 0; k--) { const [b] = rangeOf(w.nodes, k, k + 1).getClientRects(); if (b && (b.width || b.height)) return [Math.round(b.left), Math.round(b.top), Math.round(b.bottom)]; } return null; }; const f = $('reading').getBoundingClientRect(); return { section: s + 1, of: w.text.length, frame: [Math.round(f.left), Math.round(f.top), Math.round(f.right), Math.round(f.bottom)], first: box(${m[1]}), justBefore: ${m[1]} > 0 ? back(${m[1]} - 1) : null, last: back(${m[2]} - 1), justAfter: ${m[2]} < w.text.length ? box(${m[2]}) : null, begins: w.text.slice(${m[1]}, ${m[1]} + 40), ends: w.text.slice(${m[2]} - 40, ${m[2]}) }; })())`));
    };
    for (const how of ['pages', 'scroll']) {
      await run(`(setting[paceOf(book.item)] = ${JSON.stringify(how)}, pace(), 0)`); await wait(400);
      show('5b ' + how, await run(`Boolean(book.leaf)`));
      await run(`(go(2), 0)`); await wait(900);
      await placed('5b ' + how + ' chapter start');
      if (how === 'pages') { await run(`(setLeaf(2, 2), 0)`); await wait(600); } else { await run(`($('reading').scrollTop += 1300, 0)`); await wait(600); }
      await placed('5b ' + how + ' further on');
    }
    show('5b no highlights', (await ask('HIGHLIGHTS')).answer);
    await run(`(() => { const t = linesOf(rootOf(2)).text; const a = t.indexOf('quick brown'); addLight({ section: 2, start: a, end: a + 30, text: t.slice(a, a + 30) }, 2).note = 'Why a fox?'; const b = t.indexOf('lazy dog', a + 200); addLight({ section: 2, start: b, end: b + 8, text: t.slice(b, b + 8) }, 0); keepLights(); return 0; })()`); await wait(300);
    show('5b highlights', (await ask('HIGHLIGHTS')).answer);
    if (!CODEX && !ENDPOINT) show('5b the SDK was offered', calls().at(-1).offered.map((o) => o[0]));
  }
  // 6. A PDF: its sections are its pages.
  await openItem('pdf');
  show('6 pdf contents', cut((await ask('CONTENTS')).answer, 400));
  show('6 pdf read 1', cut((await ask('READ 1')).answer, 300));
  show('6 pdf search', cut((await ask('SEARCH "test"')).answer, 400));
  if (!process.env.NO_SDK) { await run(`(go(4), 0)`); await wait(1200); show('6 pdf place', cut((await ask('PLACE')).answer, 200)); show('6 pdf highlights', (await ask('HIGHLIGHTS')).answer); }
  // 7. An article: one section.
  await openItem('article');
  show('7 article contents', cut((await ask('CONTENTS')).answer, 400));
  show('7 article read', cut((await ask('READ 1')).answer, 240));
  show('7 article search', cut((await ask('SEARCH "slow"')).answer, 300));
  if (!process.env.NO_SDK) show('7 article place', cut((await ask('PLACE')).answer, 260));
  // 8. A look that is no longer wanted: the book put away while the model was looking.
  { await type('SLOW CONTENTS'); await enter(); await wait(300); await run(`(shut(), 0)`); await wait(1200); show('8 put away', [await run(`document.body.dataset.screen ?? ''`), await run(`talk === null`)]); }
  show('logs', JSON.stringify(logs.slice(0, 5)));
} finally { await stop(); mock.close(); for (const f of ['assistant.json', 'connections.json']) rmSync(profile + '/' + f, { force: true }); }
