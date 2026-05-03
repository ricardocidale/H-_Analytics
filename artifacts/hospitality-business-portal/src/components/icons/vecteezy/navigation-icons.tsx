import { type IconProps, defaults, S, F } from '../icon-utils';

export function VecHome(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 10l8-7 8 7v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10z" {...F} />
      <path d="M4 10l8-7 8 7v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10z" {...S} fill="none" />
      <rect x="9" y="14" width="6" height="7" rx="0.5" {...S} fill="none" />
    </svg>
  );
}

export function VecMenu(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 6h18" {...S} />
      <path d="M3 12h18" {...S} />
      <path d="M3 18h18" {...S} />
    </svg>
  );
}

export function VecChevronLeft(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M15 18l-6-6 6-6" {...S} />
    </svg>
  );
}

export function VecChevronRight(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M9 18l6-6-6-6" {...S} />
    </svg>
  );
}

export function VecChevronUp(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M18 15l-6-6-6 6" {...S} />
    </svg>
  );
}

export function VecChevronDown(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M6 9l6 6 6-6" {...S} />
    </svg>
  );
}

export function VecArrowLeft(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M19 12H5" {...S} />
      <path d="M12 19l-7-7 7-7" {...S} />
    </svg>
  );
}

export function VecArrowRight(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M5 12h14" {...S} />
      <path d="M12 5l7 7-7 7" {...S} />
    </svg>
  );
}

export function VecExternalLink(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" {...S} />
      <path d="M15 3h6v6" {...S} />
      <path d="M10 14L21 3" {...S} />
    </svg>
  );
}

export function VecGlobe(p: IconProps) {
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
