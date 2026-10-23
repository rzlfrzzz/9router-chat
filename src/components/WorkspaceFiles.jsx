import { useEffect, useState } from 'react';
import { approveFile, getFiles } from '../lib/server-storage.js';
import FileBadge from './FileBadge.jsx';
import { AlertIcon, CheckIcon, ChevronIcon, DownloadIcon } from './Icons.jsx';

const PILL = {
  pending: ['Menunggu persetujuan', 'bg-signal-soft text-signal-ink'],
  approved: ['Disetujui', 'bg-brand-soft text-brand-strong'],
  rejected: ['Ditolak', 'bg-danger-soft text-danger-ink'],
};

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
  return (
    <div className="max-h-[38vh] shrink-0 overflow-y-auto px-4 pb-2">
      <div className="mx-auto max-w-[44rem] space-y-2">
        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-ink">
            <AlertIcon width={16} height={16} className="shrink-0" /> {error}
          </p>
        )}
        {files.map((file) => {
          const [label, tone] = PILL[file.status] || PILL.pending;
          return (
            <div key={file.id} className="rounded-2xl border border-line-strong bg-sheet p-3 shadow-float">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
                <FileBadge name={file.name} />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="break-all text-sm font-semibold leading-snug">{file.name}</p>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${tone}`}>
                    {file.status === 'approved' && <CheckIcon width={11} height={11} />}{label}
                  </span>
                </div>
                {file.status === 'pending' && (
                  <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                    <button disabled={busy} onClick={() => decide(file, 'rejected')} className="flex-1 rounded-xl border border-line-strong px-3 py-1.5 text-sm font-semibold text-ink-soft sm:flex-none transition hover:bg-raised disabled:opacity-40">Tolak</button>
                    <button disabled={busy} onClick={() => decide(file, 'approved')} className="flex-1 rounded-xl bg-brand px-3.5 py-1.5 text-sm font-bold text-brand-ink transition hover:brightness-95 disabled:opacity-40 sm:flex-none">Setujui</button>
                  </div>
                )}
                {file.status === 'approved' && (
                  <a className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand sm:w-auto px-3.5 py-1.5 text-sm font-bold text-brand-ink transition hover:brightness-95" href={`/api/conversations/${conversationId}/files/${file.id}/download`}>
                    <DownloadIcon width={16} height={16} /> Unduh
                  </a>
                )}
              </div>
              <details open={file.status === 'pending' && typeof window !== 'undefined' && window.innerWidth >= 640} className="group mt-2.5">
                <summary className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink">
                  <ChevronIcon width={13} height={13} className="transition-transform group-open:rotate-90" /> Ringkasan perubahan
                </summary>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-raised p-3 font-mono text-xs leading-relaxed text-ink-soft">{file.preview || 'Tidak ada ringkasan perubahan.'}</pre>
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">Diff XLSX dihitung server terhadap sumber yang disebut agent; tidak mencakup seluruh fitur workbook. Dokumen non-XLSX perlu diperiksa manual.</p>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
