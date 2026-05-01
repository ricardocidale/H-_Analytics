import { type IconProps, defaults, S, F } from './icon-utils';

export function IconDashboard(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="7" height="9" rx="2" {...F} />
      <rect x="3" y="3" width="7" height="9" rx="2" {...S} fill="none" />
      <rect x="14" y="3" width="7" height="5" rx="2" {...S} fill="none" />
      <rect x="14" y="12" width="7" height="9" rx="2" {...F} />
      <rect x="14" y="12" width="7" height="9" rx="2" {...S} fill="none" />
      <rect x="3" y="16" width="7" height="5" rx="2" {...S} fill="none" />
    </svg>
  );
}


export function IconProperties(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 21V8l9-5 9 5v13" {...F} />
      <path d="M3 21V8l9-5 9 5v13" {...S} fill="none" />
      <rect x="8" y="13" width="3" height="4" rx="0.5" {...S} fill="none" />
      <rect x="13" y="13" width="3" height="4" rx="0.5" {...S} fill="none" />
      <path d="M9 9h6" {...S} />
      <path d="M1 21h22" {...S} />
    </svg>
  );
}


export function IconPropertyFinder(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="10.5" cy="10.5" r="6.5" {...F} />
      <circle cx="10.5" cy="10.5" r="6.5" {...S} fill="none" />
      <path d="M21 21l-4.35-4.35" {...S} />
      <path d="M8 10l2 2 3.5-4" {...S} />
    </svg>
  );
}


export function IconMapPin(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" {...F} />
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" {...S} fill="none" />
      <circle cx="12" cy="9" r="2.5" {...S} fill="none" />
      <circle cx="12" cy="9" r="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}


export function IconHome(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" {...F} />
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" {...S} fill="none" />
      <path d="M9 22V12h6v10" {...S} />
    </svg>
  );
}


export function IconHotel(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" {...F} />
      <path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" {...S} fill="none" />
      <path d="M9 22V18h6v4" {...S} />
      <rect x="8" y="6" width="3" height="3" rx="0.5" {...S} fill="none" />
      <rect x="13" y="6" width="3" height="3" rx="0.5" {...S} fill="none" />
      <rect x="8" y="11" width="3" height="3" rx="0.5" {...S} fill="none" />
      <rect x="13" y="11" width="3" height="3" rx="0.5" {...S} fill="none" />
    </svg>
  );
}


export function IconBed(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M2 4v16" {...S} />
      <path d="M2 8h18a2 2 0 0 1 2 2v10" {...S} />
      <path d="M2 17h20" {...S} />
      <rect x="6" y="11" width="5" height="3" rx="1" {...F} />
      <rect x="6" y="11" width="5" height="3" rx="1" {...S} fill="none" />
      <rect x="13" y="11" width="5" height="3" rx="1" {...F} />
      <rect x="13" y="11" width="5" height="3" rx="1" {...S} fill="none" />
    </svg>
  );
}


export function IconBuilding(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="4" y="2" width="16" height="20" rx="2" {...F} />
      <rect x="4" y="2" width="16" height="20" rx="2" {...S} fill="none" />
      <path d="M9 22V12h6v10" {...S} />
      <rect x="8" y="6" width="3" height="2.5" rx="0.5" {...S} fill="none" />
      <rect x="13" y="6" width="3" height="2.5" rx="0.5" {...S} fill="none" />
    </svg>
  );
}


export function IconBuilding2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="4" y="2" width="16" height="20" rx="2" {...F} />
      <rect x="4" y="2" width="16" height="20" rx="2" {...S} fill="none" />
      <path d="M9 22V12h6v10" {...S} />
      <rect x="8" y="6" width="3" height="2.5" rx="0.5" {...S} fill="none" />
      <rect x="13" y="6" width="3" height="2.5" rx="0.5" {...S} fill="none" />
    </svg>
  );
}


export function IconMap(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" {...F} />
      <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" {...S} fill="none" />
      <path d="M8 2v16" {...S} />
      <path d="M16 6v16" {...S} />
    </svg>
  );
}


export function IconMountain(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M8 3l-6 18h20L14 7l-3 4-3-8z" {...F} />
      <path d="M8 3l-6 18h20L14 7l-3 4-3-8z" {...S} fill="none" />
    </svg>
  );
}


export function IconCompass(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" {...F} opacity="0.3" />
      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" {...S} fill="none" />
    </svg>
  );
}


export function IconGlobe(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M2 12h20" {...S} />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" {...S} fill="none" />
    </svg>
  );
}


export function IconNavigation(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="3,11 22,2 13,21 11,13" {...F} />
      <polygon points="3,11 22,2 13,21 11,13" {...S} fill="none" />
    </svg>
  );
}


export function IconLogIn(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" {...S} />
      <path d="M10 17l5-5-5-5" {...S} />
      <path d="M15 12H3" {...S} />
      <rect x="15" y="3" width="6" height="18" rx="2" {...F} />
    </svg>
  );
}


export function IconLogOut(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...S} />
      <path d="M16 17l5-5-5-5" {...S} />
      <path d="M21 12H9" {...S} />
      <rect x="3" y="3" width="6" height="18" rx="2" {...F} />
    </svg>
  );
}


export function IconMenu(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 6h16" {...S} />
      <path d="M4 12h16" {...S} />
      <path d="M4 18h16" {...S} />
    </svg>
  );
}


export function IconPanelLeft(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="18" height="18" rx="2" {...F} />
      <rect x="3" y="3" width="18" height="18" rx="2" {...S} fill="none" />
      <path d="M9 3v18" {...S} />
      <path d="M14 8h4M14 12h3M14 16h4" {...S} />
    </svg>
  );
}


export function IconPackage(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2l9 4.5v11L12 22l-9-4.5v-11L12 2z" {...F} />
      <path d="M12 2l9 4.5v11L12 22l-9-4.5v-11L12 2z" {...S} fill="none" />
      <path d="M12 12l9-4.5M12 12v10M12 12L3 7.5" {...S} />
      <path d="M7.5 4.25L16.5 9" {...S} />
    </svg>
  );
}


export function IconLayoutGrid(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" {...F} />
      <rect x="3" y="3" width="7" height="7" rx="1.5" {...S} fill="none" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" {...F} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" {...S} fill="none" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" {...F} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" {...S} fill="none" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" {...F} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" {...S} fill="none" />
    </svg>
  );
}


export function IconLayoutDashboard(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="7" height="9" rx="1" {...F} />
      <rect x="3" y="3" width="7" height="9" rx="1" {...S} fill="none" />
      <rect x="14" y="3" width="7" height="5" rx="1" {...S} fill="none" />
      <rect x="14" y="12" width="7" height="9" rx="1" {...S} fill="none" />
      <rect x="3" y="16" width="7" height="5" rx="1" {...S} fill="none" />
    </svg>
  );
}


export function IconLayoutTemplate(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="18" height="18" rx="2" {...F} />
      <rect x="3" y="3" width="18" height="18" rx="2" {...S} fill="none" />
      <path d="M21 9H3" {...S} fill="none" />
      <path d="M9 21V9" {...S} fill="none" />
    </svg>
  );
}


export function IconColumns(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="18" height="18" rx="2" {...F} />
      <rect x="3" y="3" width="18" height="18" rx="2" {...S} fill="none" />
      <line x1="12" y1="3" x2="12" y2="21" {...S} />
    </svg>
  );
}


export function IconList(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <line x1="8" y1="6" x2="21" y2="6" {...S} />
      <line x1="8" y1="12" x2="21" y2="12" {...S} />
      <line x1="8" y1="18" x2="21" y2="18" {...S} />
      <line x1="3" y1="6" x2="3.01" y2="6" {...S} />
      <line x1="3" y1="12" x2="3.01" y2="12" {...S} />
      <line x1="3" y1="18" x2="3.01" y2="18" {...S} />
    </svg>
  );
}


export function IconMoreVertical(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="1" {...S} />
      <circle cx="12" cy="5" r="1" {...S} />
      <circle cx="12" cy="19" r="1" {...S} />
    </svg>
  );
}


export function IconPresentation(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="3" width="20" height="14" rx="2" {...F} />
      <rect x="2" y="3" width="20" height="14" rx="2" {...S} fill="none" />
      <path d="M8 21l4-4 4 4" {...S} />
      <path d="M12 17v-4" {...S} />
      <path d="M7 10l3-3 2 2 4-4" {...S} />
    </svg>
  );
}


export function IconCalendar(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="4" width="18" height="18" rx="2" {...F} />
      <rect x="3" y="4" width="18" height="18" rx="2" {...S} fill="none" />
      <path d="M16 2v4" {...S} />
      <path d="M8 2v4" {...S} />
      <path d="M3 10h18" {...S} />
      <circle cx="8" cy="15" r="0.75" fill="currentColor" opacity="0.35" />
      <circle cx="12" cy="15" r="0.75" fill="currentColor" opacity="0.35" />
      <circle cx="16" cy="15" r="0.75" fill="currentColor" opacity="0.35" />
    </svg>
  );
}


export function IconBookOpen(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" {...F} />
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" {...S} fill="none" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" {...S} fill="none" />
    </svg>
  );
}


export function IconBookOpenCheck(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M8 3H2v15h7c1.7 0 3 1.3 3 3V7c0-2.2-1.8-4-4-4z" {...F} />
      <path d="M8 3H2v15h7c1.7 0 3 1.3 3 3V7c0-2.2-1.8-4-4-4z" {...S} fill="none" />
      <path d="M16 3h6v15h-7c-1.7 0-3 1.3-3 3V7c0-2.2 1.8-4 4-4z" {...S} fill="none" />
      <path d="M16 12l2 2 4-4" {...S} />
    </svg>
  );
}


export function IconLibrary(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="4" height="18" rx="1" {...F} />
      <rect x="3" y="3" width="4" height="18" rx="1" {...S} fill="none" />
      <rect x="10" y="3" width="4" height="18" rx="1" {...F} />
      <rect x="10" y="3" width="4" height="18" rx="1" {...S} fill="none" />
      <rect x="17" y="3" width="4" height="18" rx="1" {...F} />
      <rect x="17" y="3" width="4" height="18" rx="1" {...S} fill="none" />
    </svg>
  );
}


export function IconInbox(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" {...F} />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" {...S} fill="none" />
    </svg>
  );
}


export function IconForward(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polyline points="15 17 20 12 15 7" {...S} fill="none" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" {...S} fill="none" />
    </svg>
  );
}


export function IconHistory(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <polyline points="12 6 12 12 16 14" {...S} fill="none" />
    </svg>
  );
}


export function IconScenarios(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" {...F} />
      <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" {...S} fill="none" />
      <path d="M10 13l2 2 4-4" {...S} />
    </svg>
  );
}
