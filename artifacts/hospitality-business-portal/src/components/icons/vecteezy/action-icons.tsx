import { type IconProps, defaults, S, F } from '../icon-utils';

export function VecPlus(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 5v14" {...S} />
      <path d="M5 12h14" {...S} />
    </svg>
  );
}

export function VecTrash(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 7h16l-1.5 13a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 7z" {...F} />
      <path d="M4 7h16l-1.5 13a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 7z" {...S} fill="none" />
      <path d="M2 7h20" {...S} />
      <path d="M9 3h6a1 1 0 0 1 1 1v3H8V4a1 1 0 0 1 1-1z" {...S} fill="none" />
      <path d="M10 11v5" {...S} />
      <path d="M14 11v5" {...S} />
    </svg>
  );
}

export function VecEdit(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z" {...F} />
      <path d="M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z" {...S} fill="none" />
      <path d="M13 7l4 4" {...S} />
    </svg>
  );
}

export function VecCopy(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="9" y="9" width="13" height="13" rx="2" {...F} />
      <rect x="9" y="9" width="13" height="13" rx="2" {...S} fill="none" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" {...S} />
    </svg>
  );
}

export function VecDownload(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...S} />
      <path d="M7 10l5 5 5-5" {...S} />
      <path d="M12 15V3" {...S} />
    </svg>
  );
}

export function VecUpload(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" {...S} />
      <path d="M12 3v12" {...S} />
      <path d="M8 7l4-4 4 4" {...S} />
    </svg>
  );
}

export function VecSearch(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="11" cy="11" r="7" {...F} />
      <circle cx="11" cy="11" r="7" {...S} fill="none" />
      <path d="M21 21l-4.35-4.35" {...S} />
    </svg>
  );
}

export function VecRefresh(p: IconProps) {
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

export function VecShare(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="18" cy="5" r="3" {...F} />
      <circle cx="18" cy="5" r="3" {...S} fill="none" />
      <circle cx="6" cy="12" r="3" {...S} fill="none" />
      <circle cx="18" cy="19" r="3" {...S} fill="none" />
      <path d="M8.59 13.51l6.83 3.98" {...S} />
      <path d="M15.41 6.51l-6.82 3.98" {...S} />
    </svg>
  );
}

export function VecMail(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="4" width="20" height="16" rx="2" {...F} />
      <rect x="2" y="4" width="20" height="16" rx="2" {...S} fill="none" />
      <path d="M2 7l10 6 10-6" {...S} />
    </svg>
  );
}
