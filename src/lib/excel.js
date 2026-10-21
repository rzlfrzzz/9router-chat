export function validateEdits(input, snapshot) {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new Error('Usulan harus berisi 1-200 perubahan sel.');
  const seen = new Set();
  return input.map((edit) => {
    const sheet = snapshot.find((item) => item.name === edit.sheet);
    const address = String(edit.cell || '').toUpperCase();
    if (!sheet || !/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address)) throw new Error('Sheet atau alamat sel tidak valid.');
    const column = address.match(/^[A-Z]+/)[0].split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    if (column > 16384 || Number(address.match(/[0-9]+/)[0]) > 1048576) throw new Error('Alamat sel di luar batas Excel.');
    const key = `${edit.sheet}!${address}`;
    if (seen.has(key)) throw new Error('Usulan mengandung sel duplikat.');
    seen.add(key);
    if (!(edit.value === null || ['string', 'number', 'boolean'].includes(typeof edit.value)) ||
        (typeof edit.value === 'number' && !Number.isFinite(edit.value)) ||
        (typeof edit.value === 'string' && (edit.value.length > 32767 || /^[=+@]/.test(edit.value)))) {
      throw new Error('Nilai tidak valid. Rumus baru tidak didukung pada tahap ini.');
    }
    const current = sheet.cells[address];
    if (current?.formula || current?.merged) throw new Error(`Sel ${key} berisi rumus atau merupakan sel gabungan dan tidak boleh diedit.`);
    return { sheet: edit.sheet, cell: address, value: edit.value, before: current?.text ?? '' };
  });
}

export function compareWorkbooks(left, right) {
  const differences = [];
  for (const name of new Set([...left, ...right].map((sheet) => sheet.name))) {
    const a = left.find((sheet) => sheet.name === name);
    const b = right.find((sheet) => sheet.name === name);
    if (!a || !b) differences.push({ sheet: name, cell: '(sheet)', before: a ? 'Ada' : 'Tidak ada', after: b ? 'Ada' : 'Tidak ada' });
    for (const cell of new Set([...Object.keys(a?.cells || {}), ...Object.keys(b?.cells || {})])) {
      const av = a?.cells[cell];
      const bv = b?.cells[cell];
      if (JSON.stringify([av?.value ?? av?.text ?? null, av?.formula ?? null]) !== JSON.stringify([bv?.value ?? bv?.text ?? null, bv?.formula ?? null])) {
        differences.push({ sheet: name, cell, before: av?.text ?? '', after: bv?.text ?? '' });
      }
    }
  }
  return differences;
}

export function parseProposal(text, snapshot) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(clean); } catch { throw new Error('AI tidak menghasilkan JSON perubahan yang valid. Coba ulang dengan instruksi lebih spesifik.'); }
  return validateEdits(parsed.edits, snapshot);
}