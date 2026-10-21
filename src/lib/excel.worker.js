import ExcelJS from 'exceljs';
import { inspectOffice } from './office.js';
import { validateEdits } from './excel.js';

async function load(buffer) {
  inspectOffice(buffer, 'xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.worksheets.length > 20) throw new Error('Maksimal 20 sheet.');
  let count = 0;
  let characters = 0;
  const snapshot = workbook.worksheets.map((sheet) => {
    const cells = {};
    sheet.eachRow((row) => row.eachCell((cell) => {
      if (++count > 20000) throw new Error('Maksimal 20.000 sel terisi.');
      const formula = cell.formula || (cell.value?.sharedFormula ? '(shared)' : null);
      const value = cell.value instanceof Date ? cell.value.toISOString()
        : ['string', 'number', 'boolean'].includes(typeof cell.value) ? cell.value : cell.text;
      characters += cell.text.length;
      if (characters > 200000) throw new Error('Isi workbook melebihi 200.000 karakter.');
      cells[cell.address] = { value, text: formula ? `=${formula} [hasil: ${cell.text}]` : cell.text, formula, merged: cell.isMerged };
    }));
    return { name: sheet.name, cells };
  });
  return { workbook, snapshot };
}

self.onmessage = async ({ data }) => {
  try {
    const { workbook, snapshot } = await load(data.buffer);
    if (data.edits) {
      const edits = validateEdits(data.edits, snapshot);
      for (const edit of edits) workbook.getWorksheet(edit.sheet).getCell(edit.cell).value = edit.value;
      workbook.calcProperties.fullCalcOnLoad = true;
      const output = await workbook.xlsx.writeBuffer();
      self.postMessage({ output });
    } else self.postMessage({ snapshot });
  } catch (error) { self.postMessage({ error: error.message || 'Workbook tidak dapat diproses.' }); }
};