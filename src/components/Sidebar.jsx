import { BrandMark, ChatIcon, MoonIcon, PlusIcon, SheetIcon, SunIcon, TrashIcon, XIcon } from './Icons.jsx';

const DAY = 86400000;
const stamp = (c) => c.updatedAt || c.createdAt || 0;

function groupOf(ts, startToday) {
  if (ts >= startToday) return 'Hari ini';
  if (ts >= startToday - DAY) return 'Kemarin';
  if (ts >= startToday - 7 * DAY) return '7 hari terakhir';
  return 'Lebih lama';
}

export default function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, open, onClose, workspace, onWorkspace, busy, theme, onTheme }) {
  const sorted = [...conversations].sort((a, b) => stamp(b) - stamp(a));
  const startToday = new Date().setHours(0, 0, 0, 0);
  const groups = [];
  for (const c of sorted) {
    const label = groupOf(stamp(c), startToday);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(c);
    else groups.push({ label, items: [c] });
  }
  const dark = theme === 'dark';

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[2px] md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[19rem] max-w-[85vw] flex-col border-r border-line bg-frame px-3 pb-3 pt-4 transition-transform duration-300 md:static md:w-72 md:max-w-none md:translate-x-0 md:border-0 md:px-2 md:pb-0 md:pt-2 ${
          open ? 'translate-x-0 shadow-float' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid size-8 place-items-center rounded-[10px] bg-bubble text-brand"><BrandMark width={20} height={20} /></span>
          <span className="text-[17px] font-extrabold tracking-tight">9router<span className="ml-1 font-medium text-ink-soft">chat</span></span>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-ink-soft hover:bg-ink/5 md:hidden" aria-label="Tutup menu">
            <XIcon />
          </button>
        </div>

        <div role="tablist" aria-label="Ruang kerja" className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-ink/[0.06] p-1">
          {[['chat', 'Chat', ChatIcon], ['excel', 'Excel', SheetIcon]].map(([id, label, Icon]) => (
            <button
              key={id} role="tab" aria-selected={workspace === id} disabled={busy} onClick={() => onWorkspace(id)}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                workspace === id ? 'bg-sheet text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              <Icon width={16} height={16} /> {label}
            </button>
          ))}
        </div>

        <button
          onClick={onNew}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-bold text-brand-ink transition hover:brightness-95 active:brightness-90"
        >
          <PlusIcon width={18} height={18} strokeWidth={2.25} /> Percakapan baru
        </button>

        <nav className="-mx-1 mt-4 flex-1 overflow-y-auto px-1 pb-3" aria-label="Riwayat percakapan">
          {sorted.length === 0 && (
            <p className="px-3 py-4 text-sm leading-relaxed text-ink-soft">Belum ada percakapan. Mulai dengan pesan pertama Anda.</p>
          )}
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-3 pb-1 text-xs font-semibold text-ink-faint">{g.label}</p>
              {g.items.map((c) => {
                const current = c.id === activeId && workspace === 'chat';
                return (
                  <div
                    key={c.id}
                    className={`group relative mb-0.5 flex items-center rounded-xl transition-colors ${
                      current ? 'bg-sheet shadow-sm' : 'hover:bg-sheet/60'
                    }`}
                  >
                    {current && <span aria-hidden="true" className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-brand" />}
                    <button
                      onClick={() => onSelect(c.id)}
                      aria-current={current ? 'true' : undefined}
                      className="min-w-0 flex-1 truncate rounded-xl py-2 pl-4 pr-2 text-left text-sm font-medium"
                    >
                      {c.title}
                    </button>
                    <button
                      onClick={() => onDelete(c.id)}
                      className="mr-1 rounded-lg p-1.5 text-ink-faint transition hover:bg-danger-soft hover:text-danger-ink focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      aria-label={`Hapus percakapan ${c.title}`}
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          role="switch" aria-checked={dark} onClick={onTheme}
          className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-ink/5"
        >
          {dark ? <MoonIcon width={18} height={18} /> : <SunIcon width={18} height={18} />}
          <span className="flex-1 text-left">Mode gelap</span>
          <span aria-hidden="true" className={`relative h-5 w-9 rounded-full transition-colors ${dark ? 'bg-brand' : 'bg-line-strong'}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${dark ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        </button>
      </aside>
    </>
  );
}
