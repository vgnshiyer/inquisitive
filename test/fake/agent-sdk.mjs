// A stand-in for Anthropic's Agent SDK, for testing off-screen: it runs no Claude Code and touches
// no account. It does what the question's capital words say, in order, with the tools it is given:
//   CONTENTS            uses `contents`
//   READ 2 [FROM 50]    uses `read`
//   SEARCH "words"      uses `search`
//   PLACE               uses `place`
//   HIGHLIGHTS          uses `highlights`
//   BADREAD             uses `read` with a section that is no number
//   LOOP                ends as the real one does when it has gone round too often
//   FAIL                throws, as when Claude Code cannot be run
//   SLOW                says its words slowly
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ANSWERS, scripted } from './answers.mjs';

const STATE = process.env.INQUISITIVE_TEST_STATE || import.meta.dirname; // where it notes down how it was run, and reads whether it is signed in
const log = (entry) => appendFileSync(path.join(STATE, 'sdk-calls.jsonl'), JSON.stringify(entry) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const tool = (name, description, inputSchema, handler) => ({ name, description, inputSchema, handler });
export const createSdkMcpServer = ({ name, version, tools }) => ({ type: 'sdk', name, version, tools });

export function query({ prompt, options }) {
  return (async function* () {
    let asked = '';
    for await (const one of prompt) asked = String(one.message.content);
    const last = asked.split('The reader now asks:\n').at(-1);
    const server = options.mcpServers?.book ?? { tools: [] };
    // (How it was run is also set down as the stand-in for Claude Code itself sets it down: what it would have been run with, and what it was asked.)
    appendFileSync(path.join(STATE, 'calls.jsonl'), JSON.stringify({ args: ['--system-prompt', options.systemPrompt, ...(options.model ? ['--model', options.model] : []), ...(options.effort ? ['--effort', options.effort] : [])], prompt: asked, cwd: options.cwd, tools: options.tools, sources: options.settingSources, persist: options.persistSession, offered: server.tools.map((t) => t.name) }) + '\n');
    const state = (() => { try { return JSON.parse(readFileSync(path.join(STATE, 'state.json'), 'utf8')); } catch { return {}; } })();
    log({ asked, last, system: options.systemPrompt, model: options.model, effort: options.effort, tools: options.tools, allowed: options.allowedTools, strict: options.strictMcpConfig, sources: options.settingSources, persist: options.persistSession, turns: options.maxTurns, program: options.pathToClaudeCodeExecutable, cwd: options.cwd, offered: server.tools.map((t) => [t.name, Object.keys(t.inputSchema)]), app: options.env?.CLAUDE_AGENT_SDK_CLIENT_APP });
    const stopped = options.abortController?.signal;
    const check = () => {
      if (stopped?.aborted) throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    };
    const slow = last.includes('SLOW');
    const say = async function* (text) {
      yield { type: 'stream_event', event: { type: 'message_start' } };
      for (const word of text.match(/\S+\s*/g) ?? []) {
        check();
        yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: word } } };
        await sleep(slow ? 120 : 12);
      }
    };
    const use = async (name, input) => {
      const one = server.tools.find((t) => t.name === name);
      if (!one) return 'No such tool.';
      // (As the real one does: what the tool is given must be what it says it takes.)
      for (const [key, kind] of Object.entries(one.inputSchema)) {
        const tried = kind.safeParse(input[key]);
        if (!tried.success) return `Invalid input for ${key}.`;
      }
      const gave = await Promise.race([one.handler(input), new Promise((_, no) => stopped?.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' }))))]);
      return gave.content[0].text;
    };
    yield { type: 'system', subtype: 'init', model: options.model, tools: options.allowedTools };
    if (!state.signedIn) return void (yield { type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' });
    if (last.includes('FAIL')) throw new Error('Claude Code process exited with code 1');
    const steps = [...last.matchAll(/CONTENTS|PLACE|HIGHLIGHTS|READ (\d+)(?: FROM (\d+))?|SEARCH "([^"]*)"|BADREAD/g)];
    const got = [];
    if (steps.length) yield* say('Let me look at the book. ');
    for (const step of steps) {
      check();
      await sleep(slow ? 400 : 60);
      if (step[0] === 'CONTENTS') got.push(await use('contents', {}));
      else if (step[0] === 'PLACE') got.push(await use('place', {}));
      else if (step[0] === 'HIGHLIGHTS') got.push(await use('highlights', {}));
      else if (step[0] === 'BADREAD') got.push(await use('read', { section: 'two' }));
      else if (step[0].startsWith('READ')) got.push(await use('read', { section: Number(step[1]), ...(step[2] ? { from: Number(step[2]) } : {}) }));
      else got.push(await use('search', { query: step[3] }));
      yield { type: 'user', message: { role: 'user', content: [{ type: 'tool_result' }] } };
    }
    if (last.includes('LOOP')) return void (yield { type: 'result', subtype: 'error_max_turns', is_error: true, errors: [] });
    const answer = scripted(last) ? ANSWERS[scripted(last)] : steps.length ? got.map((text) => text.slice(0, 700)).join(' ¶ ') : asked.includes('single word: ready') ? 'ready' : slow ? Array.from({ length: 30 }, (_, i) => 'c' + i + ' ').join('') : 'From Claude Code: ' + asked.split('\n').at(-1);
    yield* say(answer);
    yield { type: 'result', subtype: 'success', is_error: false, result: answer, num_turns: steps.length + 1 };
  })();
}
