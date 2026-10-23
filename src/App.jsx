import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import MessageList from './components/MessageList.jsx';
import Composer from './components/Composer.jsx';
import ExcelWorkspace from './components/ExcelWorkspace.jsx';
import WorkspaceFiles from './components/WorkspaceFiles.jsx';
import { AlertIcon, MenuIcon, ModelIcon, XIcon } from './components/Icons.jsx';
import { loadModel, saveModel } from './lib/storage.js';
import { getConversations, putConversation, deleteConversation, uploadFiles, streamAgent } from './lib/server-storage.js';
import { fetchModels } from './lib/api.js';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [capability, setCapability] = useState(null);
  const deletedRef = useRef(new Set());
  const savedRef = useRef(new Map());
  const saveQueue = useRef(Promise.resolve());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(loadModel);
  const [models, setModels] = useState([]);
  const [notice, setNotice] = useState('');
  const [workspace, setWorkspace] = useState('chat');
  const [seed, setSeed] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch { return 'light'; }
  });
  const abortRef = useRef(null);

  const active = conversations.find((c) => c.id === activeId);

  // Tema
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);

  // Muat konfigurasi & daftar model dari proxy
  useEffect(() => {
    fetchModels().then((info) => {
      setModels(info.models || []);
      setModel((cur) => cur || info.defaultModel || info.models?.[0] || '');
      const msgs = [];
      if (info.warning) msgs.push(info.warning);
      if (info.hasKey === false) msgs.push('NINEROUTER_API_KEY belum diisi di .env.');
      if (msgs.length) setNotice(msgs.join(' '));
    });
  }, []);

  useEffect(() => { saveModel(model); }, [model]);
  useEffect(() => {
    setCapability(null);
    if (!model.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/model-capabilities', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-9Router-Client': 'chat' }, body: JSON.stringify({ model }), signal: controller.signal })
        .then((res) => res.json()).then(setCapability).catch(() => {});
    }, 1200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [model]);

  useEffect(() => {
    getConversations().then((items) => {
      setConversations(items); setActiveId(items[0]?.id ?? null);
      items.forEach((c) => savedRef.current.set(c.id, JSON.stringify(c)));
      setLoaded(true);
    }).catch((err) => setNotice(err.message));
  }, []);

  // Serialize writes so an older streaming snapshot cannot overwrite a newer one.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      for (const c of conversations) {
        const serialized = JSON.stringify(c);
        if (savedRef.current.get(c.id) === serialized) continue;
        saveQueue.current = saveQueue.current.then(async () => {
          if (deletedRef.current.has(c.id)) return;
          await putConversation(c); savedRef.current.set(c.id, serialized);
        }).catch((err) => setNotice(err.message));
      }
    }, 500);
    return () => clearTimeout(t);
  }, [conversations, loaded]);

  const patchConv = useCallback((id, fn) =>
    setConversations((cs) => cs.map((c) => (c.id === id ? fn(c) : c))), []);

  const patchMsg = useCallback((convId, msgId, patch) =>
    patchConv(convId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) })), [patchConv]);

  // Inti: jalankan permintaan untuk riwayat yang diberikan, lalu stream jawabannya
  const run = useCallback(async (convId, history) => {
    const asst = { id: uid(), role: 'assistant', content: '', steps: [], createdAt: Date.now() };
    patchConv(convId, (c) => ({ ...c, messages: [...history, asst], updatedAt: Date.now() }));

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    let acc = '';
    let steps = [];
    try {
      await streamAgent({
        conversationId: convId,
        messages: history.map((m) => ({ role: m.role, content: `${m.content || ''}${m.attachments?.length ? `\nFile workspace: ${m.attachments.map((a) => `${a.name} => /workspace/uploads/${a.serverName || a.name}`).join(', ')}` : ''}` })),
        model,
        signal: controller.signal,
        hasAttachments: history.some((m) => m.attachments?.length),
        onEvent: (event) => {
          if (event.type === 'text') { acc += event.text; patchMsg(convId, asst.id, { content: acc }); }
          if (event.type === 'tool_start') setNotice(`Agent menjalankan ${event.name}...`);
          if (event.type === 'tool_start') {
            steps = [...steps, { id: event.id, name: event.name, status: 'running' }];
            patchMsg(convId, asst.id, { steps });
          }
          if (event.type === 'tool_result') {
            steps = steps.map((step) => step.id === event.id ? { ...step, status: event.ok ? 'success' : 'error', summary: String(event.error || (typeof event.result === 'string' ? event.result : JSON.stringify(event.result ?? event.excerpt ?? 'Selesai'))).slice(0, 1500) } : step);
            patchMsg(convId, asst.id, { steps });
          }
          if (event.type === 'tool_result') setNotice(event.ok ? `Tool ${event.name} selesai.` : `Tool ${event.name}: ${event.error}`);
          if (event.type === 'file') setNotice('File dibuat. Periksa preview untuk menyetujui atau menolak.');
        },
      });
      if (!acc) patchMsg(convId, asst.id, { error: 'API mengembalikan respons kosong.' });
    } catch (err) {
      if (err.name === 'AbortError') {
        if (!acc) patchConv(convId, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== asst.id) }));
      } else {
        patchMsg(convId, asst.id, { content: acc, error: err.message || 'Terjadi kesalahan tak dikenal.' });
      }
    } finally {
      steps = steps.map((step) => step.status === 'running' ? { ...step, status: 'error', summary: 'Proses dihentikan sebelum selesai.' } : step);
      patchMsg(convId, asst.id, { steps });
      abortRef.current = null;
      setBusy(false);
    }
  }, [model, patchConv, patchMsg]);

  const send = async (text, attachments) => {
    if (busy || !loaded) return false;
    if (!model.trim()) { setNotice('Pilih model terlebih dahulu.'); return false; }
    const id = activeId || uid();
    try {
      if (!active) await putConversation({ id, title: (text || attachments[0]?.name || 'Percakapan baru').slice(0, 40), messages: [] });
      if (attachments.length) {
        const uploaded = await uploadFiles(id, attachments);
        attachments = uploaded.map((file) => ({ id: file.id, name: file.originalName, serverName: file.name, size: 0, kind: 'file' }));
      }
    } catch (err) { setNotice(err.message); return false; }
    const userMsg = { id: uid(), role: 'user', content: text, attachments, createdAt: Date.now() };
    let convId = activeId;
    const history = active
      ? [...active.messages.filter((m) => m.content || m.role === 'user'), userMsg]
      : [userMsg];
    if (active) {
      convId = active.id;
    } else {
      convId = id;
      const title = (text || attachments[0]?.name || 'Percakapan baru').slice(0, 40);
      setConversations((cs) => [{ id: convId, title, messages: [], createdAt: Date.now(), updatedAt: Date.now() }, ...cs]);
      setActiveId(convId);
    }
    run(convId, history);
    return true;
  };

  const retry = () => {
    if (busy || !active) return;
    const idx = active.messages.map((m) => m.role).lastIndexOf('user');
    if (idx < 0) return;
    run(active.id, active.messages.slice(0, idx + 1));
  };

  const stop = () => abortRef.current?.abort();

  const remove = (id) => {
    if (!window.confirm('Hapus percakapan ini?')) return;
    if (id === activeId) { abortRef.current?.abort(); }
    deletedRef.current.add(id);
    saveQueue.current = saveQueue.current.then(() => deleteConversation(id)).catch((err) => setNotice(err.message));
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(conversations.find((c) => c.id !== id)?.id ?? null);
  };

  const noticeBar = 'mx-3 mt-3 flex items-start gap-2.5 rounded-xl bg-signal-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-signal-ink sm:mx-5';
  return (
    <div className="flex h-dvh overflow-hidden bg-frame md:p-3">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        workspace={workspace}
        busy={busy}
        theme={theme}
        onWorkspace={(w) => { setWorkspace(w); setSidebarOpen(false); }}
        onTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onClose={() => setSidebarOpen(false)}
        onNew={() => { if (!busy) { setActiveId(null); setWorkspace('chat'); } setSidebarOpen(false); }}
        onSelect={(id) => { if (!busy) { setActiveId(id); setWorkspace('chat'); setSidebarOpen(false); } }}
        onDelete={remove}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-sheet md:rounded-[1.75rem] md:border md:border-line md:shadow-sheet">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-5">
          <button onClick={() => setSidebarOpen(true)} className="-ml-1 rounded-lg p-2 text-ink-soft hover:bg-raised md:hidden" aria-label="Buka menu">
            <MenuIcon />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
            {workspace === 'excel' ? 'Excel' : active?.title || 'Percakapan baru'}
          </h2>

          <label className="flex items-center gap-2 rounded-full border border-line-strong bg-sheet py-1.5 pl-3 pr-3.5 transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
            <ModelIcon width={16} height={16} className="shrink-0 text-brand-strong" />
            <span className="sr-only">Model</span>
            <input
              list="model-list"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Pilih model"
              className="w-28 bg-transparent text-[13px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-faint focus-visible:outline-none sm:w-52"
            />
          </label>
          <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </header>

        {notice && (
          <div role="status" className={noticeBar}>
            <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Tutup pemberitahuan" className="rounded p-0.5 hover:bg-signal/20"><XIcon width={16} height={16} /></button>
          </div>
        )}
        {capability?.warning && (
          <div role="status" className={noticeBar}>
            <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{capability.warning} <button className="font-semibold underline underline-offset-2" onClick={() => setWorkspace('excel')}>Buka Excel fallback</button></span>
          </div>
        )}

        {workspace === 'excel' ? <ExcelWorkspace model={model} /> : <>
          <MessageList messages={active?.messages || []} busy={busy} onRetry={retry} onPick={(text) => setSeed({ text, n: Date.now() })} />
          <WorkspaceFiles conversationId={activeId} busy={busy} />
          <Composer busy={busy || !loaded} onSend={send} onStop={stop} seed={seed} />
        </>}
      </main>
    </div>
  );
}
