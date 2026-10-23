import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import FileBadge, { fmtSize } from './FileBadge.jsx';
import { AlertIcon, BrandMark, CheckIcon, ChevronIcon, CopyIcon, NotesIcon, PenIcon, RetryIcon, SheetIcon, FileIcon, XIcon } from './Icons.jsx';

const STARTERS = [
  { icon: FileIcon, title: 'Ringkas dokumen', desc: 'Unggah file Word atau PDF, dapatkan poin penting dan tindak lanjutnya.', prompt: 'Ringkas dokumen terlampir menjadi poin-poin penting dan tindak lanjut.' },
  { icon: SheetIcon, title: 'Rapikan data Excel', desc: 'Temukan sel kosong, duplikat, dan format yang tidak konsisten.', prompt: 'Periksa workbook terlampir: cari sel kosong, duplikat, dan format tidak konsisten, lalu usulkan perbaikannya.' },
  { icon: NotesIcon, title: 'Susun notulen rapat', desc: 'Ringkasan, keputusan, dan tabel tindakan lengkap dengan PIC dan tenggat.', prompt: 'Susun notulen dari catatan rapat berikut: ringkasan, keputusan, serta tabel tindakan, PIC, dan tenggat. Tandai informasi yang belum tersedia; jangan mengarang. Catatan rapat: ' },
  { icon: PenIcon, title: 'Tulis surat atau email', desc: 'Draf resmi dalam bahasa Indonesia yang rapi dan sopan.', prompt: 'Bantu saya menulis surat resmi tentang: ' },
];

const greeting = () => {
  const h = new Date().getHours();
  return h >= 4 && h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
};

const stepLabel = (name) =>
  name === 'run_python' ? 'Menjalankan Python / memproses dokumen'
    : name === 'list_files' ? 'Memeriksa file workspace'
    : name === 'read_skill' ? 'Membaca panduan dokumen'
    : name;
const STATUS = { running: 'Berjalan', success: 'Selesai', error: 'Gagal' };

function Attachments({ items, align = 'start' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
      {items.map((a) =>
        a.kind === 'image' && a.dataUrl ? (
          <img key={a.id} src={a.dataUrl} alt={a.name} className="max-h-48 max-w-full rounded-2xl border border-line" />
        ) : (
          <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-sheet py-1.5 pl-1.5 pr-3 text-xs">
            <FileBadge name={a.name} />
            <span className="min-w-0">
              <span className="block max-w-[12rem] truncate text-[13px] font-semibold">{a.name}</span>
              <span className="text-ink-soft">
                {a.dropped ? 'Tidak tersimpan' : a.size ? fmtSize(a.size) : 'Terunggah'}
                {a.extracted && !a.dropped ? ', teks diekstrak' : ''}
              </span>
            </span>
          </div>
        )
      )}
    </div>
  );
}

/* Jalur kerja agent: setiap langkah adalah titik pemberhentian; garis berubah tosca setelah langkah selesai. */
function Trail({ steps }) {
  return (
    <ol className="mb-4" aria-label="Langkah yang dikerjakan agent">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const node =
          s.status === 'success' ? 'bg-brand text-brand-ink'
            : s.status === 'error' ? 'bg-danger text-white'
            : 'node-running bg-signal text-signal-ink';
        const head = (
          <>
            <span className="font-semibold">{stepLabel(s.name)}</span>
            <span className={`text-xs font-medium ${s.status === 'error' ? 'text-danger-ink' : 'text-ink-faint'}`}>{STATUS[s.status] || s.status}</span>
          </>
        );
        return (
          <li key={`${s.id}-${i}`} className="relative pl-8">
            {!last && <span aria-hidden="true" className={`absolute -bottom-[3px] left-[7px] top-[21px] w-0.5 rounded-full ${s.status === 'success' ? 'bg-brand' : 'bg-line-strong'}`} />}
            <span aria-hidden="true" className={`absolute left-0 top-[3px] grid size-4 place-items-center rounded-full ${node}`}>
              {s.status === 'success' && <CheckIcon width={10} height={10} />}
              {s.status === 'error' && <XIcon width={10} height={10} strokeWidth={3} />}
            </span>
            {s.summary ? (
              <details className="group pb-3.5">
                <summary className="flex cursor-pointer items-center gap-2.5 text-[13.5px] leading-[22px]">
                  {head}
                  <ChevronIcon width={14} height={14} className="text-ink-faint transition-transform group-open:rotate-90" />
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-raised p-3 font-mono text-xs leading-relaxed text-ink-soft">{s.summary}</pre>
              </details>
            ) : (
              <div className="flex items-center gap-2.5 pb-3.5 text-[13.5px] leading-[22px]">{head}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Message({ m, streaming, canRetry, onRetry }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (m.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-2">
        {m.attachments?.length > 0 && <Attachments items={m.attachments} align="end" />}
        {m.content && (
          <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-[1.25rem] rounded-br-md bg-bubble px-4 py-2.5 text-[15px] leading-relaxed text-bubble-ink">
            {m.content}
          </p>
        )}
      </div>
    );
  }

  const stepRunning = m.steps?.some((s) => s.status === 'running');
  return (
    <div className="flex gap-3.5">
      <span className="mt-0.5 hidden size-8 shrink-0 place-items-center rounded-[10px] bg-brand-soft sm:grid text-brand-strong">
        <BrandMark width={18} height={18} />
      </span>
      <div className="min-w-0 flex-1">
        {m.steps?.length > 0 && <Trail steps={m.steps} />}

        {m.content ? (
          <div className={`md break-words ${streaming ? 'cursor' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>
              {m.content}
            </ReactMarkdown>
          </div>
        ) : (
          !m.error && !stepRunning && (
            <span role="status" className="inline-flex items-center gap-2.5 py-1 text-sm text-ink-soft">
              <span className="dots" aria-hidden="true"><i /><i /><i /></span> Berpikir
            </span>
          )
        )}

        {m.error && (
          <div role="alert" className="mt-3 flex items-start gap-3 rounded-2xl bg-danger-soft p-3.5 text-sm text-danger-ink">
            <AlertIcon width={18} height={18} className="mt-0.5 shrink-0" />
            <span className="flex-1 leading-relaxed">{m.error}</span>
            {canRetry && (
              <button onClick={onRetry} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-semibold transition hover:bg-danger/10">
                <RetryIcon width={14} height={14} /> Coba lagi
              </button>
            )}
          </div>
        )}

        {m.content && !streaming && (
          <button onClick={copy} className="-ml-2 mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-ink-faint transition hover:bg-raised hover:text-ink">
            {copied ? <CheckIcon width={14} height={14} className="text-brand-strong" /> : <CopyIcon width={14} height={14} />}
            {copied ? 'Tersalin' : 'Salin'}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onPick }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[44rem] flex-col justify-center px-4 pb-6 pt-10">
      <h1 className="rise text-[clamp(2.4rem,6vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">{greeting()}.</h1>
      <p className="rise mt-3 text-[clamp(1.15rem,2.4vw,1.5rem)] font-medium leading-snug tracking-tight text-ink-soft" style={{ '--d': '90ms' }}>
        Mau dikerjakan apa hari ini?
      </p>
      <ul className="rise mt-10 divide-y divide-line border-y border-line" style={{ '--d': '180ms' }}>
        {STARTERS.map(({ icon: Icon, title, desc, prompt }) => (
          <li key={title}>
            <button onClick={() => onPick(prompt)} className="group -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-4 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-raised">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong"><Icon width={20} height={20} /></span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{title}</span>
                <span className="block text-[13.5px] leading-snug text-ink-soft">{desc}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="rise mt-4 text-[13px] text-ink-faint" style={{ '--d': '260ms' }}>
        Anda juga bisa melampirkan PDF, Word, Excel, gambar, serta file teks atau kode.
      </p>
    </div>
  );
}

export default function MessageList({ messages, busy, onRetry, onPick }) {
  const scroller = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scroller.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto">
      {messages.length === 0 ? (
        <EmptyState onPick={onPick} />
      ) : (
        <div className="mx-auto w-full max-w-[44rem] space-y-9 px-4 py-8">
          {messages.map((m, i) => {
            const last = i === messages.length - 1;
            return (
              <Message
                key={m.id}
                m={m}
                streaming={busy && last && m.role === 'assistant'}
                canRetry={!busy && last && m.role === 'assistant'}
                onRetry={onRetry}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
