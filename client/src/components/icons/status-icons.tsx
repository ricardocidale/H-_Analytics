import { type IconProps, defaults, S, F } from './icon-utils';

export function IconSettings(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="3" {...F} />
      <circle cx="12" cy="12" r="3" {...S} fill="none" />
      <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" {...S} />
    </svg>
  );
}


export function IconSettingsGear(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M10.3 2h3.4l.5 2.3a7 7 0 0 1 1.7 1l2.2-.7 1.7 2.9-1.7 1.6a7 7 0 0 1 0 2l1.7 1.6-1.7 2.9-2.2-.7a7 7 0 0 1-1.7 1L13.7 22h-3.4l-.5-2.3a7 7 0 0 1-1.7-1l-2.2.7-1.7-2.9 1.7-1.6a7 7 0 0 1 0-2L4.2 11.3l1.7-2.9 2.2.7a7 7 0 0 1 1.7-1L10.3 2z" {...F} />
      <path d="M10.3 2h3.4l.5 2.3a7 7 0 0 1 1.7 1l2.2-.7 1.7 2.9-1.7 1.6a7 7 0 0 1 0 2l1.7 1.6-1.7 2.9-2.2-.7a7 7 0 0 1-1.7 1L13.7 22h-3.4l-.5-2.3a7 7 0 0 1-1.7-1l-2.2.7-1.7-2.9 1.7-1.6a7 7 0 0 1 0-2L4.2 11.3l1.7-2.9 2.2.7a7 7 0 0 1 1.7-1L10.3 2z" {...S} fill="none" />
      <circle cx="12" cy="12" r="3" {...S} fill="none" />
    </svg>
  );
}


export function IconSettings2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M20 7h-9" {...S} />
      <path d="M14 17H5" {...S} />
      <circle cx="17" cy="17" r="3" {...F} />
      <circle cx="17" cy="17" r="3" {...S} fill="none" />
      <circle cx="7" cy="7" r="3" {...F} />
      <circle cx="7" cy="7" r="3" {...S} fill="none" />
    </svg>
  );
}


export function IconSliders(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 21v-7" {...S} />
      <path d="M4 10V3" {...S} />
      <path d="M12 21v-9" {...S} />
      <path d="M12 8V3" {...S} />
      <path d="M20 21v-5" {...S} />
      <path d="M20 12V3" {...S} />
      <circle cx="4" cy="12" r="2" {...F} />
      <circle cx="4" cy="12" r="2" {...S} fill="none" />
      <circle cx="12" cy="10" r="2" {...F} />
      <circle cx="12" cy="10" r="2" {...S} fill="none" />
      <circle cx="20" cy="14" r="2" {...F} />
      <circle cx="20" cy="14" r="2" {...S} fill="none" />
    </svg>
  );
}


export function IconWrench(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" {...F} />
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" {...S} fill="none" />
    </svg>
  );
}


export function IconShield(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2l8 4v5c0 5.25-3.5 8.5-8 10-4.5-1.5-8-4.75-8-10V6l8-4z" {...F} />
      <path d="M12 2l8 4v5c0 5.25-3.5 8.5-8 10-4.5-1.5-8-4.75-8-10V6l8-4z" {...S} fill="none" />
      <path d="M9 12l2 2 4-4" {...S} />
    </svg>
  );
}


export function IconShieldAlert(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2l8 4v5c0 5.25-3.5 8.5-8 10-4.5-1.5-8-4.75-8-10V6l8-4z" {...F} />
      <path d="M12 2l8 4v5c0 5.25-3.5 8.5-8 10-4.5-1.5-8-4.75-8-10V6l8-4z" {...S} fill="none" />
      <path d="M12 8v4" {...S} />
      <circle cx="12" cy="16" r="0.5" fill="currentColor" />
    </svg>
  );
}


export function IconShieldCheck(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...F} />
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...S} fill="none" />
      <path d="M9 12l2 2 4-4" {...S} />
    </svg>
  );
}


export function IconAlertCircle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M12 8v4" {...S} />
      <circle cx="12" cy="16" r="0.5" fill="currentColor" />
    </svg>
  );
}


export function IconAlertTriangle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...F} />
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...S} fill="none" />
      <path d="M12 9v4" {...S} />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </svg>
  );
}


export function IconCheckCircle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M9 12l2 2 4-4" {...S} />
    </svg>
  );
}


export function IconCheckCircle2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M9 12l2 2 4-4" {...S} />
    </svg>
  );
}


export function IconInfo(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M12 16v-4" {...S} />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" />
    </svg>
  );
}


export function IconHelpCircle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" {...S} />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </svg>
  );
}


export function IconXCircle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M15 9l-6 6" {...S} />
      <path d="M9 9l6 6" {...S} />
    </svg>
  );
}


export function IconBell(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" {...F} />
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" {...S} fill="none" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" {...S} />
    </svg>
  );
}


export function IconClock(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M12 6v6l4 2" {...S} />
    </svg>
  );
}


export function IconTimer(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="13" r="8" {...F} />
      <circle cx="12" cy="13" r="8" {...S} fill="none" />
      <path d="M12 9v4l2 2" {...S} />
      <path d="M10 2h4" {...S} />
      <path d="M12 2v3" {...S} />
    </svg>
  );
}


export function IconVerify(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="9" {...F} />
      <circle cx="12" cy="12" r="9" {...S} fill="none" />
      <path d="M9 12l2 2 4-4" {...S} />
    </svg>
  );
}


export function IconTarget(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <circle cx="12" cy="12" r="6" {...S} fill="none" />
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.3" />
    </svg>
  );
}


export function IconStar(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" {...F} />
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" {...S} fill="none" />
    </svg>
  );
}


export function IconTag(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12.6 2.4l9 9a2 2 0 0 1 0 2.8l-6.4 6.4a2 2 0 0 1-2.8 0l-9-9A2 2 0 0 1 2.8 10l.6-5.6A2 2 0 0 1 5.2 2.6L10.8 2a2 2 0 0 1 1.8.4z" {...F} />
      <path d="M12.6 2.4l9 9a2 2 0 0 1 0 2.8l-6.4 6.4a2 2 0 0 1-2.8 0l-9-9A2 2 0 0 1 2.8 10l.6-5.6A2 2 0 0 1 5.2 2.6L10.8 2a2 2 0 0 1 1.8.4z" {...S} fill="none" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}


export function IconHeart(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" {...F} />
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" {...S} fill="none" />
    </svg>
  );
}


export function IconBookmark(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" {...F} />
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" {...S} fill="none" />
    </svg>
  );
}


export function IconHash(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 9h16" {...S} />
      <path d="M4 15h16" {...S} />
      <path d="M10 3l-2 18" {...S} />
      <path d="M16 3l-2 18" {...S} />
    </svg>
  );
}


export function IconToggleLeft(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="1" y="5" width="22" height="14" rx="7" {...F} />
      <rect x="1" y="5" width="22" height="14" rx="7" {...S} fill="none" />
      <circle cx="8" cy="12" r="3" {...S} fill="none" />
    </svg>
  );
}


export function IconThumbsUp(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M7 10v12" {...S} fill="none" />
      <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" {...F} />
      <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" {...S} fill="none" />
    </svg>
  );
}


export function IconHelp(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M2 4h8l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z" {...F} opacity="0" />
      <path d="M4 19V4h6l1 1h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4z" {...S} fill="none" />
      <path d="M4 19l-2 2V4a1 1 0 0 1 1-1h6l1 1h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6l-2 2z" {...F} />
      <path d="M2 4a1 1 0 0 1 1-1h6l1 1h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6l-4 4V4z" {...S} fill="none" />
      <path d="M10 9a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2" {...S} />
      <circle cx="12" cy="15" r="0.5" fill="currentColor" />
    </svg>
  );
}


export function IconProfile(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="8" r="4" {...F} />
      <circle cx="12" cy="8" r="4" {...S} fill="none" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" {...F} />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" {...S} fill="none" />
    </svg>
  );
}


export function IconExecutive(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" {...F} />
      <path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" {...S} fill="none" />
      <path d="M7 8h4" {...S} />
      <path d="M7 11h3" {...S} />
      <rect x="14" y="8" width="4" height="6" rx="0.5" {...S} fill="none" />
      <path d="M14 11h4" {...S} />
      <path d="M7 16h10" {...S} />
    </svg>
  );
}

export function IconCheck(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M20 6 9 17l-5-5" {...S} />
    </svg>
  );
}

export function IconX(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M18 6 6 18" {...S} />
      <path d="m6 6 12 12" {...S} />
    </svg>
  );
}
