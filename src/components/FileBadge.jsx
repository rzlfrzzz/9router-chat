const TONES = {
  docx: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  xlsx: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  pdf: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  pptx: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
};
const ALIAS = { doc: 'docx', xls: 'xlsx', csv: 'xlsx', ppt: 'pptx' };

export const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Lencana jenis file: warna menandai jenis dokumen sehingga mudah dikenali sekilas.
export default function FileBadge({ name = '', className = '' }) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const tone = TONES[ALIAS[ext] || ext] || 'bg-ink/10 text-ink-soft';
  return (
    <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-lg text-[10px] font-bold tracking-wide ${tone} ${className}`}>
      {ext.slice(0, 4).toUpperCase() || 'FILE'}
    </span>
  );
}
