// Asking a model through pi. Two of its packages do the work that is the same whichever
// model answers:
// - pi-ai (@earendil-works/pi-ai) speaks to each kind of address in that address's own way:
//   ChatGPT signed in to (either way), an address that answers as OpenAI's API does (OpenAI
//   itself, Ollama, LM Studio and most others), and Anthropic's;
// - pi's agent loop (@earendil-works/pi-agent-core) does the going back and forth when the
//   model uses a tool: the model asks for it, it is run here, what it found is sent back,
//   and so on until there is an answer.
// What is asked, the tools, and where the key or the sign-in comes from are the caller's
// (assistant.js for ChatGPT, connections.js for an address with a key). Claude through Claude
// Code does not come this way: Anthropic's own Agent SDK runs that (connections.js).

const USES = 16; // as many times as the tools may be used in one answer

// (Each is loaded when it is first wanted: they are modules of the newer kind, and not small.)
const lib = {
  loop: () => import('@earendil-works/pi-agent-core'),
  'openai-codex-responses': () => import('@earendil-works/pi-ai/api/openai-codex-responses'),
  'openai-responses': () => import('@earendil-works/pi-ai/api/openai-responses'),
  'openai-completions': () => import('@earendil-works/pi-ai/api/openai-completions'),
  'anthropic-messages': () => import('@earendil-works/pi-ai/api/anthropic-messages'),
};
// What pi-ai knows of the models of each kind (what they take, how they are to be spoken to).
const known = {
  'openai-codex-responses': () => import('@earendil-works/pi-ai/providers/openai-codex.models').then((all) => all.OPENAI_CODEX_MODELS),
  'openai-responses': () => import('@earendil-works/pi-ai/providers/openai.models').then((all) => all.OPENAI_MODELS),
  'anthropic-messages': () => import('@earendil-works/pi-ai/providers/anthropic.models').then((all) => all.ANTHROPIC_MODELS),
  'openai-completions': async () => ({}),
};

const NOTHING = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** A model as pi-ai wants one described: `api` is the way its address is spoken to (one of
    lib's), `id` its name there, `url` the address. What pi-ai knows of it is used; of one it
    has not heard of, a plain description (or, with `like`, what it knows of the latest of
    that kind). `most` is how long its reply may be, in tokens, where that is known. */
async function describe(api, id, url, { like = false, most = 0 } = {}) {
  const all = await known[api]().catch(() => ({}));
  const found = all[id] ?? (like ? Object.values(all).at(-1) : null);
  const plain = { name: id, api, provider: 'inquisitive', reasoning: false, input: ['text'], cost: NOTHING, contextWindow: 128000, maxTokens: 8192 };
  return { ...(found ?? plain), id, baseUrl: url, ...(most ? { maxTokens: most } : {}) };
}

/** Asks a model, and tells of the answer as it comes: { delta } for each piece of its words,
    { looking: a tool's name } each time a tool is used (the words begin again after it), and
    then one of { done, text }, { stopped, text } or { error, text } (`error` is what went
    wrong, in the words pi-ai or the address gave; `text` what had come).

    `model` is the model as `describe` gives it. `key` gives the key or token to ask with,
    each time the model is spoken to (so that one that runs out midway can be renewed).
    `messages` is the conversation, oldest first, each { role, text }, the last of them the
    question. `tools` are what the model may use: each { name, description, schema, run }.
    `effort` is the reasoning level, for a model that takes one: with none, the model thinks
    as much as it does by itself. `signal` stops it. `more` is anything else the way to this
    kind of address is to be told (pi-ai's own options for it), and `shape` a last word on
    what is sent: it is handed the request as it is about to go, to change. */
async function ask({ model, key, headers, instructions, messages, thread, effort, tools = [], signal, more = {}, shape }, tell) {
  let text = '';
  try {
    const [{ Agent }, way] = await Promise.all([lib.loop(), lib[model.api]()]);
    const said = (messages ?? []).filter((one) => one && typeof one.text === 'string' && one.text);
    const now = said.at(-1);
    if (now?.role !== 'user') return void tell({ error: 'There is nothing to ask.', text });
    // The conversation so far, as pi-ai keeps one.
    const before = said.slice(0, -1).map((one, at) =>
      one.role === 'assistant'
        ? { role: 'assistant', content: [{ type: 'text', text: one.text }], api: model.api, provider: model.provider, model: model.id, usage: { ...NOTHING, totalTokens: 0, cost: { ...NOTHING, total: 0 } }, stopReason: 'stop', timestamp: at }
        : { role: 'user', content: one.text, timestamp: at },
    );
    let used = 0;
    const agent = new Agent({
      initialState: {
        systemPrompt: String(instructions ?? ''),
        model,
        messages: before,
        tools: tools.map((one) => ({
          name: one.name,
          label: one.name,
          description: one.description,
          parameters: one.schema,
          execute: async (call, input) => ({ content: [{ type: 'text', text: String(await one.run(input ?? {})) }], details: {} }),
        })),
      },
      getApiKey: () => key(),
      streamFn: (to, context, options) =>
        way.streamSimple(to, context, {
          apiKey: options?.apiKey,
          signal: options?.signal,
          sessionId: options?.sessionId,
          headers,
          reasoning: effort ? String(effort) : undefined,
          // (With no level chosen, nothing is said of how much to think.)
          onPayload: (body) => {
            if (!effort) {
              delete body.reasoning; // (as OpenAI's addresses are told it)
              if (body.output_config) delete body.output_config.effort; // (as Anthropic's is)
              if (body.output_config && !Object.keys(body.output_config).length) delete body.output_config;
            }
            shape?.(body);
            return body;
          },
          ...more,
        }),
      sessionId: thread ? String(thread) : undefined,
      identity: null,
      toolExecution: 'sequential',
      beforeToolCall: async () => (++used > USES ? { block: true, reason: 'Enough has been looked up for one answer. Answer now, from what you have.' } : undefined),
    });
    agent.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        text += event.assistantMessageEvent.delta;
        tell({ delta: event.assistantMessageEvent.delta });
      } else if (event.type === 'tool_execution_start') {
        text = ''; // (what it had begun to say before it used a tool gives way to what it says after)
        tell({ looking: event.toolName });
      }
    });
    signal?.addEventListener('abort', () => agent.abort(), { once: true });
    if (signal?.aborted) return void tell({ stopped: true, text });
    await agent.prompt(now.text);
    const last = agent.state.messages.findLast((one) => one.role === 'assistant');
    if (signal?.aborted || last?.stopReason === 'aborted') return void tell({ stopped: true, text });
    if (!last || last.stopReason === 'error') return void tell({ error: String(last?.errorMessage || 'No answer came.'), text });
    const whole = last.content.filter((block) => block.type === 'text').map((block) => block.text).join('').trim();
    if (!whole) return void tell({ error: 'No answer came.', text });
    tell({ done: true, text: whole });
  } catch (error) {
    if (signal?.aborted) tell({ stopped: true, text });
    else tell({ error: String(error?.message ?? error), text, threw: error });
  }
}

module.exports = { ask, describe };
