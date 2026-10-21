import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../server/agent.js';

const call = (name = 'sample', args = '{}', id = 'call_1') => ({ id, type: 'function', function: { name, arguments: args } });
const reply = (tool_calls, content = null) => ({ choices: [{ message: { role: 'assistant', content, ...(tool_calls ? { tool_calls } : {}) } }] });
const tool = (execute) => ({ definition: { type: 'function', function: { name: 'sample', parameters: { type: 'object' } } }, execute });
const base = { model: 'test', messages: [{ role: 'user', content: 'Help' }] };

test('executes multiple tools, preserves IDs and continues to final answer', async () => {
  let rounds = 0;
  const messages = structuredClone(base.messages);
  const result = await runAgent({ ...base, messages, tools: [tool(async (args) => args)], complete: async (body) => {
    assert.equal(body.stream, false);
    assert.equal(body.tools[0].function.name, 'sample');
    if (++rounds === 1) return reply([call('sample', '{"value":1}'), call('sample', '{}', 'call_2')]);
    assert.equal(body.messages[1].role, 'assistant');
    assert.equal(body.messages[2].tool_call_id, 'call_1');
    assert.deepEqual(JSON.parse(body.messages[2].content), { ok: true, result: { value: 1 } });
    assert.equal(body.messages[3].tool_call_id, 'call_2');
    return reply(null, 'Done');
  } });
  assert.equal(result.iterations, 2);
  assert.equal(result.toolExecutions, 2);
  assert.deepEqual(messages, base.messages);
});

test('unknown tool, invalid JSON and handler failure become tool errors', async () => {
  for (const requested of [call('unknown'), call('sample', '{bad'), call()]) {
    let round = 0;
    await runAgent({ ...base, tools: [tool(async () => { throw new Error('Failure'); })], complete: async (body) => {
      if (++round === 1) return reply([requested]);
      assert.equal(JSON.parse(body.messages.at(-1).content).ok, false);
      return reply(null, 'Explained');
    } });
  }
});

test('per-tool timeout allows model to recover', async () => {
  let round = 0;
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await runAgent({ ...base, toolTimeoutMs: 10, tools: [tool(() => new Promise(() => {}))], complete: async (body) => {
      if (++round === 1) return reply([call()]);
      assert.match(body.messages.at(-1).content, /Tool timeout/);
      return reply(null, 'Timed out');
    } });
  } finally { clearInterval(keepAlive); }
});

test('iteration cap prevents further execution', async () => {
  let executed = 0;
  await assert.rejects(runAgent({ ...base, maxIterations: 2, tools: [tool(async () => { executed++; })], complete: async () => reply([call()]) }), { code: 'iteration_limit' });
  assert.equal(executed, 1);
});

test('abort stops an uncooperative tool', async () => {
  const controller = new AbortController();
  await assert.rejects(runAgent({ ...base, signal: controller.signal, tools: [tool(() => { controller.abort(); return new Promise(() => {}); })], complete: async () => reply([call()]) }), { name: 'AbortError' });
});

test('model timeout and malformed tool IDs are rejected', async () => {
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(runAgent({ ...base, tools: [], modelTimeoutMs: 10, complete: () => new Promise(() => {}) }), { code: 'model_timeout' });
  } finally { clearInterval(keepAlive); }
  await assert.rejects(runAgent({ ...base, tools: [], complete: async () => reply([call(), call()]) }), { code: 'bad_tool_calls' });
});