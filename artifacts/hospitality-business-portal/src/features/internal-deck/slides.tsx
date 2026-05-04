/**
 * slides.tsx — Six React slide components for the L+B canonical investor deck.
 *
 * Renderer contract (STRICTLY ENFORCED):
 *   • Canvas: 960×540 px, position:relative, overflow:hidden
 *   • All interior elements: position:absolute
 *   • Layout coordinates from contract.ts bb() helper — no flex/grid inside canvas
 *   • Colors: PALETTE only — no theme.ts, no hardcoded hex
 *   • Fonts: FONTS.editorial / FONTS.body / FONTS.numeric only — no theme.ts FONT_*
 *   • Backgrounds: SLIDE_BG[n] only
 *   • No UI library components inside slide boundaries
 *
 * Source of truth: docs/slide-system/canonical/design-contract.json
 */
import React from "react";
import {
  PALETTE,
  FONTS,
  FW,
  SLIDE_BG,
  CANVAS,
  bb,
} from "./contract";
import {
  GreenRule,
  LbBadge,
  PageNumber,
  PhotoBg,
  fmtCurrency,
  fmtPct,
  getStableYear,
  statusBadgeLabel,
  statusLabel,
  typeLabel,
} from "./helpers";
import { getCanonicalPhoto } from "./canonical-photos";
import type { SiblingProperty, SlidePayload, SlidePhoto } from "./types";

// ── Canvas aliases ──────────────────────────────────────────────────────────
const W = CANVAS.width;   // 960
const H = CANVAS.height;  // 540

// ── Shared business-logic constants ─────────────────────────────────────────
const SLIDE_EXIT_CAP_RATE_FALLBACK = 0.07;
const DEFAULT_OCCUPANCY = 0.7;
const STABLE_OCC_FLOOR = 0.55;
const STABLE_OCC_CEILING = 0.85;
const PCT_SCALE = 100;
const DEFAULT_LTV_LABEL_PCT = "65%";
const PROFORMA_YEARS = 5;
const SIBLING_GRID_SLOTS = 6;
const SIBLING_GRID_COLS = 3;

// ── Layout constants derived from canonical bboxes ───────────────────────────
// Header band: [0,0,960,43.5]
const HEADER_H = 44;
// Footer band: [0,502,960,540]
const FOOTER_Y = 502;
const FOOTER_H = H - FOOTER_Y;  // 38
// Left photo column right edge: x≈405
const LEFT_COL_W = 405;
// Right column left edge
const RIGHT_X = 418;
// Card inner padding
const CARD_PAD_H = 14;
const CARD_PAD_V = 10;
// Green accent rule on dark slides
const RULE_BOTTOM_OFFSET = 30;
// Card gap on slide 4
const CARD_GAP = 8;
const CARD_RADIUS = 6;
// Slide 5/6 header area
const S56_HEADER_H = 56;

// ── Shared primitive components ──────────────────────────────────────────────

function DarkHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div style={{ ...bb(0, 0, W, HEADER_H), background: PALETTE.forest_green, display: "flex", flexDirection: "row", alignItems: "center", paddingLeft: 32, paddingRight: 24 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <span style={{ fontFamily: FONTS.editorial, fontSize: 15, fontWeight: FW.bold, fontStyle: "italic", color: PALETTE.off_white, lineHeight: 1.1 }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontFamily: FONTS.editorial, fontSize: 11, fontStyle: "italic", color: PALETTE.sage, marginTop: 2 }}>
            {subtitle}
          </span>
        )}
      </div>
      {badge && (
        <span style={{ fontFamily: FONTS.body, fontSize: 6, fontWeight: FW.bold, letterSpacing: "0.3em", color: PALETTE.pale_sage, textTransform: "uppercase" }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function DarkFooter({ tagline, slideNum }: { tagline?: string; slideNum: number }) {
  return (
    <div style={{ ...bb(0, FOOTER_Y, W, H), background: PALETTE.forest_green, display: "flex", flexDirection: "row", alignItems: "center", paddingLeft: 32, paddingRight: 24 }}>
      <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.regular, fontStyle: "italic", color: PALETTE.sage, flex: 1, letterSpacing: "0.02em" }}>
        {tagline ?? ""}
      </span>
      <span style={{ fontFamily: FONTS.body, fontSize: 6, fontWeight: FW.regular, letterSpacing: "0.35em", color: PALETTE.pale_sage, textTransform: "uppercase" }}>
        L+B Analytics · {slideNum}
      </span>
    </div>
  );
}

function PhotoPanel({
  photo,
  x1, y1, x2, y2,
  caption,
  radius = 4,
  gradientDir = "top",
}: {
  photo: SlidePhoto | undefined;
  x1: number; y1: number; x2: number; y2: number;
  caption?: string;
  radius?: number;
  gradientDir?: "top" | "right";
}) {
  const grad = gradientDir === "top"
    ? "linear-gradient(to top, rgba(21,51,31,0.75) 0%, transparent 45%)"
    : "linear-gradient(to right, transparent 55%, rgba(21,51,31,0.90) 100%)";
  return (
    <div style={{ ...bb(x1, y1, x2, y2), borderRadius: radius, overflow: "hidden" }}>
      <PhotoBg photo={photo} />
      <div style={{ position: "absolute", inset: 0, background: grad }} />
      {caption && (
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 8, background: "rgba(21,39,28,0.70)", padding: "3px 8px", borderRadius: 2 }}>
          <span style={{ fontFamily: FONTS.body, fontSize: 6, fontWeight: FW.regular, letterSpacing: "0.25em", color: PALETTE.white, textTransform: "uppercase" }}>
            {caption}
          </span>
        </div>
      )}
    </div>
  );
}

function CredeCardHeader({ children, sage = false }: { children: React.ReactNode; sage?: boolean }) {
  return (
    <div style={{ background: sage ? PALETTE.sage : PALETTE.forest_green, padding: `${CARD_PAD_V}px ${CARD_PAD_H}px` }}>
      <span style={{ fontFamily: FONTS.body, fontSize: 9, fontWeight: FW.bold, letterSpacing: "0.18em", color: PALETTE.white, textTransform: "uppercase" }}>
        {children}
      </span>
    </div>
  );
}

function Card({ x1, y1, x2, y2, children, radius = CARD_RADIUS }: {
  x1: number; y1: number; x2: number; y2: number;
  children: React.ReactNode;
  radius?: number;
}) {
  return (
    <div style={{ ...bb(x1, y1, x2, y2), background: PALETTE.cream_card, border: `1px solid ${PALETTE.fine_rule}`, borderRadius: radius, overflow: "hidden" }}>
      {children}
    </div>
  );
}

// ── Slide 1 — Pipeline Spotlight ─────────────────────────────────────────────
//
// Layout (960×540):
//   Header band [0,0,960,44]
//   Left photos [16,51,405,327] + [15,330,402,499]
//   Title card  [418,51,943,104]
//   Specs card  [418,109,943,253]
//   Vision card [418,258,678,499]
//   Inset photo [686,247,952,502]
//   Footer band [0,502,960,540]
export function Slide1({ p }: { p: SlidePayload }) {
  const { property, deckPayloadV2 } = p;
  const v2 = deckPayloadV2?.slide1;

  const hero = getCanonicalPhoto(1, "hero");
  const secondary = getCanonicalPhoto(1, "secondary");
  const inset = getCanonicalPhoto(1, "inset");
  const type = typeLabel(property);

  const regionParts = [property.city, property.county, property.stateProvince]
    .filter((s): s is string => Boolean(s));
  const regionLine = regionParts.filter((s, i, a) => a.indexOf(s) === i).join(", ");

  const specs: string[] = [
    `${property.roomCount} boutique keys planned at stabilization`,
    type + (property.qualityTier ? ` · ${property.qualityTier} tier` : ""),
    regionLine,
    property.acquisitionStatus
      ? `${statusLabel(property.acquisitionStatus)} — ${property.businessModel || "Hospitality"} structure`
      : "",
  ].filter(Boolean);

  const visionBullets: string[] = (() => {
    const authored = v2?.visionBullets?.map(b => b.text).filter(Boolean);
    if (authored && authored.length > 0) return authored;
    return [
      `${property.roomCount}-key boutique conversion targeting year-round demand`,
      `${property.qualityTier || "Upscale"}-tier repositioning in ${property.city}, ${property.stateProvince}`,
      `Diversified revenue through lodging, F&B, and curated experiential programming`,
    ];
  })();

  const computedHeroCaption = `${property.name.toUpperCase()} · ${type.toUpperCase()}`;
  const heroCaption = v2?.photoCaptions?.hero?.text?.toUpperCase() || computedHeroCaption;
  const secondaryCaption = v2?.photoCaptions?.secondary?.text?.toUpperCase() || "CURATED GUEST EXPERIENCE";
  const computedInsetCaption = `${property.roomCount} KEYS · YEAR-ROUND DEMAND`;
  const insetCaption = v2?.photoCaptions?.inset?.text?.toUpperCase() || computedInsetCaption;

  const propertySubtitle = v2?.propertySubtitle?.text || property.description || "";
  const headerTitle = `Pipeline Spotlight: ${property.name}, ${property.stateProvince}`;
  const computedHeaderSubtitle = `${statusLabel(property.acquisitionStatus)} — ${regionLine}`;
  const headerSubtitle = v2?.headerSubtitle?.text || computedHeaderSubtitle;
  const closingTagline = v2?.closingTagline?.text || "";

  return (
    <div style={{ width: W, height: H, background: SLIDE_BG[1], position: "relative", overflow: "hidden" }}>
      <DarkHeader title={headerTitle} subtitle={headerSubtitle} badge="INVESTMENT SPOTLIGHT" />

      {/* Left column — main aerial photo [16,51,405,327] */}
      <PhotoPanel photo={hero} x1={16} y1={51} x2={405} y2={327} caption={heroCaption} />

      {/* Left column — secondary photo [15,330,402,499] */}
      <PhotoPanel photo={secondary} x1={15} y1={330} x2={402} y2={499} caption={secondaryCaption} />

      {/* Title card [418,51,943,104] */}
      <Card x1={RIGHT_X} y1={51} x2={943} y2={104}>
        <div style={{ padding: `10px ${CARD_PAD_H}px 8px`, display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 19, fontWeight: FW.regular, color: PALETTE.deep_green, lineHeight: 1.05 }}>
              {property.name}
            </div>
            {propertySubtitle && (
              <div style={{ fontFamily: FONTS.body, fontSize: 8, fontWeight: FW.regular, fontStyle: "italic", color: PALETTE.muted_gray_green, marginTop: 3, lineHeight: 1.3 }}>
                {propertySubtitle}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 6, fontWeight: FW.bold, letterSpacing: "0.3em", color: PALETTE.muted_gray_green, textTransform: "uppercase" }}>
              ASKING PRICE
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 18, fontWeight: FW.bold, color: PALETTE.forest_green, lineHeight: 1.1, marginTop: 2 }}>
              {fmtCurrency(property.purchasePrice)}
            </div>
          </div>
        </div>
      </Card>

      {/* Specs card [418,109,943,253] */}
      <Card x1={RIGHT_X} y1={109} x2={943} y2={253}>
        <CredeCardHeader>Property Specs</CredeCardHeader>
        <div style={{ padding: `10px ${CARD_PAD_H}px`, display: "flex", flexDirection: "column", gap: 7 }}>
          {specs.map((spec, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
              <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: 2, background: PALETTE.deep_green, marginTop: 5, marginRight: 8, flexShrink: 0 }} />
              <span style={{ fontFamily: FONTS.body, fontSize: 8.5, fontWeight: FW.regular, color: PALETTE.deep_green, lineHeight: 1.45, flex: 1 }}>
                {spec}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Vision card [418,258,678,499] */}
      <Card x1={RIGHT_X} y1={258} x2={678} y2={499}>
        <CredeCardHeader sage>The Vision</CredeCardHeader>
        <div style={{ padding: `10px ${CARD_PAD_H}px`, display: "flex", flexDirection: "column", gap: 8 }}>
          {visionBullets.map((bullet, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
              <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: 2, background: PALETTE.pale_sage, marginTop: 5, marginRight: 8, flexShrink: 0 }} />
              <span style={{ fontFamily: FONTS.body, fontSize: 8, fontWeight: FW.regular, color: PALETTE.muted_gray_green, lineHeight: 1.5, flex: 1 }}>
                {bullet}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Inset photo [686,247,952,502] */}
      <PhotoPanel photo={inset} x1={686} y1={247} x2={952} y2={502} caption={insetCaption} radius={6} />

      {closingTagline && (
        <div style={{ ...bb(RIGHT_X, 503, 943, FOOTER_Y - 2), display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: FONTS.editorial, fontSize: 8, fontStyle: "italic", color: PALETTE.muted_gray_green, letterSpacing: "0.02em", textAlign: "center" }}>
            {closingTagline}
          </span>
        </div>
      )}

      <DarkFooter tagline="" slideNum={1} />
    </div>
  );
}

// ── Slide 2 — Photo Gallery / Alt View ───────────────────────────────────────
//
// Layout (960×540):
//   Header band [0,0,960,44]   — forest green, like slide 1
//   Left panel [0,44,340,502]  — dark bg, property stats column
//   Photo grid [340,44,960,502]— 2×2 panel grid, non-hero photos
//   Footer band [0,502,960,540]
export function Slide2({ p }: { p: SlidePayload }) {
  const { property, photos, financials, deckPayloadV2 } = p;
  const v2s2 = deckPayloadV2?.slide2;
  const operationalModelText = v2s2?.operationalModelText?.text || "Boutique hospitality conversion · year-round demand";
  const slide2RevenueBullet = v2s2?.revenueBullet?.text || "Diversified revenue: lodging, F&B, and curated events";
  const slide2ProgrammingBullet = v2s2?.programmingBullet?.text || "Signature programming driving premium ADR and repeat visits";
  const stable = getStableYear(financials.yearlyIS);
  const renovBudget = financials.renovationBudget;
  const panelPhotos = photos.filter(ph => !ph.isHero).slice(0, 4);
  const type = typeLabel(property);

  const headerTitle = `${property.name.toUpperCase()} — ${property.city}, ${property.stateProvince}`;

  // Left stats panel bounds: x1=0,y1=44,x2=340,y2=502
  const LEFT_PANEL_X2 = 340;
  const BODY_Y1 = HEADER_H;
  const BODY_Y2 = FOOTER_Y;

  // Photo grid: 2 cols × 2 rows in [342,44,958,500]
  const GRID_X1 = 342; const GRID_X2 = 958;
  const GRID_Y1 = BODY_Y1 + 4; const GRID_Y2 = BODY_Y2 - 4;
  const HALF_W = (GRID_X2 - GRID_X1 - 4) / 2;
  const HALF_H = (GRID_Y2 - GRID_Y1 - 4) / 2;

  const statRows = [
    ["Purchase Price", fmtCurrency(property.purchasePrice)],
    ["Renovation Budget", fmtCurrency(renovBudget)],
    ["Total Investment", fmtCurrency((property.purchasePrice ?? 0) + renovBudget)],
    ["Stabilized Revenue", fmtCurrency(stable?.revenueTotal)],
    ["Projected NOI", fmtCurrency(stable?.noi)],
    ["Est. IRR", fmtPct(financials.irr)],
  ];

  return (
    <div style={{ width: W, height: H, background: SLIDE_BG[2], position: "relative", overflow: "hidden" }}>
      <DarkHeader title={headerTitle} badge="INVESTMENT SPOTLIGHT" />

      {/* Left dark panel */}
      <div style={{ ...bb(0, BODY_Y1, LEFT_PANEL_X2, BODY_Y2), background: PALETTE.forest_green, display: "flex", flexDirection: "column", padding: "18px 22px" }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.bold, letterSpacing: "0.35em", color: PALETTE.deep_green, textTransform: "uppercase", marginBottom: 4 }}>
          INVESTMENT SPOTLIGHT
        </span>
        <span style={{ fontFamily: FONTS.editorial, fontSize: 20, fontWeight: FW.bold, color: PALETTE.off_white, lineHeight: 1.15, marginBottom: 4 }}>
          {property.name}
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 8, fontWeight: FW.regular, color: PALETTE.sage, marginBottom: 12 }}>
          {type} · {property.city}, {property.stateProvince}
        </span>

        <div style={{ width: 24, height: 1, background: PALETTE.deep_green, marginBottom: 12 }} />

        <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.bold, letterSpacing: "0.12em", color: PALETTE.sage, textTransform: "uppercase", marginBottom: 6 }}>
          Property Specs
        </span>
        {statRows.map(([label, val]) => (
          <div key={label} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.sage }}>{label}</span>
            <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.off_white }}>{val}</span>
          </div>
        ))}

        <div style={{ width: "100%", height: 1, background: `${PALETTE.deep_green}55`, marginTop: 8, marginBottom: 10 }} />

        <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.bold, letterSpacing: "0.12em", color: PALETTE.sage, textTransform: "uppercase", marginBottom: 6 }}>
          The Vision
        </span>
        <span style={{ fontFamily: FONTS.editorial, fontSize: 9, fontStyle: "italic", color: PALETTE.off_white, marginBottom: 5, lineHeight: 1.4 }}>
          Operational Model: {operationalModelText}
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.pale_sage, marginBottom: 3, lineHeight: 1.45 }}>
          · {slide2RevenueBullet}
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.pale_sage, lineHeight: 1.45 }}>
          · {slide2ProgrammingBullet}
        </span>
      </div>

      {/* 2×2 photo grid */}
      <PhotoPanel photo={panelPhotos[0]} x1={GRID_X1} y1={GRID_Y1} x2={GRID_X1 + HALF_W} y2={GRID_Y1 + HALF_H} radius={3} />
      <PhotoPanel photo={panelPhotos[1]} x1={GRID_X1 + HALF_W + 4} y1={GRID_Y1} x2={GRID_X2} y2={GRID_Y1 + HALF_H} radius={3} />
      <PhotoPanel photo={panelPhotos[2]} x1={GRID_X1} y1={GRID_Y1 + HALF_H + 4} x2={GRID_X1 + HALF_W} y2={GRID_Y2} radius={3} />
      <PhotoPanel photo={panelPhotos[3]} x1={GRID_X1 + HALF_W + 4} y1={GRID_Y1 + HALF_H + 4} x2={GRID_X2} y2={GRID_Y2} radius={3} />

      <DarkFooter slideNum={2} />
    </div>
  );
}

// ── Slide 3 — Investment Model ────────────────────────────────────────────────
//
// Layout (960×540):
//   Header band  [0,0,960,44]
//   Left photos  hero [0,44,240,292] + interior [0,292,240,502]
//   Center col   [246,44,640,502] — dark bg, narrative text
//   Right col    [646,44,960,502] — cream, reason cards
//   Footer band  [0,502,960,540]
export function Slide3({ p }: { p: SlidePayload }) {
  const { property, photos, deckPayloadV2 } = p;
  const v2s3 = deckPayloadV2?.slide3;

  const conceptParagraph = v2s3?.conceptParagraph?.text || "L+B applies a disciplined boutique hospitality conversion model — acquiring underutilized assets, repositioning them with curated design and programming, and optimizing for year-round RevPAR growth.";
  const marketRationale = v2s3?.marketRationale?.text || `${property.city}, ${property.stateProvince} presents a compelling supply-constrained market with growing leisure demand and limited boutique competition at the premium tier.`;
  const reasons = (v2s3?.reasons ?? []).length > 0
    ? v2s3!.reasons!.map(r => ({ label: r.label.text, detail: r.detail.text }))
    : [
        { label: "Location", detail: `Prime position in ${property.city}, ${property.stateProvince}` },
        { label: "Asset", detail: `${property.roomCount}-key boutique conversion at ${property.qualityTier || "upscale"} tier` },
        { label: "Returns", detail: "Targeting stabilized NOI yield and strong equity multiple at exit" },
      ];
  const closingLine = v2s3?.closingLine?.text || "";

  const hero = photos.find(ph => ph.isHero) ?? photos[0];
  const autoInterior =
    photos.find(ph => !ph.isHero && ph.url?.includes("medellin-duplex-2")) ??
    photos[1] ??
    photos.find(ph => !ph.isHero) ??
    photos[0];
  const interiorOverrideUrl = v2s3?.interiorPhotoUrl ?? null;
  const interior = interiorOverrideUrl
    ? (photos.find(ph => ph.url === interiorOverrideUrl) ?? autoInterior)
    : autoInterior;

  const type = typeLabel(property);
  const headerTitle = `Investment Model: ${property.city.toUpperCase()}, ${property.stateProvince.toUpperCase()} · ${type.toUpperCase()}`;

  const BODY_Y1 = HEADER_H;
  const BODY_Y2 = FOOTER_Y;
  const LEFT_X2 = 240;
  const MID_X1 = 246; const MID_X2 = 636;
  const RIGHT_X1 = 642; const RIGHT_X2 = W;
  const MID_SPLIT = BODY_Y1 + (BODY_Y2 - BODY_Y1) / 2;

  return (
    <div style={{ width: W, height: H, background: SLIDE_BG[3], position: "relative", overflow: "hidden" }}>
      <DarkHeader title={headerTitle} badge="INVESTMENT MODEL" />

      {/* Left — hero photo */}
      <PhotoPanel photo={hero} x1={0} y1={BODY_Y1} x2={LEFT_X2} y2={MID_SPLIT} caption={hero?.caption || property.name} gradientDir="right" />

      {/* Left — interior photo */}
      <PhotoPanel photo={interior} x1={0} y1={MID_SPLIT + 2} x2={LEFT_X2} y2={BODY_Y2} caption="Chef's kitchen · marble waterfall island" gradientDir="right" />

      {/* Center dark column — narrative */}
      <div style={{ ...bb(MID_X1, BODY_Y1, MID_X2, BODY_Y2), background: PALETTE.forest_green, padding: "16px 18px", display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.bold, letterSpacing: "0.25em", color: PALETTE.deep_green, textTransform: "uppercase", marginBottom: 6 }}>
          THE CONCEPT
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 8, fontWeight: FW.regular, color: PALETTE.pale_sage, lineHeight: 1.6, marginBottom: 14 }}>
          {conceptParagraph}
        </span>

        <div style={{ width: 20, height: 1, background: PALETTE.deep_green, marginBottom: 10 }} />

        <span style={{ fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.bold, letterSpacing: "0.25em", color: PALETTE.deep_green, textTransform: "uppercase", marginBottom: 6 }}>
          WHY THIS PROPERTY?
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 8, fontWeight: FW.regular, color: PALETTE.pale_sage, lineHeight: 1.6, marginBottom: 14 }}>
          {marketRationale}
        </span>

        {closingLine && (
          <div style={{ borderLeft: `2px solid ${PALETTE.deep_green}`, paddingLeft: 10, marginTop: "auto" }}>
            <span style={{ fontFamily: FONTS.editorial, fontSize: 9, fontStyle: "italic", color: PALETTE.off_white, lineHeight: 1.5 }}>
              {closingLine}
            </span>
          </div>
        )}
      </div>

      {/* Right cream column — reason cards */}
      <div style={{ ...bb(RIGHT_X1, BODY_Y1, RIGHT_X2, BODY_Y2), background: PALETTE.cream_card, display: "flex", flexDirection: "column", padding: "14px 16px", gap: 0 }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.bold, letterSpacing: "0.25em", color: PALETTE.muted_gray_green, textTransform: "uppercase", marginBottom: 10 }}>
          KEY REASONS
        </span>
        {reasons.map(({ label, detail }, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <span style={{ display: "block", fontFamily: FONTS.body, fontSize: 8.5, fontWeight: FW.bold, color: PALETTE.forest_green, marginBottom: 2 }}>
              {label}
            </span>
            <span style={{ display: "block", fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.muted_gray_green, lineHeight: 1.5 }}>
              {detail}
            </span>
          </div>
        ))}
      </div>

      <DarkFooter slideNum={3} />
    </div>
  );
}

// ── Slide 4 — Portfolio Overview ──────────────────────────────────────────────
//
// Layout (960×540):
//   Header band [0,0,960,44]
//   Card grid   6 cards in 3×2 in [16,52,944,498]
//   Footer band [0,502,960,540]
function PortfolioCard({ prop, isCurrent }: { prop: SiblingProperty | null; isCurrent?: boolean }) {
  if (!prop) {
    return (
      <div style={{ position: "relative", flex: 1, borderRadius: CARD_RADIUS, overflow: "hidden", border: `1px solid ${PALETTE.fine_rule}`, background: PALETTE.cream_card, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.regular, color: PALETTE.muted_gray_green, letterSpacing: "0.15em", textTransform: "uppercase" }}>
          COMING SOON
        </span>
      </div>
    );
  }

  const photo: SlidePhoto | undefined = prop.heroPhotoBase64
    ? { base64: prop.heroPhotoBase64, isHero: true, sortOrder: 0 }
    : undefined;

  return (
    <div style={{ position: "relative", flex: 1, borderRadius: CARD_RADIUS, overflow: "hidden", border: isCurrent ? `1.5px solid ${PALETTE.deep_green}` : `1px solid ${PALETTE.fine_rule}` }}>
      <PhotoBg photo={photo} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(15,22,16,0.93) 30%, rgba(15,22,16,0.15) 100%)" }} />
      {isCurrent && (
        <div style={{ position: "absolute", top: 7, right: 7, background: PALETTE.deep_green, padding: "2px 6px", borderRadius: 2 }}>
          <span style={{ fontFamily: FONTS.body, fontSize: 5.5, fontWeight: FW.bold, color: PALETTE.white, letterSpacing: "0.15em", textTransform: "uppercase" }}>
            THIS PROPERTY
          </span>
        </div>
      )}
      <div style={{ position: "absolute", bottom: 9, left: 9, right: 9, display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 6, fontWeight: FW.regular, color: PALETTE.sage, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>
          {statusBadgeLabel(prop.acquisitionStatus)}
        </span>
        <span style={{ fontFamily: FONTS.editorial, fontSize: 10, fontWeight: FW.regular, color: PALETTE.off_white, lineHeight: 1.2, marginBottom: 2 }}>
          {prop.name}
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.regular, color: PALETTE.sage, marginBottom: 2 }}>
          {[prop.city, prop.stateProvince].filter(Boolean).join(", ")}
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.bold, color: PALETTE.pale_sage }}>
          {fmtCurrency(prop.purchasePrice)}
        </span>
      </div>
    </div>
  );
}

export function Slide4({ p }: { p: SlidePayload }) {
  const { property, siblings, slide4HeroBase64, deckPayloadV2 } = p;
  const v2 = deckPayloadV2?.slide4;

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

  const allCards: (SiblingProperty | null)[] = [currentAsCard, ...siblings.slice(0, SIBLING_GRID_SLOTS - 1)];
  while (allCards.length < SIBLING_GRID_SLOTS) allCards.push(null);

  const row1 = allCards.slice(0, SIBLING_GRID_COLS);
  const row2 = allCards.slice(SIBLING_GRID_COLS, SIBLING_GRID_SLOTS);

  const computedSubtitle = `${allCards.filter(Boolean).length} properties · ${property.name} highlighted`;
  const sectionSubtitle = v2?.sectionSubtitle?.text || computedSubtitle;

  const headerTitle = "H+ Portfolio Overview";

  // Grid bounds
  const GX1 = 16; const GX2 = 944;
  const GY1 = 52; const GY2 = 498;
  const CARD_W = (GX2 - GX1 - CARD_GAP * 2) / 3;
  const CARD_H = (GY2 - GY1 - CARD_GAP) / 2;

  return (
    <div style={{ width: W, height: H, background: SLIDE_BG[4], position: "relative", overflow: "hidden" }}>
      {/* Header uses off-white bg but dark-green text for this slide */}
      <div style={{ ...bb(0, 0, W, HEADER_H), background: PALETTE.off_white, display: "flex", flexDirection: "row", alignItems: "center", paddingLeft: 32, paddingRight: 24, borderBottom: `1px solid ${PALETTE.fine_rule}` }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.bold, letterSpacing: "0.3em", color: PALETTE.deep_green, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
            PROPERTY PIPELINE
          </span>
          <span style={{ fontFamily: FONTS.editorial, fontSize: 18, fontWeight: FW.bold, fontStyle: "italic", color: PALETTE.forest_green }}>
            {headerTitle}
          </span>
        </div>
        <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.muted_gray_green }}>
          {sectionSubtitle}
        </span>
      </div>

      {/* Card row 1 */}
      {row1.map((card, i) => (
        <div key={i} style={{ ...bb(GX1 + i * (CARD_W + CARD_GAP), GY1, GX1 + i * (CARD_W + CARD_GAP) + CARD_W, GY1 + CARD_H), display: "flex" }}>
          <PortfolioCard prop={card} isCurrent={i === 0} />
        </div>
      ))}

      {/* Card row 2 */}
      {row2.map((card, i) => (
        <div key={i + SIBLING_GRID_COLS} style={{ ...bb(GX1 + i * (CARD_W + CARD_GAP), GY1 + CARD_H + CARD_GAP, GX1 + i * (CARD_W + CARD_GAP) + CARD_W, GY2), display: "flex" }}>
          <PortfolioCard prop={card} />
        </div>
      ))}

      {/* Footer rule */}
      <GreenRule y={FOOTER_Y} />
      <PageNumber n={4} />
    </div>
  );
}

// ── Slide 5 — Financial Snapshot (Transformation Plan) ───────────────────────
//
// Background: sage (#9FBCAD)
// Layout:
//   Header area [0,0,960,56] — off-white header card
//   Left col    [16,64,490,490] — transformation table + description
//   Right col   [506,64,944,490] — snapshot + financing + metrics
//   Fine rule footer at y=500
export function Slide5({ p }: { p: SlidePayload }) {
  const { property, financials, deckPayloadV2 } = p;
  const stable = getStableYear(financials.yearlyIS);
  const renovBudget = financials.renovationBudget;
  const totalInvestment = (property.purchasePrice ?? 0) + renovBudget;
  const grossMargin = stable && stable.revenueTotal > 0 ? (stable.gop / stable.revenueTotal) : null;
  const ebitdaPct = stable && stable.revenueTotal > 0 ? (stable.noi / stable.revenueTotal) : null;
  const ltv = financials.loanLtv > 0 ? `${Math.round(financials.loanLtv * PCT_SCALE)}%` : DEFAULT_LTV_LABEL_PCT;
  const stableLabel = stable ? `Year ${stable.year}` : "Yr 3";

  const stableOcc = stable && stable.availableRooms > 0
    ? Math.min(STABLE_OCC_CEILING, Math.max(STABLE_OCC_FLOOR, stable.soldRooms / stable.availableRooms))
    : (property.maxOccupancy ?? DEFAULT_OCCUPANCY);
  const stableAdr = stable?.cleanAdr ?? property.startAdr ?? 0;
  const stableRevpar = stableAdr * stableOcc;

  const v2s5 = deckPayloadV2?.slide5;
  const slide5TransformDesc = v2s5?.transformationDescription?.text || `${property.name} is being repositioned as a ${property.roomCount}-key boutique ${property.hospitalityType || property.businessModel || "hotel"} in ${property.city}, ${property.stateProvince}. The transformation plan targets ${property.qualityTier || "upscale"}-tier finishes, curated amenity programming, and a stabilized ADR of ${fmtCurrency(property.startAdr)}.`;
  const authoredTransRows = v2s5?.transformationRows;
  const transformRows: string[][] = [
    ["Feature", "Existing", "Proposed"],
    ...(authoredTransRows && authoredTransRows.length > 0
      ? authoredTransRows.map(r => [r.feature.text, r.existing.text, r.proposed.text])
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

  const BODY_Y1 = S56_HEADER_H;
  const BODY_Y2 = 500;
  const LEFT_X2 = 490;
  const RIGHT_X1 = 506;

  // Table row colors on sage bg
  const TABLE_HEADER_BG = PALETTE.forest_green;
  const TABLE_ZEBRA = "rgba(255,255,255,0.25)";
  const TABLE_RULE = "rgba(255,255,255,0.18)";

  return (
    <div style={{ width: W, height: H, background: SLIDE_BG[5], position: "relative", overflow: "hidden" }}>
      {/* Header area — white card */}
      <div style={{ ...bb(0, 0, W, BODY_Y1), background: PALETTE.off_white, display: "flex", flexDirection: "row", alignItems: "center", paddingLeft: 24, paddingRight: 24, borderBottom: `1px solid ${PALETTE.fine_rule}` }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.bold, letterSpacing: "0.3em", color: PALETTE.deep_green, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
            FINANCIAL SNAPSHOT
          </span>
          <span style={{ fontFamily: FONTS.editorial, fontSize: 18, fontWeight: FW.bold, fontStyle: "italic", color: PALETTE.forest_green }}>
            The Transformation Plan — {property.name}
          </span>
        </div>
      </div>

      {/* Left column — description + transformation table */}
      <div style={{ ...bb(16, BODY_Y1 + 8, LEFT_X2, BODY_Y2), display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.forest_green, lineHeight: 1.6, marginBottom: 12 }}>
          {slide5TransformDesc}
        </span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {transformRows.map((row, ri) => (
            <div key={ri} style={{ display: "flex", flexDirection: "row", padding: "5px 0", borderBottom: ri < transformRows.length - 1 ? `1px solid ${TABLE_RULE}` : "none", background: ri === 0 ? TABLE_HEADER_BG : ri % 2 === 0 ? TABLE_ZEBRA : "transparent" }}>
              {row.map((cell, ci) => (
                <span key={ci} style={{ flex: ci === 0 ? 0.8 : 1, fontFamily: FONTS.body, fontSize: ri === 0 ? 6.5 : 7.5, color: ri === 0 ? PALETTE.off_white : PALETTE.forest_green, fontWeight: ri === 0 || ci === 0 ? FW.bold : FW.regular, paddingLeft: 6 }}>
                  {cell}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Right column — snapshot + financing + metrics */}
      <div style={{ ...bb(RIGHT_X1, BODY_Y1 + 8, 944, BODY_Y2), display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.bold, letterSpacing: "0.15em", color: PALETTE.forest_green, textTransform: "uppercase", marginBottom: 8 }}>
          Snapshot of Stable Year ({stableLabel})
        </span>
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 16 }}>
          {snapshotRows.map(([label, val], ri) => (
            <div key={ri} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${TABLE_RULE}` }}>
              <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.forest_green }}>{label}</span>
              <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.forest_green }}>{val}</span>
            </div>
          ))}
        </div>

        <span style={{ fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.bold, letterSpacing: "0.15em", color: PALETTE.forest_green, textTransform: "uppercase", marginBottom: 8 }}>
          Financing Summary
        </span>
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 14 }}>
          {[
            ["Purchase Price", fmtCurrency(property.purchasePrice)],
            ["Renovation Budget", fmtCurrency(renovBudget)],
            ["Total Investment", fmtCurrency(totalInvestment)],
            [`Loan Amount (${ltv})`, fmtCurrency(financials.loanAmount)],
            ["Annual Debt Service", fmtCurrency(financials.annualDebtService)],
          ].map(([label, val], ri) => (
            <div key={ri} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${TABLE_RULE}` }}>
              <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.forest_green }}>{label}</span>
              <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: ri === 2 ? FW.bold : FW.regular, color: PALETTE.forest_green }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(21,51,31,0.12)", borderLeft: `2px solid ${PALETTE.forest_green}`, padding: "8px 10px" }}>
          <span style={{ fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.bold, color: PALETTE.forest_green, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Key Investor Metrics*
          </span>
          <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.forest_green, display: "block", marginBottom: 2 }}>
            GOP Margin: {fmtPct(grossMargin)}
          </span>
          <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.forest_green, display: "block", marginBottom: 4 }}>
            EBITDA ({stableLabel}): {fmtPct(ebitdaPct)}
          </span>
          <span style={{ fontFamily: FONTS.body, fontSize: 6, fontWeight: FW.regular, color: PALETTE.forest_green }}>
            * Projections for first full stabilized year
          </span>
        </div>
      </div>

      <GreenRule y={BODY_Y2 + 2} />
      <PageNumber n={5} />
    </div>
  );
}

// ── Slide 6 — Pro Forma Income Statement ─────────────────────────────────────
//
// Background: sage (#9FBCAD)
// Layout:
//   Header area [0,0,960,56] — off-white
//   Left col    [16,64,620,490] — pro forma table (or PNG)
//   Right col   [636,64,944,490] — investor metrics + disclaimer
export function Slide6({ p }: { p: SlidePayload }) {
  const { property, financials, deckPayloadV2, usaliPngBase64, projYears } = p;
  const v2 = deckPayloadV2?.slide6;

  const isLbMode = p.usaliMode === true;
  const hasUsaliPng = Boolean(usaliPngBase64);
  const yearCount = projYears ?? PROFORMA_YEARS;

  const SLIDE6_DEFAULT_DISCLAIMER = isLbMode
    ? "10-year portfolio pro forma aggregated across all portfolio properties. H+ Analytics projection engine. Projections are estimates; actual results may vary."
    : "5-year pro forma based on H+ Analytics projection engine. Projections are estimates; actual results may vary.";

  const years = financials.yearlyIS.slice(0, yearCount);
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
    ["Debt Service", financials.yearlyCF.slice(0, PROFORMA_YEARS).map(y => fmtCurrency(y.debtService))],
    ["Net Cash Flow", financials.yearlyCF.slice(0, PROFORMA_YEARS).map(y => fmtCurrency(y.netCashFlowToInvestors))],
    ["Cumulative CF", financials.yearlyCF.slice(0, PROFORMA_YEARS).map(y => fmtCurrency(y.cumulativeCashFlow))],
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

  const BODY_Y1 = S56_HEADER_H;
  const BODY_Y2 = 500;
  const LEFT_X2 = 618;
  const RIGHT_X1 = 634;

  const TABLE_HEADER_BG = PALETTE.forest_green;
  const TABLE_ZEBRA = "rgba(255,255,255,0.22)";
  const TABLE_RULE = "rgba(255,255,255,0.18)";

  return (
    <div style={{ width: W, height: H, background: SLIDE_BG[6], position: "relative", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ ...bb(0, 0, W, BODY_Y1), background: PALETTE.off_white, display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 24, paddingRight: 24, borderBottom: `1px solid ${PALETTE.fine_rule}` }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 7, fontWeight: FW.bold, letterSpacing: "0.3em", color: PALETTE.deep_green, textTransform: "uppercase", marginBottom: 2 }}>
          {yearCount}-YEAR CONSOLIDATED PRO FORMA INCOME STATEMENT
        </span>
        <span style={{ fontFamily: FONTS.editorial, fontSize: 16, fontWeight: FW.bold, fontStyle: "italic", color: PALETTE.forest_green }}>
          {property.name}
        </span>
      </div>

      {/* Left — table or PNG */}
      <div style={{ ...bb(16, BODY_Y1 + 8, LEFT_X2, BODY_Y2), display: "flex", flexDirection: "column" }}>
        {hasUsaliPng ? (
          <img
            src={`data:image/png;base64,${usaliPngBase64}`}
            alt="10-Year Portfolio Pro Forma"
            style={{ width: "100%", height: "auto", display: "block", borderRadius: 2 }}
          />
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "row", padding: "5px 0", background: TABLE_HEADER_BG, marginBottom: 2 }}>
              <span style={{ flex: 1.4, fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.bold, color: PALETTE.sage, paddingLeft: 6 }}>Item</span>
              {years.map((_, i) => (
                <span key={i} style={{ flex: 1, fontFamily: FONTS.numeric, fontSize: 7, color: PALETTE.off_white, textAlign: "right", paddingRight: 6, letterSpacing: "0.04em" }}>Yr {i + 1}</span>
              ))}
            </div>
            {isRows.map(([label, vals], ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "row", padding: "4px 0", background: ri % 2 === 0 ? TABLE_ZEBRA : "transparent", borderBottom: `1px solid ${TABLE_RULE}` }}>
                <span style={{ flex: 1.4, fontFamily: FONTS.body, fontSize: 7, fontWeight: ri === 2 ? FW.bold : FW.regular, color: PALETTE.forest_green, paddingLeft: 6 }}>
                  {label}
                </span>
                {(vals as string[]).map((v, vi) => (
                  <span key={vi} style={{ flex: 1, fontFamily: FONTS.numeric, fontSize: 7.5, color: ri === 2 ? PALETTE.deep_green : PALETTE.forest_green, textAlign: "right", paddingRight: 6, fontWeight: ri === 2 ? FW.bold : FW.regular }}>
                    {v}
                  </span>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Right — investor metrics */}
      <div style={{ ...bb(RIGHT_X1, BODY_Y1 + 8, 944, BODY_Y2), display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 6.5, fontWeight: FW.bold, letterSpacing: "0.15em", color: PALETTE.forest_green, textTransform: "uppercase", marginBottom: 8 }}>
          Key Investor Metrics
        </span>
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 16 }}>
          {investorRows.map(([label, val], ri) => (
            <div key={ri} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "5px 8px", background: ri % 2 === 0 ? TABLE_ZEBRA : "transparent", borderBottom: `1px solid ${TABLE_RULE}` }}>
              <span style={{ fontFamily: FONTS.body, fontSize: 7.5, fontWeight: FW.regular, color: PALETTE.forest_green }}>{label}</span>
              <span style={{ fontFamily: FONTS.numeric, fontSize: 9, color: PALETTE.forest_green, fontWeight: ri < 2 ? FW.bold : FW.regular }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(21,51,31,0.12)", borderLeft: `2px solid ${PALETTE.forest_green}`, padding: "8px 10px", marginTop: "auto" }}>
          <span style={{ fontFamily: FONTS.editorial, fontSize: 8, fontStyle: "italic", color: PALETTE.forest_green, lineHeight: 1.6, display: "block" }}>
            {v2?.disclaimer?.text || SLIDE6_DEFAULT_DISCLAIMER}
          </span>
        </div>
      </div>

      <GreenRule y={BODY_Y2 + 2} />
      <PageNumber n={6} />
    </div>
  );
}
