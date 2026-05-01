import { type IconProps, defaults, S, F } from '../icon-utils';

export function VecPlay(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="5,3 19,12 5,21" {...F} />
      <polygon points="5,3 19,12 5,21" {...S} fill="none" />
    </svg>
  );
}

export function VecPause(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="6" y="4" width="4" height="16" rx="1" {...F} />
      <rect x="6" y="4" width="4" height="16" rx="1" {...S} fill="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" {...F} />
      <rect x="14" y="4" width="4" height="16" rx="1" {...S} fill="none" />
    </svg>
  );
}

export function VecCamera(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11z" {...F} />
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11z" {...S} fill="none" />
      <circle cx="12" cy="13" r="4" {...S} fill="none" />
    </svg>
  );
}

export function VecMic(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="9" y="2" width="6" height="11" rx="3" {...F} />
      <rect x="9" y="2" width="6" height="11" rx="3" {...S} fill="none" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" {...S} />
      <path d="M12 18v4" {...S} />
      <path d="M8 22h8" {...S} />
    </svg>
  );
}

export function VecImage(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="3" width="18" height="18" rx="2" {...F} />
      <rect x="3" y="3" width="18" height="18" rx="2" {...S} fill="none" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" opacity="0.35" />
      <path d="M21 15l-5-5-9 9" {...S} />
    </svg>
  );
}

export function VecSend(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M22 2L11 13" {...S} />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" {...F} />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" {...S} fill="none" />
    </svg>
  );
}

export function VecPhone(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" {...F} />
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" {...S} fill="none" />
    </svg>
  );
}

export function VecMessageSquare(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" {...F} />
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" {...S} fill="none" />
    </svg>
  );
}
