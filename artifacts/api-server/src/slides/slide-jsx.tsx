/**
 * Server-side JSX slide components for satori rendering (Track 2 image-PPTX).
 *
 * Each component accepts the full slide payload and renders a 1920×1080 slide
 * matching the canonical L+B design: sage #9FBCA4 canvas, #257D41 green accent,
 * #1C2B1E dark-green for primary text, EB Garamond headers, Poppins body.
 *
 * Important: satori supports a restricted CSS subset — no grid, no :hover,
 * no calc(), no gap shorthand on older satori versions. Use flexbox only.
 */

import React from "react";

// ── Canonical per-slide canvas backgrounds ────────────────────────────────
// Mirrors the L+B master backgrounds in attached_assets/L+B_Property_Slides_*.pptx:
// Slides 1–3 are cream property-spotlight pages, slide 4 is the decorative
// portfolio page (cream as a safe fallback for the satori path that can't
// composite the master art), and slides 5–6 are the sage financial pages.
//
// MUST be kept in sync with the parallel definition in
// artifacts/property-slides/src/lib/slideUtils.ts (the in-app preview
// surface). The api-server cannot import from the property-slides artifact
// (cross-artifact imports are forbidden by the workspace contract) and the
// property-slides artifact has no @workspace lib path, so the two
// definitions are deliberately mirrored.
const CREAM_CANVAS = "#FFF9F5";
const SAGE_CANVAS  = "#9FBCA4";
// Default exit cap rate used when neither financials nor property provides one.
// Shared with hybrid-renderer.ts to avoid cross-file literal duplication.
export const SLIDE_EXIT_CAP_RATE_FALLBACK = 0.07;

export const SLIDE_BACKGROUNDS: Record<number, string> = {
  1: CREAM_CANVAS,
  2: CREAM_CANVAS,
  3: CREAM_CANVAS,
  4: CREAM_CANVAS,
  5: SAGE_CANVAS,
  6: SAGE_CANVAS,
};

// ── Canonical L+B colors — post-consolidation (`_02_` template) ──
// Mirror of SLIDE_COLORS in scripts/src/slide_helpers.py — keep both in sync.
// The `_02_` PPTX consolidated near-duplicate sage/dark-green hex values:
//   #5A7A62 + #7AAA88 + theme accent2 #9FBBA5  →  #9FBCA4  (single sage)
//   #1F3A2A + #2E4A35                         →  #1C2B1E  (single dark green)
//   #7C837A (Slide 2 tag-line second run)     →  #9FBCA4
// The Track-1 python-pptx generator and Track-2 satori renderer must agree.
const C = {
  // Core L+B palette (six swatches).
  darkBg:     "#1C2B1E", // deep forest green — header/footer bands, dark cards, primary text
  accent:     "#257D41", // forest green — headlines, body bullets, page number
  sage:       "#9FBCA4", // muted sage — eyebrows, captions, subtitle, tagline
  cream:      "#FFF9F5", // warm ivory — slide canvas, cream-on-dark text
  mint:       "#C8E8D0", // mint — Slide 4 subtitle header (introduced in `_02_`)
  white:      "#FFFFFF",

  // Computed rgba helpers (translucent overlays — NOT palette swatches).
  dimWhite:     "rgba(255,249,245,0.85)", // 85% cream — overlay text
  faintWhite:   "rgba(255,249,245,0.55)", // 55% cream — caption/byline overlay
  canvasRule:   "rgba(28,43,30,0.15)",    // 15% darkBg — dividers/borders
  canvasZebra:  "rgba(28,43,30,0.04)",    //  4% darkBg — alternating row bg
  canvasHeader: "rgba(37,125,65,0.2)",    // 20% accent — table-header band
} as const;

// ── Slide dimensions ──────────────────────────────────────────────────────
const W = 1920;
const H = 1080;

// ── Shared types ──────────────────────────────────────────────────────────

export interface SlidePhoto {
  url?: string;
  base64?: string;
  isHero: boolean;
  sortOrder: number;
}

export interface YearlyIS {
  year: number;
  revenueTotal: number;
  totalExpenses: number;
  noi: number;
  gop: number;
  operationalMonthsInYear: number;
  soldRooms: number;
  availableRooms: number;
  cleanAdr: number;
}

export interface YearlyCF {
  year: number;
  debtService: number;
  netCashFlowToInvestors: number;
  cumulativeCashFlow: number;
  exitValue: number;
}

export interface SlideFinancials {
  yearlyIS: YearlyIS[];
  yearlyCF: YearlyCF[];
  loanAmount: number;
  loanLtv: number;
  annualDebtService: number;
  renovationBudget: number;
  irr?: number;
  equityMultiple?: number;
  exitCapRate?: number;
}

export interface SlideProperty {
  id: number;
  name: string;
  city: string;
  stateProvince: string;
  county: string;
  country: string;
  purchasePrice: number;
  roomCount: number;
  startAdr: number;
  maxOccupancy: number;
  businessModel: string;
  hospitalityType: string;
  qualityTier: string;
  description: string;
  acquisitionStatus: string;
  isHistoric?: boolean | string;
  renovationScope?: string;
  exitCapRate?: number;
}

export interface SiblingProperty {
  id: number;
  name: string;
  city?: string;
  stateProvince?: string;
  purchasePrice?: number;
  hospitalityType?: string;
  acquisitionStatus?: string;
  heroPhotoBase64?: string;
}

export interface PropertyImprovement {
  feature: string;
  existing: string;
  proposed: string;
}

export interface VisionText {
  cinematicCaption: string;
  visionHeadline: string;
  visionBullet1: string;
  visionBullet2: string;
  badgeText: string;
  descriptionParagraph: string;
  investmentModelConcept: string;
  marketRationale: string;
  reason1Label: string; reason1Detail: string;
  reason2Label: string; reason2Detail: string;
  reason3Label: string; reason3Detail: string;
  closingLine: string;
  transformationDescription: string;
  operationalModelText: string;
  revenueBullet: string;
  programmingBullet: string;
  operationalParagraph: string;
}

export interface SlidePayload {
  property: SlideProperty;
  photos: SlidePhoto[];
  financials: SlideFinancials;
  siblings: SiblingProperty[];
  visionText: VisionText;
  improvements: PropertyImprovement[];
  slide4HeroBase64?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtCurrency(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  const v = Math.round(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

function detectMime(b64: string): string {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  if (b64.startsWith("R0lG"))  return "image/gif";
  return "image/jpeg";
}

function photoSrc(photo: SlidePhoto | undefined): string | null {
  if (!photo) return null;
  if (photo.base64 && photo.base64.length > 0) {
    if (photo.base64.startsWith("data:")) return photo.base64;
    return `data:${detectMime(photo.base64)};base64,${photo.base64}`;
  }
  return null;
}

function getStableYear(yearlyIS: YearlyIS[]): YearlyIS | undefined {
  return (
    yearlyIS.find(y => y.operationalMonthsInYear >= 12 && y.revenueTotal > 0) ??
    yearlyIS[2] ??
    yearlyIS[0]
  );
}

function typeLabel(p: SlideProperty): string {
  const m = ((p.hospitalityType ?? "") + (p.businessModel ?? "")).toLowerCase();
  if (m.includes("retreat")) return "Retreat Center";
  if (m.includes("vrbo") || m.includes("vacation")) return "Luxury Vacation Rental";
  if (m.includes("boutique") || m.includes("hotel")) return "Boutique Hotel";
  if (m.includes("bnb")) return "Bed & Breakfast";
  if (m.includes("motel")) return "Boutique Motel";
  if (m.includes("resort")) return "Boutique Resort";
  return "Hospitality Property";
}

function statusLabel(s: string): string {
  const MAP: Record<string, string> = {
    active: "Acquisition Target",
    pipeline: "Pipeline",
    closed: "Acquired",
    operating: "Operating",
    disposed: "Disposed",
  };
  return MAP[s.toLowerCase()] ?? "Pipeline";
}

// ── Shared sub-components ─────────────────────────────────────────────────

function PhotoBg({ photo, style }: { photo: SlidePhoto | undefined; style?: React.CSSProperties }) {
  const src = photoSrc(photo);
  return (
    <div style={{ display: "flex", position: "absolute", inset: 0, overflow: "hidden", ...style }}>
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: C.darkBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "Garamond, serif", fontSize: 48, color: C.sage, letterSpacing: "0.3em" }}>L+B</span>
        </div>
      )}
    </div>
  );
}

function LbBadge({ x = 48, y = 40 }: { x?: number; y?: number }) {
  return (
    <div style={{ position: "absolute", top: y, left: x, display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, fontWeight: 400, letterSpacing: "0.35em", color: C.accent, textTransform: "uppercase" }}>
        L+B ANALYTICS
      </span>
    </div>
  );
}

function PageNumber({ n }: { n: number }) {
  return (
    <div style={{ position: "absolute", bottom: 28, right: 48, display: "flex", alignItems: "center" }}>
      <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, color: C.sage, letterSpacing: "0.12em" }}>
        PAGE {n}
      </span>
    </div>
  );
}

function GreenRule({ y = 640 }: { y?: number }) {
  return (
    <div style={{ position: "absolute", top: y, left: 0, right: 0, height: 2, background: C.accent, opacity: 0.45 }} />
  );
}

// ── Slide 1 — Property Spotlight ─────────────────────────────────────────

export function Slide1({ p }: { p: SlidePayload }) {
  const { property, photos, visionText } = p;
  const hero = photos.find(ph => ph.isHero) ?? photos[0];
  const secondary = photos.find(ph => !ph.isHero) ?? photos[1];
  const type = typeLabel(property);
  const status = statusLabel(property.acquisitionStatus);
  const revpar = (property.startAdr ?? 0) * (property.maxOccupancy ?? 0.7);

  return (
    <div style={{ width: W, height: H, background: C.darkBg, display: "flex", position: "relative", overflow: "hidden" }}>
      {/* LEFT — hero photo (55%) */}
      <div style={{ display: "flex", position: "relative", width: "55%", height: "100%" }}>
        <PhotoBg photo={hero} />
        {/* Gradient overlay */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(to top, rgba(28,43,30,0.96) 0%, transparent 100%)" }} />
        {/* Caption */}
        <div style={{ position: "absolute", bottom: 60, left: 48, right: 32, display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, letterSpacing: "0.22em", color: C.sage, textTransform: "uppercase", marginBottom: 8 }}>
            {visionText.cinematicCaption || `${property.roomCount} KEYS · ${type.toUpperCase()}`}
          </span>
        </div>
        <LbBadge />
      </div>

      {/* RIGHT — data panel (45%) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "44px 56px 44px 48px" }}>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>
          INVESTMENT SPOTLIGHT
        </span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, color: C.sage, letterSpacing: "0.1em", marginBottom: 4 }}>
          {status}: {property.city}, {property.stateProvince}
        </span>
        <span style={{ fontFamily: "Garamond, serif", fontSize: 34, fontWeight: 700, color: C.cream, lineHeight: 1.15, marginBottom: 6 }}>
          {property.name.toUpperCase()} · {type.toUpperCase()}
        </span>

        <div style={{ width: 48, height: 2, background: C.accent, marginBottom: 16 }} />

        {/* Vision headline + bullets */}
        <span style={{ fontFamily: "Garamond, serif", fontSize: 18, color: C.cream, fontStyle: "italic", marginBottom: 10 }}>
          {visionText.visionHeadline}
        </span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 13, color: C.dimWhite, marginBottom: 6 }}>• {visionText.visionBullet1}</span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 13, color: C.dimWhite, marginBottom: 14 }}>• {visionText.visionBullet2}</span>

        {/* Description */}
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.faintWhite, lineHeight: 1.6, marginBottom: 20 }}>
          {visionText.descriptionParagraph}
        </span>

        {/* Specs grid */}
        <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", marginBottom: 20 }}>
          {[
            ["ASKING PRICE", fmtCurrency(property.purchasePrice)],
            ["KEYS", String(property.roomCount || "—")],
            ["ADR", fmtCurrency(property.startAdr)],
            ["OCC", fmtPct(property.maxOccupancy)],
            ["RevPAR", fmtCurrency(revpar)],
            ["TYPE", type],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", marginRight: 28, marginBottom: 12 }}>
              <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 9, letterSpacing: "0.18em", color: C.sage, textTransform: "uppercase", marginBottom: 3 }}>{label}</span>
              <span style={{ fontFamily: "Garamond, serif", fontSize: 17, color: C.cream }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Badge */}
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", background: C.accent, padding: "5px 16px", borderRadius: 2 }}>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 10, letterSpacing: "0.2em", color: C.white, textTransform: "uppercase" }}>
              {visionText.badgeText || type.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Secondary photo thumbnail */}
        {photoSrc(secondary) && (
          <div style={{ display: "flex", position: "absolute", bottom: 44, right: 56, width: 200, height: 120, borderRadius: 3, overflow: "hidden", border: `1px solid rgba(37,125,65,0.3)` }}>
            <PhotoBg photo={secondary} />
          </div>
        )}
      </div>

      <GreenRule y={H - 60} />
      <PageNumber n={1} />
    </div>
  );
}

// ── Slide 2 — Alt View / Photo Gallery ───────────────────────────────────

export function Slide2({ p }: { p: SlidePayload }) {
  const { property, photos, visionText, financials } = p;
  const stable = getStableYear(financials.yearlyIS);
  // Deterministic renovation budget computed server-side (mirrors Track 1 Python).
  const renovBudget = financials.renovationBudget;
  const panelPhotos = photos.filter(ph => !ph.isHero).slice(0, 4);
  const type = typeLabel(property);

  return (
    <div style={{ width: W, height: H, background: C.darkBg, display: "flex", position: "relative", overflow: "hidden" }}>
      {/* LEFT — data panel */}
      <div style={{ width: 520, display: "flex", flexDirection: "column", padding: "44px 40px 44px 48px", flexShrink: 0 }}>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>
          INVESTMENT SPOTLIGHT
        </span>
        <span style={{ fontFamily: "Garamond, serif", fontSize: 26, fontWeight: 700, color: C.cream, lineHeight: 1.2, marginBottom: 8 }}>
          {property.name.toUpperCase()}
        </span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.sage, marginBottom: 16 }}>
          {property.city}, {property.stateProvince}
        </span>

        <div style={{ width: 40, height: 2, background: C.accent, marginBottom: 16 }} />

        {/* Specs */}
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.12em", color: C.sage, marginBottom: 8 }}>Property Specs</span>
        {[
          ["Purchase Price", fmtCurrency(property.purchasePrice)],
          ["Renovation Budget", fmtCurrency(renovBudget)],
          ["Total Investment", fmtCurrency((property.purchasePrice ?? 0) + renovBudget)],
          ["Stabilized Revenue", fmtCurrency(stable?.revenueTotal)],
          ["Projected NOI", fmtCurrency(stable?.noi)],
          ["Est. IRR", fmtPct(financials.irr)],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.sage }}>{label}</span>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.cream }}>{val}</span>
          </div>
        ))}

        <div style={{ width: "100%", height: 1, background: "rgba(37,125,65,0.3)", marginTop: 12, marginBottom: 16 }} />

        {/* Operational vision */}
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.12em", color: C.sage, marginBottom: 8 }}>The Vision</span>
        <span style={{ fontFamily: "Garamond, serif", fontSize: 14, color: C.cream, fontStyle: "italic", marginBottom: 8 }}>
          Operational Model: {visionText.operationalModelText}
        </span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.dimWhite, marginBottom: 4 }}>• {visionText.revenueBullet}</span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.dimWhite }}>• {visionText.programmingBullet}</span>
      </div>

      {/* RIGHT — 2×2 photo grid */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "row", marginBottom: 8 }}>
          {[panelPhotos[0], panelPhotos[1]].map((ph, i) => (
            <div key={i} style={{ display: "flex", flex: 1, position: "relative", borderRadius: 3, overflow: "hidden", marginLeft: i > 0 ? 8 : 0 }}>
              <PhotoBg photo={ph} />
            </div>
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "row" }}>
          {[panelPhotos[2], panelPhotos[3]].map((ph, i) => (
            <div key={i} style={{ display: "flex", flex: 1, position: "relative", borderRadius: 3, overflow: "hidden", marginLeft: i > 0 ? 8 : 0 }}>
              <PhotoBg photo={ph} />
            </div>
          ))}
        </div>
      </div>

      <LbBadge x={48} y={H - 50} />
      <GreenRule y={H - 60} />
      <PageNumber n={2} />
    </div>
  );
}

// ── Slide 3 — Investment Model ────────────────────────────────────────────

export function Slide3({ p }: { p: SlidePayload }) {
  const { property, photos, visionText } = p;
  const hero = photos.find(ph => ph.isHero) ?? photos[0];
  const secondary = photos[1] ?? photos[0];
  const tertiary = photos[2] ?? photos[0];
  const type = typeLabel(property);

  return (
    <div style={{ width: W, height: H, background: C.darkBg, display: "flex", position: "relative", overflow: "hidden" }}>
      {/* LEFT — large photo panel */}
      <div style={{ display: "flex", width: 480, position: "relative", flexShrink: 0 }}>
        <PhotoBg photo={hero} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 60%, rgba(28,43,30,0.95) 100%)" }} />
      </div>

      {/* CENTER — medium photo */}
      <div style={{ display: "flex", width: 340, position: "relative", flexShrink: 0 }}>
        <PhotoBg photo={secondary} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(28,43,30,0.4)" }} />
      </div>

      {/* RIGHT — data content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "44px 48px 44px 40px" }}>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>
          INVESTMENT MODEL
        </span>
        <span style={{ fontFamily: "Garamond, serif", fontSize: 26, fontWeight: 700, color: C.cream, lineHeight: 1.2, marginBottom: 4 }}>
          {property.city.toUpperCase()}, {property.stateProvince.toUpperCase()} · {type.toUpperCase()}
        </span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.sage, marginBottom: 16 }}>
          The L+B model applied to {type.toLowerCase()} assets in {property.city}, {property.stateProvince}
        </span>

        <div style={{ width: 40, height: 2, background: C.accent, marginBottom: 16 }} />

        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, color: C.sage, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>The Concept</span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 13, color: C.dimWhite, lineHeight: 1.6, marginBottom: 16 }}>
          {visionText.investmentModelConcept}
        </span>

        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, color: C.sage, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Why This Property?</span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 13, color: C.dimWhite, lineHeight: 1.6, marginBottom: 16 }}>
          {visionText.marketRationale}
        </span>

        {/* 3 Reasons */}
        {[
          [visionText.reason1Label, visionText.reason1Detail],
          [visionText.reason2Label, visionText.reason2Detail],
          [visionText.reason3Label, visionText.reason3Detail],
        ].map(([label, detail], i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.cream, fontWeight: 600, marginBottom: 2 }}>{label}</span>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, color: C.sage, lineHeight: 1.5 }}>{detail}</span>
          </div>
        ))}

        <div style={{ display: "flex", marginTop: 16, padding: "10px 16px", borderLeft: `3px solid ${C.accent}` }}>
          <span style={{ fontFamily: "Garamond, serif", fontSize: 15, color: C.cream, fontStyle: "italic" }}>{visionText.closingLine}</span>
        </div>
      </div>

      <LbBadge x={48} y={40} />
      <GreenRule y={H - 60} />
      <PageNumber n={3} />
    </div>
  );
}

// ── Slide 4 — Portfolio Overview ─────────────────────────────────────────
// Uniform 3-column × 2-row grid showing up to 6 H+ portfolio properties,
// sorted by acquisition date (same order as the Properties page in the app).

function statusBadgeLabel(s?: string): string {
  const MAP: Record<string, string> = {
    active: "Acquisition Target", pipeline: "Pipeline",
    closed: "Acquired", operating: "Operating", disposed: "Disposed",
  };
  return MAP[(s ?? "pipeline").toLowerCase()] ?? "Pipeline";
}

function PortfolioCard({ prop, isCurrent }: { prop: SiblingProperty | null; isCurrent?: boolean }) {
  if (!prop) {
    return (
      <div style={{ display: "flex", flex: 1, position: "relative", borderRadius: 4, overflow: "hidden", border: `1px solid ${C.canvasRule}`, background: "rgba(28,43,30,0.08)", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, color: C.sage, letterSpacing: "0.15em" }}>COMING SOON</span>
      </div>
    );
  }
  const photo: SlidePhoto | undefined = prop.heroPhotoBase64
    ? { base64: prop.heroPhotoBase64, isHero: true, sortOrder: 0 }
    : undefined;

  return (
    <div style={{ display: "flex", flex: 1, position: "relative", borderRadius: 4, overflow: "hidden", border: isCurrent ? `1px solid ${C.accent}` : `1px solid ${C.canvasRule}` }}>
      <PhotoBg photo={photo} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(15,22,16,0.96) 30%, rgba(15,22,16,0.2) 100%)" }} />
      {isCurrent && (
        <div style={{ position: "absolute", top: 10, right: 10, background: C.accent, padding: "2px 8px", display: "flex", borderRadius: 2 }}>
          <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 8, color: C.white, letterSpacing: "0.15em" }}>THIS PROPERTY</span>
        </div>
      )}
      <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 8, color: C.sage, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>
          {statusBadgeLabel(prop.acquisitionStatus)}
        </span>
        <span style={{ fontFamily: "Garamond, serif", fontSize: 15, color: C.cream, lineHeight: 1.2, marginBottom: 3 }}>{prop.name}</span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 10, color: C.sage, marginBottom: 3 }}>
          {[prop.city, prop.stateProvince].filter(Boolean).join(", ")}
        </span>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.sage, fontWeight: 600 }}>
          {fmtCurrency(prop.purchasePrice)}
        </span>
      </div>
    </div>
  );
}

export function Slide4({ p }: { p: SlidePayload }) {
  const { property, siblings, slide4HeroBase64 } = p;

  const currentAsCard: SiblingProperty = {
    id: property.id,
    name: property.name,
    city: property.city,
    stateProvince: property.stateProvince,
    purchasePrice: property.purchasePrice,
    hospitalityType: property.hospitalityType || property.businessModel,
    acquisitionStatus: property.acquisitionStatus,
    heroPhotoBase64: slide4HeroBase64,
  };

  // Portfolio: current property + siblings, capped at 6
  const allCards: (SiblingProperty | null)[] = [currentAsCard, ...siblings.slice(0, 5)];
  while (allCards.length < 6) allCards.push(null);
  const row1 = allCards.slice(0, 3);
  const row2 = allCards.slice(3, 6);
  const CARD_GAP = 16;

  return (
    <div style={{ width: W, height: H, background: SLIDE_BACKGROUNDS[4], display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "30px 56px 18px 56px", display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>
            PROPERTY PIPELINE
          </span>
          <span style={{ fontFamily: "Garamond, serif", fontSize: 26, color: C.darkBg }}>
            H+ Portfolio Overview
          </span>
        </div>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.sage }}>
          {allCards.filter(Boolean).length} properties · {property.name} highlighted
        </span>
      </div>

      {/* 3×2 card grid — explicit margins instead of gap (satori compatibility) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `0 40px 48px 40px` }}>
        <div style={{ display: "flex", flexDirection: "row", flex: 1, marginBottom: CARD_GAP }}>
          {row1.map((card, i) => (
            <div key={i} style={{ display: "flex", flex: 1, marginRight: i < 2 ? CARD_GAP : 0 }}>
              <PortfolioCard prop={card} isCurrent={i === 0} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "row", flex: 1 }}>
          {row2.map((card, i) => (
            <div key={i + 3} style={{ display: "flex", flex: 1, marginRight: i < 2 ? CARD_GAP : 0 }}>
              <PortfolioCard prop={card} />
            </div>
          ))}
        </div>
      </div>

      <GreenRule y={H - 60} />
      <PageNumber n={4} />
    </div>
  );
}

// ── Slide 5 — Financial Snapshot ─────────────────────────────────────────

export function Slide5({ p }: { p: SlidePayload }) {
  const { property, financials, visionText, improvements } = p;
  const stable = getStableYear(financials.yearlyIS);
  // Deterministic renovation budget computed server-side (mirrors Track 1 Python).
  const renovBudget = financials.renovationBudget;
  const totalInvestment = (property.purchasePrice ?? 0) + renovBudget;
  const grossMargin = stable && stable.revenueTotal > 0 ? (stable.gop / stable.revenueTotal) : null;
  const ebitdaPct = stable && stable.revenueTotal > 0 ? (stable.noi / stable.revenueTotal) : null;
  const ltv = financials.loanLtv > 0 ? `${Math.round(financials.loanLtv * 100)}%` : "65%";
  const stableLabel = stable ? `Year ${stable.year}` : "Yr 3";

  // Stable-year metrics from engine (matches Track 1 build_slide5: clamp_occupancy + cleanAdr).
  const stableOcc = stable && stable.availableRooms > 0
    ? Math.min(0.85, Math.max(0.55, stable.soldRooms / stable.availableRooms))
    : (property.maxOccupancy ?? 0.7);
  const stableAdr = stable?.cleanAdr ?? property.startAdr ?? 0;
  const stableRevpar = stableAdr * stableOcc;

  const transformRows: string[][] = [
    ["Feature", "Existing", "Proposed"],
    ...(improvements.length > 0
      ? improvements.slice(0, 4).map(imp => [imp.feature, imp.existing, imp.proposed])
      : [
          ["Guest Capacity", `${Math.max(1, property.roomCount - 2)} Guests`, `${property.roomCount} Keys`],
          ["Event Space", "Limited", "Curated venue spaces"],
          ["Lodging", "Standard rooms", `${property.roomCount} boutique-designed keys`],
          ["Amenities", "Basic", "Curated experiential amenities"],
        ]
    ),
  ];

  const snapshotRows = [
    ["Occupancy", fmtPct(stableOcc)],
    ["ADR", fmtCurrency(stableAdr)],
    ["RevPAR", fmtCurrency(stableRevpar)],
    ["Revenue", fmtCurrency(stable?.revenueTotal)],
    ["Variable Costs", fmtCurrency(stable?.totalExpenses)],
    ["GOP Margin", fmtPct(grossMargin)],
    ["EBITDA %", fmtPct(ebitdaPct)],
  ];

  return (
    <div style={{ width: W, height: H, background: SLIDE_BACKGROUNDS[5], display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "32px 56px 20px 56px", display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>
            FINANCIAL SNAPSHOT
          </span>
          <span style={{ fontFamily: "Garamond, serif", fontSize: 26, color: C.darkBg }}>
            The Transformation Plan — {property.name}
          </span>
        </div>
      </div>

      {/* Content: transformation table left, metrics right */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", padding: "0 40px 48px 40px" }}>
        {/* LEFT — transformation + vision */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", marginRight: 32 }}>
          <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.darkBg, lineHeight: 1.6, marginBottom: 20 }}>
            {visionText.transformationDescription}
          </span>

          {/* Transformation table */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {transformRows.map((row, ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "row", padding: "7px 0", borderBottom: ri < transformRows.length - 1 ? `1px solid ${C.canvasRule}` : "none", background: ri === 0 ? C.canvasHeader : ri % 2 === 0 ? C.canvasZebra : "transparent" }}>
                {row.map((cell, ci) => (
                  <span key={ci} style={{ flex: ci === 0 ? 0.8 : 1, fontFamily: "Poppins, sans-serif", fontSize: ri === 0 ? 10 : 12, color: ri === 0 ? C.darkBg : ci === 0 ? C.darkBg : C.darkBg, fontWeight: ri === 0 || ci === 0 ? 600 : 400, paddingLeft: 8 }}>
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — stable year snapshot + financing */}
        <div style={{ width: 380, display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.12em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>
            Snapshot of Stable Year ({stableLabel})
          </span>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
            {snapshotRows.map(([label, val], ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.canvasRule}` }}>
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.sage }}>{label}</span>
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.darkBg }}>{val}</span>
              </div>
            ))}
          </div>

          <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.12em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>
            Financing Summary
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              ["Purchase Price", fmtCurrency(property.purchasePrice)],
              ["Renovation Budget", fmtCurrency(renovBudget)],
              ["Total Investment", fmtCurrency(totalInvestment)],
              [`Loan Amount (${ltv})`, fmtCurrency(financials.loanAmount)],
              ["Annual Debt Service", fmtCurrency(financials.annualDebtService)],
            ].map(([label, val], ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.canvasRule}` }}>
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.sage }}>{label}</span>
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: ri === 2 ? C.darkBg : C.darkBg, fontWeight: ri === 2 ? 600 : 400 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Key metrics badge */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 20, padding: "12px 16px", background: "rgba(37,125,65,0.15)", borderLeft: `3px solid ${C.accent}` }}>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, color: C.accent, marginBottom: 6, display: "block" }}>Key Investor Metrics*</span>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.darkBg, display: "block", marginBottom: 3 }}>GOP Margin: {fmtPct(grossMargin)}</span>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.darkBg, display: "block", marginBottom: 6 }}>EBITDA ({stableLabel}): {fmtPct(ebitdaPct)}</span>
            <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 10, color: C.sage }}>* Projections for first full stabilized year</span>
          </div>
        </div>
      </div>

      <GreenRule y={H - 60} />
      <PageNumber n={5} />
    </div>
  );
}

// ── Slide 6 — Income Statement ────────────────────────────────────────────

export function Slide6({ p }: { p: SlidePayload }) {
  const { property, financials } = p;
  const years = financials.yearlyIS.slice(0, 5);
  const stable = getStableYear(financials.yearlyIS);
  const stableNoi = stable?.noi ?? 0;
  const exitVal = financials.yearlyCF[financials.yearlyCF.length - 1]?.exitValue ?? 0;
  const totalReturn = financials.yearlyCF.reduce((a, y) => a + (y.netCashFlowToInvestors ?? 0), 0) + exitVal;
  const exitCap = financials.exitCapRate ?? property.exitCapRate ?? SLIDE_EXIT_CAP_RATE_FALLBACK;
  const initialEquity = financials.loanAmount > 0
    ? (property.purchasePrice ?? 0) - financials.loanAmount
    : property.purchasePrice ?? 0;

  const isRows = [
    ["Revenue", years.map(y => fmtCurrency(y.revenueTotal))],
    ["Operating Expenses", years.map(y => fmtCurrency(y.totalExpenses))],
    ["NOI", years.map(y => fmtCurrency(y.noi))],
    ["Debt Service", financials.yearlyCF.slice(0, 5).map(y => fmtCurrency(y.debtService))],
    ["Net Cash Flow", financials.yearlyCF.slice(0, 5).map(y => fmtCurrency(y.netCashFlowToInvestors))],
    ["Cumulative CF", financials.yearlyCF.slice(0, 5).map(y => fmtCurrency(y.cumulativeCashFlow))],
  ];

  const investorRows = [
    ["IRR (5yr)", fmtPct(financials.irr)],
    ["Equity Multiple", financials.equityMultiple != null ? `${financials.equityMultiple.toFixed(2)}×` : "—"],
    ["Stabilized NOI", fmtCurrency(stableNoi)],
    ["Exit Cap Rate", fmtPct(exitCap)],
    ["Exit Value (Yr 5)", fmtCurrency(exitVal)],
    ["Total Return", fmtCurrency(totalReturn)],
    ["Initial Equity", fmtCurrency(initialEquity)],
  ];

  return (
    <div style={{ width: W, height: H, background: SLIDE_BACKGROUNDS[6], display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "32px 56px 16px 56px", display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>
          5-YEAR CONSOLIDATED PRO FORMA INCOME STATEMENT
        </span>
        <span style={{ fontFamily: "Garamond, serif", fontSize: 22, color: C.darkBg }}>
          {property.name}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", padding: "0 40px 48px 40px" }}>
        {/* LEFT — IS table */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: 32 }}>
          {/* Year headers — dark band keeps an intentional brand accent */}
          <div style={{ display: "flex", flexDirection: "row", padding: "8px 0", background: C.darkBg, borderBottom: `1px solid ${C.accent}`, marginBottom: 4 }}>
            <span style={{ flex: 1.4, fontFamily: "Poppins, sans-serif", fontSize: 10, color: C.sage, paddingLeft: 8 }}>Item</span>
            {years.map((y, i) => (
              <span key={i} style={{ flex: 1, fontFamily: "Poppins, sans-serif", fontSize: 10, color: C.cream, textAlign: "right", paddingRight: 8 }}>Yr {i + 1}</span>
            ))}
          </div>
          {isRows.map(([label, vals], ri) => (
            <div key={ri} style={{ display: "flex", flexDirection: "row", padding: "6px 0", background: ri % 2 === 0 ? C.canvasZebra : "transparent", borderBottom: `1px solid ${C.canvasRule}` }}>
              <span style={{ flex: 1.4, fontFamily: "Poppins, sans-serif", fontSize: 11, color: ri < 2 ? C.darkBg : C.darkBg, paddingLeft: 8, fontWeight: ri === 2 ? 600 : 400 }}>{label}</span>
              {(vals as string[]).map((v, vi) => (
                <span key={vi} style={{ flex: 1, fontFamily: "Poppins, sans-serif", fontSize: 11, color: ri === 2 ? C.accent : C.darkBg, textAlign: "right", paddingRight: 8, fontWeight: ri === 2 ? 600 : 400 }}>{v}</span>
              ))}
            </div>
          ))}
        </div>

        {/* RIGHT — investor metrics */}
        <div style={{ width: 320, display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 11, letterSpacing: "0.12em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>
            Key Investor Metrics
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {investorRows.map(([label, val], ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "8px 12px", background: ri % 2 === 0 ? C.canvasZebra : "transparent", borderBottom: `1px solid ${C.canvasRule}` }}>
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: C.sage }}>{label}</span>
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: 13, color: ri < 2 ? C.darkBg : C.darkBg, fontWeight: ri < 2 ? 600 : 400 }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: 24, padding: "12px 16px", background: "rgba(37,125,65,0.15)", borderLeft: `3px solid ${C.accent}` }}>
            <span style={{ fontFamily: "Garamond, serif", fontSize: 14, color: C.darkBg, fontStyle: "italic", lineHeight: 1.6 }}>
              5-year pro forma based on H+ Analytics projection engine.
              Projections are estimates; actual results may vary.
            </span>
          </div>
        </div>
      </div>

      <GreenRule y={H - 60} />
      <PageNumber n={6} />
    </div>
  );
}
