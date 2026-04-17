import { type IconProps, defaults, S, F } from './icon-utils';

export function IconMic(p: IconProps) {
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


export function IconMic2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" {...F} />
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" {...S} fill="none" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" {...S} />
      <path d="M12 18v4" {...S} />
      <path d="M8 22h8" {...S} />
    </svg>
  );
}


export function IconMicOff(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="9" y="2" width="6" height="11" rx="3" {...F} />
      <rect x="9" y="2" width="6" height="11" rx="3" {...S} fill="none" />
      <path d="M19 10v1a7 7 0 0 1-11.46 5.38" {...S} />
      <path d="M5 10v1a7 7 0 0 0 .54 2.7" {...S} />
      <path d="M12 18v4" {...S} />
      <path d="M8 22h8" {...S} />
      <path d="M2 2l20 20" {...S} />
    </svg>
  );
}


export function IconMusic(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="6" cy="18" r="3" {...F} />
      <circle cx="6" cy="18" r="3" {...S} fill="none" />
      <path d="M9 18V5l12-2v13" {...S} />
      <circle cx="18" cy="16" r="3" {...F} />
      <circle cx="18" cy="16" r="3" {...S} fill="none" />
    </svg>
  );
}


export function IconMusic2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="8" cy="18" r="4" {...F} />
      <circle cx="8" cy="18" r="4" {...S} fill="none" />
      <path d="M12 18V2l7 4" {...S} />
    </svg>
  );
}


export function IconAudioLines(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M2 10v4" {...S} />
      <path d="M6 6v12" {...S} />
      <path d="M10 3v18" {...S} />
      <path d="M14 8v8" {...S} />
      <path d="M18 5v14" {...S} />
      <path d="M22 10v4" {...S} />
    </svg>
  );
}


export function IconVolume(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" {...F} />
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" {...S} fill="none" />
    </svg>
  );
}


export function IconVolume1(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" {...F} />
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" {...S} fill="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" {...S} fill="none" />
    </svg>
  );
}


export function IconVolume2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M11 5L6 9H2v6h4l5 4V5z" {...F} />
      <path d="M11 5L6 9H2v6h4l5 4V5z" {...S} fill="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" {...S} />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" {...S} />
    </svg>
  );
}


export function IconVolumeX(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" {...F} />
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" {...S} fill="none" />
      <line x1="23" y1="9" x2="17" y2="15" {...S} />
      <line x1="17" y1="9" x2="23" y2="15" {...S} />
    </svg>
  );
}


export function IconPlay(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="5,3 19,12 5,21" {...F} />
      <polygon points="5,3 19,12 5,21" {...S} fill="none" />
    </svg>
  );
}


export function IconPause(p: IconProps) {
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


export function IconPlayCircle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <polygon points="10,8 16,12 10,16" {...F} opacity="0.3" />
      <polygon points="10,8 16,12 10,16" {...S} fill="none" />
    </svg>
  );
}


export function IconSkipBack(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="19 20 9 12 19 4" {...F} />
      <polygon points="19 20 9 12 19 4" {...S} fill="none" />
      <line x1="5" y1="19" x2="5" y2="5" {...S} />
    </svg>
  );
}


export function IconSkipForward(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="5 4 15 12 5 20" {...F} />
      <polygon points="5 4 15 12 5 20" {...S} fill="none" />
      <line x1="19" y1="5" x2="19" y2="19" {...S} />
    </svg>
  );
}


export function IconMessageCircle(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" {...F} />
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" {...S} fill="none" />
    </svg>
  );
}


export function IconMessageSquare(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" {...F} />
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" {...S} fill="none" />
    </svg>
  );
}


export function IconMessageSquareText(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...F} />
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...S} fill="none" />
      <path d="M13 8H7" {...S} fill="none" />
      <path d="M17 12H7" {...S} fill="none" />
    </svg>
  );
}


export function IconSend(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M22 2L11 13" {...S} />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" {...F} />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" {...S} fill="none" />
    </svg>
  );
}


export function IconExternalLink(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" {...S} />
      <path d="M15 3h6v6" {...S} />
      <path d="M10 14L21 3" {...S} />
      <rect x="3" y="6" width="13" height="15" rx="2" {...F} />
    </svg>
  );
}


export function IconLink(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" {...S} />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" {...S} />
    </svg>
  );
}


export function IconPhone(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" {...F} />
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" {...S} fill="none" />
    </svg>
  );
}


export function IconPhoneOff(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67" {...S} fill="none" />
      <path d="M22 2L2 22" {...S} fill="none" />
      <path d="M3.27 11.11a19.89 19.89 0 0 1-1.24-4.93A2 2 0 0 1 3.75 4H6.7a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.67 11.91" {...S} fill="none" />
    </svg>
  );
}


export function IconRadio(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="2" {...F} />
      <circle cx="12" cy="12" r="2" {...S} fill="none" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49" {...S} fill="none" />
      <path d="M7.76 16.24a6 6 0 0 1 0-8.49" {...S} fill="none" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" {...S} fill="none" />
      <path d="M4.93 19.07a10 10 0 0 1 0-14.14" {...S} fill="none" />
    </svg>
  );
}


export function IconCaptions(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="1" y="4" width="22" height="16" rx="2.5" {...F} />
      <rect x="1" y="4" width="22" height="16" rx="2.5" {...S} fill="none" />
      <path d="M7 15h4M13 15h4" {...S} />
      <path d="M7 11h10" {...S} />
    </svg>
  );
}


export function IconBot(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="8" width="18" height="12" rx="3" {...F} />
      <rect x="3" y="8" width="18" height="12" rx="3" {...S} fill="none" />
      <circle cx="9" cy="14" r="1.5" fill="currentColor" opacity="0.35" />
      <circle cx="15" cy="14" r="1.5" fill="currentColor" opacity="0.35" />
      <path d="M12 2v4" {...S} />
      <circle cx="12" cy="2" r="1" fill="currentColor" opacity="0.3" />
      <path d="M9 18h6" {...S} />
      <path d="M1 13h2M21 13h2" {...S} />
    </svg>
  );
}


export function IconBrain(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2a5 5 0 0 0-4.6 3A4.5 4.5 0 0 0 4 9.5a4.5 4.5 0 0 0 1.4 3.3A5 5 0 0 0 4 16a5 5 0 0 0 5 5h1V2h-1z" {...F} />
      <path d="M12 2a5 5 0 0 1 4.6 3A4.5 4.5 0 0 1 20 9.5a4.5 4.5 0 0 1-1.4 3.3A5 5 0 0 1 20 16a5 5 0 0 1-5 5h-3V2z" {...F} opacity="0.08" />
      <path d="M12 2a5 5 0 0 0-4.6 3A4.5 4.5 0 0 0 4 9.5a4.5 4.5 0 0 0 1.4 3.3A5 5 0 0 0 4 16a5 5 0 0 0 5 5" {...S} />
      <path d="M12 2a5 5 0 0 1 4.6 3A4.5 4.5 0 0 1 20 9.5a4.5 4.5 0 0 1-1.4 3.3A5 5 0 0 1 20 16a5 5 0 0 1-5 5" {...S} />
      <path d="M12 2v19" {...S} />
    </svg>
  );
}


export function IconSparkles(p: IconProps) {
  const a = defaults(p);
  // Classic AI "twinkle" sparkle: a 4-point star with concave sides, paired
  // with a smaller companion sparkle in the upper-right. Used by the Analyst
  // CTA across the app — see AnalystButton for theming (text-accent-pop).
  return (
    <svg {...a}>
      {/* Main sparkle (4-point twinkle, concave-sided) */}
      <path d="M11 3 C 11.7 8.2, 13.8 10.3, 19 11 C 13.8 11.7, 11.7 13.8, 11 19 C 10.3 13.8, 8.2 11.7, 3 11 C 8.2 10.3, 10.3 8.2, 11 3 Z" {...F} />
      <path d="M11 3 C 11.7 8.2, 13.8 10.3, 19 11 C 13.8 11.7, 11.7 13.8, 11 19 C 10.3 13.8, 8.2 11.7, 3 11 C 8.2 10.3, 10.3 8.2, 11 3 Z" {...S} fill="none" />
      {/* Companion sparkle (smaller, upper-right) */}
      <path d="M19 14 C 19.3 16, 20 16.7, 22 17 C 20 17.3, 19.3 18, 19 20 C 18.7 18, 18 17.3, 16 17 C 18 16.7, 18.7 16, 19 14 Z" {...F} />
      <path d="M19 14 C 19.3 16, 20 16.7, 22 17 C 20 17.3, 19.3 18, 19 20 C 18.7 18, 18 17.3, 16 17 C 18 16.7, 18.7 16, 19 14 Z" {...S} fill="none" />
    </svg>
  );
}


export function IconWand2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M15 4V2" {...S} />
      <path d="M15 16v-2" {...S} />
      <path d="M8 9h2" {...S} />
      <path d="M20 9h2" {...S} />
      <path d="M17.8 11.8l1.4 1.4" {...S} />
      <path d="M15 9h.01" {...S} />
      <path d="M17.8 6.2l1.4-1.4" {...S} />
      <path d="M3 21l9-9" {...S} />
      <path d="M12.2 6.2l1.4-1.4" {...S} />
      <circle cx="15" cy="9" r="4" {...F} />
    </svg>
  );
}


export function IconZap(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" {...F} />
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" {...S} fill="none" />
    </svg>
  );
}


export function IconCamera(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11z" {...F} />
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11z" {...S} fill="none" />
      <circle cx="12" cy="13" r="4" {...S} fill="none" />
      <circle cx="12" cy="13" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}
