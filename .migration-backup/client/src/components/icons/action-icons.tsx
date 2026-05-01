import { type IconProps, defaults, S, F } from './icon-utils';

export function IconPlus(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="9" {...F} />
      <circle cx="12" cy="12" r="9" {...S} fill="none" />
      <path d="M12 8v8" {...S} />
      <path d="M8 12h8" {...S} />
    </svg>
  );
}


export function IconPlusCircle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M12 8v8" {...S} />
      <path d="M8 12h8" {...S} />
    </svg>
  );
}


export function IconTrash(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 7h16l-1.5 13a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 7z" {...F} />
      <path d="M4 7h16l-1.5 13a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 7z" {...S} fill="none" />
      <path d="M2 7h20" {...S} />
      <path d="M9 3h6a1 1 0 0 1 1 1v3H8V4a1 1 0 0 1 1-1z" {...S} fill="none" />
      <path d="M10 11v6" {...S} />
      <path d="M14 11v6" {...S} />
    </svg>
  );
}


export function IconPencil(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z" {...F} />
      <path d="M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z" {...S} fill="none" />
      <path d="M13 7l4 4" {...S} />
    </svg>
  );
}


export function IconCopy(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="9" y="9" width="13" height="13" rx="2" {...F} />
      <rect x="9" y="9" width="13" height="13" rx="2" {...S} fill="none" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" {...S} />
    </svg>
  );
}


export function IconSave(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" {...F} />
      <path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" {...S} fill="none" />
      <path d="M7 3v5h8V3" {...S} />
      <rect x="7" y="14" width="10" height="7" rx="1" {...S} fill="none" />
    </svg>
  );
}


export function IconUpload(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" {...S} />
      <path d="M12 3v12" {...S} />
      <path d="M8 7l4-4 4 4" {...S} />
      <path d="M8 7l4-4 4 4" {...F} opacity="0.15" />
    </svg>
  );
}


export function IconDownload(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...S} />
      <path d="M7 10l5 5 5-5" {...S} />
      <path d="M12 15V3" {...S} />
      <rect x="3" y="15" width="18" height="6" rx="2" {...F} />
    </svg>
  );
}


export function IconExport(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7l-6-4z" {...F} />
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7l-6-4z" {...S} fill="none" />
      <path d="M14 3v4h4" {...S} />
      <path d="M12 12v5" {...S} />
      <path d="M9 15l3 3 3-3" {...S} />
    </svg>
  );
}


export function IconRefresh(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" {...S} />
      <path d="M21 3v5h-5" {...S} />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" {...S} />
      <path d="M3 21v-5h5" {...S} />
    </svg>
  );
}


export function IconRefreshCw(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" {...S} />
      <path d="M21 3v5h-5" {...S} />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" {...S} />
      <path d="M3 21v-5h5" {...S} />
    </svg>
  );
}


export function IconEye(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" {...F} />
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" {...S} fill="none" />
      <circle cx="12" cy="12" r="3" {...S} fill="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}


export function IconEyeOff(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" {...S} />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" {...S} />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" {...S} />
      <path d="M1 1l22 22" {...S} />
    </svg>
  );
}


export function IconKey(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="8" cy="15" r="5" {...F} />
      <circle cx="8" cy="15" r="5" {...S} fill="none" />
      <path d="M11.5 11.5L21 2" {...S} />
      <path d="M18 5l3 3" {...S} />
      <path d="M15 8l3 3" {...S} />
      <circle cx="8" cy="15" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}


export function IconUserPlus(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="10" cy="8" r="4" {...F} />
      <circle cx="10" cy="8" r="4" {...S} fill="none" />
      <path d="M10 14c-4.42 0-8 1.79-8 4v2h16v-2c0-.73-.4-1.42-1.1-2" {...S} />
      <path d="M19 8v6" {...S} />
      <path d="M16 11h6" {...S} />
    </svg>
  );
}


export function IconMail(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="4" width="20" height="16" rx="2.5" {...F} />
      <rect x="2" y="4" width="20" height="16" rx="2.5" {...S} fill="none" />
      <path d="M2 7l10 6 10-6" {...S} />
    </svg>
  );
}


export function IconGroupUsers(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="9" cy="7" r="4" {...F} />
      <circle cx="9" cy="7" r="4" {...S} fill="none" />
      <path d="M1 21v-2c0-2.21 3.58-4 8-4s8 1.79 8 4v2" {...S} />
      <circle cx="17" cy="7" r="3" {...S} fill="none" />
      <path d="M21 21v-2c0-1.16-1.46-2.16-3.5-2.7" {...S} />
    </svg>
  );
}


export function IconPalette(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c3 0 5.6-2.5 5.6-5.5C23 5.4 18 2 12 2z" {...F} />
      <path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c3 0 5.6-2.5 5.6-5.5C23 5.4 18 2 12 2z" {...S} fill="none" />
      <circle cx="7.5" cy="11.5" r="1.5" fill="currentColor" opacity="0.35" />
      <circle cx="10" cy="7.5" r="1.5" fill="currentColor" opacity="0.35" />
      <circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" opacity="0.35" />
      <circle cx="17" cy="11.5" r="1.5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}


export function IconSwatchBook(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="8" height="18" rx="2" {...F} />
      <rect x="3" y="3" width="8" height="18" rx="2" {...S} fill="none" />
      <path d="M13 3h6a2 2 0 0 1 2 2v3l-8 8V5a2 2 0 0 1 2-2z" {...F} />
      <path d="M13 3h6a2 2 0 0 1 2 2v3l-8 8V5a2 2 0 0 1 2-2z" {...S} fill="none" />
      <circle cx="7" cy="17" r="1.5" fill="currentColor" opacity="0.35" />
      <path d="M13 16l3-3 3 3v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4z" {...S} fill="none" />
    </svg>
  );
}


export function IconImage(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" {...F} />
      <rect x="3" y="3" width="18" height="18" rx="2.5" {...S} fill="none" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" opacity="0.35" />
      <path d="M21 15l-5-5-9 9" {...S} />
    </svg>
  );
}


export function IconImageIcon(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="18" height="18" rx="2" {...F} />
      <rect x="3" y="3" width="18" height="18" rx="2" {...S} fill="none" />
      <circle cx="8.5" cy="8.5" r="1.5" {...S} fill="none" />
      <path d="M21 15l-5-5L5 21" {...S} fill="none" />
    </svg>
  );
}


export function IconShare(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="18" cy="5" r="3" {...F} />
      <circle cx="18" cy="5" r="3" {...S} fill="none" />
      <circle cx="6" cy="12" r="3" {...S} fill="none" />
      <circle cx="18" cy="19" r="3" {...S} fill="none" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" {...S} />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" {...S} />
    </svg>
  );
}


export function IconMaximize2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polyline points="15 3 21 3 21 9" {...S} fill="none" />
      <polyline points="9 21 3 21 3 15" {...S} fill="none" />
      <line x1="21" y1="3" x2="14" y2="10" {...S} />
      <line x1="3" y1="21" x2="10" y2="14" {...S} />
    </svg>
  );
}


export function IconMinimize2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polyline points="4 14 10 14 10 20" {...S} fill="none" />
      <polyline points="20 10 14 10 14 4" {...S} fill="none" />
      <line x1="14" y1="10" x2="21" y2="3" {...S} />
      <line x1="3" y1="21" x2="10" y2="14" {...S} />
    </svg>
  );
}


export function IconCrop(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M6 2v4" {...S} />
      <path d="M18 22v-4" {...S} />
      <rect x="6" y="6" width="12" height="12" rx="1" {...F} />
      <path d="M6 6h14v12H6z" {...S} fill="none" />
      <path d="M2 6h4" {...S} />
      <path d="M18 18h4" {...S} />
    </svg>
  );
}


export function IconArrowRightLeft(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M21 7H3" {...S} />
      <path d="M18 4l3 3-3 3" {...S} />
      <path d="M3 17h18" {...S} />
      <path d="M6 20l-3-3 3-3" {...S} />
    </svg>
  );
}


export function IconArrowUpRight(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M7 17L17 7" {...S} />
      <path d="M7 7h10v10" {...S} />
    </svg>
  );
}


export function IconGitCompareArrows(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="5" cy="6" r="3" {...F} />
      <circle cx="5" cy="6" r="3" {...S} fill="none" />
      <circle cx="19" cy="18" r="3" {...F} />
      <circle cx="19" cy="18" r="3" {...S} fill="none" />
      <path d="M12 2l-3 3 3 3" {...S} />
      <path d="M9 5h7a4 4 0 0 1 4 4v4" {...S} />
      <path d="M12 22l3-3-3-3" {...S} />
      <path d="M15 19H8a4 4 0 0 1-4-4v-4" {...S} />
    </svg>
  );
}
