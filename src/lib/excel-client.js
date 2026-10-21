export function excelTask(buffer, edits) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./excel.worker.js', import.meta.url), { type: 'module' });
    const finish = (error, result) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(new Error(error)); else resolve(result);
    };
    const timer = setTimeout(() => finish('Pemrosesan Excel melebihi 30 detik.'), 30000);
    worker.onmessage = ({ data }) => finish(data.error, data);
    worker.onerror = () => finish('Gagal memproses workbook Excel.');
    worker.postMessage({ buffer, edits });
  });
}