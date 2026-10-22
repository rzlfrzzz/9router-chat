import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { artifactDiff } from '../server/artifact-diff.js';
import { readSkill, skillContext } from '../server/skills.js';
import { runAgent } from '../server/agent.js';

test('server diff compares real XLSX values and formulas', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '9router-diff-'));
  try {
    const book = new ExcelJS.Workbook(); book.addWorksheet('Data').getCell('A1').value = 10;
    const before = path.join(root, 'before.xlsx'), after = path.join(root, 'after.xlsx');
    await book.xlsx.writeFile(before);
    book.getWorksheet('Data').getCell('A1').value = 20;
    book.getWorksheet('Data').getCell('B1').value = { formula: 'A1*2', result: 40 };
    await book.xlsx.writeFile(after);
    const preview = await artifactDiff(before, after);
    assert.match(preview, /2 perubahan/); assert.match(preview, /Data!A1/); assert.match(preview, /A1\*2/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('skills load without accepting arbitrary paths', () => {
  assert.match(readSkill('xlsx'), /XLSX/);
  assert.match(skillContext([{ content: 'Analisis Excel' }]), /Skill xlsx/);
  assert.throws(() => readSkill('../../.env'));
});

test('tool result exceeding context budget is bounded and explained', async () => {
  let round = 0;
  await runAgent({ model: 'test', messages: [{ role: 'user', content: 'Go' }], tools: [{ definition: { type: 'function', function: { name: 'large' } }, execute: async () => 'x'.repeat(30000) }], complete: async (body) => {
    if (++round === 1) return { choices: [{ message: { role: 'assistant', tool_calls: [{ id: '1', type: 'function', function: { name: 'large', arguments: '{}' } }] } }] };
    const result = body.messages.at(-1).content;
    assert.ok(result.length < 10000); assert.match(result, /head\(\)/); assert.equal(JSON.parse(result).truncated, true);
    return { choices: [{ message: { role: 'assistant', content: 'Done' } }] };
  } });
});