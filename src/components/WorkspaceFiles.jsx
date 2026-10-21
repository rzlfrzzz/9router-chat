import { useEffect, useState } from 'react';
import { approveFile, getFiles } from '../lib/server-storage.js';

export default function WorkspaceFiles({ conversationId, busy }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setFiles([]);
    if (conversationId) getFiles(conversationId).then((items) => { if (live) setFiles(items.filter((f) => f.kind === 'outputs')); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [conversationId, busy]);
  const decide = async (file, status) => {
    try { await approveFile(conversationId, file.id, status); setFiles((items) => items.map((item) => item.id === file.id ? { ...item, status } : item)); }
    catch (e) { setError(e.message); }
  };
  if (!files.length && !error) return null;
  return <div className="max-h-60 overflow-auto border-t border-zinc-200 p-3 text-sm dark:border-zinc-800">
    {error && <p role="alert">{error}</p>}
    {files.map((file) => <div key={file.id} className="mb-2 rounded border border-zinc-300 p-2 dark:border-zinc-700"><strong className="break-all">{file.name}</strong><p className="whitespace-pre-wrap">{file.preview || 'Tidak ada ringkasan perubahan.'}</p><p className="text-xs text-zinc-500">Preview ini disusun agent, bukan diff terverifikasi otomatis. Periksa sumber dan ringkasannya sebelum menyetujui.</p>{file.status === 'pending' ? <div className="mt-2 flex gap-3"><button disabled={busy} onClick={() => decide(file, 'approved')}>Setujui</button><button disabled={busy} onClick={() => decide(file, 'rejected')}>Tolak</button></div> : file.status === 'approved' ? <a className="text-blue-600 underline" href={`/api/conversations/${conversationId}/files/${file.id}/download`}>Unduh file final</a> : <p>Perubahan ditolak.</p>}</div>)}
  </div>;
}