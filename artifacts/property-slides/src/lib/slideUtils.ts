export function fmtCurrency(n: number | null | undefined, short = false): string {
  if (n == null) return "—";
  const v = Math.round(n);
  if (short) {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}K`;
    return `$${v}`;
  }
  if (Math.abs(v) >= 1_000_000) {
    const m = v / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return "$" + v.toLocaleString("en-US");
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

export function getStatusLabel(s: string | null | undefined): string {
  const STATUS: Record<string, string> = {
    active: "Acquisition Target",
    pipeline: "Pipeline",
    closed: "Acquired",
    operating: "Operating",
    disposed: "Disposed",
  };
  const key = (s ?? "pipeline").toLowerCase();
  return STATUS[key] ?? "Pipeline";
}

export function getTypeLabel(hospitalityType?: string | null, businessModel?: string | null): string {
  const model = ((hospitalityType ?? "") + (businessModel ?? "")).toLowerCase();
  if (model.includes("retreat")) return "Retreat Center";
  if (model.includes("vrbo") || model.includes("vacation")) return "Luxury Vacation Rental";
  if (model.includes("boutique") || model.includes("hotel")) return "Boutique Hotel";
  if (model.includes("bnb") || model.includes("bed")) return "Bed & Breakfast";
  if (model.includes("motel")) return "Boutique Motel";
  if (model.includes("resort")) return "Boutique Resort";
  if (model.includes("glamping")) return "Glamping / Eco-Resort";
  return "Boutique Hospitality Asset";
}

export function getStableYearIndex(yearlyIS: Array<{ operationalMonthsInYear?: number }>): number {
  for (let i = 0; i < yearlyIS.length; i++) {
    if ((yearlyIS[i].operationalMonthsInYear ?? 0) >= 12) return i;
  }
  return Math.min(2, yearlyIS.length - 1);
}

export function getMarketInsight(city: string, state: string): string {
  const key = (city + " " + state).toLowerCase();
  if (key.includes("catskill") || key.includes("woodstock") || key.includes("hudson")) {
    return "4.2M+ annual visitors; surging demand for curated drive-market escapes";
  }
  if (key.includes("berkshire") || key.includes("lenox") || key.includes("stockbridge")) {
    return "Affluent NYC drive-market; year-round cultural demand (Tanglewood, museums)";
  }
  if (key.includes("asheville") || key.includes("blue ridge")) {
    return "Top-10 US travel destination; boutique hospitality undersupply vs. demand";
  }
  return `Growing boutique hospitality market in ${city || state}`;
}

export const COLORS = {
  /**
   * Canonical L+B sage canvas — used as the slide canvas for the financial
   * pages (slides 5–6). Slides 1–4 use cream (`COLORS.cream`) per the
   * canonical L+B template. See `SLIDE_BACKGROUNDS` below for the full
   * per-slide mapping.
   */
  slideBg: "#9FBCA4",
  /** Legacy dark-green panel — kept for header bands and badges only. */
  darkBg: "#1C2B1E",
  accent: "#257D41",
  sage: "#7AAA88",
  cream: "#FFF9F5",
  muted: "#9FBCA4",
  nearBlack: "#1C2B1E",
  /** Secondary text on sage canvas. */
  mutedDark: "#5A7A62",
  /** Body text on sage canvas. */
  bodyDark: "#2A4030",
  white: "#FFFFFF",
  lightBorder: "#E8EDE9",
} as const;

/**
 * Per-slide canonical canvas backgrounds (1–6) — mirrors the L+B master
 * backgrounds in the canonical property-slides PPTX template:
 * 1–3 cream property spotlight, 4 decorative (cream fallback), 5–6 sage
 * financial pages. Kept in sync with SLIDE_BACKGROUNDS in
 * artifacts/api-server/src/slides/slide-jsx.tsx.
 */
export const SLIDE_BACKGROUNDS: Record<number, string> = {
  1: COLORS.cream,
  2: COLORS.cream,
  3: COLORS.cream,
  4: COLORS.cream,
  5: COLORS.slideBg,
  6: COLORS.slideBg,
};

export const FONTS = {
  serif: "'EB Garamond', 'Georgia', serif",
  sans: "'Poppins', 'Inter', 'system-ui', sans-serif",
} as const;
