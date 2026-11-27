// The chat beside the page, with real clicks and typing, against a stand-in for the model.
import { cpSync, rmSync } from 'node:fs';
import os from 'node:os';
import { startMock } from './helpers/aimock.mjs';
import { start } from './helpers/base.mjs';
const S = import.meta.dirname, out = S + '/out/chatpanel';
rmSync(out, { recursive: true, force: true }); cpSync(S + '/fixtures/library', out + '/library', { recursive: true });
const profile = os.tmpdir() + '/inquisitive-test'; for (const f of ['assistant.json', 'connections.json']) rmSync(profile + '/' + f, { force: true });
const mock = await startMock();
Object.assign(process.env, { INQUISITIVE_AI_ISSUER: mock.base, INQUISITIVE_AI_RESOURCE: mock.base + '/v1', INQUISITIVE_AI_CODEX: mock.base + '/codex' });
const { wait, run, send, stop, logs, shot, scheme } = await start(S + '/..', out, { sample: false });
const show = (name, value) => console.log(name + '	' + JSON.stringify(value));
const box = (sel) => run(`JSON.stringify((() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })())`).then(JSON.parse);
const click = async (sel) => { const b = await box(sel); const x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2; await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await wait(150); };
const type = (text) => send('Input.insertText', { text });
const key = async (k, more = {}) => { const base = { key: k, code: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0, ...more }; await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }); if (k === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...base }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); await wait(120); };
const thread = () => run(`JSON.stringify([...document.querySelector('#chat-thread').children].map((n) => [n.className, n.querySelector('.chat-passage')?.textContent.slice(0, 40) ?? null, (n.querySelector('p:not(.chat-state), .chat-words') ?? n).textContent.slice(0, 60), n.querySelector('.chat-state')?.textContent ?? null, Boolean(n.querySelector('.tick'))]))`).then(JSON.parse);
const state = () => run(`JSON.stringify({ open: 'chat' in document.body.dataset, title: document.querySelector('#chat-title').textContent, busy: document.querySelector('#chat-form').hasAttribute('data-busy'), send: document.querySelector('#chat-send').getAttribute('aria-label'), field: document.querySelector('#chat-field').value, quote: document.querySelector('#chat-quote').hidden ? null : document.querySelector('#chat-quoted').textContent.slice(0, 50), focus: document.activeElement?.id })`).then(JSON.parse);
const settle = async (ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (!(await state()).busy) return; await wait(100); } };
const menu = () => run(`JSON.stringify([...document.querySelectorAll('.menu > *')].map((n) => n.textContent + (n.classList.contains('on') ? '*' : '')))`).then(JSON.parse);
try {
  for (let i = 0; i < 40 && !(await run(`typeof choose === 'function' && document.readyState === 'complete' && items.length > 0`)); i++) await wait(100);
  await scheme('light');
  // Signed in to the stand-in, as the app's own sign-in does it.
  await run(`(window.__signed = undefined, window.api.assistant.signIn('plan').then((r) => (window.__signed = r)), 0)`);
  { let url = null; for (let i = 0; i < 40 && !url; i++) { await wait(50); url = await run(`window.api.assistant.pending()`); } await (await fetch(url)).text(); for (let i = 0; i < 60 && (await run(`window.__signed === undefined`)); i++) await wait(50); }
  await run(`relink().then(() => 0)`);
  // A book, open: the page has the window; the chat's button is in the top bar.
  await run(`[...document.querySelectorAll('.card')].find((c) => c.item.kind === 'article').click()`); await wait(1500);
  await run(`document.body.dataset.bar = 'shown'`); await wait(300);
  const before = { reading: await box('#reading'), top: await box('#top'), tool: await box('[data-tool="ask"]') };
  show('1 before', before);
  // The slide, frame by frame: how wide the chat's column and the page are as it opens.
  await run(`(window.__frames = [], (() => { const t0 = performance.now(); const tick = () => { window.__frames.push([Math.round(performance.now() - t0), Math.round(document.querySelector('#chat').getBoundingClientRect().width), Math.round(document.querySelector('#reading').getBoundingClientRect().width), Math.round(document.querySelector('#top').getBoundingClientRect().width), Math.round(document.querySelector('#chat-inner').getBoundingClientRect().width)]); if (performance.now() - t0 < 450) requestAnimationFrame(tick); }; requestAnimationFrame(tick); })(), 0)`);
  await click('[data-tool="ask"]'); await wait(600);
  { const f = JSON.parse(await run(`JSON.stringify(window.__frames)`)); const widths = f.map((x) => x[1]); show('1 slide', { frames: f.length, between: widths.filter((w) => w > 0 && w < 354).length, growsOnly: widths.every((w, i) => !i || w >= widths[i - 1]), sample: f.filter((_, i) => i % Math.ceil(f.length / 8) === 0).map((x) => x.join('/')), innerAlways: [...new Set(f.map((x) => x[4]))], sums: [...new Set(f.map((x) => x[1] + x[2]))] }); }
  show('1 opened', await state()); show('1 layout', { reading: await box('#reading'), top: await box('#top'), chat: await box('#chat'), head: await box('#chat-head'), form: await box('#chat-form'), win: await run(`innerWidth + 'x' + innerHeight`) });
  // 2. A question, typed and sent with Return; the answer comes in pieces.
  await type('What is this essay about?'); show('2 typed', await state()); await key('Enter');
  { const seen = []; for (let t = 0; t < 40; t++) { const th = await thread(); const now = JSON.stringify(th.map((r) => [r[0], r[2].length, r[4]])); if (seen.at(-1) !== now) seen.push(now); if (!(await state()).busy && th.length > 1 && !th.at(-1)[4]) break; await wait(25); } show('2 as it came', seen.length + ' states, first ' + seen[0]); }
  show('2 thread', await thread()); show('2 state', await state());
  { const r = mock.seen.responses.at(-1); show('2 the model was told', [JSON.stringify(r.body.input.find((i) => i.role === 'developer' && !i.type)?.content ?? r.body.instructions ?? '').slice(0, 200), r.body.input.filter((i) => i.role === 'user').length]); }
  // 3. Shift-Return is a new line; an empty field asks nothing; a slow answer is stopped with the button.
  await type('SLOW one'); await key('Enter', { modifiers: 8 }); show('3 shift-return', JSON.stringify((await state()).field)); await type('more'); await key('Enter'); await wait(600);
  show('3 while it comes', await state()); await click('#chat-send'); await settle(); show('3 stopped', (await thread()).slice(-2)); show('3 state', await state());
  await key('Enter'); show('3 empty asks nothing', (await thread()).length);
  // 4. A passage chosen on the page: the row has Ask about this; the passage goes over the field and with the question.
  { const p = await run(`JSON.stringify((() => { const t = document.querySelector('#page .text p, #page p'); const r = t.getBoundingClientRect(); return [r.left + 4, r.top + 8, Math.min(r.right - 6, r.left + 260), r.top + 8]; })())`).then(JSON.parse);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[2], y: p[3], button: 'left', buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[2], y: p[3], button: 'left', clickCount: 1 }); await wait(400); }
  show('4 the row', await run(`JSON.stringify([...document.querySelectorAll('.picker .picker-tool')].map((b) => b.getAttribute('aria-label')))`));
  { const pb = await box('.picker'); await shot('chat-row', { x: pb[0] - 6, y: pb[1] - 6, width: pb[2] - pb[0] + 12, height: pb[3] - pb[1] + 12, scale: 4 }); }
  await click('.picker .picker-tool[aria-label="Ask about this"]'); await wait(500); show('4 passage over the field', await state());
  await type('Why this?'); await key('Enter'); await settle(); show('4 thread', (await thread()).slice(-2)); show('4 what went out', JSON.stringify(mock.seen.responses.at(-1).body.input.at(-1).content).slice(0, 110));
  await shot('chat-light'); { const t = await box('#reading-tools'); await shot('chat-tools', { x: t[0] - 8, y: 0, width: t[2] - t[0] + 16, height: 44, scale: 4 }); const pk = await run(`(() => 0)()`); }
  // 5. Closed and opened again: the chat is there to go on with. A new chat; the list of this item's chats.
  await key('Escape'); await wait(100); show('5 Escape: sliding away', [(await state()).open, await box('#chat'), await run(`getComputedStyle(document.querySelector('#chat')).visibility`)]); await wait(500); show('5 Escape closes it', [(await state()).open, await run(`document.body.dataset.screen`), await box('#reading'), await run(`getComputedStyle(document.querySelector('#chat')).visibility + ' ' + document.querySelector('#chat').inert`)]);
  await click('[data-tool="ask"]'); await wait(700); show('5 opened again', [(await state()).title, (await thread()).length]);
  await click('[data-chat="new"]'); show('5 new chat', [await state(), (await thread()).length]); await type('A second chat'); await key('Enter'); await settle();
  await click('[data-chat="list"]'); await wait(300); show('5 chats', await menu()); await run(`[...document.querySelectorAll('.menu .menu-item')].at(-1).click()`); await wait(500); show('5 the first again', [(await state()).title, (await thread()).length]);
  // 5b. Its width, dragged by its left edge: it follows the pointer, is kept, and has a least and a most; a double click puts it back.
  { const e = await box('#chat-edge'); const y = 400; const at = async (x) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }); await wait(60); return [(await box('#chat'))[0], (await box('#reading'))[2]]; };
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: e[0] + 3, y }); show('5b cursor', await run(`getComputedStyle(document.querySelector('#chat-edge')).cursor`));
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: e[0] + 3, y, button: 'left', clickCount: 1 });
    show('5b dragged', { start: e[0], to700: await at(700), to650: await at(650), tooFar: await at(200), tooNear: await at(1100), back: await at(760) });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 760, y, button: 'left', clickCount: 1 }); await wait(400);
    show('5b kept', [await run(`localStorage.getItem('chat')`), await box('#chat'), await run(`getSelection().toString().length`)]);
    const b = await box('#chat-edge'); for (const n of [1, 2]) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b[0] + 3, y, button: 'left', clickCount: n }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b[0] + 3, y, button: 'left', clickCount: n }); } await wait(500);
    show('5b double click', [await run(`localStorage.getItem('chat')`), await box('#chat'), await run(`JSON.stringify([document.body.style.getPropertyValue('--chat-wide'), getComputedStyle(document.body).getPropertyValue('--chat-now'), getComputedStyle(document.body).getPropertyValue('--chat-width'), document.body.className, innerWidth])`)]); }
  // 6. The passage taken off again; another item has its own chats; leaving the book closes the panel.
  await run(`askAbout('A passage to drop')`); await wait(200); await click('[data-chat="unquote"]'); show('6 passage dropped', (await state()).quote);
  await scheme('dark'); await wait(500); await shot('chat-dark'); await scheme('light');
  await run(`showLibrary()`); await wait(500); show('6 left the book', [(await state()).open, await run(`'chat' in document.body.dataset`), await box('#top')]);
  await run(`[...document.querySelectorAll('.card')].find((c) => c.item.kind === 'book').click()`); await wait(1500); await run(`document.body.dataset.bar = 'shown'`); await click('[data-tool="ask"]'); await wait(700);
  show('6 another item', [await state(), (await thread()).length]); await click('[data-chat="list"]'); await wait(300); show('6 its chats', await menu()); await run(`closeMenu()`);
  // 7. In pages, the page is laid out afresh in the room that is left.
  show('7 paged', await run(`JSON.stringify({ paged: document.querySelector('#reading').classList.contains('paged'), part: Math.round(document.querySelector('#page .part.now, #page .part')?.getBoundingClientRect().width ?? 0), reading: Math.round(document.querySelector('#reading').getBoundingClientRect().width) })`));
  await shot('chat-book');
  // 8. With no model connected, nothing is kept and the thread says so.
  await run(`window.api.assistant.signOut().then(() => relink())`); await wait(500); await type('Anyone?'); await key('Enter'); await settle(); show('8 no model', (await thread()).slice(-2)); show('8 kept', (await run(`window.api.chats.list().then((l) => JSON.stringify(l.map((c) => [c.title, c.messages])))`)));
  show('logs', JSON.stringify(logs.slice(0, 4)));
} finally { await stop(); mock.close(); for (const f of ['assistant.json', 'connections.json']) rmSync(profile + '/' + f, { force: true }); }
