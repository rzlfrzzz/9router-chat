import { OFFICE_LIMITS } from './office.js';

export async function extractOffice(file, extension) {
  if (file.size > OFFICE_LIMITS.bytes) throw new Error('Dokumen kantor maksimal 10 MiB.');
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./office.worker.js', import.meta.url), { type: 'module' });
    const finish = (error, text) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve(text);
    };
    const timer = setTimeout(() => finish('Pemrosesan dokumen melebihi 30 detik. Kurangi ukuran/kompleksitas dokumen.'), OFFICE_LIMITS.timeout);
    worker.onmessage = ({ data }) => finish(data.error, data.text);
    worker.onerror = (event) => {
      event.preventDefault();
      finish('Gagal memproses dokumen. File mungkin rusak, terenkripsi, atau tidak didukung.');
    };
    worker.postMessage({ buffer, extension }, [buffer]);
  });
}