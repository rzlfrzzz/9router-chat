import ExcelJS from 'exceljs';

async function cells(file) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  const result = new Map();
  let count = 0;
  for (const sheet of book.worksheets) {
    result.set(`${sheet.name}!<sheet>`, { exists: true });
    sheet.eachRow((row) => row.eachCell((cell) => {
      if (++count > 100000) throw new Error('Diff maksimal 100.000 sel terisi.');
      result.set(`${sheet.name}!${cell.address}`, { value: cell.value, style: cell.style, format: cell.numFmt });
    }));
  }
  return result;
}

export async function artifactDiff(source, output) {
  if (!output.toLowerCase().endsWith('.xlsx')) return 'Output non-XLSX: diff otomatis belum tersedia. Periksa dokumen secara manual; ringkasan AI bukan bukti perubahan.';
  const before = source ? await cells(source) : new Map();
  const after = await cells(output);
  const sample = [];
  let total = 0;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key), b = after.get(key);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      total++;
      if (sample.length < 100) sample.push(`${key}: ${JSON.stringify(a ?? null)} => ${JSON.stringify(b ?? null)}`);
    }
  }
  return `${source ? 'Diff terhitung server' : 'Workbook baru, tanpa sumber pembanding'}: ${total} perubahan sel/sheet (nilai, rumus, gaya dasar).${total > 100 ? ' Hanya 100 pertama ditampilkan.' : ''}\n${sample.join('\n')}`.slice(0, 95000);
}