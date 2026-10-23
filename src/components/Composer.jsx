import { useEffect, useRef, useState } from 'react';
import { ClipIcon, SendIcon, StopIcon, XIcon } from './Icons.jsx';
import FileBadge, { fmtSize } from './FileBadge.jsx';
import { LIMITS } from '../lib/files.js';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.xlsx,.docx,.md,.csv,.json,.xml,.yml,.yaml,.log,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.sh,.sql,.html,.css';

export default function Composer({ busy, onSend, onStop, seed }) {
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

  // Isi kotak pesan dari contoh tugas di layar awal
  useEffect(() => {
    if (!seed) return;
    setText(seed.text);
    area.current?.focus();
  }, [seed]);

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
      className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
    >
      <div className="mx-auto max-w-[44rem]">
        {error && (
          <div role="alert" className="mb-2 flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-ink">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="Tutup pesan kesalahan"><XIcon width={16} height={16} /></button>
          </div>
        )}

        <div className={`relative rounded-3xl border bg-sheet shadow-float transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15 ${dragging ? 'border-brand' : 'border-line-strong'}`}>
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-brand bg-brand-soft/95 text-sm font-semibold text-brand-strong">
              Lepas file di sini untuk melampirkan
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((a) => (
                <div key={a.id} className="relative flex items-center gap-2.5 rounded-xl border border-line bg-raised py-1.5 pl-1.5 pr-9 text-xs">
                  {a.kind === 'image' && a.dataUrl
                    ? <img src={a.dataUrl} alt={a.name} className="size-9 rounded-lg object-cover" />
                    : <FileBadge name={a.name} />}
                  <span className="min-w-0" title={a.extracted ? 'Teks/tabel diekstrak; format dan gambar tidak disertakan.' : a.name}>
                    <span className="block max-w-[10rem] truncate text-[13px] font-semibold">{a.name}</span>
                    <span className="text-ink-soft">{fmtSize(a.size)}{a.extracted ? ', teks' : ''}</span>
                  </span>
                  <button
                    onClick={() => {
                      attachmentsRef.current = attachmentsRef.current.filter((x) => x.id !== a.id);
                      setAttachments(attachmentsRef.current);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-faint transition hover:bg-danger-soft hover:text-danger-ink"
                    aria-label={`Hapus ${a.name}`}
                  >
                    <XIcon width={14} height={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={area}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="Tulis pesan atau tugas…"
            aria-label="Pesan"
            className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15.5px] leading-relaxed outline-none placeholder:text-ink-faint focus-visible:outline-none"
          />

          <div className="flex items-center gap-1 px-2 pb-2">
            <button onClick={() => fileInput.current.click()} className="rounded-full p-2 text-ink-soft transition hover:bg-raised hover:text-ink" aria-label="Lampirkan file">
              <ClipIcon />
            </button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <span className="hidden flex-1 px-1 text-xs text-ink-faint sm:block">Enter untuk kirim, Shift+Enter untuk baris baru</span>
            <span className="flex-1 sm:hidden" />

            {busy ? (
              <button onClick={onStop} className="grid size-9 place-items-center rounded-full bg-bubble text-bubble-ink transition hover:opacity-85" aria-label="Hentikan">
                <StopIcon />
              </button>
            ) : (
              <button onClick={submit} disabled={!canSend}
                className="grid size-9 place-items-center rounded-full bg-brand text-brand-ink transition hover:brightness-95 disabled:bg-raised disabled:text-ink-faint" aria-label="Kirim">
                <SendIcon />
              </button>
            )}
          </div>
        </div>

        {processing && <p role="status" className="mt-2 text-center text-xs text-ink-soft">Memproses lampiran, tunggu sebelum mengirim…</p>}
        <p className="mt-2 px-2 text-center text-xs leading-relaxed text-ink-faint">
          Maksimal 20 MiB per file. Analisis dokumen oleh agent memerlukan sandbox Python yang diaktifkan administrator.
        </p>
      </div>
    </div>
  );
}
