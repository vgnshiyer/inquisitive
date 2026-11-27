// A stand-in for OpenAI's sign-in pages and API, on this machine, for testing the assistant without anyone's account.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
// (Node reads zstd itself from 23.8; before that, the zstd program does.)
const unsqueeze = (raw) => (zlib.zstdDecompressSync ? zlib.zstdDecompressSync(raw) : execFileSync('zstd', ['-d', '-c'], { input: raw }));
import { ANSWERS, scripted } from '../fake/answers.mjs';
export async function startMock() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const seen = { authorize: [], token: [], revoke: [], responses: [], models: 0, refreshes: 0, codexAuthorize: [], codexToken: [], codexResponses: [], anthropic: [], chat: [] };
  const mode = { deny: false, noshare: false, badnonce: false, rejectRefresh: false, expires: 3600, refuseCodes: 0, newClient: null };
  const codes = new Map();
  let base = '', n = 0, access = null, refresh = null;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const idToken = (client, nonce) => { const head = b64({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }); const body = b64({ iss: base, aud: client, sub: 'user-123', email: 'reader@example.com', name: 'A Reader', nonce: mode.badnonce ? 'wrong' : nonce, exp: Math.floor(Date.now() / 1000) + 600 }); return head + '.' + body + '.' + crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey).toString('base64url'); };
  const read = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); });
  const readRaw = (req) => new Promise((r) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => r(Buffer.concat(parts))); });
  const json = (res, status, o) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
  const issue = (client, nonce) => { n++; access = 'at_' + n; refresh = 'rt_' + n; return { access_token: access, refresh_token: refresh, ...(nonce ? { id_token: idToken(client, nonce) } : {}), expires_in: mode.expires, scope: 'openid profile email offline_access resource.invoke' + (mode.noshare ? '' : ' chatgpt.tokens.use.direct') }; };
  // What the stand-in models do, whichever address they are asked at: what the question's capital words say, in order, with the tools offered.
  const textOf = (content) => (typeof content === 'string' ? content : (content ?? []).map((c) => c.text ?? '').join(''));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const stepsOf = (last, offered) => (offered ? [...last.matchAll(/CONTENTS|PLACE|HIGHLIGHTS|READ (\d+)(?: FROM (\d+))?|SEARCH "([^"]*)"|BADREAD|NOSUCH/g)] : []);
  const toolOf = (step) => (step[0] === 'CONTENTS' ? ['contents', {}] : step[0] === 'PLACE' ? ['place', {}] : step[0] === 'HIGHLIGHTS' ? ['highlights', {}] : step[0] === 'BADREAD' ? ['read', { section: 'two' }] : step[0] === 'NOSUCH' ? ['burn', {}] : step[0].startsWith('READ') ? ['read', { section: Number(step[1]), ...(step[2] ? { from: Number(step[2]) } : {}) }] : ['search', { query: step[3] }]);
  // (Of something very long, such as a chat to be summarised, only its end is said back.)
  const answerOf = (who, last, steps, got) => (scripted(last) ? ANSWERS[scripted(last)] : steps.length ? got.map((text) => text.slice(0, 700)).join(' ¶ ') : who + (last.length > 2000 ? last.slice(-120) : last));
  // An answer as OpenAI's Responses API sends one (ChatGPT signed in to, either way).
  const responses = async (res, body, who, { failed, slowWords }) => {
    const at = body.input.findLastIndex((item) => item.role === 'user');
    const last = textOf(body.input[at].content);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    const slow = last.includes('SLOW');
    const output = [];
    const say = async (text, words) => {
      const index = output.length, id = 'msg_' + index;
      send({ type: 'response.output_item.added', output_index: index, item: { type: 'message', id, role: 'assistant', status: 'in_progress', content: [] } });
      send({ type: 'response.content_part.added', output_index: index, item_id: id, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } });
      for (const word of words ?? text.match(/\S+\s*/g) ?? []) { if (res.destroyed) return; send({ type: 'response.output_text.delta', output_index: index, item_id: id, content_index: 0, delta: word }); await pause(slow ? 120 : 10); }
      const item = { type: 'message', id, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
      send({ type: 'response.output_item.done', output_index: index, item }); output.push(item);
    };
    const call = (name, args) => {
      const index = output.length, id = 'fc_' + index, call_id = 'call_' + Math.random().toString(36).slice(2, 10), text = JSON.stringify(args);
      send({ type: 'response.output_item.added', output_index: index, item: { type: 'function_call', id, call_id, name, arguments: '', status: 'in_progress' } });
      send({ type: 'response.function_call_arguments.delta', output_index: index, item_id: id, delta: text });
      send({ type: 'response.function_call_arguments.done', output_index: index, item_id: id, arguments: text });
      const item = { type: 'function_call', id, call_id, name, arguments: text, status: 'completed' };
      send({ type: 'response.output_item.done', output_index: index, item }); output.push(item);
    };
    const finish = () => { send({ type: 'response.completed', response: { id: 'resp_1', status: 'completed', output, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } }); res.end(); };
    send({ type: 'response.created', response: { id: 'resp_1', status: 'in_progress' } });
    // (pi-ai offers the tools at the head of what is said, or beside it.)
    const offered = body.tools ?? body.input.find((item) => item.type === 'additional_tools')?.tools ?? [];
    const steps = stepsOf(last, offered.length);
    const got = body.input.slice(at + 1).filter((item) => item.type === 'function_call_output').map((item) => textOf(item.output));
    if (last.includes('FAIL') && got.length === steps.length) { await say('Hello, wo'); send({ type: 'response.failed', response: { status: 'failed', error: failed } }); return res.end(); }
    if (last.includes('LOOP') && offered.length) { if (got.at(-1)?.includes('Enough has been looked up')) { await say('I have looked enough: ' + got.length + ' times.'); return finish(); } call('contents', {}); return finish(); }
    if (got.length < steps.length) {
      if (!got.length) await say('Let me look at the book. ');
      if (slow) await pause(400);
      call(...toolOf(steps[got.length]));
      return finish();
    }
    if (slow && !steps.length) { await say(slowWords.join(''), slowWords); if (last.includes('CUT')) return res.end(); return finish(); }
    await say(answerOf(who, last, steps, got));
    if (last.includes('CUT')) return res.end();
    return finish();
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    if (url.pathname === '/api/accounts/authorize') {
      const q = Object.fromEntries(url.searchParams); seen.authorize.push(q);
      const back = new URL(q.redirect_uri);
      if (mode.deny) { back.searchParams.set('error', 'access_denied'); back.searchParams.set('state', q.state); return res.writeHead(302, { Location: back.href }).end(); }
      const code = 'code_' + crypto.randomBytes(6).toString('hex');
      const client = q.client_id === 'dynamic_agent_client' ? (mode.newClient ?? 'oaiapp_test123') : q.client_id;
      codes.set(code, { challenge: q.code_challenge, nonce: q.nonce, client, redirect: q.redirect_uri });
      back.searchParams.set('code', code); back.searchParams.set('state', q.state);
      if (q.client_id === 'dynamic_agent_client') back.searchParams.set('client_id', client);
      return res.writeHead(302, { Location: back.href }).end();
    }
    if (url.pathname === '/api/accounts/oauth/token') {
      const f = Object.fromEntries(new URLSearchParams(await read(req))); seen.token.push(f);
      if (f.grant_type === 'authorization_code') {
        const c = codes.get(f.code); codes.delete(f.code);
        if (mode.refuseCodes > 0) { mode.refuseCodes--; return json(res, 400, { error: 'invalid_grant' }); }
        if (!c || c.client !== f.client_id || c.redirect !== f.redirect_uri || crypto.createHash('sha256').update(f.code_verifier ?? '').digest('base64url') !== c.challenge) return json(res, 400, { error: 'invalid_grant' });
        return json(res, 200, issue(c.client, c.nonce));
      }
      if (f.grant_type === 'refresh_token') {
        seen.refreshes++;
        if (mode.rejectRefresh) return json(res, 400, { error: 'invalid_grant' });
        if (f.refresh_token !== refresh) return json(res, 400, { error: 'refresh_token_reused' });
        await new Promise((r) => setTimeout(r, 150));
        return json(res, 200, issue(f.client_id, null));
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }
    // Codex's own sign-in and address.
    if (url.pathname === '/oauth/authorize') {
      const q = Object.fromEntries(url.searchParams); seen.codexAuthorize.push(q);
      const back = new URL(q.redirect_uri.replace('localhost', '127.0.0.1')); const code = 'cx_' + crypto.randomBytes(6).toString('hex');
      codes.set(code, { challenge: q.code_challenge, client: q.client_id, redirect: q.redirect_uri, codex: true });
      back.searchParams.set('code', code); back.searchParams.set('state', q.state);
      return res.writeHead(302, { Location: back.href }).end();
    }
    if (url.pathname === '/oauth/token') {
      const f = Object.fromEntries(new URLSearchParams(await read(req))); seen.codexToken.push(f);
      if (f.grant_type === 'authorization_code') {
        const c = codes.get(f.code); codes.delete(f.code);
        if (!c || !c.codex || c.client !== f.client_id || c.redirect !== f.redirect_uri || 'resource' in f || crypto.createHash('sha256').update(f.code_verifier ?? '').digest('base64url') !== c.challenge) return json(res, 400, { error: 'invalid_grant' });
        n++; refresh = 'crt_' + n;
        access = b64({ alg: 'RS256', kid: 'test-key' }) + '.' + b64({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct_42' }, n }) + '.sig';
        const head = b64({ alg: 'RS256', kid: 'test-key' }), body = b64({ iss: base, aud: [f.client_id], sub: 'user-123', email: 'reader@example.com', name: 'A Reader', 'https://api.openai.com/auth': { chatgpt_account_id: 'acct_42', chatgpt_plan_type: 'free' }, exp: Math.floor(Date.now() / 1000) + 600 });
        return json(res, 200, { access_token: access, refresh_token: refresh, id_token: head + '.' + body + '.sig', expires_in: mode.expires });
      }
      if (f.grant_type === 'refresh_token') {
        seen.refreshes++;
        if (f.refresh_token !== refresh || f.client_id !== 'app_EMoamEEZ73f0CkXaXp7hrann') return json(res, 400, { error: 'refresh_token_reused' });
        n++; refresh = 'crt_' + n;
        access = b64({ alg: 'RS256', kid: 'test-key' }) + '.' + b64({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct_42' }, n }) + '.sig';
        return json(res, 200, { access_token: access, refresh_token: refresh, expires_in: mode.expires });
      }
    }
    if (url.pathname.startsWith('/codex/')) {
      if (req.headers.authorization !== 'Bearer ' + access || req.headers['chatgpt-account-id'] !== 'acct_42') return json(res, 401, { detail: 'Unauthorized' });
      if (url.pathname === '/codex/models') { if (mode.noCodexModels) return json(res, 404, { detail: 'no' }); return json(res, 200, { models: [{ slug: 'gpt-6.2-sol', display_name: 'GPT-6.2 Sol', visibility: 'list', supported_in_api: true }] }); }
      if (url.pathname === '/codex/responses') {
        // (pi-ai sends what it asks squeezed with zstd, as Codex itself does.)
        const raw = await readRaw(req);
        const body = JSON.parse(req.headers['content-encoding'] === 'zstd' ? unsqueeze(raw).toString() : raw.toString());
        seen.codexResponses.push({ body, headers: { originator: req.headers.originator, account: req.headers['chatgpt-account-id'], 'session-id': req.headers['session-id'], squeezed: req.headers['content-encoding'] === 'zstd' } });
        if (!body.instructions && !['developer', 'system'].includes(body.input[0]?.role)) return json(res, 400, { detail: 'Instructions are required' });
        if (textOf(body.input.findLast((item) => item.role === 'user').content).includes('LIMIT')) return json(res, 429, { error: { type: 'usage_limit_reached', message: 'The usage limit has been reached' } });
        return responses(res, body, 'From Codex: ', { failed: { code: 'usage_not_included', message: 'not included' }, slowWords: Array.from({ length: 30 }, (_, i) => 'x' + i + ' ') });
      }
    }
    if (url.pathname === '/.well-known/jwks.json') return json(res, 200, { keys: [jwk] });
    if (url.pathname === '/api/accounts/oauth/revoke') { seen.revoke.push(Object.fromEntries(new URLSearchParams(await read(req)))); return res.writeHead(200).end(); }
    if (url.pathname.startsWith('/v1/')) {
      if (req.headers.authorization !== 'Bearer ' + access) return json(res, 401, { error: { code: 'subscription_sharing_invalid_user', message: 'bad token' } });
      if (url.pathname === '/v1/models') { seen.models++; return json(res, 200, { models: [{ slug: 'gpt-6.1-sol', display_name: 'GPT-6.1 Sol', visibility: 'list', supported_in_api: true, supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }] }, { slug: 'gpt-6.1-terra', display_name: 'GPT-6.1 Terra', visibility: 'list', supported_in_api: true }, { slug: 'internal', display_name: 'Internal', visibility: 'hide', supported_in_api: true }] }); }
      if (url.pathname === '/v1/responses') {
        const body = JSON.parse(await read(req)); seen.responses.push({ body, headers: { 'session-id': req.headers['session-id'] ?? req.headers.session_id, 'thread-id': req.headers['thread-id'] } });
        if (body.store !== false || body.stream !== true) return json(res, 400, { error: { code: 'subscription_sharing_unsupported_capability', message: 'bad request', param: 'store' } });
        if (textOf(body.input.findLast((item) => item.role === 'user').content).includes('LIMIT')) return json(res, 429, { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'limit' } });
        return responses(res, body, 'Hello, world. You said: ', { failed: { code: 'subscription_sharing_usage_unavailable', message: 'unavailable' }, slowWords: Array.from({ length: 30 }, (_, i) => 'w' + i + ' ') });
      }
    }
    // Anthropic's API, as its SDK speaks it.
    if (url.pathname.startsWith('/anthropic/v1/')) {
      seen.anthropicAuth = [req.headers.authorization ?? null, req.headers['x-api-key'] ?? null];
      if (req.headers.authorization !== 'Bearer sk-ant-test' && req.headers['x-api-key'] !== 'sk-ant-test') return json(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (url.pathname === '/anthropic/v1/models') return json(res, 200, { data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', max_tokens: 128000, capabilities: { effort: { supported: true, low: { supported: true }, medium: { supported: true }, high: { supported: true }, max: { supported: true } } } }, { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', max_tokens: 64000 }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-haiku-5-5' });
      if (url.pathname === '/anthropic/v1/messages') {
        const body = JSON.parse(await read(req)); seen.anthropic.push(body);
        // The question is the last thing the reader said in words; after it, what the tools gave.
        const asked = (m) => m.role === 'user' && (typeof m.content === 'string' || m.content.some((c) => c.type === 'text'));
        const at = body.messages.findLastIndex(asked);
        const last = textOf(body.messages[at].content);
        const got = body.messages.slice(at + 1).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((c) => c.type === 'tool_result').map((c) => textOf(c.content));
        const steps = stepsOf(last, body.tools?.length);
        if (body.model === 'claude-nope') return json(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'model: claude-nope' } });
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
        send({ type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
        const say = async (index, words) => {
          send({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
          for (const w of words) { if (res.destroyed) return; send({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: w } }); await pause(last.includes('SLOW') ? 120 : 15); }
          send({ type: 'content_block_stop', index });
        };
        let stop = last.includes('REFUSE') ? 'refusal' : 'end_turn';
        if (got.length < steps.length) {
          const [name, input] = toolOf(steps[got.length]);
          if (!got.length) await say(0, ['Let me look ', 'at the book. ']);
          const index = got.length ? 0 : 1;
          send({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: 'toolu_' + Math.random().toString(36).slice(2, 10), name, input: {} } });
          send({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } });
          send({ type: 'content_block_stop', index });
          stop = 'tool_use';
        } else await say(0, last.includes('SLOW') ? Array.from({ length: 30 }, (_, i) => 'a' + i + ' ') : steps.length || scripted(last) ? answerOf('', last, steps, got).match(/\S+\s*/g) : ['From ', 'Anthropic: ', last]);
        send({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 7 } });
        send({ type: 'message_stop' });
        return res.end();
      }
    }
    // An address that speaks the API OpenAI set, as a model on this Mac does: no key wanted.
    if (url.pathname.startsWith('/oai/v1/')) {
      if (url.pathname === '/oai/v1/models') return json(res, 200, { data: [{ id: 'qwen3' }, { id: 'llama3.2' }] });
      if (url.pathname === '/oai/v1/chat/completions') {
        const body = JSON.parse(await read(req)); seen.chat.push({ body, auth: req.headers.authorization ?? null });
        const at = body.messages.findLastIndex((m) => m.role === 'user');
        const last = textOf(body.messages[at].content);
        const got = body.messages.slice(at + 1).filter((m) => m.role === 'tool').map((m) => textOf(m.content));
        if (body.model === 'missing') return json(res, 404, { error: { message: 'model "missing" not found, try pulling it first' } });
        // (One of its models takes no tools, as many that run on a Mac do not, and says so.)
        if (body.model === 'llama3.2' && body.tools?.length) return json(res, 400, { error: { message: 'registry.ollama.ai/library/llama3.2:latest does not support tools' } });
        const steps = stepsOf(last, body.tools?.length);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
        send({ role: 'assistant', content: '' });
        if (got.length < steps.length) {
          const [name, input] = toolOf(steps[got.length]);
          if (!got.length) for (const w of ['Let me look ', 'at the book. ']) { send({ content: w }); await pause(15); }
          send({ tool_calls: [{ index: 0, id: 'call_' + Math.random().toString(36).slice(2, 10), type: 'function', function: { name, arguments: JSON.stringify(input) } }] });
          send({}, 'tool_calls');
        } else {
          for (const w of steps.length || scripted(last) ? answerOf('', last, steps, got).match(/\S+\s*/g) : ['<think>', 'let me think', '</think>', 'From ', 'this Mac: ', last]) { if (res.destroyed) return; send({ content: w }); await pause(15); }
          send({}, 'stop');
        }
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }
    res.writeHead(404).end('no');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  return { base, seen, mode, close: () => server.close(), current: () => ({ access, refresh }) };
}
