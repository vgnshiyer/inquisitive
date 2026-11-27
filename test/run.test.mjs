// The app's off-screen tests: `npm test`.
//
// Each test (the .mjs files beside this one) starts the real app off-screen on a small test
// library, drives it with real clicks and typing, and prints what it saw, a line for each
// thing: a name, a tab, and what was seen. No account, key or model is touched: stand-ins
// answer in their place (helpers/aimock.mjs for ChatGPT's, Anthropic's and a local model's
// addresses; fake/ for Claude Code and Anthropic's Agent SDK).
//
// A test passes when what it printed is what it printed when it was last looked over and
// accepted: that is kept in expected/. To accept what a test prints now, after reading it:
//
//   UPDATE=1 npm test                                 every test
//   UPDATE=1 npm test -- --test-name-pattern=tools    the ones whose name has "tools" in it
//
// (Accepting runs each test twice: whatever differs between the two runs, such as how many
// pieces an answer happened to come in, is noted as changeable and not held against a later
// run.) The tests run one after another, since they share the app's test profile and a port.
// They need the sqlite3 program, and before Node 23.8 the zstd one.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const HERE = import.meta.dirname;
const UPDATE = Boolean(process.env.UPDATE);
// What a test sees that goes by how fast things happened to come (which states an answer was caught in as it arrived): never held against a run.
const CHANGEABLE = /as it came|while looking|steps seen|^1 slide$/;

// Each run: what it is called, the test, and what it is run with (which model answers).
const RUNS = [
  ['assistant: signing in with ChatGPT, and asking', 'assistant.mjs', {}],
  ['chats: the chat store', 'chats.mjs', {}],
  ['panel: the chat beside the page', 'panel.mjs', {}],
  ['connections: Claude, added models, the model in use', 'connections.mjs', {}],
  ['tools, with Claude', 'tools.mjs', {}],
  ['tools, with ChatGPT', 'tools.mjs', { CODEX: '1' }],
  ['tools, with an Anthropic key', 'tools.mjs', { ENDPOINT: 'anthropic' }],
  ['tools, with a local model', 'tools.mjs', { ENDPOINT: 'local' }],
  ['tools, with a local model that takes none', 'tools.mjs', { ENDPOINT: 'notools' }],
  ['chat end to end, with Claude', 'chat.mjs', {}],
  ['chat end to end, with ChatGPT', 'chat.mjs', { CODEX: '1' }],
];

/** What a run printed, with what is never the same twice taken out: times, the ids of chats, the ports and folders of this run. */
function steady(text) {
  return text
    .replaceAll(HERE, '<test>')
    .replaceAll(HERE.replace(os.homedir(), '~'), '<test>') // (as the app itself writes a folder under your own)
    .replaceAll(os.tmpdir(), '<tmp>')
    .replace(/\/private<tmp>/g, '<tmp>')
    .replace(/\d{10,}/g, 'N')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID')
    .replace(/127\.0\.0\.1:\d+/g, 'HOST')
    .replace(/\b(api|call|toolu|fc|msg)[-_][a-z0-9]{6,}\b/g, '$1-ID')
    .replace(/"ms":\d+/g, '"ms":N');
}

/** Runs a test and gives what it saw, by name; the run fails here if the test itself did. */
function seen(file, env) {
  // (A copy of the app left by a run that was cut short would hold the port.)
  spawnSync('pkill', ['-f', 'remote-debugging-port=9372']);
  const ran = spawnSync(process.execPath, [path.join(HERE, file)], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 8 * 60 * 1000 });
  const lines = steady(ran.stdout).split('\n').filter(Boolean);
  const stray = lines.filter((line) => !line.includes('\t'));
  assert.equal(ran.status, 0, `${file} stopped early:\n${steady(ran.stderr).slice(-1500)}\n${lines.slice(-3).join('\n')}`);
  assert.deepEqual(stray, [], `${file} printed something that is not a thing it saw`);
  const all = new Map();
  for (const line of lines) {
    const [name, ...rest] = line.split('\t');
    // (A name used again is told apart by which time it is.)
    let called = name;
    for (let nth = 2; all.has(called); nth++) called = `${name} (${nth})`;
    all.set(called, rest.join('\t'));
  }
  // (What went wrong inside the window while the test ran is the last thing each prints.)
  assert.equal(all.get('logs'), '"[]"', `${file} met errors in the window`);
  return all;
}

for (const [name, file, env] of RUNS) {
  test(name, { timeout: 20 * 60 * 1000 }, () => {
    const kept = path.join(HERE, 'expected', name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.tsv');
    const now = seen(file, env);
    if (UPDATE) {
      const again = seen(file, env);
      assert.deepEqual([...again.keys()], [...now.keys()], 'two runs did not see the same things');
      // What was the same both times is kept as it was; what differed, only by its name (marked ~).
      mkdirSync(path.dirname(kept), { recursive: true });
      writeFileSync(kept, [...now].map(([what, saw]) => (again.get(what) === saw && !CHANGEABLE.test(what) ? `${what}\t${saw}` : `~${what}`)).join('\n') + '\n');
      return;
    }
    assert.ok(existsSync(kept), `nothing is kept to hold "${name}" against yet: read what it prints (node test/${file}), then accept it with UPDATE=1`);
    const expected = readFileSync(kept, 'utf8').split('\n').filter(Boolean);
    assert.deepEqual([...now.keys()], expected.map((line) => line.replace(/^~/, '').split('\t')[0]), 'it did not see the things it saw before, in the order it saw them');
    // Everything that differs is told of together, not only the first of it.
    const differs = [];
    for (const line of expected) {
      const [what, ...rest] = line.split('\t');
      if (line.startsWith('~') || CHANGEABLE.test(what)) continue; // (changeable from run to run: only that it was seen is held)
      if (now.get(what) !== rest.join('\t')) differs.push(`${what}\n    was: ${rest.join('\t')}\n    now: ${now.get(what)}`);
    }
    assert.equal(differs.length, 0, `${differs.length} of what it saw differs:\n  ${differs.join('\n  ')}`);
  });
}

// (So that nothing of the last run is left holding the port.)
test.after(() => void spawnSync('pkill', ['-f', 'remote-debugging-port=9372']));
