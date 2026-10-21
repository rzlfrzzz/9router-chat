import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyIcon, FileIcon, RetryIcon } from './Icons.jsx';

const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Attachments({ items }) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((a) =>
        a.kind === 'image' && a.dataUrl ? (
          <img key={a.id} src={a.dataUrl} alt={a.name} className="max-h-48 max-w-full rounded-lg border border-zinc-300 dark:border-zinc-700" />
        ) : (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white/60 px-2.5 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900/40">
            <FileIcon width={16} height={16} />
            <span className="max-w-[12rem] truncate">{a.name}</span>
            {a.extracted && !a.dropped && <span className="text-zinc-500">(teks diekstrak)</span>}
            <span className="text-zinc-500">{a.dropped ? '(tidak tersimpan)' : fmtSize(a.size)}</span>
          </div>
        )
      )}
    </div>
  );
}

function Message({ m, streaming, canRetry, onRetry }) {
  const [copied, setCopied] = useState(false);
  const isUser = m.role === 'user';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className={`border-b border-zinc-200 dark:border-zinc-800 ${isUser ? '' : 'bg-zinc-50 dark:bg-zinc-900/50'}`}>
      <div className="mx-auto w-full max-w-3xl px-4 py-5">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-white ${isUser ? 'bg-blue-600' : 'bg-emerald-600'}`}>
            {isUser ? 'A' : 'AI'}
          </span>
          {isUser ? 'Anda' : 'Asisten'}
        </div>

        {isUser ? (
          <div>
            {m.attachments?.length > 0 && <Attachments items={m.attachments} />}
            <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
          </div>
        ) : (
          <div>
            {m.content ? (
              <div className={`md break-words ${streaming ? 'cursor' : ''}`}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            ) : (
              !m.error && <span className="cursor text-zinc-500">Berpikir…</span>
            )}

            {m.error && (
              <div role="alert" className="mt-3 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                <span className="flex-1">{m.error}</span>
                {canRetry && (
                  <button onClick={onRetry} className="flex shrink-0 items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40">
                    <RetryIcon width={14} height={14} /> Coba lagi
                  </button>
                )}
              </div>
            )}

            {m.content && !streaming && (
              <button onClick={copy} className="mt-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
                <CopyIcon width={14} height={14} /> {copied ? 'Tersalin' : 'Salin'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessageList({ messages, busy, onRetry }) {
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
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold">Ada yang bisa saya bantu?</h1>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Ketik pesan, atau lampirkan gambar, PDF, Excel (.xlsx), Word (.docx), dan file teks/kode. Enter untuk kirim, Shift+Enter untuk baris baru.
          </p>
        </div>
      ) : (
        messages.map((m, i) => {
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
        })
      )}
    </div>
  );
}