import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkspace } from '../server/workspace.js';
import { collectCompletion } from '../server/stream.js';
import express from 'express';
import { once } from 'node:events';

test('stream assembles fragmented tool names/arguments by index', async () => {
  const frames = [
    { tool_calls: [{ index: 0, id: 'c1', function: { name: 'run_', arguments: '{"co' } }] },
    { tool_calls: [{ index: 1, id: 'c2', function: { name: 'list_files', arguments: '{}' } }, { index: 0, function: { name: 'python', arguments: 'de":"print(1)"}' } }] },
  ].map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`).join('');
  const response = new Response(`${frames}data: {"choices":[{"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  const result = await collectCompletion(response);
  const calls = result.choices[0].message.tool_calls;
  assert.equal(calls[0].function.name, 'run_python');
  assert.deepEqual(JSON.parse(calls[0].function.arguments), { code: 'print(1)' });
  assert.equal(calls[1].id, 'c2');
});

test('SQLite roundtrip, workspace path containment and pending outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '9router-'));
  const workspace = createWorkspace(root);
  try {
    workspace.save({ id: 'conv1', title: 'Test', messages: [{ id: 'm1', role: 'user', content: 'Hello' }] });
    assert.equal(workspace.list()[0].messages[0].content, 'Hello');
    assert.throws(() => workspace.folder('../escape', 'uploads'));
    fs.writeFileSync(path.join(workspace.folder('conv1', 'outputs'), 'result.txt'), 'test');
    assert.equal(workspace.register('conv1', 'result.txt', 'outputs', 'Preview').status, 'pending');
    assert.throws(() => workspace.register('conv1', '../result.txt', 'outputs'));
  } finally { workspace.db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('multipart upload and output download approval gate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '9router-http-'));
  const workspace = createWorkspace(root);
  const app = express(); app.use(express.json()); app.use('/api', workspace.router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/conversations/conv1`;
  try {
    const form = new FormData(); form.append('files', new Blob(['test']), 'report.txt');
    const uploaded = await fetch(`${base}/uploads`, { method: 'POST', body: form });
    assert.equal(uploaded.status, 200);
    assert.equal((await uploaded.json())[0].originalName, 'report.txt');
    fs.writeFileSync(path.join(workspace.folder('conv1', 'outputs'), 'new.txt'), 'changed');
    const artifact = workspace.register('conv1', 'new.txt', 'outputs', 'changed values');
    const url = `${base}/files/${artifact.id}`;
    assert.equal((await fetch(`${url}/download`)).status, 403);
    assert.equal((await fetch(`${url}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) })).status, 200);
    assert.equal(await (await fetch(`${url}/download`)).text(), 'changed');
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); workspace.db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});