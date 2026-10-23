const I = (d, extra = {}) => (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra} {...props}>
    {d}
  </svg>
);

export const MenuIcon = I(<path d="M4 7h16M4 12h16M4 17h10" />);
export const PlusIcon = I(<path d="M12 5v14M5 12h14" />);
export const TrashIcon = I(<path d="M4 7h16M9 7V5h6v2M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />);
export const SendIcon = I(<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />, { strokeWidth: 2.25 });
export const StopIcon = I(<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />);
export const ClipIcon = I(<path d="M20.5 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" />);
export const SunIcon = I(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const MoonIcon = I(<path d="M20.5 13.2A8.6 8.6 0 1110.8 3.5a6.8 6.8 0 009.7 9.7z" />);
export const CopyIcon = I(<><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 017.5 4H15" /></>);
export const XIcon = I(<path d="M18 6L6 18M6 6l12 12" />);
export const FileIcon = I(<><path d="M14 3H7.5A2.5 2.5 0 005 5.5v13A2.5 2.5 0 007.5 21h9a2.5 2.5 0 002.5-2.5V8z" /><path d="M14 3v5h5" /></>);
export const RetryIcon = I(<><path d="M3.5 12a8.5 8.5 0 108.5-8.5 8.5 8.5 0 00-6 2.5L3.5 8" /><path d="M3.5 3.5V8H8" /></>);
export const ChatIcon = I(<path d="M20.5 12a8 8 0 01-11.4 7.2L4 20.5l1.3-4.4A8 8 0 1120.5 12z" />);
export const SheetIcon = I(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 9.5h16M4 14.5h16M9.5 4v16" /></>);
export const PenIcon = I(<><path d="M16.5 3.5a2.1 2.1 0 013 3L7.5 18.5 3 20l1.5-4.5z" /><path d="M14.5 5.5l3 3" /></>);
export const NotesIcon = I(<><rect x="5.5" y="4" width="13" height="17" rx="2.5" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>);
export const CheckIcon = I(<path d="M5 12.5l4.5 4.5L19 7.5" />, { strokeWidth: 2.5 });
export const AlertIcon = I(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></>);
export const ChevronIcon = I(<path d="M9 6l6 6-6 6" />);
export const ModelIcon = I(<path d="M10 4l1.9 5.1L17 11l-5.1 1.9L10 18l-1.9-5.1L3 11l5.1-1.9zM18 3.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7zM18 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />);
export const DownloadIcon = I(<path d="M12 4v11M7 11l5 5 5-5M5 20h14" />);

/* Logo: angka "9" yang ekornya berujung di sebuah titik pemberhentian. */
export const BrandMark = I(<><circle cx="11" cy="9.5" r="4.5" /><path d="M15.5 9.5V14a5.5 5.5 0 01-5.5 5.5H8" /><circle cx="5.6" cy="19.5" r="1.4" fill="currentColor" stroke="none" /></>, { strokeWidth: 2 });
