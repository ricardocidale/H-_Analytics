import { type IconProps, defaults, S, F } from '../icon-utils';

export function VecDollarSign(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <circle cx="12" cy="12" r="10" {...F} />
      <circle cx="12" cy="12" r="10" {...S} fill="none" />
      <path d="M15.5 8.5c-.7-1-1.8-1.5-3.5-1.5-2.2 0-3.5 1-3.5 2.5S10 12 12 12.5s3.5 1 3.5 2.5-1.3 2.5-3.5 2.5c-1.7 0-2.8-.5-3.5-1.5" {...S} />
      <path d="M12 5v2M12 17v2" {...S} />
    </svg>
  );
}

export function VecCreditCard(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="5" width="20" height="14" rx="2" {...F} />
      <rect x="2" y="5" width="20" height="14" rx="2" {...S} fill="none" />
      <path d="M2 10h20" {...S} />
      <path d="M6 14h4" {...S} />
    </svg>
  );
}

export function VecWallet(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="2" y="6" width="20" height="14" rx="2" {...F} />
      <rect x="2" y="6" width="20" height="14" rx="2" {...S} fill="none" />
      <path d="M2 10h20" {...S} />
      <circle cx="17" cy="15" r="1" fill="currentColor" opacity="0.35" />
      <path d="M6 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" {...S} />
    </svg>
  );
}

export function VecBarChart(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <rect x="3" y="13" width="4" height="8" rx="1" {...F} />
      <rect x="3" y="13" width="4" height="8" rx="1" {...S} fill="none" />
      <rect x="10" y="8" width="4" height="13" rx="1" {...F} />
      <rect x="10" y="8" width="4" height="13" rx="1" {...S} fill="none" />
      <rect x="17" y="3" width="4" height="18" rx="1" {...F} />
      <rect x="17" y="3" width="4" height="18" rx="1" {...S} fill="none" />
    </svg>
  );
}

export function VecTrendingUp(p: IconProps) {
  const a = defaults(p);
  return (
    <svg {...a}>
      <path d="M3 17l5-5 4 4 9-10" {...S} />
      <path d="M17 6h4v4" {...S} />
    </svg>
  );
}

export function VecPieChart(p: IconProps) {
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
