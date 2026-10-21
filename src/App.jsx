import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import MessageList from './components/MessageList.jsx';
import Composer from './components/Composer.jsx';
import ExcelWorkspace from './components/ExcelWorkspace.jsx';
import WorkspaceFiles from './components/WorkspaceFiles.jsx';
import { MenuIcon, MoonIcon, SunIcon, XIcon } from './components/Icons.jsx';
import { loadModel, saveModel } from './lib/storage.js';
import { getConversations, putConversation, deleteConversation, uploadFiles, streamAgent } from './lib/server-storage.js';
import { fetchModels } from './lib/api.js';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const deletedRef = useRef(new Set());
  const savedRef = useRef(new Map());
  const saveQueue = useRef(Promise.resolve());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(loadModel);
  const [models, setModels] = useState([]);
  const [notice, setNotice] = useState('');
  const [workspace, setWorkspace] = useState('chat');
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
    const asst = { id: uid(), role: 'assistant', content: '', createdAt: Date.now() };
    patchConv(convId, (c) => ({ ...c, messages: [...history, asst], updatedAt: Date.now() }));

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    let acc = '';
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

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={() => { if (!busy) setActiveId(null); setSidebarOpen(false); }}
        onSelect={(id) => { if (!busy) { setActiveId(id); setSidebarOpen(false); } }}
        onDelete={remove}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden" aria-label="Buka menu">
            <MenuIcon />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{active?.title || '9router Chat'}</h2>

          <button disabled={busy} onClick={() => setWorkspace(workspace === 'chat' ? 'excel' : 'chat')} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700">{workspace === 'chat' ? 'Excel' : 'Chat'}</button>

          <input
            list="model-list"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model"
            className="w-36 rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 sm:w-56"
          />
          <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Ganti tema"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        {notice && (
          <div role="status" className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Tutup"><XIcon width={16} height={16} /></button>
          </div>
        )}

        {workspace === 'excel' ? <ExcelWorkspace model={model} /> : <>
          <MessageList messages={active?.messages || []} busy={busy} onRetry={retry} />
          <WorkspaceFiles conversationId={activeId} busy={busy} />
          <Composer busy={busy || !loaded} onSend={send} onStop={stop} />
        </>}
      </main>
    </div>
  );
}