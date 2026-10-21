import { useEffect, useRef, useState } from 'react';
import { ClipIcon, FileIcon, SendIcon, StopIcon, XIcon } from './Icons.jsx';
import { LIMITS } from '../lib/files.js';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.xlsx,.docx,.md,.csv,.json,.xml,.yml,.yaml,.log,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.sh,.sql,.html,.css';

export default function Composer({ busy, onSend, onStop }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const attachmentsRef = useRef([]);
  const queueRef = useRef(Promise.resolve());
  const pendingRef = useRef(0);
  const area = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => {
    const el = area.current;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  const addFiles = (list) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    pendingRef.current += 1;
    setProcessing(true);
    queueRef.current = queueRef.current.then(async () => {
      const errors = [];
      for (const f of files) {
        if (attachmentsRef.current.length >= LIMITS.maxFiles) {
          errors.push(`Maksimal ${LIMITS.maxFiles} lampiran per pesan.`);
          break;
        }
        try {
          if (f.size > 20 * 1024 * 1024) throw new Error('Maksimal 20 MiB per file.');
          const attachment = { id: crypto.randomUUID(), name: f.name, size: f.size, kind: 'file', rawFile: f };
          attachmentsRef.current = [...attachmentsRef.current, attachment];
          setAttachments(attachmentsRef.current);
        } catch (e) {
          errors.push(e.message);
        }
      }
      setError(errors.join(' '));
    }).finally(() => {
      pendingRef.current -= 1;
      setProcessing(pendingRef.current > 0);
    });
  };

  const submit = async () => {
    if (busy || pendingRef.current > 0) return;
    if (!text.trim() && attachments.length === 0) return;
    pendingRef.current += 1; setProcessing(true);
    let accepted;
    try { accepted = await onSend(text.trim(), attachmentsRef.current); }
    finally { pendingRef.current -= 1; setProcessing(false); }
    if (accepted === false) return;
    setText('');
    attachmentsRef.current = [];
    setAttachments([]);
    setError('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  const canSend = !processing && (text.trim() || attachments.length > 0);

  return (
    <div
      className="border-t border-zinc-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-zinc-800 dark:bg-zinc-950"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
    >
      <div className="mx-auto max-w-3xl">
        {error && (
          <div role="alert" className="mb-2 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="Tutup"><XIcon width={16} height={16} /></button>
          </div>
        )}

        <div className={`rounded-2xl border bg-zinc-50 p-2 dark:bg-zinc-900 ${dragging ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-zinc-300 dark:border-zinc-700'}`}>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1 pb-2">
              {attachments.map((a) => (
                <div key={a.id} className="relative">
                  {a.kind === 'image' ? (
                    <img src={a.dataUrl} alt={a.name} className="h-16 w-16 rounded-lg border border-zinc-300 object-cover dark:border-zinc-700" />
                  ) : (
                    <div className="flex h-16 w-40 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-800">
                      <FileIcon width={20} height={20} className="shrink-0" />
                      <span className="truncate" title={a.extracted ? 'Teks/tabel diekstrak; format dan gambar tidak disertakan.' : a.name}>{a.name}{a.extracted ? ' (teks)' : ''}</span>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      attachmentsRef.current = attachmentsRef.current.filter((x) => x.id !== a.id);
                      setAttachments(attachmentsRef.current);
                    }}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-800 p-0.5 text-white hover:bg-red-600"
                    aria-label={`Hapus ${a.name}`}
                  >
                    <XIcon width={14} height={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1">
            <button onClick={() => fileInput.current.click()} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="Lampirkan file">
              <ClipIcon />
            </button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

            <textarea
              ref={area}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder="Kirim pesan…"
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-zinc-400"
            />

            {busy ? (
              <button onClick={onStop} className="rounded-full bg-zinc-900 p-2 text-white dark:bg-zinc-100 dark:text-zinc-900" aria-label="Hentikan">
                <StopIcon />
              </button>
            ) : (
              <button onClick={submit} disabled={!canSend}
                className="rounded-full bg-zinc-900 p-2 text-white disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900" aria-label="Kirim">
                <SendIcon />
              </button>
            )}
          </div>
        </div>
        {processing && <p role="status" className="mt-1.5 text-xs text-zinc-500">Memproses lampiran, tunggu sebelum mengirim...</p>}
        <p className="mt-1.5 text-center text-xs text-zinc-500">Upload multipart, maksimal 20 MiB per file. Analisis dokumen agent memerlukan sandbox Python yang diaktifkan administrator.</p>
        <p className="mt-1.5 hidden text-center text-xs text-zinc-500 sm:block">
          Enter untuk kirim · Shift+Enter baris baru · tempel atau seret file ke sini
        </p>
      </div>
    </div>
  );
}