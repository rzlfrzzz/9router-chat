import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_REQUEST_BYTES, serializeChat, streamChat } from '../src/lib/api.js';

const delta = (text, finish = null) => `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: finish }] })}`;

async function receive(payload) {
  const original = globalThis.fetch;
  let output = '';
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers['X-9Router-Client'], 'chat');
    return new Response(payload, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    await streamChat({ messages: [], model: 'test', onDelta: (part) => { output += part; } });
    return output;
  } finally {
    globalThis.fetch = original;
  }
}

test('stream completion and truncation', async (t) => {
  await t.test('normal DONE', async () => {
    assert.equal(await receive(`${delta('hello')}\n\ndata: [DONE]\n\n`), 'hello');
  });
  await t.test('finish reason without trailing newline', async () => {
    assert.equal(await receive(delta('last', 'stop')), 'last');
  });
  await t.test('premature EOF', async () => {
    await assert.rejects(receive(`${delta('partial')}\n\n`), /sebelum jawaban selesai/);
  });
  await t.test('malformed event', async () => {
    await assert.rejects(receive('data: {broken}\n\n'), /tidak valid/);
  });
  await t.test('upstream error', async () => {
    await assert.rejects(receive('data: {"error":{"message":"quota"}}\n\n'), /quota/);
  });
  await t.test('UTF-8 chunks', async () => {
    const bytes = new TextEncoder().encode(`${delta('halo \u{1f44b}')}\n\ndata: [DONE]\n\n`);
    const body = new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    assert.equal(await receive(body), 'halo \u{1f44b}');
  });
});

test('request size includes complete JSON and UTF-8 bytes', () => {
  assert.equal(JSON.parse(serializeChat([], 'test')).stream, true);
  assert.throws(() => serializeChat([{ content: 'x'.repeat(MAX_REQUEST_BYTES) }], 'test'), /60 MiB/);
  assert.throws(() => serializeChat([{ content: '\u20ac'.repeat(MAX_REQUEST_BYTES / 3) }], 'test'), /60 MiB/);
});