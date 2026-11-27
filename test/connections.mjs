// The other ways to a model (Claude through Claude Code, a model added by its address) and the choice of model, against stand-ins: no real tool, account or key is touched.
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import { startMock } from './helpers/aimock.mjs';
import { start } from './helpers/base.mjs';
const S = import.meta.dirname, out = S + '/out/connections';
const STATE = S + '/out/fake'; mkdirSync(STATE, { recursive: true }); process.env.INQUISITIVE_TEST_STATE = STATE; // where the stand-ins note down how they were run
rmSync(out, { recursive: true, force: true }); cpSync(S + '/fixtures/library', out + '/library', { recursive: true }); mkdirSync(out + '/claude-config');
const profile = os.tmpdir() + '/inquisitive-test';
for (const f of ['assistant.json', 'connections.json']) rmSync(profile + '/' + f, { force: true });
const fake = S + '/fake/claude', fakeState = STATE + '/state.json', fakeCalls = STATE + '/calls.jsonl';
const setFake = (state) => writeFileSync(fakeState, JSON.stringify(state)); setFake({}); rmSync(fakeCalls, { force: true }); chmodSync(fake, 0o755);
const calls = () => (existsSync(fakeCalls) ? readFileSync(fakeCalls, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const mock = await startMock();
Object.assign(process.env, { INQUISITIVE_AI_ISSUER: mock.base, INQUISITIVE_AI_RESOURCE: mock.base + '/v1', INQUISITIVE_AI_CODEX: mock.base + '/codex', INQUISITIVE_AI_ANTHROPIC: mock.base + '/anthropic', INQUISITIVE_AI_CLAUDE: fake, CLAUDE_CONFIG_DIR: out + '/claude-config', INQUISITIVE_AI_SDK: S + '/fake/agent-sdk.mjs' });
const { wait, run, stop, logs, shot, scheme } = await start(S + '/..', out, { sample: false });
const show = (name, value) => console.log(name + '	' + JSON.stringify(value));
const kept = () => JSON.parse(readFileSync(profile + '/connections.json', 'utf8'));
const api = (call) => run(`window.api.${call}.then((r) => JSON.stringify(r ?? null), (e) => JSON.stringify({ threw: e.message }))`).then(JSON.parse);
const rows = () => run(`JSON.stringify([...document.querySelectorAll('.set')].find((s) => s.querySelector('.set-head').textContent === 'Intelligence') ? [...[...document.querySelectorAll('.set')].find((s) => s.querySelector('.set-head').textContent === 'Intelligence').querySelectorAll('.set-row')].map((r) => [r.querySelector('.set-name').textContent, r.querySelector('.set-more')?.textContent, [...r.querySelectorAll('.set-state, button')].map((b) => b.matches('.switch') ? (b.getAttribute('aria-checked') === 'true' ? '[on]' : '[off]') : b.matches('.round') ? '…' : b.matches('.set-state') ? '(' + b.textContent + ')' : b.textContent + (b.disabled ? ' (off)' : ''))]) : null)`).then(JSON.parse);
const press = (row, button) => run(`[...[...document.querySelectorAll('.set-row')].find((r) => r.querySelector('.set-name').textContent === ${JSON.stringify(row)}).querySelectorAll('button')].find((b) => b.textContent === ${JSON.stringify(button)}).click()`);
const more = async (row, item) => { await run(`[...document.querySelectorAll('.set-row')].find((r) => r.querySelector('.set-name').textContent === ${JSON.stringify(row)}).querySelector('.round, .set-button').click()`); await wait(150); const m = await menu(); if (item) { await run(`[...document.querySelectorAll('.menu .menu-item')].find((n) => n.textContent === ${JSON.stringify(item)}).click()`); await wait(300); } return m; };
const flip = (row) => run(`[...document.querySelectorAll('.set-row')].find((r) => r.querySelector('.set-name').textContent === ${JSON.stringify(row)}).querySelector('.switch').click()`);
const reason = () => run(`JSON.stringify((() => { const r = [...document.querySelectorAll('.set-row')].find((r) => r.querySelector('.set-name').textContent === 'Reasoning'); return [r.querySelector('.set-more').textContent, [...r.querySelectorAll('.seg button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + (b.disabled ? ' (off)' : ''))]; })())`).then(JSON.parse);
const level = (name) => run(`[...[...document.querySelectorAll('.set-row')].find((r) => r.querySelector('.set-name').textContent === 'Reasoning').querySelectorAll('.seg button')].find((b) => b.textContent === ${JSON.stringify(name)}).click()`);
const dialog = () => run(`JSON.stringify((() => { const d = document.querySelector('.modal.mind'); return d ? { title: d.querySelector('.modal-title').textContent, steps: [...d.querySelectorAll('.mind-step')].map((s) => [s.className.replace('mind-step ', ''), s.querySelector('.step-name').textContent, s.querySelector('.step-said').textContent, [...s.querySelectorAll('button')].map((b) => b.textContent)]), foot: [...d.querySelectorAll('.mind-foot button')].map((b) => b.textContent + (b.disabled ? ' (off)' : '')) } : null; })())`).then(JSON.parse);
const foot = (name) => run(`[...document.querySelectorAll('.mind-foot button, .mind-step button')].find((b) => b.textContent === ${JSON.stringify(name)}).click()`);
const until = async (test, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const d = await dialog(); if (d && test(d)) return d; await wait(100); } return dialog(); };
const type = (label, value) => run(`(() => { const i = [...document.querySelectorAll('.modal.mind .field')].find((f) => f.querySelector('.field-name').textContent === ${JSON.stringify(label)}).querySelector('input'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('focus')); })()`);
const key = (label, k) => run(`[...document.querySelectorAll('.modal.mind .field')].find((f) => f.querySelector('.field-name').textContent === ${JSON.stringify(label)}).querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
const offered = () => run(`JSON.stringify([...document.querySelectorAll('.mind-list .menu-item')].map((b) => b.textContent + (b.classList.contains('picked') ? '*' : '')))`).then(JSON.parse);
const ask = (id, request) => run(`(window.__parts ??= {}, window.__heard ??= (window.api.chats.onPart((id, part) => (window.__parts[id] ??= []).push(part)), true), window.api.chats.ask(${JSON.stringify(id)}, ${JSON.stringify(request)}), 0)`);
const parts = async (id, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const p = JSON.parse(await run(`JSON.stringify(window.__parts?.[${JSON.stringify(id)}] ?? [])`)); if (p.some((x) => x.done || x.error || x.stopped)) return p; await wait(100); } return []; };
const ended = (p) => { const e = p.at(-1) ?? {}; return { deltas: p.filter((x) => x.delta).length, ...(e.done ? { done: true } : e.stopped ? { stopped: true } : { error: e.error, code: e.code }), answer: e.answer && [e.answer.text.slice(0, 60), e.answer.state, e.answer.model] }; };
const menu = () => run(`JSON.stringify([...document.querySelectorAll('.menu > *')].map((n) => n.classList.contains('menu-label') ? '[' + n.textContent + ']' : n.textContent + (n.classList.contains('on') ? '*' : '')))`).then(JSON.parse);
const chooseModel = async (name) => { await run(`document.querySelector('.set-button.select').click()`); await wait(150); const m = await menu(); await run(`[...document.querySelectorAll('.menu .menu-item')].find((n) => n.textContent === ${JSON.stringify(name)}).click()`); await wait(400); return m; };
// Signing in to ChatGPT through its row: Connect, then the way, then this script as the browser.
const signInChat = async () => {
  const offered = await more('ChatGPT', 'Continue with ChatGPT'); const waitingRow = (await rows()).find((r) => r[0] === 'ChatGPT');
  let url = null; for (let i = 0; i < 40 && !url; i++) { await wait(50); url = await run(`window.api.assistant.pending()`); }
  await (await fetch(url)).text(); for (let i = 0; i < 60 && !(await run(`Boolean(helper?.signedIn)`)); i++) await wait(50); await wait(700);
  return { offered, waitingRow };
};
const BOOK = 'Books/The Test Book.epub';
try {
  for (let i = 0; i < 40 && !(await run(`typeof choose === 'function' && document.readyState === 'complete' && items.length > 0`)); i++) await wait(100);
  await scheme('light'); await run(`choose('settings')`); await wait(700);
  // 1. Nothing connected.
  show('1 rows', await rows()); show('1 quick view', (await api(`connections.view(true)`)).providers.map((p) => [p.id, p.connected, p.models.length]));
  await ask('n1', { file: BOOK, text: 'Anyone there?' }); show('1 asking with none', ended(await parts('n1')));
  show('1 once with none', await api(`connections.once('o0', { system: 'Sort', text: 'Titles' })`));
  // 2. Claude Code is not on this Mac.
  chmodSync(fake, 0o644); await press('Claude', 'Connect'); show('2 not installed', await until((d) => d.steps[0][0] !== 'busy')); await foot('Cancel'); chmodSync(fake, 0o755);
  // 3. Its sign-in fails; then is given up while it waits; then goes through.
  setFake({ loginFails: true }); await press('Claude', 'Connect'); show('3 sign-in fails', await until((d) => d.steps[1][0] === 'failed'));
  setFake({ loginMs: 5000 }); await foot('Try again'); show('3 signing in', await until((d) => d.steps[1][0] === 'busy')); await foot('Cancel'); await wait(600);
  show('3 given up', { dialog: await dialog(), row: (await rows()).find((r) => r[0] === 'Claude'), kept: existsSync(profile + '/connections.json') ? kept().claude : 'no file', signedIn: JSON.parse(readFileSync(fakeState, 'utf8')).signedIn ?? false });
  setFake({}); await press('Claude', 'Connect'); const seenSteps = []; for (let t = 0; t < 60; t++) { const d = await dialog(); const now = d?.steps.map((s) => s[0]).join(' '); if (now && seenSteps.at(-1) !== now) seenSteps.push(now); if (d?.foot[0] === 'Done') break; await wait(50); }
  show('3 steps seen', seenSteps); { const d = await dialog(); show('3 connected', { ...d, steps: d.steps.map((s) => [s[0], s[1], s[2].replace(/[\d.]+ s/, 'N s'), s[3]]) }); }
  await shot('dialog-claude'); await foot('Done'); await wait(500);
  show('3 rows', await rows()); show('3 reasoning', await reason()); show('3 kept', { ...kept(), mode: (statSync(profile + '/connections.json').mode & 0o777).toString(8) });
  // 4. Asking goes to Claude Code: one prompt, no tools, in an empty folder; a second question carries the first.
  rmSync(fakeCalls, { force: true });
  await ask('c1', { file: BOOK, text: 'What is this about?', quote: 'A dark night.' }); const c1 = await parts('c1'); show('4 answered', ended(c1));
  { const c = calls().at(-1); show('4 how it was run', { args: c.args.map((a) => (a.length > 40 ? a.slice(0, 40) + '…' : a)), cwd: c.cwd.replace(os.tmpdir(), '<tmp>').replace(/^\/private/, ''), prompt: c.prompt }); }
  await ask('c2', { chat: c1[0].chat.id, text: 'And then?' }); show('4 second', ended(await parts('c2'))); show('4 second prompt', calls().at(-1).prompt);
  await level('High'); await wait(300); show('4 reasoning high', [await reason(), kept().effort]); await ask('c4', { file: BOOK, text: 'Think hard' }); await parts('c4'); show('4 asked with', calls().at(-1).args.slice(-4));
  show('4 once', await api(`connections.once('o1', { system: 'Sort these into collections.', text: 'Dune by Frank Herbert' })`)); { const c = calls().at(-1); show('4 once ran as', [c.args[c.args.indexOf('--system-prompt') + 1], c.prompt]); } show('4 once kept nothing', (await api(`chats.list()`)).length);
  show('4 once empty', await api(`connections.once('o2', { text: '  ' })`)); await run(`(window.__once = undefined, window.api.connections.once('o3', { text: 'SLOW' }).then((r) => (window.__once = r)), 0)`); await wait(600); await run(`window.api.connections.cancel('o3')`); await wait(500); show('4 once called off', await run(`JSON.stringify(window.__once)`));
  await ask('c3', { chat: c1[0].chat.id, text: 'SLOW' }); await wait(700); await run(`window.api.chats.stop('c3')`); show('4 stopped', ended(await parts('c3')));
  // 5. A model added by its address: Anthropic, with a key.
  await press('Another model', 'Add'); await wait(200);
  show('5 form', { chips: await run(`JSON.stringify([...document.querySelectorAll('.chip')].map((c) => c.textContent))`), d: await dialog() });
  await run(`[...document.querySelectorAll('.chip')].find((c) => c.textContent === 'Anthropic').click()`); show('5 preset fills', await run(`document.querySelector('.modal.mind .field input').value`));
  await type('Address', mock.base + '/anthropic'); await type('API key', 'sk-ant-wrong'); await type('Model', 'claude-haiku-5-5'); await foot('Connect'); show('5 wrong key', (await until((d) => d.steps[0][0] === 'failed')).steps[0]);
  await type('API key', 'sk-ant-test'); await type('Model', ''); await wait(500); show('5 models offered', await offered());
  await type('Model', 'hai'); await wait(100); show('5 narrowed', await offered()); await key('Model', 'ArrowDown'); show('5 marked', await offered()); await key('Model', 'Enter'); show('5 picked', await run(`[...document.querySelectorAll('.modal.mind .field input')].at(-1).value`));
  await shot('dialog-add'); await key('Model', 'Enter'); { const d = await until((d) => d.foot[0] === 'Done'); show('5 added', { steps: d.steps.map((s) => [s[0], s[2].replace(/[\d.]+ s/, 'N s')]), foot: d.foot }); } await foot('Done'); await wait(500);
  show('5 rows', await rows()); { const k = kept().endpoints[0]; show('5 kept', { ...k, id: /^api-/.test(k.id), url: k.url.replace(mock.base, '<mock>') }); }
  show('5 view has no key', JSON.stringify(await api(`connections.view()`)).includes('sk-ant'));
  // 6. Choosing the model; asking goes there, with the whole conversation.
  show('6 menu', await chooseModel('Claude Haiku 5.5')); show('6 rows', (await rows()).find((r) => r[0] === 'Default model'));
  show('6 reasoning (haiku takes none)', await reason()); await ask('a1', { chat: c1[0].chat.id, text: 'Now you' }); show('6 answered', ended(await parts('a1')));
  { const b = mock.seen.anthropic.at(-1); show('6 what went out', { model: b.model, effort: b.output_config ?? null, max_tokens: b.max_tokens, system: b.system.slice(0, 30), stream: b.stream, roles: b.messages.map((m) => m.role).join(' '), first: b.messages[0].content }); }
  await ask('a2', { chat: c1[0].chat.id, text: 'REFUSE this' }); show('6 declined', ended(await parts('a2')));
  await ask('a3', { chat: c1[0].chat.id, text: 'SLOW' }); await wait(600); await run(`window.api.chats.stop('a3')`); show('6 stopped', ended(await parts('a3')));
  // 7. A model on this Mac: no key, and its thinking is not part of its answer.
  await press('Another model', 'Add'); await wait(200); await type('Address', mock.base + '/oai/v1'); await type('Model', ''); await wait(500); show('7 models offered', await offered());
  await type('Model', 'missing'); await foot('Connect'); show('7 no such model', (await until((d) => d.steps[0][0] === 'failed')).steps[0]);
  await type('Model', 'llama3.2'); await foot('Connect'); await until((d) => d.foot[0] === 'Done'); await foot('Done'); await wait(500); show('7 rows', await rows());
  await chooseModel('llama3.2'); await ask('l1', { file: BOOK, text: 'Local?' }); show('7 answered', ended(await parts('l1'))); show('7 what went out', { auth: mock.seen.chat.at(-1).auth, roles: mock.seen.chat.at(-1).body.messages.map((m) => m.role).join(' ') });
  // 8. Changing a held one: its key stays kept when none is typed.
  show('8 its menu', await more('Anthropic', 'Edit')); await wait(200); show('8 edit form', await run(`JSON.stringify([...document.querySelectorAll('.modal.mind .field input')].map((i) => [i.value.replace(${JSON.stringify(mock.base)}, '<mock>'), i.placeholder]))`));
  await type('Model', 'claude-opus-5-5'); await foot('Connect'); await until((d) => d.foot[0] === 'Done'); await foot('Done'); await wait(500); show('8 rows', (await rows()).filter((r) => r[0] === 'Anthropic')); show('8 kept', [kept().endpoints.length, kept().endpoints[0].model, kept().endpoints[0].levels, kept().endpoints[0].limit, kept().endpoints[0].key]);
  await chooseModel('Claude Opus 5.5'); show('8 reasoning (opus takes it)', await reason()); await ask('a4', { file: BOOK, text: 'With effort' }); await parts('a4'); show('8 asked with', mock.seen.anthropic.at(-1).output_config);
  // 8b. A connection rested: its models leave the menu, and the model in use gives way; switched on, they are back.
  await flip('Anthropic'); await wait(500); show('8b rested', { row: (await rows()).find((r) => r[0] === 'Anthropic'), model: (await rows()).find((r) => r[0] === 'Default model')[2], off: kept().off.length }); show('8b menu', await chooseModel('llama3.2')); show('8b reasoning (none known)', await reason());
  await flip('Anthropic'); await wait(500); show('8b on again', [(await rows()).find((r) => r[0] === 'Anthropic')[2], kept().off]);
  // 9. ChatGPT signed in to: its models join the menu.
  // 9a. A ChatGPT sign-in given up while it waits, after the page has been drawn afresh (as when Settings is chosen again).
  await more('ChatGPT', 'Sign in with Codex'); show('9a waiting', (await rows()).find((r) => r[0] === 'ChatGPT')); await run(`(choose('library'), choose('settings'))`); await wait(700);
  show('9a waiting, page redrawn', (await rows()).find((r) => r[0] === 'ChatGPT')); await press('ChatGPT', 'Cancel'); await wait(400); show('9a after Cancel', [(await rows()).find((r) => r[0] === 'ChatGPT'), await run(`window.api.assistant.status().then((s) => s.waiting)`)]);
  show('9 signing in', await signInChat()); show('9 row', (await rows()).find((r) => r[0] === 'ChatGPT')); show('9 its menu', await more('ChatGPT')); await run(`closeMenu()`);
  show('9 menu', await chooseModel('GPT-6.1 Sol')); show('9 reasoning', await reason()); await ask('g1', { file: BOOK, text: 'And you?' }); show('9 answered', ended(await parts('g1'))); show('9 went out', [(JSON.stringify(mock.seen.responses.at(-1).body.input.find((i) => i.role === 'developer' && !i.type)?.content ?? mock.seen.responses.at(-1).body.instructions ?? '')).slice(0, 31), mock.seen.responses.at(-1).body.reasoning ?? null]);
  show('9 once', await api(`connections.once('o4', { system: 'Sort these.', text: 'Titles' })`)); show('9 once went out', [(JSON.stringify(mock.seen.responses.at(-1).body.input.find((i) => i.role === 'developer' && !i.type)?.content ?? mock.seen.responses.at(-1).body.instructions ?? '')), mock.seen.responses.at(-1).body.input.filter((i) => i.role === 'user').length]); await run(`(window.__once = undefined, window.api.connections.once('o5', { text: 'SLOW' }).then((r) => (window.__once = r)), 0)`); await wait(600); await run(`window.api.connections.cancel('o5')`); await wait(500); show('9 once called off', await run(`JSON.stringify(window.__once)`));
  await run(`[...document.querySelectorAll('.set-head')].find((h) => h.textContent === 'Intelligence').scrollIntoView({ block: 'start' })`); await wait(300);
  await scheme('light'); await wait(500); await shot('settings-light'); await run(`document.querySelector('.set-button.select').click()`); await wait(300); await shot('settings-menu-light'); await run(`closeMenu()`); await more('Claude'); await shot('settings-more-light'); await run(`closeMenu()`);
  await scheme('dark'); await wait(500); await shot('settings-dark');
  show('9 edges', await run(`JSON.stringify([...document.querySelectorAll('.set')].find((s) => s.querySelector('.set-head').textContent === 'Intelligence') && [...[...document.querySelectorAll('.set')].find((s) => s.querySelector('.set-head').textContent === 'Intelligence').querySelectorAll('.set-row')].map((r) => { const n = r.querySelector('.set-name').getBoundingClientRect(), b = (r.querySelector('.set-buttons') ?? r.lastElementChild).getBoundingClientRect(), k = r.getBoundingClientRect(); return [Math.round(n.left), Math.round(b.right), Math.round(k.height), Math.round((b.top + b.bottom) / 2 - (n.top + n.bottom) / 2)]; }))`));
  // 10. Letting go: the model in use gives way to another.
  await more('ChatGPT', 'Sign out'); await wait(500); await api(`connections.view()`).then((v) => show('10 chatgpt gone', v.model));
  await more('127.0.0.1', 'Disconnect'); await wait(400); show('10 claude menu', await more('Claude', 'Disconnect')); await wait(400); show('10 rows', await rows()); show('10 kept', { claude: kept().claude, endpoints: kept().endpoints.length, model: kept().model });
  await flip('Anthropic'); await wait(500); await run(`[...document.querySelectorAll('.set-head')].find((h) => h.textContent === 'Intelligence').scrollIntoView({ block: 'start' })`); await scheme('light'); await wait(600); await shot('settings-mixed-light'); show('10 parts', await run(`JSON.stringify([...document.querySelectorAll('.set-head, .set-sub')].map((h) => h.textContent))`));
  show('logs', JSON.stringify(logs.slice(0, 4)));
} finally { await stop(); mock.close(); for (const f of ['assistant.json', 'connections.json']) rmSync(profile + '/' + f, { force: true }); }
