import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import readXlsxFile from 'read-excel-file/browser';
import { inspectOffice, extractWord, formatSheets, OFFICE_LIMITS } from '../src/lib/office.js';
import { buildApiMessages, processFile } from '../src/lib/files.js';

const archive = (files) => zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)]))).buffer;

test('DOCX paragraphs, table, escaped text and deleted revisions', () => {
  const xml = '<w:document xmlns:w="test"><w:body><w:p><w:r><w:t>Laporan &amp; biaya</w:t></w:r><w:del><w:r><w:t>deleted</w:t></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Divisi</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Keuangan</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  const buffer = archive({ 'word/document.xml': xml });
  const text = extractWord(inspectOffice(buffer, 'docx'));
  assert.match(text, /Laporan & biaya/);
  assert.match(text, /Divisi/);
  assert.match(text, /Keuangan/);
  assert.doesNotMatch(text, /deleted/);
  const messages = buildApiMessages([{ role: 'user', content: 'Ringkas', attachments: [{ kind: 'text', name: 'report.docx', text }] }]);
  assert.match(messages[1].content, /Laporan & biaya/);
});

test('real XLSX archive through browser parser', async () => {
  const buffer = archive({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Anggaran" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Biaya</t></is></c><c r="B1"><v>1500</v></c></row></sheetData></worksheet>',
  });
  inspectOffice(buffer, 'xlsx');
  const text = formatSheets(await readXlsxFile(buffer));
  assert.match(text, /Sheet: Anggaran/);
  assert.match(text, /"Biaya"\t"1500"/);
});

test('spreadsheet includes sheet names, empty cells, zero and dates', () => {
  const text = formatSheets([
    { sheet: 'A', data: [[0, null, false]] },
    { sheet: 'B', data: [[new Date('2026-01-01T00:00:00Z')]] },
  ]);
  assert.match(text, /"0"\t\t"false"/);
  assert.match(text, /Sheet: B/);
  assert.match(text, /2026-01-01/);
});

test('reject invalid, oversized and unsupported documents', async () => {
  assert.throws(() => inspectOffice(new ArrayBuffer(OFFICE_LIMITS.bytes + 1), 'docx'), /10 MiB/);
  assert.throws(() => inspectOffice(archive({ 'other.xml': 'x' }), 'docx'), /tidak valid/);
  assert.throws(() => inspectOffice(archive({ 'word/document.xml': 'x'.repeat(OFFICE_LIMITS.expandedBytes + 1) }), 'docx'), /32 MiB/);
  assert.throws(() => extractWord('<!DOCTYPE x><w:document/>'), /DTD/);
  assert.throws(() => extractWord('<w:document>'), /tidak valid/);
  assert.throws(() => extractWord('<w:document/>'), /Tidak ditemukan teks/);
  assert.throws(() => formatSheets([{ sheet: 'A', data: [Array(20001).fill(1)] }]), /20.000 sel/);
  assert.throws(() => formatSheets(Array(21).fill({ sheet: 'A', data: [[1]] })), /20 sheet/);
  assert.throws(() => formatSheets([{ sheet: 'A', data: [['x'.repeat(200001)]] }]), /200.000/);
  assert.throws(() => formatSheets([{ sheet: 'A', data: [] }]), /tidak berisi data/);
  await assert.rejects(processFile({ name: 'old.doc', type: '', size: 1 }), /Simpan ulang/);
});