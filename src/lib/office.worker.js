import readXlsxFile from 'read-excel-file/browser';
import { inspectOffice, extractWord, formatSheets } from './office.js';

self.onmessage = async ({ data: { buffer, extension } }) => {
  try {
    const xml = inspectOffice(buffer, extension);
    const text = extension === 'docx'
      ? extractWord(xml)
      : formatSheets(await readXlsxFile(buffer));
    self.postMessage({ text });
  } catch (error) {
    self.postMessage({ error: error.message || 'Dokumen tidak dapat dibaca.' });
  }
};