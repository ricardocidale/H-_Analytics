import { type IconProps, defaults, S, F } from '../icon-utils';

export function VecFile(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...F} />
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...S} fill="none" />
      <polyline points="14 2 14 8 20 8" {...S} fill="none" />
    </svg>
  );
}

export function VecFileText(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" {...F} />
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" {...S} fill="none" />
      <path d="M14 2v6h6" {...S} />
      <path d="M16 13H8" {...S} />
      <path d="M16 17H8" {...S} />
      <path d="M10 9H8" {...S} />
    </svg>
  );
}

export function VecFolder(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" {...F} />
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" {...S} fill="none" />
    </svg>
  );
}

export function VecDatabase(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <ellipse cx="12" cy="5" rx="8" ry="3" {...F} />
      <ellipse cx="12" cy="5" rx="8" ry="3" {...S} fill="none" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" {...S} />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" {...S} />
    </svg>
  );
}

export function VecClipboard(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="8" y="2" width="8" height="4" rx="1" {...F} />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" {...S} fill="none" />
      <rect x="8" y="2" width="8" height="4" rx="1" {...S} fill="none" />
      <path d="M12 11h4" {...S} />
      <path d="M12 16h4" {...S} />
      <path d="M8 11h.01" {...S} />
      <path d="M8 16h.01" {...S} />
    </svg>
  );
}

export function VecServer(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="2" width="20" height="8" rx="2" {...F} />
      <rect x="2" y="2" width="20" height="8" rx="2" {...S} fill="none" />
      <rect x="2" y="14" width="20" height="8" rx="2" {...F} />
      <rect x="2" y="14" width="20" height="8" rx="2" {...S} fill="none" />
      <circle cx="6" cy="6" r="1" fill="currentColor" opacity="0.35" />
      <circle cx="6" cy="18" r="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export function VecTable(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="18" height="18" rx="2" {...F} />
      <rect x="3" y="3" width="18" height="18" rx="2" {...S} fill="none" />
      <path d="M3 9h18" {...S} />
      <path d="M3 15h18" {...S} />
      <path d="M9 3v18" {...S} />
    </svg>
  );
}

export function VecMonitor(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="3" width="20" height="14" rx="2" {...F} />
      <rect x="2" y="3" width="20" height="14" rx="2" {...S} fill="none" />
      <path d="M8 21h8" {...S} />
      <path d="M12 17v4" {...S} />
    </svg>
  );
}
