// The assistant: signing in with ChatGPT, and asking it things on the reader's own plan.
//
// This is OpenAI's "Sign in with ChatGPT" for apps that run on the reader's own machine
// (developers.openai.com/siwc, "token sharing for open-source and locally hosted apps").
// You sign in in your browser, on OpenAI's own pages; the app never sees a password. What
// it gets back is a pair of tokens: one that lets it ask for an hour, and one that renews
// it, good for thirty days and replaced each time it is used. Those are kept in the app's
// own folder, sealed with a key from the Mac's keychain, and nowhere else.
//
// The way of it follows opencode's (packages/core/src/plugin/provider/chatgpt.ts: MIT):
// the first sign-in registers this app for your account and is told its name there (its
// "client"), which is kept and used from then on; this machine has a name of its own too
// (its "host"), made once.
//
// There is a second way to sign in, for an account with no paid plan: as Codex does. Codex
// is OpenAI's own coding tool, and every ChatGPT plan, the free one too, includes some use
// of it. Signing in that way, the app uses Codex's sign-in (its client, its page, its
// address for asking: chatgpt.com/backend-api/codex), as opencode's older "Codex browser"
// way does (packages/core/src/plugin/provider/openai.ts). OpenAI documents this for Codex
// itself and not for other apps; the app says it is Inquisitive where it is asked who is
// asking ("originator"). Which way the tokens came is kept with them, as `way`.
//
// Nothing a model says is kept by OpenAI between one ask and the next in this way of
// signing in: each ask carries the whole of the conversation so far. So a conversation
// that is to last has to be kept here, by the app; `ask` is given all of it each time.

const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const headless = Boolean(process.env.INQUISITIVE_HEADLESS);
// (A test run off-screen is told where a stand-in for OpenAI is; nothing else can be.)
const ISSUER = (headless && process.env.INQUISITIVE_AI_ISSUER) || 'https://auth.openai.com';
const RESOURCE = (headless && process.env.INQUISITIVE_AI_RESOURCE) || 'https://api.openai.com/v1';
const AUTHORIZE = ISSUER + '/api/accounts/authorize';
const TOKEN = ISSUER + '/api/accounts/oauth/token';
const REVOKE = ISSUER + '/api/accounts/oauth/revoke';
const KEYS = ISSUER + '/.well-known/jwks.json';
const FIRST = 'dynamic_agent_client'; // what a first sign-in asks as: it is given a client of its own
const NAME = 'Inquisitive'; // what the app is called on OpenAI's page, the first time
const SHARING = 'chatgpt.tokens.use.direct'; // the leave to ask on your plan
const SCOPE = `openid profile email offline_access resource.invoke ${SHARING}`;
const USAGE = 'https://chatgpt.com/settings/usage';
// Signing in as Codex does.
const CODEX = {
  client: 'app_EMoamEEZ73f0CkXaXp7hrann', // Codex's own
  authorize: ISSUER + '/oauth/authorize',
  token: ISSUER + '/oauth/token',
  base: (headless && process.env.INQUISITIVE_AI_CODEX) || 'https://chatgpt.com/backend-api/codex',
  ports: [1455, 1457], // the only two its sign-in will come back to
  scope: 'openid profile email offline_access',
  // What is asked with if the models cannot be listed: the newest first.
  models: ['gpt-6.2-sol', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-5.6-sol'],
};
const WHO = 'inquisitive'; // who the app says is asking
const BRIEF = 'You are a well-read companion to someone reading a book, an article or a paper. Answer plainly and briefly.';
const WAIT = 5 * 60 * 1000; // how long a sign-in waits for the browser

// ---------- what is kept ----------
// <the app's folder>/assistant.json: this machine's name, the app's client, who is signed
// in, and the tokens (sealed, where the Mac can seal them). Readable by you alone.

const KEPT = () => path.join(app.getPath('userData'), 'assistant.json');

function kept() {
  try {
    return JSON.parse(fs.readFileSync(KEPT(), 'utf8'));
  } catch {
    return {}; // nothing kept yet
  }
}

/** Writes what is kept: to one side first, then into place, so that a crash midway cannot
    leave half a file (and with it lose the token that renews the sign-in). */
function keep(next) {
  const aside = KEPT() + '.writing';
  fs.mkdirSync(path.dirname(KEPT()), { recursive: true });
  fs.writeFileSync(aside, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(aside, KEPT());
  return next;
}

/** Notes a step of a sign-in in <the app's folder>/assistant.log, for finding out why one
    failed: what happened and what OpenAI answered, never a code, a token or a verifier.
    The last fifty are kept. */
function note(step, detail = {}) {
  try {
    const file = path.join(app.getPath('userData'), 'assistant.log');
    let lines = [];
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    } catch {
      // none yet
    }
    lines.push(JSON.stringify({ at: new Date().toISOString(), step, ...detail }));
    fs.writeFileSync(file, lines.slice(-50).join('\n') + '\n', { mode: 0o600 });
  } catch {
    // not noted: the sign-in goes on all the same
  }
}

// (A test run keeps away from the keychain: its tokens are a stand-in's.)
const sealing = () => !headless && safeStorage.isEncryptionAvailable();

/** The tokens, out of what is kept: none if there are none, or they cannot be unsealed. */
function tokensOf(from = kept()) {
  try {
    if (from.sealed) return JSON.parse(safeStorage.decryptString(Buffer.from(from.sealed, 'base64')));
    return from.open ?? null;
  } catch {
    return null;
  }
}

/** Keeps tokens (or, given none, takes them away), leaving the rest as it is. */
function keepTokens(tokens, more = {}) {
  const next = { ...kept(), ...more };
  delete next.sealed;
  delete next.open;
  if (tokens && sealing()) next.sealed = safeStorage.encryptString(JSON.stringify(tokens)).toString('base64');
  else if (tokens) next.open = tokens;
  return keep(next);
}

/** This machine's name to OpenAI: made once, before the first sign-in, and kept. */
function host() {
  const has = kept();
  if (typeof has.host === 'string') return has.host;
  return keep({ ...has, host: 'urn:uuid:' + crypto.randomUUID() }).host;
}

// ---------- signing in ----------

const random = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** A page for the browser to show when the sign-in comes back. */
const page = (title, line) => `<!doctype html><meta charset="utf-8"><title>${NAME}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f1e6;color:#40332a;font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif}@media (prefers-color-scheme:dark){body{background:#181613;color:#ece6da}}main{max-width:420px;padding:32px;text-align:center}h1{margin:0 0 8px;font:500 28px/1.2 ui-serif,Georgia,serif}p{margin:0;opacity:.7}</style><main><h1>${title}</h1><p>${line}</p></main>`;
const clean = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let pending = null; // the sign-in under way: its listener, what it sent, and what is waiting on it

/** What a failed ask of OpenAI's sign-in pages said went wrong: its word for it, and
    anything more it said. (Such an answer holds no token.) */
async function refusal(response, step) {
  const text = await response.text().catch(() => '');
  let error = '';
  let more = '';
  try {
    const said = JSON.parse(text);
    error = typeof said.error === 'string' ? said.error : said.error?.code ?? '';
    more = said.error_description ?? said.error?.message ?? said.message ?? '';
  } catch {
    // not JSON: the status has to do
  }
  if (step) note(step, { status: response.status, error, answered: text.slice(0, 600), request: response.headers.get('x-request-id') ?? response.headers.get('cf-ray') ?? '' });
  return Object.assign(new String(error), { more: String(more) });
}

const form = (fields) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': `${NAME}/${app.getVersion()}` }, body: new URLSearchParams(fields).toString() });

/** Checks that an ID token is OpenAI's own, made for this app and for this sign-in: its
    signature against OpenAI's published keys, and who it says it is from and for. Gives
    what it says of you. */
async function identity(token, client, nonce) {
  const [head, body, mark] = String(token).split('.');
  const read = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  const { kid, alg } = read(head);
  if (alg !== 'RS256') throw new Error('the ID token is signed in a way that is not expected');
  const { keys } = await (await fetch(KEYS)).json();
  const key = keys.find((one) => one.kid === kid && one.kty === 'RSA');
  if (!key) throw new Error('the ID token is signed with a key OpenAI does not publish');
  const sound = crypto.verify('RSA-SHA256', Buffer.from(head + '.' + body), crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(mark, 'base64url'));
  if (!sound) throw new Error('the ID token is not signed by OpenAI');
  const said = read(body);
  const forWhom = [].concat(said.aud ?? []);
  if (said.iss !== ISSUER || !forWhom.includes(client)) throw new Error('the ID token was made for something else');
  if (!(said.exp * 1000 > Date.now()) || said.nonce !== nonce || typeof said.sub !== 'string' || !said.sub.trim()) throw new Error('the ID token is not for this sign-in');
  return { sub: said.sub, email: typeof said.email === 'string' ? said.email : '', name: typeof said.name === 'string' ? said.name : '' };
}

/** What an ID token says of you, read without checking who signed it: for the Codex way,
    where it has come straight from OpenAI's own address in answer to this sign-in's code
    (and carries nothing made for this sign-in alone to check it by). With it, the account
    the tokens are for, which asking needs. */
function told(token, access) {
  const read = (from) => {
    try {
      return JSON.parse(Buffer.from(String(from).split('.')[1], 'base64url').toString('utf8'));
    } catch {
      return {};
    }
  };
  const said = read(token);
  const account = (one) => one.chatgpt_account_id ?? one['https://api.openai.com/auth']?.chatgpt_account_id ?? one.organizations?.[0]?.id;
  return { who: { sub: typeof said.sub === 'string' ? said.sub : '', email: typeof said.email === 'string' ? said.email : '', name: typeof said.name === 'string' ? said.name : '' }, account: account(said) ?? account(read(access)) ?? '' };
}

/** What a token answer comes to, as it is kept. */
const tokensFrom = (answer, before) => ({
  access: answer.access_token,
  refresh: answer.refresh_token ?? before?.refresh,
  expires: Date.now() + (answer.expires_in ?? 3600) * 1000,
  scopes: answer.scope ? answer.scope.split(' ').filter(Boolean) : before?.scopes ?? [],
});

const PORT = 1455; // where the listener is put if it can be: the port OpenAI's own example uses

/** Signs in: opens OpenAI's page in the browser, waits for it to come back to a listener
    on this machine, and trades what it brings for tokens. Gives how things stand after,
    or why it did not sign in. One sign-in at a time.

    A first sign-in registers the app for your account: what comes back names the client
    it was given, which is kept at once. If OpenAI then refuses the code (it sometimes
    does, on a registration), its own advice is followed: the code is let go and the
    sign-in is begun afresh as that client, once, in the same browser tab. */
function signIn(way) {
  if (pending) return pending.settled;
  const codex = way === 'codex';
  const mine = { server: null, url: '', redirect: '', done: null, settled: null, timer: 0, hits: 0, again: false, state: '', nonce: '', verifier: '', client: null, taken: false };
  mine.settled = new Promise((resolve) => (mine.done = resolve));
  pending = mine;
  const finish = (result) => {
    if (pending !== mine) return;
    pending = null;
    clearTimeout(mine.timer);
    mine.server?.close();
    mine.done(typeof result === 'function' ? result() : result); // (how things stand is read once the sign-in is over)
  };
  /** Makes ready one going to OpenAI: fresh secrets, and the address to open. */
  const begin = () => {
    mine.state = random();
    mine.nonce = random();
    mine.verifier = random(); // (43 letters, as OpenAI's example and opencode make it)
    mine.client = codex ? CODEX.client : typeof kept().client === 'string' ? kept().client : null;
    mine.taken = false;
    const challenge = crypto.createHash('sha256').update(mine.verifier).digest('base64url');
    // As Codex signs in: its client, and nothing said of a plan.
    if (codex) mine.url = CODEX.authorize + '?' + new URLSearchParams({ response_type: 'code', client_id: CODEX.client, redirect_uri: mine.redirect, scope: CODEX.scope, code_challenge: challenge, code_challenge_method: 'S256', id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', state: mine.state, originator: WHO });
    else mine.url = AUTHORIZE + '?' + new URLSearchParams({
      client_id: mine.client ?? FIRST,
      ...(mine.client ? {} : { agent_name_hint: NAME }),
      ext_agent_host_id: host(),
      response_type: 'code',
      redirect_uri: mine.redirect,
      scope: SCOPE,
      resource: RESOURCE,
      state: mine.state,
      nonce: mine.nonce,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
    clearTimeout(mine.timer);
    mine.timer = setTimeout(() => finish({ why: 'The sign-in was not finished in the browser. Try again.' }), WAIT);
    note('began', { way: codex ? 'codex' : 'plan', first: !mine.client, port: mine.server.address().port, again: mine.again });
  };

  mine.server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/auth/callback') return void response.writeHead(404).end('Not found');
    const answer = (ok, title, line) => response.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(title, line));
    const fail = (why) => {
      answer(false, 'Not signed in', clean(why));
      finish({ why });
    };
    const refused = url.searchParams.get('error_description') ?? url.searchParams.get('error');
    if (refused) return fail(refused === 'access_denied' ? 'The sign-in was cancelled.' : `ChatGPT did not sign you in: ${refused}`);
    const code = url.searchParams.get('code');
    mine.hits++;
    note('came back', { hit: mine.hits, with: [...url.searchParams.keys()], scope: url.searchParams.get('scope') ?? '', client: (url.searchParams.get('client_id') ?? '').slice(0, 8), first: !mine.client, port: mine.server.address()?.port });
    if (!code || url.searchParams.get('state') !== mine.state) return fail('What came back from the browser was not this sign-in. Try again.');
    // Only the first coming-back is acted on: a code can be traded once, so a second ask
    // for the same page (a browser will sometimes make one) must not try, fail, and be
    // taken for the sign-in failing.
    if (mine.taken) return void response.writeHead(409, { 'Content-Type': 'text/plain' }).end('This sign-in has already come back.');
    mine.taken = true;
    try {
      // (Coming back a second time, the client may go unsaid: it is the one this began with.)
      const came = url.searchParams.get('client_id');
      if (mine.client && came && came !== mine.client) return fail('ChatGPT answered for a different app than this one. Try again.');
      const client = mine.client ?? came;
      if (!client) return fail('ChatGPT did not say which app this is. Try again.');
      // The client a registration was given is kept from here on, whatever comes next.
      if (!mine.client) keep({ ...kept(), client });
      const nonce = mine.nonce;
      const traded = codex
        ? await fetch(CODEX.token, form({ grant_type: 'authorization_code', code, redirect_uri: mine.redirect, client_id: client, code_verifier: mine.verifier }))
        : await fetch(TOKEN, form({ grant_type: 'authorization_code', client_id: client, code, code_verifier: mine.verifier, redirect_uri: mine.redirect, resource: RESOURCE }));
      if (!traded.ok) {
        const why = await refusal(traded, 'code refused');
        // Refused: the code is let go, and the sign-in begun afresh as the client just
        // given, in this same tab. Once.
        if (!codex && String(why) === 'invalid_grant' && !mine.again && pending === mine) {
          mine.again = true;
          begin();
          return void response.writeHead(302, { Location: mine.url }).end();
        }
        return fail(`ChatGPT would not finish the sign-in (${why.more ? `${why}: ${why.more}` : String(why) || traded.status}). Try again.`);
      }
      const answerOf = await traded.json();
      const tokens = tokensFrom(answerOf);
      note('code traded', { scopes: tokens.scopes, id: Boolean(answerOf.id_token), renews: Boolean(tokens.refresh), expires: answerOf.expires_in });
      if (!codex && !tokens.scopes.includes(SHARING)) return fail('The sign-in finished without leave to use your ChatGPT plan. Sign in again and allow it.');
      if (!answerOf.id_token || !tokens.refresh) return fail('ChatGPT did not send all that a sign-in needs. Try again.');
      if (codex) {
        const { who, account } = told(answerOf.id_token, tokens.access);
        keepTokens(tokens, { who, account, way: 'codex' });
      } else keepTokens(tokens, { client, who: await identity(answerOf.id_token, client, nonce), way: 'plan', account: '' });
      listed = null;
      answer(true, 'You are signed in', `${NAME} is connected to ChatGPT. You can close this tab.`);
      // (Back to the app, which is where you were.)
      if (!headless) {
        app.focus({ steal: true });
        BrowserWindow.getAllWindows()[0]?.show();
      }
      finish(status);
    } catch (error) {
      note('failed', { why: error.message });
      fail(`The sign-in could not be finished: ${error.message}.`);
    }
  });
  // The listener is up before the browser is sent off: on the usual port if it is free,
  // else on any. (Only the path and 127.0.0.1 are fixed.)
  const ready = () => {
    // (Codex's sign-in comes back to "localhost", and only to its own two ports.)
    mine.redirect = `http://${codex ? 'localhost' : '127.0.0.1'}:${mine.server.address().port}/auth/callback`;
    begin();
    if (!headless) shell.openExternal(mine.url);
  };
  const ports = headless ? [0] : codex ? [...CODEX.ports] : [PORT, 0];
  const tryNext = () => {
    const port = ports.shift();
    mine.server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' && ports.length) return tryNext();
      finish({ why: codex && error.code === 'EADDRINUSE' ? `Signing in as Codex needs port ${CODEX.ports.join(' or ')} on this Mac, and both are in use. Quit whatever is using them (Codex itself, if it is signing in) and try again.` : `The app could not listen for the browser to come back (${error.message}).` });
    });
    mine.server.listen(port, '127.0.0.1', ready);
  };
  tryNext();
  return mine.settled;
}

/** Gives up a sign-in that is waiting on the browser. */
function cancel() {
  if (!pending) return;
  const mine = pending;
  pending = null;
  clearTimeout(mine.timer);
  mine.server?.close();
  mine.done({ none: true });
}

// ---------- staying signed in ----------

/** Thrown when there is no sign-in to ask with: none yet, or one that has run out. */
class SignedOut extends Error {
  constructor(message = 'Sign in with ChatGPT first.') {
    super(message);
    this.code = 'signed-out';
  }
}

let renewing = null; // the renewal under way: one at a time, since each uses up the token it renews with

/** Renews the sign-in. The token it was renewed with is spent, and its replacement is kept
    before anything is asked with the new one. If OpenAI will not renew it (it ran out, or
    was taken away), the sign-in is over, and what is kept of it is cleared. */
async function renew(tokens) {
  const { client, way } = kept();
  const codex = way === 'codex';
  if ((!codex && !client) || !tokens.refresh) throw new SignedOut();
  const answer = codex
    ? await fetch(CODEX.token, form({ grant_type: 'refresh_token', refresh_token: tokens.refresh, client_id: CODEX.client }))
    : await fetch(TOKEN, form({ grant_type: 'refresh_token', client_id: client, refresh_token: tokens.refresh, resource: RESOURCE }));
  if (!answer.ok) {
    const why = String(await refusal(answer, 'renewal refused'));
    if (['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_reused', 'refresh_token_expired', 'refresh_token_invalidated'].includes(why)) {
      keepTokens(null, { who: null });
      throw new SignedOut('Your ChatGPT sign-in has run out. Sign in again.');
    }
    throw new Error(`ChatGPT could not be reached to renew the sign-in (${why || answer.status}).`);
  }
  const next = tokensFrom(await answer.json(), tokens);
  keepTokens(next);
  return next;
}

/** A token to ask with: the one kept, or a new one if that has under a minute left. */
async function access() {
  const tokens = tokensOf();
  if (!tokens?.access) throw new SignedOut();
  if (tokens.expires - Date.now() > 60 * 1000) return tokens.access;
  renewing ??= renew(tokens).finally(() => (renewing = null));
  return (await renewing).access;
}

/** Signs out: asks OpenAI to end the sign-in (without waiting long on it), and clears the
    tokens and who was signed in. The app's client and this machine's name are kept, for
    signing in again. Says whether OpenAI confirmed it. */
async function signOut() {
  cancel();
  for (const stop of asking.values()) stop.abort();
  const tokens = tokensOf();
  const { client, way } = kept();
  // (The Codex way has no ending to ask for: its tokens are dropped here, and run out.)
  let confirmed = way === 'codex' ? null : false;
  if (way !== 'codex' && tokens?.refresh && client) {
    try {
      const answer = await fetch(REVOKE, { ...form({ token: tokens.refresh, token_type_hint: 'refresh_token', client_id: client }), signal: AbortSignal.timeout(5000) });
      confirmed = answer.ok;
    } catch {
      // not confirmed: the tokens are cleared here all the same, and run out unused
    }
  }
  keepTokens(null, { who: null, account: '', way: null });
  listed = null;
  return { ...status(), confirmed };
}

/** How things stand: whether you are signed in, and as whom. */
function status() {
  const has = kept();
  const tokens = tokensOf(has);
  const signedIn = Boolean(tokens?.access && tokens.refresh);
  return { signedIn, way: signedIn ? (has.way === 'codex' ? 'codex' : 'plan') : null, email: has.who?.email ?? '', name: has.who?.name ?? '', waiting: Boolean(pending), sealed: Boolean(has.sealed) };
}

// ---------- asking ----------

/** Why an ask was turned down, in words; and whether signing in again would help. */
function trouble(code, said, status) {
  const known = {
    subscription_sharing_usage_limit_exceeded: 'You have reached your ChatGPT plan’s limit for now.',
    subscription_sharing_workplace_individual_usage_limit_exceeded: 'You have reached your ChatGPT plan’s limit for now.',
    subscription_sharing_user_not_eligible: 'This ChatGPT account cannot use its plan in other apps.',
    subscription_sharing_usage_unavailable: 'ChatGPT plan usage is not available just now. Try again in a little while.',
    subscription_sharing_unsupported_capability: 'ChatGPT does not allow something this ask used.',
    subscription_sharing_route_not_supported: 'ChatGPT does not allow this kind of ask on your plan.',
    subscription_sharing_invalid_user: 'ChatGPT no longer recognises this sign-in. Sign in again.',
    usage_limit_reached: 'You have reached your ChatGPT plan’s limit for now.',
    usage_not_included: 'Your ChatGPT plan does not include this.',
  };
  return { error: known[code] ?? said ?? `ChatGPT answered ${status}.`, code: code || String(status), usage: /usage_limit/.test(code ?? '') ? USAGE : undefined };
}

async function failure(response) {
  const text = await response.text().catch(() => '');
  let code = '';
  let said = '';
  try {
    const body = JSON.parse(text);
    code = body.error?.code ?? body.error?.type ?? '';
    said = body.error?.message ?? (typeof body.detail === 'string' ? body.detail : body.detail?.message ?? '');
  } catch {
    // not JSON: the status has to do
  }
  return trouble(code, said, response.status);
}

let listed = null; // the models last listed, and when

/** The models your plan can be asked with: each its id and its name. */
/** The reasoning levels a model says it takes (each a word, or an entry naming one): none if it does not say. */
const levelsOf = (model) => (Array.isArray(model.supported_reasoning_levels) ? model.supported_reasoning_levels : []).map((level) => (typeof level === 'string' ? level : level?.effort)).filter((level) => typeof level === 'string');

async function models() {
  if (listed && Date.now() - listed.when < 15 * 60 * 1000) return listed.models;
  const has = kept();
  if (has.way === 'codex') {
    // Codex's own list; if it cannot be had, the ones Codex is known to take.
    let found = [];
    try {
      const answer = await fetch(CODEX.base + '/models?client_version=1.0.0', { headers: { Authorization: 'Bearer ' + (await access()), originator: WHO, ...(has.account ? { 'chatgpt-account-id': has.account } : {}) } });
      if (answer.ok) found = ((await answer.json()).models ?? []).filter((model) => model.visibility === 'list' && model.supported_in_api !== false).map((model) => ({ id: model.slug, name: model.display_name || model.slug, levels: levelsOf(model) }));
    } catch (error) {
      if (error instanceof SignedOut) throw error;
    }
    listed = { when: Date.now(), models: found.length ? found : CODEX.models.map((id) => ({ id, name: id, levels: [] })), guessed: !found.length };
    return listed.models;
  }
  const answer = await fetch(RESOURCE + '/models', { headers: { Authorization: 'Bearer ' + (await access()) } });
  if (!answer.ok) throw Object.assign(new Error((await failure(answer)).error), { status: answer.status });
  const { models: all = [] } = await answer.json();
  const usable = all.filter((model) => model.visibility === 'list' && model.supported_in_api !== false).map((model) => ({ id: model.slug, name: model.display_name || model.slug, levels: levelsOf(model) }));
  listed = { when: Date.now(), models: usable };
  return usable;
}

const asking = new Map(); // the asks under way, by their id: each can be stopped

/** Asks a model, and tells of the answer as it comes: { delta } for each piece of text,
    then { done, text } once it is whole, or { error, code } if it could not be had.
    `messages` is the whole conversation so far, oldest first, each { role: 'user' or
    'assistant', text }: nothing of it is kept on OpenAI's side between asks. `thread` names
    the conversation, so that asks in it are served from the same place and cost less.
    `effort` is the reasoning level, for a model known to take one. */
async function ask(id, { model, instructions, messages, thread, effort }, tell) {
  const stop = new AbortController();
  asking.set(id, stop);
  let text = '';
  try {
    const chosen = model || (await models())[0]?.id;
    if (!chosen) return void tell({ error: 'Your ChatGPT plan has no model to ask.', code: 'no-model' });
    const said = (messages ?? []).filter((one) => one && typeof one.text === 'string' && one.text);
    const has = kept();
    const codex = has.way === 'codex';
    // (Codex's address wants each message spelt out in full, and always something by way of instructions.)
    const input = codex
      ? said.map((one) => (one.role === 'assistant' ? { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: one.text }] } : { type: 'message', role: 'user', content: [{ type: 'input_text', text: one.text }] }))
      : said.map((one) => ({ role: one.role === 'assistant' ? 'assistant' : 'user', content: one.text }));
    const answer = await fetch((codex ? CODEX.base : RESOURCE) + '/responses', {
      method: 'POST',
      signal: stop.signal,
      headers: {
        Authorization: 'Bearer ' + (await access()),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(codex ? { originator: WHO, ...(has.account ? { 'chatgpt-account-id': has.account } : {}) } : {}),
        ...(thread ? { 'session-id': String(thread), ...(codex ? {} : { 'thread-id': String(thread), 'x-client-request-id': String(thread) }) } : {}),
      },
      // (What both ways of signing in ask for: nothing stored, and the answer streamed.)
      body: JSON.stringify({ model: chosen, ...(instructions || codex ? { instructions: String(instructions || BRIEF) } : {}), input, ...(effort ? { reasoning: { effort: String(effort) } } : {}), store: false, stream: true }),
    });
    if (!answer.ok || !answer.body) return void tell(await failure(answer));
    // The answer comes as a stream of events, each a line naming it and a line of JSON.
    const reader = answer.body.getReader();
    const decoder = new TextDecoder();
    let held = '';
    let ended = false;
    const take = (block) => {
      const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        text += event.delta;
        tell({ delta: event.delta });
      } else if (event.type === 'response.completed') {
        ended = true;
        tell({ done: true, text, model: chosen, usage: event.response?.usage ?? null });
      } else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
        ended = true;
        const error = event.response?.error ?? event.error ?? event;
        tell({ ...trouble(error?.code ?? '', error?.message ?? (event.type === 'response.incomplete' ? 'The answer was cut short.' : ''), 'an error'), text });
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      held += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      for (let end = held.indexOf('\n\n'); end >= 0; end = held.indexOf('\n\n')) {
        take(held.slice(0, end));
        held = held.slice(end + 2);
      }
    }
    if (held.trim()) take(held);
    // (An answer is whole only once it has said so.)
    if (!ended) tell({ error: 'The answer stopped before it was finished.', code: 'cut-short', text });
  } catch (error) {
    if (stop.signal.aborted) tell({ stopped: true, text });
    else if (error instanceof SignedOut) tell({ error: error.message, code: 'signed-out' });
    else tell({ error: `ChatGPT could not be reached (${error.message}).`, code: 'unreachable', text });
  } finally {
    asking.delete(id);
  }
}

/** Stops an ask that is under way: it ends with what had come of it. */
const stop = (id) => asking.get(String(id))?.abort();

// ---------- what the window can ask for ----------

function listen() {
  ipcMain.handle('assistant:status', () => status());
  ipcMain.handle('assistant:sign-in', (event, way) => signIn(way === 'codex' ? 'codex' : 'plan'));
  ipcMain.on('assistant:cancel', () => cancel());
  ipcMain.handle('assistant:sign-out', () => signOut());
  ipcMain.handle('assistant:models', () => models().then((list) => ({ models: list }), (error) => ({ why: error.message, signedOut: error.code === 'signed-out' })));
  ipcMain.on('assistant:ask', (event, id, request) => {
    const tell = (part) => !event.sender.isDestroyed() && event.sender.send('assistant:part', id, part);
    ask(String(id), request ?? {}, tell);
  });
  ipcMain.on('assistant:stop', (event, id) => stop(id));
  // Where you see and limit how much of your plan apps use: ChatGPT's own settings.
  ipcMain.on('assistant:usage', () => !headless && shell.openExternal(USAGE));
  // (A test run off-screen opens no browser: it is told where the browser would have gone.)
  if (headless) ipcMain.handle('assistant:pending', () => pending?.url ?? null);
}

module.exports = { listen, ask, stop, status, models };
