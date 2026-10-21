import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const OFFICE_LIMITS = {
  bytes: 10 * 1024 * 1024,
  expandedBytes: 32 * 1024 * 1024,
  characters: 200000,
  cells: 20000,
  sheets: 20,
  timeout: 30000,
};

export function inspectOffice(buffer, extension) {
  if (buffer.byteLength > OFFICE_LIMITS.bytes) throw new Error('Dokumen kantor maksimal 10 MiB.');
  let expanded = 0;
  let entries = 0;
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (entry) => {
      expanded += entry.originalSize;
      if (++entries > 2000 || expanded > OFFICE_LIMITS.expandedBytes) {
        throw new Error('Isi dokumen terlalu besar setelah diekstrak (maksimal 32 MiB).');
      }
      return entry.name === (extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml');
    },
  });
  const name = extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  if (!files[name]) throw new Error('Dokumen tidak valid, terenkripsi, atau bukan format Office yang didukung.');
  return strFromU8(files[name]);
}

export function checkOfficeText(text) {
  if (!text.trim()) throw new Error('Tidak ditemukan teks/sel. Dokumen hasil scan perlu OCR terlebih dahulu.');
  if (text.length > OFFICE_LIMITS.characters) throw new Error('Hasil ekstraksi melebihi 200.000 karakter. Pisahkan dokumen terlebih dahulu.');
  return text;
}

export function extractWord(xml) {
  // Reject DTDs rather than expanding user-controlled XML entities.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error('XML dokumen Word tidak valid atau mengandung DTD yang tidak didukung.');
  }
  const nodes = new XMLParser({ preserveOrder: true, ignoreAttributes: true, trimValues: false, parseTagValue: false }).parse(xml);
  let text = '';
  const append = (value) => {
    text += value;
    if (text.length > OFFICE_LIMITS.characters) throw new Error('Hasil ekstraksi melebihi 200.000 karakter.');
  };
  const walk = (items) => {
    for (const node of items) {
      for (const [name, children] of Object.entries(node)) {
        if (name === 'w:t') {
          for (const child of children) if (child['#text'] != null) append(String(child['#text']));
        } else if (name === 'w:tab') append('\t');
        else if (name === 'w:br' || name === 'w:cr') append('\n');
        else if (Array.isArray(children) && !['w:del', 'w:instrText'].includes(name)) {
          walk(children);
          if (name === 'w:p' || name === 'w:tr') append('\n');
          if (name === 'w:tc') append('\t');
        }
      }
    }
  };
  walk(nodes);
  return checkOfficeText(text.trim());
}

export function formatSheets(sheets) {
  if (sheets.length > OFFICE_LIMITS.sheets) throw new Error('Maksimal 20 sheet per workbook.');
  let cells = 0;
  let length = 0;
  let populated = false;
  const blocks = sheets.map(({ sheet, data }) => {
    const rows = data.map((row) => {
      cells += row.length;
      if (cells > OFFICE_LIMITS.cells) throw new Error('Workbook melebihi 20.000 sel. Pisahkan data terlebih dahulu.');
      const line = row.map((value) => {
        if (value == null) return '';
        if (value !== '') populated = true;
        return JSON.stringify(value instanceof Date ? value.toISOString() : String(value));
      }).join('\t');
      length += line.length + 1;
      if (length > OFFICE_LIMITS.characters) throw new Error('Hasil ekstraksi melebihi 200.000 karakter.');
      return line;
    });
    return `[Sheet: ${sheet}]\n${rows.join('\n')}`;
  });
  if (!populated) throw new Error('Workbook tidak berisi data sel yang dapat dibaca.');
  return checkOfficeText(blocks.join('\n\n'));
}