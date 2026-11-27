// The assistant's backend, against a stand-in for OpenAI: signing in through "the browser", keeping and renewing tokens, asking, signing out.
import { cpSync, rmSync, readFileSync, statSync, existsSync } from 'node:fs';
import os from 'node:os';
import { startMock } from './helpers/aimock.mjs';
import { start } from './helpers/base.mjs';
const S = import.meta.dirname, out = S + '/out/assistant';
rmSync(out, { recursive: true, force: true }); cpSync(S + '/fixtures/library', out + '/library', { recursive: true });
const keptFile = os.tmpdir() + '/inquisitive-test/assistant.json'; rmSync(keptFile, { force: true });
const mock = await startMock();
process.env.INQUISITIVE_AI_ISSUER = mock.base; process.env.INQUISITIVE_AI_RESOURCE = mock.base + '/v1'; process.env.INQUISITIVE_AI_CODEX = mock.base + '/codex';
const { wait, run, stop, logs } = await start(S + '/..', out, { sample: false });
const show = (name, value) => console.log(name + '	' + JSON.stringify(value));
const kept = () => JSON.parse(readFileSync(keptFile, 'utf8'));
const row = () => run(`JSON.stringify((() => { const r = [...document.querySelectorAll('.set-row')].find((r) => r.querySelector('.set-name').textContent === 'ChatGPT'); return r ? [[...r.querySelectorAll('button')].map((b) => b.textContent), r.querySelector('.set-more').textContent] : null; })())`);
// Signing in as the app does, with this script standing in for the browser.
const signIn = async (way) => {
  await run(`(window.__signed = undefined, window.api.assistant.signIn(${JSON.stringify(way ?? 'plan')}).then((r) => (window.__signed = r)), 0)`);
  let url = null; for (let i = 0; i < 40 && !url; i++) { await wait(50); url = await run(`window.api.assistant.pending()`); }
  const page = await fetch(url); const html = await page.text();
  for (let i = 0; i < 60 && (await run(`window.__signed === undefined`)); i++) await wait(50);
  return { result: JSON.parse(await run(`JSON.stringify(window.__signed)`)), page: [page.status, (html.match(/<h1>(.*?)<\/h1>/) ?? [])[1]] };
};
const ask = async (id, text, more = {}) => {
  await run(`(window.__parts ??= {}, window.__heard ??= (window.api.assistant.onPart((id, part) => (window.__parts[id] ??= []).push(part)), true), window.api.assistant.ask(${JSON.stringify(id)}, ${JSON.stringify({ messages: [{ role: 'user', text: 'Earlier question' }, { role: 'assistant', text: 'Earlier answer' }, { role: 'user', text }], instructions: 'Be brief.', thread: 'thread-1', ...more })}), 0)`);
};
const parts = async (id, ms = 6000) => { for (let t = 0; t < ms; t += 100) { const p = JSON.parse(await run(`JSON.stringify(window.__parts?.[${JSON.stringify(id)}] ?? [])`)); if (p.some((x) => x.done || x.error || x.stopped)) return p; await wait(100); } return JSON.parse(await run(`JSON.stringify(window.__parts?.[${JSON.stringify(id)}] ?? [])`)); };
try {
  for (let i = 0; i < 40 && !(await run(`typeof choose === 'function' && document.readyState === 'complete' && items.length > 0`)); i++) await wait(100);
  await run(`choose('settings')`); await wait(500);
  show('at first', await run(`window.api.assistant.status().then(JSON.stringify)`)); show('row', await row());
  // 1. A first sign-in.
  { const s = await signIn(); show('signed in', s); }
  { const q = mock.seen.authorize[0]; show('asked the sign-in page', { client_id: q.client_id, agent_name_hint: q.agent_name_hint, host: /^urn:uuid:[0-9a-f-]{36}$/.test(q.ext_agent_host_id), redirect: /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/.test(q.redirect_uri), scope: q.scope, resource: q.resource === mock.base + '/v1', method: q.code_challenge_method, hasState: q.state.length > 20, hasNonce: q.nonce.length > 20 }); }
  { const t = mock.seen.token[0]; show('traded the code', { grant: t.grant_type, client: t.client_id, verifier: t.code_verifier.length, resource: t.resource === mock.base + '/v1' }); }
  { const k = kept(); show('kept', { host: k.host.slice(0, 9), client: k.client, who: k.who, tokens: Object.keys(k.open ?? {}), sealed: Boolean(k.sealed), mode: (statSync(keptFile).mode & 0o777).toString(8) }); }
  await run(`(helper = null, window.api.assistant.status().then((s) => { helper = s; settled?.(); }), 0)`); await wait(700); show('row', await row());
  // 2. Asking.
  show('models', await run(`window.api.assistant.models().then(JSON.stringify)`));
  await ask('a1', 'What is this?'); { const p = await parts('a1'); show('an answer', { deltas: p.filter((x) => x.delta).length, last: p.at(-1) }); }
  { const r = mock.seen.responses.at(-1); show('what was asked', r); }
  // 3. The token runs short: renewed once, however many asks are waiting, and the new one kept.
  mock.mode.expires = 3600; const before = kept().open.refresh;
  await run(`0`); { const k = kept(); k.open.expires = Date.now() + 5000; const fs = await import('node:fs'); fs.writeFileSync(keptFile, JSON.stringify(k)); }
  await ask('b1', 'one'); await ask('b2', 'two'); await ask('b3', 'three');
  { const [p1, p2, p3] = [await parts('b1'), await parts('b2'), await parts('b3')]; show('three asks on a spent token', [p1.at(-1).done, p2.at(-1).done, p3.at(-1).done, 'renewals', mock.seen.refreshes]); }
  show('token replaced and kept', [before, kept().open.refresh, kept().open.refresh === mock.current().refresh]);
  // 4. What can go wrong with an ask.
  await ask('c1', 'LIMIT'); show('over the limit', (await parts('c1')).at(-1));
  await ask('c2', 'FAIL please'); show('failed midway', (await parts('c2')).at(-1));
  await ask('c3', 'CUT'); show('cut short', (await parts('c3')).at(-1));
  await ask('c4', 'SLOW'); await wait(500); await run(`window.api.assistant.stop('c4')`); { const p = await parts('c4'); show('stopped', { deltas: p.filter((x) => x.delta).length, last: { stopped: p.at(-1).stopped, text: p.at(-1).text?.length } }); }
  // 5. Signing out, and in again: the app's client is the one from before.
  show('signed out', await run(`window.api.assistant.signOut().then(JSON.stringify)`)); show('revoked', mock.seen.revoke.at(-1));
  { const k = kept(); show('kept after', { host: Boolean(k.host), client: k.client, who: k.who, tokens: Boolean(k.open || k.sealed) }); }
  await ask('d1', 'hello'); show('asking signed out', (await parts('d1')).at(-1));
  { const s = await signIn(); const q = mock.seen.authorize.at(-1); show('signed in again', { signedIn: s.result.signedIn, client_id: q.client_id, hint: q.agent_name_hint ?? null, sameHost: q.ext_agent_host_id === mock.seen.authorize[0].ext_agent_host_id }); }
  // 6. A sign-in that has run out on OpenAI's side.
  mock.mode.rejectRefresh = true; { const k = kept(); k.open.expires = Date.now() + 5000; (await import('node:fs')).writeFileSync(keptFile, JSON.stringify(k)); }
  await ask('e1', 'hello'); show('renewal refused', (await parts('e1')).at(-1)); show('status after', await run(`window.api.assistant.status().then(JSON.stringify)`)); mock.mode.rejectRefresh = false;
  // 7. Sign-ins that must not succeed.
  mock.mode.deny = true; show('refused in the browser', (await signIn())); mock.mode.deny = false;
  mock.mode.noshare = true; show('without leave to use the plan', (await signIn()).result); mock.mode.noshare = false;
  mock.mode.badnonce = true; show('an ID token for another sign-in', (await signIn()).result); mock.mode.badnonce = false;
  show('nothing kept from those', { tokens: Boolean(kept().open || kept().sealed), status: await run(`window.api.assistant.status().then((s) => s.signedIn)`) });
  // 7b. A registration whose code is refused once: begun afresh as the client it was given, by itself.
  { const fs = await import('node:fs'); const k = kept(); delete k.client; fs.writeFileSync(keptFile, JSON.stringify(k)); }
  mock.mode.newClient = 'oaiapp_second'; mock.mode.refuseCodes = 1; const before7 = mock.seen.authorize.length;
  { const s = await signIn(); const asked = mock.seen.authorize.slice(before7).map((q) => [q.client_id, q.agent_name_hint ?? null]); show('refused once, then through', { result: s.result.signedIn, page: s.page, asked, differentSecrets: mock.seen.authorize.at(-1).state !== mock.seen.authorize.at(-2).state, kept: kept().client }); }
  await run(`window.api.assistant.signOut()`); await wait(300);
  // 7c. Refused twice: it stops, and the client it was given is kept for the next try.
  { const fs = await import('node:fs'); const k = kept(); delete k.client; fs.writeFileSync(keptFile, JSON.stringify(k)); }
  mock.mode.newClient = 'oaiapp_third'; mock.mode.refuseCodes = 2;
  { const s = await signIn(); show('refused twice', { result: s.result, kept: kept().client, tokens: Boolean(kept().open) }); }
  { const s = await signIn(); show('the next try', { signedIn: s.result.signedIn, asked: mock.seen.authorize.at(-1).client_id }); }
  await run(`window.api.assistant.signOut()`); await wait(300); mock.mode.newClient = null;
  // 7d. Signing in as Codex does.
  { const s = await signIn('codex'); const q = mock.seen.codexAuthorize.at(-1); const t = mock.seen.codexToken.at(-1);
    show('codex: signed in', s); show('codex: asked the sign-in page', { client_id: q.client_id, redirect: q.redirect_uri.replace(/:\d+/, ':PORT'), scope: q.scope, flow: q.codex_cli_simplified_flow, orgs: q.id_token_add_organizations, originator: q.originator, method: q.code_challenge_method });
    show('codex: traded the code', { fields: Object.keys(t).sort(), client: t.client_id }); const k = kept(); show('codex: kept', { way: k.way, account: k.account, who: k.who?.email, planClient: k.client }); }
  show('codex: models', await run(`window.api.assistant.models().then(JSON.stringify)`));
  await ask('x1', 'What is this?', { instructions: undefined }); show('codex: an answer', (await parts('x1')).at(-1)); show('codex: what was asked', mock.seen.codexResponses.at(-1));
  await ask('x2', 'LIMIT'); show('codex: over the limit', (await parts('x2')).at(-1));
  { const fs = await import('node:fs'); const k = kept(); k.open.expires = Date.now() + 5000; fs.writeFileSync(keptFile, JSON.stringify(k)); const r0 = mock.seen.refreshes; await ask('x3', 'after renewal'); show('codex: renewed', [(await parts('x3')).at(-1).done, mock.seen.refreshes - r0, mock.seen.codexToken.at(-1).grant_type, kept().open.refresh === mock.current().refresh]); }
  mock.mode.noCodexModels = true; await run(`window.api.assistant.signOut()`); await wait(200); await signIn('codex'); show('codex: models not listed', await run(`window.api.assistant.models().then(JSON.stringify)`)); mock.mode.noCodexModels = false;
  show('codex: signed out', await run(`window.api.assistant.signOut().then(JSON.stringify)`)); show('codex: kept after', { way: kept().way ?? null, tokens: Boolean(kept().open), planClient: kept().client });
  // 8. A sign-in given up while it waits.
  await run(`(window.__signed = undefined, window.api.assistant.signIn().then((r) => (window.__signed = r)), 0)`); await wait(300); await run(`window.api.assistant.cancel()`); await wait(300);
  show('given up', await run(`JSON.stringify(window.__signed)`));
  // (The Settings row itself is tried in connectionsui.mjs.)
  show('logs', JSON.stringify(logs.filter((l) => /error/i.test(l)).slice(0, 4)));
} finally { await stop(); mock.close(); rmSync(keptFile, { force: true }); }
