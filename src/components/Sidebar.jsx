import { PlusIcon, TrashIcon, XIcon } from './Icons.jsx';

export default function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, open, onClose }) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-zinc-200 bg-zinc-50 transition-transform dark:border-zinc-800 dark:bg-zinc-900 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            onClick={onNew}
            className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-200 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <PlusIcon width={18} height={18} /> Percakapan baru
          </button>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 md:hidden" aria-label="Tutup">
            <XIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {sorted.length === 0 && <p className="px-3 py-4 text-sm text-zinc-500">Belum ada percakapan.</p>}
          {sorted.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`group mb-0.5 flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-sm ${
                c.id === activeId ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60'
              }`}
            >
              <span className="flex-1 truncate">{c.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                className="rounded p-1 text-zinc-500 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
                aria-label="Hapus percakapan"
              >
                <TrashIcon width={16} height={16} />
              </button>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}