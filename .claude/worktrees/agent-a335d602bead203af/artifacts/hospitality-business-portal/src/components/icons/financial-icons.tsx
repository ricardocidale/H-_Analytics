import { type IconProps, defaults, S, F } from './icon-utils';

export function IconBriefcase(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="7" width="20" height="14" rx="2.5" {...F} />
      <rect x="2" y="7" width="20" height="14" rx="2.5" {...S} fill="none" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" {...S} />
      <path d="M2 13h20" {...S} />
      <circle cx="12" cy="13" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}


export function IconAnalysis(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="14" width="4" height="7" rx="1" {...F} />
      <rect x="3" y="14" width="4" height="7" rx="1" {...S} fill="none" />
      <rect x="10" y="9" width="4" height="12" rx="1" {...F} />
      <rect x="10" y="9" width="4" height="12" rx="1" {...S} fill="none" />
      <rect x="17" y="4" width="4" height="17" rx="1" {...F} />
      <rect x="17" y="4" width="4" height="17" rx="1" {...S} fill="none" />
      <path d="M3 13l4-3 5-2 5-4" {...S} />
      <path d="M15 4h4v3" {...S} />
    </svg>
  );
}


export function IconIncomeStatement(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...F} />
      <path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...S} fill="none" />
      <path d="M8 7h8M8 11h5M8 15h7" {...S} />
      <circle cx="16" cy="15" r="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}


export function IconCashFlow(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="6" width="20" height="12" rx="2" {...F} />
      <rect x="2" y="6" width="20" height="12" rx="2" {...S} fill="none" />
      <circle cx="12" cy="12" r="3" {...S} fill="none" />
      <path d="M12 10v1h1.5" {...S} />
      <path d="M6 9v6M18 9v6" {...S} />
    </svg>
  );
}


export function IconBalanceSheet(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 3v18" {...S} />
      <path d="M4 7h16" {...S} />
      <path d="M4 7l3 7h-2l-1 2" {...F} />
      <path d="M20 7l-3 7h2l1 2" {...F} />
      <path d="M4 7l3 7" {...S} />
      <path d="M20 7l-3 7" {...S} />
      <path d="M4 14h6M14 14h6" {...S} />
      <rect x="8" y="19" width="8" height="2" rx="1" {...F} />
      <rect x="8" y="19" width="8" height="2" rx="1" {...S} fill="none" />
    </svg>
  );
}


export function IconInvestment(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 20L9 14l4 4 8-11" {...S} />
      <path d="M17 7h4v4" {...S} />
      <circle cx="9" cy="14" r="2" {...F} />
      <circle cx="13" cy="18" r="1.5" {...F} />
    </svg>
  );
}


export function IconCalculator(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="4" y="2" width="16" height="20" rx="2" {...F} />
      <rect x="4" y="2" width="16" height="20" rx="2" {...S} fill="none" />
      <rect x="7" y="5" width="10" height="4" rx="1" {...S} fill="none" />
      <circle cx="8.5" cy="13" r="0.75" fill="currentColor" />
      <circle cx="12" cy="13" r="0.75" fill="currentColor" />
      <circle cx="15.5" cy="13" r="0.75" fill="currentColor" />
      <circle cx="8.5" cy="16.5" r="0.75" fill="currentColor" />
      <circle cx="12" cy="16.5" r="0.75" fill="currentColor" />
      <circle cx="15.5" cy="16.5" r="0.75" fill="currentColor" />
      <circle cx="8.5" cy="19.5" r="0.75" fill="currentColor" />
      <path d="M11 19.5h5" {...S} />
    </svg>
  );
}


export function IconCompare(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M8 3v18" {...S} />
      <path d="M16 3v18" {...S} />
      <path d="M8 8l4-3 4 3" {...S} />
      <path d="M8 16l4 3 4-3" {...S} />
      <rect x="3" y="8" width="10" height="8" rx="1.5" {...F} />
      <rect x="11" y="8" width="10" height="8" rx="1.5" {...F} />
    </svg>
  );
}


export function IconTimeline(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="5" cy="12" r="2" {...F} />
      <circle cx="5" cy="12" r="2" {...S} fill="none" />
      <circle cx="12" cy="12" r="2" {...F} />
      <circle cx="12" cy="12" r="2" {...S} fill="none" />
      <circle cx="19" cy="12" r="2" {...F} />
      <circle cx="19" cy="12" r="2" {...S} fill="none" />
      <path d="M7 12h3M14 12h3" {...S} />
      <path d="M5 8V6M12 8V5M19 8V6" {...S} />
    </svg>
  );
}


export function IconTrending(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M2 20l5-6 4 3 5-5 5-6" {...S} />
      <path d="M17 6h4v4" {...S} />
      <path d="M2 20l5-6 4 3 5-5 5-6v12H2z" {...F} />
    </svg>
  );
}


export function IconTrendingUp(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M2 17l5-5 4 4 5-6 5-5" {...S} />
      <path d="M17 5h4v4" {...S} />
      <path d="M2 17l5-5 4 4 5-6 5-5v12H2z" {...F} />
    </svg>
  );
}


export function IconTrendingDown(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M2 7l5 5 4-4 5 6 5 5" {...S} />
      <path d="M17 19h4v-4" {...S} />
      <path d="M2 7l5 5 4-4 5 6 5 5V7H2z" {...F} />
    </svg>
  );
}


export function IconDollarSign(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M16 8h-2a3 3 0 0 0 0 6h0a3 3 0 0 1 0 6H8" {...S} />
      <path d="M12 5v2M12 17v2" {...S} />
    </svg>
  );
}


export function IconWallet(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="5" width="20" height="16" rx="2" {...F} />
      <rect x="2" y="5" width="20" height="16" rx="2" {...S} fill="none" />
      <path d="M2 10h20" {...S} />
      <circle cx="17" cy="15" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}


export function IconLandmark(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 22h18" {...S} />
      <path d="M6 18v-7" {...S} />
      <path d="M10 18v-7" {...S} />
      <path d="M14 18v-7" {...S} />
      <path d="M18 18v-7" {...S} />
      <path d="M12 2l10 7H2l10-7z" {...F} />
      <path d="M12 2l10 7H2l10-7z" {...S} fill="none" />
      <rect x="2" y="18" width="20" height="2" rx="0.5" {...F} />
      <rect x="2" y="18" width="20" height="2" rx="0.5" {...S} fill="none" />
    </svg>
  );
}


export function IconScale(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 3v18" {...S} />
      <path d="M16 7l-4-4-4 4" {...S} />
      <path d="M5 10l3 7h-2l-1 2" {...F} />
      <path d="M19 10l-3 7h2l1 2" {...F} />
      <path d="M5 10l3 7" {...S} />
      <path d="M19 10l-3 7" {...S} />
      <path d="M5 17h6M13 17h6" {...S} />
      <rect x="8" y="19" width="8" height="2" rx="1" {...F} />
      <rect x="8" y="19" width="8" height="2" rx="1" {...S} fill="none" />
    </svg>
  );
}


export function IconPercent(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M19 5L5 19" {...S} />
      <circle cx="7" cy="7" r="3" {...F} />
      <circle cx="7" cy="7" r="3" {...S} fill="none" />
      <circle cx="17" cy="17" r="3" {...F} />
      <circle cx="17" cy="17" r="3" {...S} fill="none" />
    </svg>
  );
}


export function IconBarChart2(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="10" y="3" width="4" height="18" rx="1" {...F} />
      <line x1="18" y1="8" x2="18" y2="21" {...S} />
      <line x1="12" y1="3" x2="12" y2="21" {...S} />
      <line x1="6" y1="14" x2="6" y2="21" {...S} />
    </svg>
  );
}


export function IconBarChart3(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="14" width="4" height="7" rx="1" {...F} />
      <rect x="3" y="14" width="4" height="7" rx="1" {...S} fill="none" />
      <rect x="10" y="8" width="4" height="13" rx="1" {...F} />
      <rect x="10" y="8" width="4" height="13" rx="1" {...S} fill="none" />
      <rect x="17" y="3" width="4" height="18" rx="1" {...F} />
      <rect x="17" y="3" width="4" height="18" rx="1" {...S} fill="none" />
    </svg>
  );
}


export function IconBanknote(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="6" width="20" height="12" rx="2" {...F} />
      <rect x="2" y="6" width="20" height="12" rx="2" {...S} fill="none" />
      <circle cx="12" cy="12" r="2" {...S} fill="none" />
      <path d="M6 12h.01" {...S} />
      <path d="M18 12h.01" {...S} />
    </svg>
  );
}


export function IconCreditCard(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="1" y="4" width="22" height="16" rx="2" {...F} />
      <rect x="1" y="4" width="22" height="16" rx="2" {...S} fill="none" />
      <line x1="1" y1="10" x2="23" y2="10" {...S} />
    </svg>
  );
}


export function IconReceipt(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" {...F} />
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" {...S} fill="none" />
      <path d="M8 10h8" {...S} />
      <path d="M8 14h4" {...S} />
    </svg>
  );
}


export function IconPieChart(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" {...F} />
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" {...S} fill="none" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" {...F} />
      <path d="M22 12A10 10 0 0 0 12 2v10z" {...S} fill="none" />
    </svg>
  );
}


export function IconGauge(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" {...F} />
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" {...S} fill="none" />
      <path d="M12 12l4-6" {...S} />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}


export function IconLayers(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M12 2l10 6.5-10 6.5L2 8.5 12 2z" {...F} />
      <path d="M12 2l10 6.5-10 6.5L2 8.5 12 2z" {...S} fill="none" />
      <path d="M2 15l10 6.5L22 15" {...S} />
      <path d="M2 11.5l10 6.5 10-6.5" {...S} />
    </svg>
  );
}


export function IconPPE(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="10" width="20" height="11" rx="1.5" {...F} />
      <rect x="2" y="10" width="20" height="11" rx="1.5" {...S} fill="none" />
      <path d="M6 10V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" {...S} />
      <path d="M12 10v4" {...S} />
      <path d="M8 15h8" {...S} />
    </svg>
  );
}


export function IconActivity(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 12h4l3-8 4 16 3-8h4" {...S} />
      <circle cx="12" cy="12" r="8" {...F} />
    </svg>
  );
}
