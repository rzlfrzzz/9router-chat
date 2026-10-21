import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { validateEdits, parseProposal, compareWorkbooks } from '../src/lib/excel.js';

const snapshot = [{ name: 'Data', cells: { A1: { value: 'Lama', text: 'Lama' }, B1: { value: 1, text: '=SUM(A1) [hasil: 1]', formula: 'SUM(A1)' }, C1: { text: 'Gabungan', merged: true } } }];
test('validate edit proposal and reject unsafe changes', () => {
  assert.equal(parseProposal('```json\n{"edits":[{"sheet":"Data","cell":"a1","value":"Baru"}]}\n```', snapshot)[0].before, 'Lama');
  for (const edit of [
    { sheet: 'Unknown', cell: 'A1', value: 1 },
    { sheet: 'Data', cell: 'XFE1', value: 1 },
    { sheet: 'Data', cell: 'A1048577', value: 1 },
    { sheet: 'Data', cell: 'B1', value: 1 },
    { sheet: 'Data', cell: 'C1', value: 1 },
    { sheet: 'Data', cell: 'A1', value: '=WEBSERVICE("url")' },
    { sheet: 'Data', cell: 'A1', value: {} },
  ]) assert.throws(() => validateEdits([edit], snapshot));
  const edit = { sheet: 'Data', cell: 'A1', value: null };
  assert.throws(() => validateEdits([edit, edit], snapshot), /duplikat/);
  assert.throws(() => parseProposal('not JSON', snapshot), /JSON/);
  assert.throws(() => validateEdits([], snapshot));
});

test('compare captures values, formulas, added and removed sheets', () => {
  const changes = compareWorkbooks(snapshot, [{ name: 'Data', cells: { A1: { value: 'Baru', text: 'Baru' }, B1: { value: 1, text: '1', formula: 'SUM(A2)' } } }, { name: 'New', cells: {} }]);
  assert.equal(changes.length, 4);
  assert.equal(changes[0].cell, 'A1');
});

test('XLSX roundtrip writes validated values preserving existing formulas and basic styles', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  sheet.getCell('A1').value = 'Lama';
  sheet.getCell('A1').font = { bold: true };
  sheet.getCell('B1').value = { formula: '1+1', result: 2 };
  const original = await workbook.xlsx.writeBuffer();
  const copy = new ExcelJS.Workbook();
  await copy.xlsx.load(original);
  for (const edit of validateEdits([{ sheet: 'Data', cell: 'A1', value: 'Baru' }], snapshot)) copy.getWorksheet(edit.sheet).getCell(edit.cell).value = edit.value;
  const result = new ExcelJS.Workbook();
  await result.xlsx.load(await copy.xlsx.writeBuffer());
  assert.equal(result.getWorksheet('Data').getCell('A1').value, 'Baru');
  assert.equal(result.getWorksheet('Data').getCell('A1').font.bold, true);
  assert.equal(result.getWorksheet('Data').getCell('B1').formula, '1+1');
  assert.equal(workbook.getWorksheet('Data').getCell('A1').value, 'Lama');
});