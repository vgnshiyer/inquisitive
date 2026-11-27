// The ways to a model, and which model answers. There are three:
// - ChatGPT, signed in to in the browser (assistant.js).
// - Claude, through Claude Code: a command-line tool already on this Mac, signed in to your
//   own Claude subscription. Inquisitive holds no account or password for it: Anthropic's
//   Agent SDK runs the tool, hands it the words, and reads the reply.
// - an endpoint: an address that answers as a model API, with your own API key if it wants
//   one. A model running on this Mac (Ollama, LM Studio) is reached the same way. It is
//   asked through pi (pi.js), as ChatGPT is.
// (How the second and third are found, held and listed is Storm's, brought over.)
//
// What is held is kept in <userData>/connections.json:
//   { claude: true, endpoints: [{ id, name, url, model, modelName, levels, limit, key }], off: [ids],
//     model: { provider, id, name }, effort }
// A connection is only held once it has answered. An endpoint's API key is kept sealed by
// the Mac's Keychain, and never leaves this process. Several can be held at once; each can be
// switched off without being let go (`off`). `model` is the one questions go to, and `effort`
// the reasoning level asked of it where it takes one: low, medium or high; left out, each
// model thinks as much as it does by itself.

const { app, ipcMain, safeStorage, shell } = require('electron');
const { spawn } = require('node:child_process');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assistant = require('./assistant.js');
const pi = require('./pi.js');

const headless = Boolean(process.env.INQUISITIVE_HEADLESS);
const HOME = os.homedir();

/** What every model is told of its part, whichever way it is reached. */
const BRIEF = 'You are a well-read companion to someone reading a book, an article or a paper. Answer plainly and briefly, in ordinary prose: no Markdown, no headings, no lists unless one is asked for.';
/** The one short message that proves a connection. */
const CHECK = { system: 'This is a connection check from a reading app. Reply with one word and nothing else.', messages: [{ role: 'user', text: 'Reply with the single word: ready' }] };
const LONG = 300e3; // how long an answer may take
const TURNS = 12; // how many times a model may go between its tools and its answer, in one answer
const LEVELS = ['low', 'medium', 'high']; // the reasoning levels on offer

// ---------- what is kept ----------

const KEPT = () => path.join(app.getPath('userData'), 'connections.json');

function kept() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(KEPT(), 'utf8')) ?? {};
  } catch {
    // nothing kept yet
  }
  const endpoints = (Array.isArray(saved.endpoints) ? saved.endpoints : []).filter((e) => e && [e.id, e.url, e.model].every((v) => typeof v === 'string' && v) && address(e.url) === e.url);
  const model = saved.model && [saved.model.provider, saved.model.id].every((v) => typeof v === 'string' && v) ? saved.model : null;
  const off = (Array.isArray(saved.off) ? saved.off : []).filter((id) => typeof id === 'string');
  return { claude: saved.claude === true, endpoints, off, model, effort: LEVELS.includes(saved.effort) ? saved.effort : null };
}

/** Writes it: to one side first, then into place, and for this user alone to read. */
function keep(next) {
  fs.mkdirSync(path.dirname(KEPT()), { recursive: true });
  fs.writeFileSync(KEPT() + '.writing', JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(KEPT() + '.writing', KEPT());
}

// An API key is kept sealed by the Keychain. (A test run off-screen has no Keychain of its
// own to ask, and keeps its made-up keys as they are.)
async function sealKey(key) {
  if (!key) return '';
  if (headless) return 'open:' + key;
  try {
    return (await safeStorage.encryptStringAsync(key)).toString('base64');
  } catch {
    throw new Error('The Keychain is not available to keep the API key.');
  }
}
async function openKey(sealed) {
  if (!sealed) return '';
  if (headless) return sealed.replace(/^open:/, '');
  try {
    return (await safeStorage.decryptStringAsync(Buffer.from(sealed, 'base64'))).result;
  } catch {
    throw new Error('The API key could not be read from the Keychain.');
  }
}

// ---------- running a tool ----------

// An app opened from the Dock is not given the Terminal's PATH, so the usual homes of a
// command-line tool are looked in directly.
const BIN_DIRS = [path.join(HOME, '.local', 'bin'), path.join(HOME, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.npm-global', 'bin'), path.join(HOME, '.bun', 'bin')];

function isProgram(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Runs a program to its end. Resolves with what it printed and how it ended; `timedOut` is
    set if it was stopped for taking too long. Rejects only if it could not be started, or
    was called off through `signal`. `onLine` is handed each line it prints, as it prints it. */
function run(file, args, { input = '', cwd, timeout = 15e3, signal, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: [path.dirname(file), ...BIN_DIRS, process.env.PATH].filter(Boolean).join(path.delimiter) };
    const child = spawn(file, args, { cwd, env, signal });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);
    let rest = ''; // the line still being printed
    child.stdout.on('data', (d) => {
      out += d;
      if (!onLine) return;
      const lines = (rest + d).split('\n');
      rest = lines.pop();
      for (const line of lines) onLine(line.trim());
    });
    child.stderr.on('data', (d) => (err += d));
    child.stdin.on('error', () => {}); // it may be gone before it has read a word
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, timedOut });
    });
    child.stdin.end(input);
  });
}

/** Where a tool lives: one of its usual homes, or wherever your own shell finds it. (A test
    run off-screen never runs the real one: only a stand-in it is pointed at.) */
async function find(bin) {
  if (headless) return isProgram(process.env.INQUISITIVE_AI_CLAUDE ?? '') ? process.env.INQUISITIVE_AI_CLAUDE : null;
  for (const dir of BIN_DIRS) {
    const file = path.join(dir, bin);
    if (isProgram(file)) return file;
  }
  try {
    // A login shell may print a greeting of its own first: the answer is the last line that is this program.
    const { out } = await run(process.env.SHELL || '/bin/zsh', ['-lic', `command -v ${bin}`], { timeout: 6e3 });
    const lines = out.split('\n').map((line) => line.trim());
    return lines.reverse().find((line) => path.isAbsolute(line) && path.basename(line) === bin && isProgram(line)) || null;
  } catch {
    return null;
  }
}

/** An empty folder for a tool to run in, so it has no project of yours to look through. */
function workDir() {
  const dir = path.join(os.tmpdir(), 'inquisitive-ai');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Why a tool gave no reply, in a line: its own last words, without colour codes. */
function reason(output, done, tool) {
  if (done.timedOut) return `${tool} took too long to reply.`;
  const lines = String(output)
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const last = (lines.pop() || '').replace(/^error:\s*/i, '');
  return last ? last.slice(0, 400) : `${tool} stopped without a reply.`;
}

// ---------- Claude, through Claude Code ----------

const CLAUDE = { id: 'claude', name: 'Claude', tool: 'Claude Code', bin: 'claude', page: 'https://claude.com/claude-code', usual: 'opus' };

async function claudeSignedIn(file) {
  const { code, out } = await run(file, ['auth', 'status', '--json']);
  try {
    return JSON.parse(out).loggedIn === true;
  } catch {
    return code === 0;
  }
}

/** Claude Code has no command that lists its models, but it keeps the catalogue behind its
    own model menu on disk: each model's id and name, which are current, and which model each
    short name (opus, sonnet…) stands for. Without that file, the short names themselves are
    offered: each means the latest model of its line. Gives { list, usual }, each model with
    the reasoning levels it takes. */
function claudeModels() {
  try {
    const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'cache', 'model-catalog');
    const newest = fs
      .readdirSync(dir)
      .filter((f) => /^published-[0-9a-f]+\.json$/.test(f))
      .map((f) => path.join(dir, f))
      .sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs)[0];
    const config = [JSON.parse(fs.readFileSync(newest, 'utf8')).document.surfaces.cc.model_selector_config].flat()[0];
    // The current models only, as Claude Code's own menu shows them; older ones sit in its overflow.
    const named = config.models.filter((m) => m.id && m.name);
    const current = named.filter((m) => m.section === 'main');
    const list = (current.length ? current : named).map((m) => ({ id: String(m.id), name: `Claude ${m.name}`, levels: m.thinking?.type === 'effort' ? (m.thinking.effort_options || []).map((o) => String(o.id)) : [] }));
    if (list.length) return { list, usual: config.provider_alias_targets?.opus?.default };
  } catch {
    // No catalogue to read: fall back to the short names.
  }
  const levels = LEVELS; // the latest of each line takes a reasoning level
  return { list: [{ id: 'fable', name: 'Claude Fable', levels }, { id: 'opus', name: 'Claude Opus', levels }, { id: 'sonnet', name: 'Claude Sonnet', levels }, { id: 'haiku', name: 'Claude Haiku', levels }], usual: CLAUDE.usual };
}

/** Claude Code takes one prompt, not a conversation: what was said before goes in ahead of
    the question, in order. */
function asOne(messages) {
  if (messages.length < 2) return messages[0]?.text ?? '';
  const before = messages.slice(0, -1).map((one) => `${one.role === 'assistant' ? 'You answered' : 'The reader asked'}:\n${one.text}`);
  return `This is a conversation with a reader. So far:\n\n${before.join('\n\n')}\n\nThe reader now asks:\n${messages.at(-1).text}`;
}

// (A test run off-screen never runs the real Agent SDK either: only a stand-in it is pointed at.)
const SDK = headless ? process.env.INQUISITIVE_AI_SDK || '' : '@anthropic-ai/claude-agent-sdk';
const sdk = () => (SDK ? import(headless ? pathToFileURL(SDK).href : SDK) : Promise.reject(new Error(`${CLAUDE.tool} cannot be run in a test without a stand-in.`)));

/** Asks Claude, through Claude Code, and resolves with the reply. Anthropic's Agent SDK runs
    Claude Code for it, with none of Claude Code's own tools and none of your own setup, and
    keeping nothing. `tools` are tools of the app's own that the model may use as it answers:
    each { name, description, input, run }, where `input` is what it takes (as zod describes
    it) and `run` gives what it found, as text; they are run here, in this process. `onText`
    is handed the words of what is being said now, whole so far; they begin again once a tool
    has been used (`onUse` is told which), and the reply is what is said last. */
async function askClaude({ system, messages, model, effort, tools = [] }, { onText, onUse, signal, timeout = LONG } = {}) {
  const file = await find(CLAUDE.bin);
  if (!file) throw new Error(`${CLAUDE.tool} was not found on this Mac.`);
  const { query, tool, createSdkMcpServer } = await sdk();
  const made = tools.map((one) =>
    tool(one.name, one.description, one.input, async (input) => {
      onUse?.(one.name);
      return { content: [{ type: 'text', text: String(await one.run(input)) }] };
    }),
  );
  const stop = new AbortController();
  const off = () => stop.abort();
  if (signal?.aborted) off();
  else signal?.addEventListener('abort', off, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => ((timedOut = true), off()), timeout);
  // (The Agent SDK takes what is asked as a stream of messages when it is to run tools here.)
  async function* asked() {
    yield { type: 'user', message: { role: 'user', content: asOne(messages) }, parent_tool_use_id: null, session_id: '' };
  }
  let said = '';
  let result = null;
  let errors = '';
  try {
    const events = query({
      prompt: asked(),
      options: {
        pathToClaudeCodeExecutable: file,
        systemPrompt: system,
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        tools: [], // none of Claude Code's own
        ...(made.length ? { mcpServers: { book: createSdkMcpServer({ name: 'book', version: app.getVersion(), tools: made }) }, allowedTools: tools.map((one) => `mcp__book__${one.name}`) } : {}),
        strictMcpConfig: true,
        settingSources: [], // none of your own Claude Code setup
        persistSession: false,
        includePartialMessages: true,
        maxTurns: TURNS,
        cwd: workDir(),
        abortController: stop,
        env: { ...process.env, PATH: [path.dirname(file), ...BIN_DIRS, process.env.PATH].filter(Boolean).join(path.delimiter), CLAUDE_AGENT_SDK_CLIENT_APP: `inquisitive/${app.getVersion()}` },
        stderr: (data) => (errors += data),
      },
    });
    for await (const one of events) {
      if (one.type === 'result') result = one;
      if (one.type !== 'stream_event') continue;
      if (one.event?.type === 'message_start') said = '';
      const delta = one.event?.delta;
      if (delta?.type === 'text_delta' && delta.text) onText?.((said += delta.text));
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(reason(errors || error.message, { timedOut }, CLAUDE.tool));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', off);
  }
  if (result?.subtype === 'success' && !result.is_error && typeof result.result === 'string' && result.result.trim()) return result.result.trim();
  if (result?.subtype === 'error_max_turns') throw new Error('Claude went on looking through it without settling on an answer.');
  throw new Error(reason(String(result?.result || (result?.errors ?? []).join('\n') || errors), { timedOut }, CLAUDE.tool));
}

/** Looks on this Mac for Claude Code: whether it is installed, its version, and whether it
    says it is signed in. Only a reply proves a connection. */
async function inspect() {
  const facts = { installed: false, version: '', signedIn: false };
  const file = await find(CLAUDE.bin);
  if (!file) return facts;
  try {
    const [version, signedIn] = await Promise.all([run(file, ['--version']), claudeSignedIn(file)]);
    return { installed: true, version: /\d+(\.\d+)+/.exec(version.out)?.[0] || '', signedIn };
  } catch {
    return facts; // found, but it would not run
  }
}

/** Signs in to Claude by running Claude Code's own sign-in: it opens its page in the browser
    and waits there until you have finished, for up to ten minutes. Inquisitive sees none of
    it; it only learns how the tool ended. `signal` calls it off, which stops the tool. */
async function signIn({ signal } = {}) {
  const file = await find(CLAUDE.bin);
  if (!file) return { ok: false, error: `${CLAUDE.tool} was not found on this Mac.` };
  const done = await run(file, ['auth', 'login'], { cwd: workDir(), timeout: 600e3, signal });
  return done.code === 0 ? { ok: true } : { ok: false, error: done.timedOut ? 'Signing in took too long.' : reason(done.err || done.out, done, CLAUDE.tool) };
}

// ---------- endpoints ----------
// An endpoint is `{ url, key, model }`. Anthropic's own address is spoken to in Anthropic's
// way; every other address is taken to speak the API OpenAI set, as Ollama, LM Studio and
// most others do: GET /models and POST /chat/completions under the address. Its models are
// listed here (Anthropic's through its SDK); it is asked through pi (pi.js).

/** The addresses offered ready-made when a model is added. */
const PRESETS = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1' },
  { name: 'Anthropic', url: 'https://api.anthropic.com' },
  { name: 'Ollama', url: 'http://localhost:11434/v1' },
  { name: 'LM Studio', url: 'http://localhost:1234/v1' },
];
const LOCAL = /^(localhost|127(\.\d+){3}|0\.0\.0\.0|\[::1\])$/;
// (A test run off-screen may name a stand-in for Anthropic's address.)
const STAND_IN = (headless && process.env.INQUISITIVE_AI_ANTHROPIC) || '';

/** An address as typed, made whole: a scheme if it has none (http for this Mac, https
    otherwise), "/v1" if it names no path, and no slash at the end. Empty if it is no address. */
function address(typed) {
  let text = String(typed || '').trim();
  if (!text) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = (LOCAL.test(text.split(/[/:]/)[0]) || text.startsWith('[::1]') ? 'http://' : 'https://') + text;
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol)) return '';
    const pathname = url.pathname.replace(/\/+$/, '') || (url.hostname === 'api.anthropic.com' ? '' : '/v1');
    return url.origin + pathname;
  } catch {
    return '';
  }
}

/** What an address is, for the settings page: the name it goes by (a preset's, or its host),
    the host, and whether it is on this Mac. */
function place(url) {
  const at = new URL(url);
  const preset = url === STAND_IN ? PRESETS[1] : PRESETS.find((p) => new URL(p.url).host === at.host);
  return { name: preset?.name || at.hostname, host: at.host, local: url !== STAND_IN && LOCAL.test(at.hostname) };
}

const speaksAnthropic = (url) => new URL(url).hostname === 'api.anthropic.com' || url === STAND_IN;
/** The SDK's client. It is told where to go and what to send, so that nothing set for other
    programs on this Mac (an address or a sign-in of Anthropic's, in the environment) can
    send the key elsewhere, or another credential with it. */
const anthropic = (url, key, timeout) => new Anthropic({ apiKey: key, authToken: null, baseURL: url === STAND_IN ? url : 'https://api.anthropic.com', maxRetries: 1, timeout });

/** Why Anthropic gave no reply, in a line. */
function anthropicReason(e, model) {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'The API key was not accepted.';
  if (e instanceof Anthropic.NotFoundError && model) return `Anthropic has no model called ${model}.`;
  if (e instanceof Anthropic.RateLimitError) return 'Anthropic is turning requests away for now. Try again in a moment.';
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'Anthropic took too long to reply.';
  if (e instanceof Anthropic.APIConnectionError) return 'Anthropic could not be reached.';
  if (e instanceof Anthropic.APIError) return String(e.error?.error?.message || e.message).slice(0, 400);
  return e.message;
}

/** One request to an address that speaks OpenAI's API. Resolves with the JSON it sent back;
    rejects with a line that says what went wrong, in the server's own words where it gave any. */
async function call(url, tail, key, { body, signal, timeout, onEvent }) {
  const { host } = new URL(url);
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (key) headers.authorization = `Bearer ${key}`;
  let reply;
  let text = '';
  try {
    reply = await fetch(url + tail, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)].filter(Boolean)) });
    if (onEvent && reply.ok && /event-stream/.test(reply.headers.get('content-type') || '')) {
      // A reply sent piece by piece: each "data:" line is an event; "[DONE]" ends it.
      let rest = '';
      for await (const piece of reply.body.pipeThrough(new TextDecoderStream())) {
        const lines = (rest + piece).split('\n');
        rest = lines.pop();
        for (const line of lines) {
          const sent = /^data:\s*(\{.*)$/.exec(line.trim())?.[1];
          if (!sent) continue;
          let event = null;
          try {
            event = JSON.parse(sent);
          } catch {
            continue;
          }
          if (event.error) throw Object.assign(new Error(String(event.error.message || event.error).slice(0, 400)), { said: true });
          onEvent(event);
        }
      }
      return null;
    }
    text = await reply.text();
  } catch (e) {
    if (signal?.aborted || e.said) throw e;
    throw new Error(e.name === 'TimeoutError' ? `${host} took too long to reply.` : `Nothing answered at ${host}.`);
  }
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON: an error page, most likely.
  }
  if (reply.ok && data) return data;
  const said = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message;
  if (typeof said === 'string' && said.trim()) throw new Error(said.trim().slice(0, 400));
  if (reply.status === 401 || reply.status === 403) throw new Error('The API key was not accepted.');
  throw new Error(reply.status === 404 || reply.ok ? `${host} does not answer as a model API at this address.` : `${host} answered with an error (${reply.status}).`);
}

/** The models an endpoint lists, as `{ id, name, levels, limit }`. Only Anthropic says which
    reasoning levels a model takes, and how long its reply may be (`limit`, in tokens);
    elsewhere none are known, so none are offered. */
async function endpointModels({ url, key }, { signal, timeout = 15e3 } = {}) {
  if (speaksAnthropic(url)) {
    if (!key) throw new Error('Anthropic needs an API key.');
    try {
      const listed = [];
      for await (const m of anthropic(url, key, timeout).models.list({ limit: 100 }, { signal })) {
        const effort = m.capabilities?.effort;
        const levels = effort?.supported ? ['low', 'medium', 'high', 'xhigh', 'max'].filter((l) => effort[l]?.supported) : [];
        if (m.lifecycle !== 'retired') listed.push({ id: m.id, name: m.display_name || m.id, levels, limit: Number(m.max_tokens) || 0 });
      }
      return listed;
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error(anthropicReason(e));
    }
  }
  const data = await call(url, '/models', key, { signal, timeout });
  const listed = (Array.isArray(data.data) ? data.data : []).filter((m) => m && typeof m.id === 'string' && m.id);
  return listed.map((m) => ({ id: m.id, name: m.id, levels: [], limit: 0 })).sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
}

/** What a local model's reply says, without the thinking some write first between <think>
    tags; while that thinking is still being written, nothing. */
function answerOf(text) {
  const answer = text.replace(/^\s*<think>[\s\S]*?<\/think>/, '');
  const start = answer.trimStart();
  return start.startsWith('<think>') || '<think>'.startsWith(start) ? '' : answer;
}

/** Why an endpoint gave no reply, in a line: from what pi-ai or the address itself said. */
function endpointReason(said, { host, model, anthropic }) {
  const who = anthropic ? 'Anthropic' : host;
  if (/\b(401|403)\b|authentication_error|permission_error|invalid[ _-]?(x-)?api[ _-]?key|incorrect api key/i.test(said)) return 'The API key was not accepted.';
  if (anthropic && /\b404\b|not_found_error/i.test(said)) return `Anthropic has no model called ${model}.`;
  if (/\b429\b|rate_limit/i.test(said)) return `${who} is turning requests away for now. Try again in a moment.`;
  if (/timed? ?out/i.test(said)) return `${who} took too long to reply.`;
  if (/connection error|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(said)) return anthropic ? 'Anthropic could not be reached.' : `Nothing answered at ${host}.`;
  // (The address's own words, where it sent any, out of what it sent them in.)
  try {
    const sent = JSON.parse(/\{[\s\S]*\}/.exec(said)?.[0] ?? '');
    const own = typeof sent.error === 'string' ? sent.error : sent.error?.message || sent.message;
    if (typeof own === 'string' && own.trim()) return own.trim().slice(0, 400);
  } catch {
    // not JSON: as it was said
  }
  if (/\b404\b/.test(said)) return `${host} does not answer as a model API at this address.`;
  return said.replace(/^\d{3}:?\s*/, '').slice(0, 400) || `${who} gave no reply.`;
}

/** Sends a conversation ({ system, messages: [{ role, text }] }) to an endpoint's model and
    resolves with the reply's text. It is asked through pi (pi.js), which speaks to Anthropic's
    address in Anthropic's way and to every other in the way OpenAI set. `effort` is the
    reasoning level, for a model known to take one. `tools` are what the model may use as it
    answers ({ name, description, schema, run }); a model that turns them down (many that run
    on this Mac take none) is asked once more without. `onText` is handed the reply's words as
    they come, whole so far (they begin again once a tool has been used: `onUse` is told
    which). The key goes to the address it was given for and nowhere else: pi-ai is told
    where to go, so nothing set for other programs on this Mac can send it elsewhere. */
async function askEndpoint({ url, key, model, limit }, { system, messages, tools = [] }, { signal, timeout = LONG, effort, onText, onUse } = {}) {
  const anthropic = speaksAnthropic(url);
  const { host } = new URL(url);
  if (anthropic && !key) throw new Error('Anthropic needs an API key.');
  // (A model's reply may be as long as the model allows, up to a length no answer here needs to pass.)
  const asked = await pi.describe(anthropic ? 'anthropic-messages' : 'openai-completions', model, anthropic && url !== STAND_IN ? 'https://api.anthropic.com' : url, { most: anthropic ? Math.min(limit || 8192, 32000) : 0 });
  const late = AbortSignal.timeout(timeout);
  const off = AbortSignal.any([signal, late].filter(Boolean));
  const once = (using) =>
    new Promise((resolve) => {
      let said = '';
      // (An address that wants no key is sent none: pi-ai must be given something for one, so it is told to leave it out.)
      pi.ask({ model: asked, key: async () => key || 'none', headers: key ? undefined : { Authorization: null }, instructions: system, messages, effort, tools: using, signal: off }, (part) => {
        if (part.delta) {
          said += part.delta;
          const answer = answerOf(said).trimStart();
          if (answer) onText?.(answer);
        } else if (part.looking) {
          said = '';
          onUse?.(part.looking);
        } else resolve(part);
      });
    });
  let end = await once(tools);
  if (end.error && tools.length && !end.text && /tool|function/i.test(end.error)) end = await once([]);
  if (signal?.aborted) throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  if (end.stopped || late.aborted) throw new Error(`${anthropic ? 'Anthropic' : host} took too long to reply.`);
  if (end.error) throw new Error(/declined|refus/i.test(end.error) && anthropic ? 'Claude declined to answer this.' : endpointReason(end.error, { host, model, anthropic }));
  const text = answerOf(end.text).trim();
  if (!text) throw new Error(`${model} gave no reply.`);
  return text;
}

/** Proves a connection the only way that counts: by getting a reply. Gives { ok, ms }, or
    { ok: false, error }. */
async function proves(asked, signal) {
  const started = Date.now();
  try {
    await asked({ signal, timeout: 60e3 });
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { ok: false, error: e.message };
  }
}

// ---------- what is connected, and the model in use ----------

let seen = null; // the last look over this Mac for Claude Code: { installed, version, signedIn }
let spoken = null; // ChatGPT's models, as last listed

const endpointOf = (s, id) => s.endpoints.find((e) => e.id === id) || null;
const oneModel = (e) => [{ id: e.model, name: e.modelName || e.model, usual: true, levels: Array.isArray(e.levels) ? e.levels : [] }];

/** ChatGPT's models, while it is signed in to: asked for, or (with `quick`) only as last heard. */
async function chatModels(quick) {
  if (!assistant.status().signedIn) spoken = null;
  else if (!quick) spoken = await assistant.models().catch(() => spoken ?? []);
  return (spoken ?? []).map((m, i) => ({ id: m.id, name: m.name, usual: i === 0, levels: m.levels ?? [] }));
}

function claudeOffered() {
  const { list, usual } = claudeModels();
  const first = list.find((m) => m.id === usual) || list[0];
  return list.map((m) => ({ ...m, usual: m === first }));
}

/** Every way to a model, as the Settings page lists them: ChatGPT, Claude, then the endpoints
    in the order they were added (`api: true`, without their keys). Each says whether it is
    held (`connected`), switched on (`enabled`) and what `models` it offers. */
async function providers(s, quick) {
  const chat = assistant.status();
  const all = [
    { id: 'chatgpt', name: 'ChatGPT', way: chat.way, connected: chat.signedIn, models: await chatModels(quick) },
    { id: CLAUDE.id, name: CLAUDE.name, tool: CLAUDE.tool, ...(seen ?? {}), connected: s.claude, models: s.claude ? claudeOffered() : [] },
    ...s.endpoints.map((e) => ({ id: e.id, api: true, ...place(e.url), url: e.url, model: e.model, hasKey: Boolean(e.key), connected: true, models: oneModel(e) })),
  ];
  return all.map((p) => ({ ...p, enabled: p.connected && !s.off.includes(p.id) }));
}

/** The model questions go to: the one chosen, while its connection is held, switched on and
    still offers it; failing that, the usual model of the first connection that is. Null when
    none is. */
function inUse(s, all) {
  const held = all.filter((p) => p.enabled);
  const chosen = s.model && held.find((p) => p.id === s.model.provider);
  // (A connection whose models have not been listed yet is taken at its word.)
  if (chosen && (!chosen.models.length || chosen.models.some((m) => m.id === s.model.id))) return s.model;
  for (const p of [...held].sort((x, y) => (y.id === s.model?.provider) - (x.id === s.model?.provider))) {
    const usual = p.models.find((m) => m.usual);
    if (usual) return { provider: p.id, id: usual.id, name: usual.name };
  }
  return null;
}

/** The reasoning levels on offer for a model: those of ours that it takes. (One whose
    connection has not listed its models yet is taken to accept them all.) */
function levelsFor(all, model) {
  if (!model) return [];
  const offered = all.find((p) => p.id === model.provider)?.models ?? [];
  const takes = offered.length ? offered.find((m) => m.id === model.id)?.levels ?? [] : LEVELS;
  return LEVELS.filter((level) => takes.includes(level));
}

/** Everything the Intelligence part of Settings draws: the connections, the ready-made
    addresses, the model in use, the reasoning level chosen (`effort`) and the levels the
    model in use takes (`levels`). With `quick`, from what is already known: nothing is asked
    of ChatGPT or run on this Mac. */
async function view(quick = false) {
  const s = kept();
  const all = await providers(s, quick);
  const model = inUse(s, all);
  return { providers: all, presets: PRESETS, model, effort: s.effort, levels: levelsFor(all, model), quick };
}

// ---------- asking ----------

const asking = new Map(); // the asks under way here, and the checks and sign-ins, by their key: each can be called off

/** Asks the model in use, and tells of the answer as assistant.js does: { delta } for each
    piece of text, then { done, text, model } once it is whole, { stopped, text } if it was
    stopped, or { error, code, text } if it could not be had. `messages` is the whole
    conversation, oldest first, each { role, text }. `model` in what is told is the name of
    the model that answered. `system` is what the model is told of its part, if it is not
    the usual, and `about` a line more to tell it (what is being read). `tools` is what the
    model may use as it answers: { note, list }, a line that tells it of them and the tools
    themselves, each { name, description, input, schema, run } (`input` as zod has what it
    takes, which Claude's way asks for, and `schema` as JSON Schema, which pi's does). Each time one is used, { looking: its name } is told, and the words of the
    answer begin again. */
async function ask(id, { messages, thread, system = BRIEF, about, tools }, tell) {
  if (about) system = `${system} ${about}`;
  const s = kept();
  const all = await providers(s, false);
  const model = inUse(s, all);
  if (!model) return void tell({ error: 'No model is connected. Connect one in Settings.', code: 'no-model' });
  const effort = levelsFor(all, model).includes(s.effort) ? s.effort : undefined; // only where the model takes it
  const using = tools?.list?.length ? tools : null;
  if (using) system = `${system} ${using.note}`;
  if (model.provider === 'chatgpt') {
    return assistant.ask(id, { model: model.id, instructions: system, messages, thread, effort, tools: using?.list ?? [] }, (part) => tell(part.done ? { ...part, model: model.name } : part));
  }
  const stop = new AbortController();
  asking.set(String(id), stop);
  let text = '';
  // (The words come whole so far each time; what is new of them is passed on.)
  const onText = (whole) => {
    if (!whole.startsWith(text)) return;
    const delta = whole.slice(text.length);
    text = whole;
    if (delta) tell({ delta });
  };
  try {
    const said = (messages ?? []).filter((one) => one && typeof one.text === 'string' && one.text);
    const endpoint = endpointOf(s, model.provider);
    // (What it had begun to say before it used a tool gives way to what it says after.)
    const onUse = (name) => ((text = ''), tell({ looking: name }));
    const answer = endpoint
      ? await askEndpoint({ ...endpoint, key: await openKey(endpoint.key) }, { system, messages: said, tools: using?.list ?? [] }, { signal: stop.signal, effort, onText, onUse })
      : await askClaude({ system, messages: said, model: model.id, effort, tools: using?.list ?? [] }, { signal: stop.signal, onText, onUse });
    tell({ done: true, text: answer, model: model.name, usage: null });
  } catch (error) {
    if (stop.signal.aborted) tell({ stopped: true, text });
    else tell({ error: error.message, code: 'failed', text });
  } finally {
    asking.delete(String(id));
  }
}

/** The model in use just now: { provider, id, name }, or null when none is connected. */
async function model() {
  const s = kept();
  return inUse(s, await providers(s, false));
}

/** Whether there is a model in use to give tools of the app's own to: every way to one takes them. */
const sees = async () => Boolean(await model());

/** Stops an ask that is under way, wherever it went. */
function stop(id) {
  asking.get(String(id))?.abort();
  assistant.stop(id);
}

/** Asks the model in use one thing, apart from any chat: nothing of it is kept. `system` is
    what the model is told of its part (the usual, if none is given) and `text` what is asked.
    Gives { ok: true, text, model } (the name of the model that answered), { ok: false,
    error }, or { ok: false, cancelled: true } if it was called off (stop, under `key`). */
function once(key, { system, text } = {}) {
  const asked = String(text ?? '').trim();
  if (!asked) return Promise.resolve({ ok: false, error: 'There is nothing to ask.' });
  return new Promise((resolve) => {
    const heard = (part) => {
      if (part.delta) return;
      resolve(part.done ? { ok: true, text: part.text, model: part.model } : part.stopped ? { ok: false, cancelled: true } : { ok: false, error: part.error });
    };
    ask(key, { system: String(system || BRIEF), messages: [{ role: 'user', text: asked }] }, heard).catch((error) => resolve({ ok: false, error: error.message }));
  });
}

/** Runs one piece of work that can be called off, under `key`. Called off, it gives
    { ok: false, cancelled: true }; gone wrong, { ok: false, error }. */
async function cancellable(key, work) {
  const off = new AbortController();
  asking.set(String(key), off);
  try {
    const result = await work(off.signal);
    return off.signal.aborted ? { ok: false, cancelled: true } : result;
  } catch (e) {
    return off.signal.aborted ? { ok: false, cancelled: true } : { ok: false, error: e.message };
  } finally {
    asking.delete(String(key));
  }
}

/** An endpoint as the Add dialog sends it, made fit to use: its address made whole, and its
    key. A key left empty while changing a held endpoint means the key already kept, but only
    while the address is the one that key was given for. Throws a line if it cannot be used. */
async function drafted(draft) {
  const held = endpointOf(kept(), String(draft?.id || ''));
  const url = address(draft?.url);
  if (!url) throw new Error('That is not an address.');
  const typed = String(draft?.key || '').trim();
  const key = typed || (held && held.url === url ? await openKey(held.key) : '');
  return { id: held?.id, url, key, model: String(draft?.model || '').trim() };
}

// ---------- what the window can ask for ----------

function listen() {
  ipcMain.handle('connections:view', (event, quick) => view(Boolean(quick)));
  // Looks over this Mac for Claude Code, and asks ChatGPT for its models again.
  ipcMain.handle('connections:look', async () => {
    seen = await inspect();
    return view();
  });
  ipcMain.handle('connections:sign-in', (event, key) => cancellable(key, (signal) => signIn({ signal })));
  // Claude is held once it has answered. The model in use stays the model in use: a
  // connection added beside it does not take over.
  ipcMain.handle('connections:connect', async (event, key) => {
    const result = await cancellable(key, (signal) => proves((how) => askClaude({ system: CHECK.system, messages: CHECK.messages, model: claudeOffered().find((m) => m.usual)?.id }, { ...how, signal }), signal));
    if (result.ok) keep({ ...kept(), claude: true, off: kept().off.filter((id) => id !== CLAUDE.id) }); // (connected again, it is switched on)
    return result;
  });
  // The models an address lists, for the Add dialog to offer while its model is being typed.
  ipcMain.handle('connections:models', (event, key, draft) => cancellable(key, async (signal) => ({ ok: true, models: await endpointModels(await drafted(draft), { signal }) })));
  // Adds an endpoint, or changes a held one, once its model has answered.
  ipcMain.handle('connections:save', (event, key, draft) =>
    cancellable(key, async (signal) => {
      const { id = `api-${Date.now().toString(36)}`, ...endpoint } = await drafted(draft);
      // The key is sealed before anything is sent: a key that cannot be kept is not tried.
      const sealed = await sealKey(endpoint.key);
      if (!endpoint.model) return { ok: false, error: 'Name a model.' };
      // What the address says of the model, where it says anything: its full name, the reasoning levels it takes, and how long its reply may be.
      const listed = (await endpointModels(endpoint, { signal }).catch(() => [])).find((m) => m.id === endpoint.model);
      const result = await proves((how) => askEndpoint({ ...endpoint, limit: listed?.limit }, CHECK, { ...how, signal }), signal);
      if (!result.ok) return result;
      const s = kept();
      const held = { id, name: place(endpoint.url).name, url: endpoint.url, model: endpoint.model, modelName: listed?.name || endpoint.model, levels: listed?.levels || [], limit: listed?.limit || 0, key: sealed };
      // (A held one that is changed and was the model in use goes on being it, under its new name.)
      const model = s.model?.provider === id ? { provider: id, id: held.model, name: held.modelName } : s.model;
      keep({ ...s, model, endpoints: s.endpoints.some((e) => e.id === id) ? s.endpoints.map((e) => (e.id === id ? held : e)) : [...s.endpoints, held] });
      return result;
    })
  );
  // Letting Claude go only makes Inquisitive forget it: Claude Code stays signed in for its
  // own use. An endpoint is forgotten whole, its key with it.
  ipcMain.handle('connections:disconnect', (event, id) => {
    const s = kept();
    keep({ ...s, claude: id === CLAUDE.id ? false : s.claude, endpoints: s.endpoints.filter((e) => e.id !== id), off: s.off.filter((other) => other !== id), model: s.model?.provider === id ? null : s.model });
    return view();
  });
  // A held connection is used, or rested: switched off, it offers no models, and is not let go.
  ipcMain.handle('connections:enable', (event, id, on) => {
    const s = kept();
    keep({ ...s, off: on ? s.off.filter((other) => other !== id) : [...new Set([...s.off, String(id)])] });
    return view();
  });
  ipcMain.handle('connections:effort', (event, level) => {
    keep({ ...kept(), effort: LEVELS.includes(level) ? level : null });
    return view();
  });
  ipcMain.handle('connections:model', async (event, provider, id) => {
    const s = kept();
    const model = (await providers(s, false)).find((p) => p.id === provider && p.enabled)?.models.find((m) => m.id === id);
    if (model) keep({ ...s, model: { provider, id: model.id, name: model.name } });
    return view();
  });
  // One question to the model in use, kept nowhere (as sorting the library asks).
  ipcMain.handle('connections:once', (event, key, request) => once(String(key), request ?? {}));
  ipcMain.on('connections:cancel', (event, key) => stop(key));
  // Where Claude Code is to be had. (A test run off-screen opens nothing.)
  ipcMain.on('connections:page', () => !headless && shell.openExternal(CLAUDE.page));
}

module.exports = { listen, ask, stop, model, once, sees };
