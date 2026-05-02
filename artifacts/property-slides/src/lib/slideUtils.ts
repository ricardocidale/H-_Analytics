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

/**
 * Canonical L+B colors — post-consolidation (`_02_` template, 2026-05-02).
 *
 * MUST be kept in sync with:
 *  - `C` in `artifacts/api-server/src/slides/slide-jsx.tsx` (Track 2 satori renderer)
 *  - `SLIDE_COLORS` in `scripts/src/slide_helpers.py` (Track 1 python-pptx generator)
 */
export const COLORS = {
  /** Deep forest green — header/footer bands, primary text. */
  darkBg: "#1C2B1E",
  /** Forest green — headlines, body bullets, page number. */
  accent: "#257D41",
  /** Muted sage — eyebrows, captions, subtitle, tagline (also used as canvas for slides 5–6). */
  sage: "#9FBCA4",
  /** Warm ivory — slide canvas for slides 1–4. */
  cream: "#FFF9F5",
  /** Mint — Slide 4 subtitle header (introduced in `_02_`). */
  mint: "#C8E8D0",
  white: "#FFFFFF",
  /** Derived UI border (not part of canonical palette — preserved for in-app preview chrome). */
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
  5: COLORS.sage,
  6: COLORS.sage,
};

export const FONTS = {
  serif: "'EB Garamond', 'Georgia', serif",
  sans: "'Poppins', 'Inter', 'system-ui', sans-serif",
} as const;
