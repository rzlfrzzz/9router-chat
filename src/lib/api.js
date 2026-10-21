export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function friendly(status, raw, hasAttachments) {
  const hint = hasAttachments
    ? ' Jika ada lampiran, model/provider ini mungkin tidak mendukung tipe lampiran tersebut — coba hapus lampiran atau ganti model.'
    : '';
  const detail = raw ? ` (${raw})` : '';
  if (status === 401 || status === 403) return `API key tidak valid atau tidak punya akses. Periksa NINEROUTER_API_KEY di .env lalu restart server${detail}`;
  if (status === 404) return `Endpoint atau model tidak ditemukan. Periksa BASE_URL dan nama model${detail}`;
  if (status === 408 || status === 504) return 'Permintaan timeout. Coba lagi beberapa saat.';
  if (status === 413) return 'Lampiran/permintaan terlalu besar. Kurangi ukuran atau jumlah lampiran.';
  if (status === 400 || status === 415 || status === 422) return `Permintaan ditolak oleh API${detail}.${hint}`;
  if (status === 429) return `Terlalu banyak permintaan atau kuota habis. Tunggu sebentar lalu coba lagi${detail}`;
  if (status >= 500) return `Server API bermasalah (HTTP ${status})${detail}. Coba lagi nanti.`;
  return `Terjadi kesalahan (HTTP ${status})${detail}`;
}

export async function fetchModels() {
  try {
    const r = await fetch('/api/models');
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    return { models: [], defaultModel: '', hasKey: true, warning: 'Backend proxy tidak dapat dihubungi. Pastikan server berjalan.' };
  }
}

// Mengirim chat dan memanggil onDelta untuk tiap potongan teks. Mengembalikan teks lengkap.
export const MAX_REQUEST_BYTES = 60 * 1024 * 1024;

export function serializeChat(messages, model) {
  const body = JSON.stringify({ model, messages, stream: true });
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new ApiError('Total pesan dan riwayat lampiran melebihi 60 MiB. Kurangi lampiran atau mulai percakapan baru.', 413);
  }
  return body;
}

export async function streamChat({ messages, model, signal, onDelta, hasAttachments }) {
  const body = serializeChat(messages, model);
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-9Router-Client': 'chat' },
      body,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Tidak dapat menghubungi server. Periksa koneksi dan pastikan backend berjalan.');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let raw = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      raw = j.error?.message || j.message || (typeof j.error === 'string' ? j.error : raw);
    } catch {}
    // Pesan dari proxy kita sudah ramah; pakai apa adanya untuk 502/504/no_model
    if ([502, 504].includes(res.status) && raw) throw new ApiError(raw, res.status);
    throw new ApiError(friendly(res.status, raw, hasAttachments), res.status);
  }

  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/event-stream')) {
    // API membalas non-stream: tampilkan sekaligus
    const j = await res.json().catch(() => null);
    const content = j?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new ApiError('Format respons API tidak dikenali.');
    onDelta(content);
    return content;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let completed = false;
  const consumeLine = (line) => {
    const s = line.trim();
    if (!s.startsWith('data:')) return;
    const data = s.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') { completed = true; return; }
    let j;
    try { j = JSON.parse(data); }
    catch { throw new ApiError('Data stream API tidak valid. Coba kirim ulang.'); }
    if (j.error) {
      const msg = typeof j.error === 'string' ? j.error : j.error.message;
      throw new ApiError(msg || 'Stream terputus oleh API.');
    }
    const choice = j.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === 'string') { full += delta; onDelta(delta); }
    if (choice?.finish_reason != null) completed = true;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) consumeLine(buffer);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        consumeLine(line);
        if (line.trim() === 'data: [DONE]') return full;
      }
    }
    if (!completed) throw new ApiError('Stream berakhir sebelum jawaban selesai. Coba lagi untuk mendapatkan jawaban lengkap.');
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof ApiError) throw err;
    throw new ApiError('Koneksi terputus saat menerima respons.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return full;
}