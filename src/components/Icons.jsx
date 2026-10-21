const I = (d, extra = {}) => (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" {...extra} {...props}>
    {d}
  </svg>
);

export const MenuIcon = I(<path d="M4 6h16M4 12h16M4 18h16" />);
export const PlusIcon = I(<path d="M12 5v14M5 12h14" />);
export const TrashIcon = I(<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />);
export const SendIcon = I(<path d="M12 19V5M5 12l7-7 7 7" />);
export const StopIcon = I(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />);
export const ClipIcon = I(<path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8" />);
export const SunIcon = I(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const MoonIcon = I(<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />);
export const CopyIcon = I(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></>);
export const XIcon = I(<path d="M18 6L6 18M6 6l12 12" />);
export const FileIcon = I(<><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></>);
export const RetryIcon = I(<><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" /><path d="M3 3v5h5" /></>);