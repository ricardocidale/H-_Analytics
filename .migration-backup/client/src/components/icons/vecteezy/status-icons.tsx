import { type IconProps, defaults, S, F } from '../icon-utils';

export function VecCheckCircle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M9 12l2 2 4-4" {...S} />
    </svg>
  );
}

export function VecAlertTriangle(p: IconProps) {
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

export function VecInfo(p: IconProps) {
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

export function VecXCircle(p: IconProps) {
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

export function VecBell(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" {...F} />
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" {...S} fill="none" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" {...S} />
    </svg>
  );
}

export function VecClock(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M12 6v6l4 2" {...S} />
    </svg>
  );
}

export function VecShield(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2l8 4v5c0 5.25-3.5 8.5-8 10-4.5-1.5-8-4.75-8-10V6l8-4z" {...F} />
      <path d="M12 2l8 4v5c0 5.25-3.5 8.5-8 10-4.5-1.5-8-4.75-8-10V6l8-4z" {...S} fill="none" />
      <path d="M9 12l2 2 4-4" {...S} />
    </svg>
  );
}

export function VecSettings(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M10.3 2h3.4l.5 2.3a7 7 0 0 1 1.7 1l2.2-.7 1.7 2.9-1.7 1.6a7 7 0 0 1 0 2l1.7 1.6-1.7 2.9-2.2-.7a7 7 0 0 1-1.7 1L13.7 22h-3.4l-.5-2.3a7 7 0 0 1-1.7-1l-2.2.7-1.7-2.9 1.7-1.6a7 7 0 0 1 0-2L4.2 11.3l1.7-2.9 2.2.7a7 7 0 0 1 1.7-1L10.3 2z" {...F} />
      <path d="M10.3 2h3.4l.5 2.3a7 7 0 0 1 1.7 1l2.2-.7 1.7 2.9-1.7 1.6a7 7 0 0 1 0 2l1.7 1.6-1.7 2.9-2.2-.7a7 7 0 0 1-1.7 1L13.7 22h-3.4l-.5-2.3a7 7 0 0 1-1.7-1l-2.2.7-1.7-2.9 1.7-1.6a7 7 0 0 1 0-2L4.2 11.3l1.7-2.9 2.2.7a7 7 0 0 1 1.7-1L10.3 2z" {...S} fill="none" />
      <circle cx="12" cy="12" r="3" {...S} fill="none" />
    </svg>
  );
}
