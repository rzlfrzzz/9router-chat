export const LIMITS = {
  maxFiles: 5,
  image: 10 * 1024 * 1024,
  text: 1 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const TEXT_EXT = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'log', 'html', 'css',
  'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'sql', 'swift', 'kt',
];

const ext = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const mb = (n) => `${Math.round(n / 1024 / 1024)} MB`;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const readAs = (file, mode) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(`Gagal membaca file "${file.name}".`));
    mode === 'text' ? r.readAsText(file) : r.readAsDataURL(file);
  });

// Mengembalikan objek lampiran, atau melempar Error dengan pesan yang jelas.
export async function processFile(file) {
  const e = ext(file.name);
  const base = { id: uid(), name: file.name, size: file.size, type: file.type };

  if (['xlsx', 'docx'].includes(e)) {
    const { extractOffice } = await import('./office-client.js');
    const text = await extractOffice(file, e);
    return { ...base, kind: 'text', text, extracted: true };
  }
  if (['xls', 'doc', 'ppt', 'pptx', 'xlsm', 'docm', 'ods', 'odt'].includes(e)) {
    throw new Error(`Format .${e} belum didukung. Simpan ulang sebagai .xlsx, .docx, PDF, atau teks terlebih dahulu.`);
  }

  if (IMAGE_TYPES.includes(file.type)) {
    if (file.size > LIMITS.image) throw new Error(`Gambar "${file.name}" melebihi batas ${mb(LIMITS.image)}.`);
    return { ...base, kind: 'image', dataUrl: await readAs(file, 'url') };
  }
  if (file.type.startsWith('image/')) {
    throw new Error(`Format gambar "${file.name}" tidak didukung. Gunakan PNG, JPEG, WebP, atau GIF.`);
  }
  if (file.type === 'application/pdf' || e === 'pdf') {
    if (file.size > LIMITS.pdf) throw new Error(`PDF "${file.name}" melebihi batas ${mb(LIMITS.pdf)}.`);
    return { ...base, kind: 'pdf', type: 'application/pdf', dataUrl: await readAs(file, 'url') };
  }
  if (file.type.startsWith('text/') || TEXT_EXT.includes(e) || file.type === 'application/json') {
    if (file.size > LIMITS.text) throw new Error(`File teks "${file.name}" melebihi batas ${mb(LIMITS.text)}.`);
    const text = await readAs(file, 'text');
    if (text.includes('\u0000')) throw new Error(`"${file.name}" tampaknya file biner, bukan teks.`);
    return { ...base, kind: 'text', text };
  }
  throw new Error(
    `Tipe file "${file.name}"${e ? ` (.${e})` : ''} tidak didukung. Gunakan gambar, PDF, XLSX, DOCX, atau file teks/kode.`
  );
}

const SYSTEM = { role: 'system', content: 'Kamu adalah asisten AI yang membantu. Jawab dalam bahasa yang digunakan pengguna. Gunakan Markdown bila perlu.' };

// Ubah riwayat internal menjadi format pesan OpenAI (multimodal)
export function buildApiMessages(messages) {
  const out = [SYSTEM];
  for (const m of messages) {
    if (m.role === 'assistant') {
      if (m.content) out.push({ role: 'assistant', content: m.content });
      continue;
    }
    const parts = [];
    let text = m.content || '';
    for (const a of m.attachments || []) {
      if (a.kind === 'text' && a.text != null) {
        text += `\n\n[Isi file: ${a.name}]\n\`\`\`\n${a.text}\n\`\`\``;
      } else if (a.kind === 'image' && a.dataUrl) {
        parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
      } else if (a.kind === 'pdf' && a.dataUrl) {
        parts.push({ type: 'file', file: { filename: a.name, file_data: a.dataUrl } });
      } else {
        text += `\n\n[Lampiran "${a.name}" tidak lagi tersedia]`;
      }
    }
    if (parts.length === 0) out.push({ role: 'user', content: text.trim() });
    else out.push({ role: 'user', content: [{ type: 'text', text: text.trim() || 'Lihat lampiran.' }, ...parts] });
  }
  return out;
}