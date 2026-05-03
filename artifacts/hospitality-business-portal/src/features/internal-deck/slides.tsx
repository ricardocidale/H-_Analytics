/**
 * slides.tsx — Six React slide components for the internal investor deck.
 * Canonical layout, dimensions, and palette for the L+B printed PDF.
 *
 * Each Slide renders a 1920×1080 canvas at native pixel dimensions; the
 * surrounding page in pages/InternalDeck.tsx applies @page sizing for print.
 */
import React from "react";
import {
  C,
  FONT_NUMERIC,
  FONT_SANS,
  FONT_SERIF,
  SLIDE_BACKGROUNDS,
  SLIDE_EXIT_CAP_RATE_FALLBACK,
  SLIDE_HEIGHT_PX as H,
  SLIDE_WIDTH_PX as W,
} from "./theme";
import {
  GreenRule,
  LbBadge,
  PageNumber,
  PhotoBg,
  fmtCurrency,
  fmtPct,
  getStableYear,
  photoSrc,
  statusBadgeLabel,
  statusLabel,
  typeLabel,
} from "./helpers";
import type { SiblingProperty, SlidePayload, SlidePhoto } from "./types";

const DEFAULT_OCCUPANCY = 0.7;
const STABLE_OCC_FLOOR = 0.55;
const STABLE_OCC_CEILING = 0.85;
const PCT_SCALE = 100;
const DEFAULT_LTV_LABEL_PCT = "65%";
const FOOTER_RULE_OFFSET = 60;
const PROFORMA_YEARS = 5;
const SIBLING_GRID_SLOTS = 6;
const SIBLING_GRID_COLS = 3;
const CARD_GAP = 16;

// ── Slide 1 — Pipeline Spotlight (Property Spotlight) ────────────────────
//
// Canonical L+B layout (960×540pt, rendered here at 2× = 1920×1080px):
//   • Top dark-green header band — "Pipeline Spotlight: <Name>, <State>"
//     in editorial italic serif + italic subtitle for region/status
//   • Two-column body:
//       - Left  (x≈34–812):  hero photo above secondary photo, both with
//         all-caps captions on a dark gradient overlay
//       - Right (x≈838–1888):
//           · Title row     — name (bold green) + italic descriptor +
//             ASKING PRICE block, right-aligned
//           · Specs card    — dark-green header strip "Property Specs"
//             over short factual bullets
//           · Vision card   — dark-green header strip "The Vision"
//             over visionText bullets, occupies left half of the bottom
//             region
//           · Inset photo   — right half of the bottom region
//   • Bottom dark-green footer band with "L+B Analytics" + page number
//
// Deviations from canonical, with rationale (per locked decisions in claude.md):
//   • Page background is white #FFFFFF, not cream — the canonical PDF paint
//     layer is white; the cream visible in renders is a baked full-page
//     raster. (decision #4)
//   • Header text uses cream/sage on dark green, not canonical's #257D41
//     forest-green-on-forest-green which fails WCAG AA contrast. (decision #1)
//   • Body copy is bound to the assigned property's seed/engine fields, not
//     canonical's "Sul Monte / Galli-Curci 1926 chateau" filler — that
//     copy has no record in any seed and is discarded. (decision #1, #5)
//   • Specs bullets are derived from real SlideProperty fields, not Sul
//     Monte features (8200sqft, 8BR/7BA, salt-water pool, 61+ acres) which
//     have no Belleayre equivalent.
//   • "Target Acquisition $2.3M" line dropped — no schema field exists for
//     a target separate from purchasePrice. (decision #6)
//   • Page number is 1, not canonical's "PAGE 17" leftover.
//   • Editorial header uses EB Garamond BoldItalic instead of canonical's
//     Georgia BoldItalic — EB Garamond is already in the bundled WOFF
//     stack and gives the same magazine-masthead serif signal; avoids
//     adding new font files for a single use site. (decision #3)
//   • Photo captions use Poppins instead of canonical's Microsoft YaHei
//     (Windows-only; falls back unreliably in headless Chromium).
export function Slide1({ p }: { p: SlidePayload }) {
  const { property, photos, visionText } = p;
  const hero = photos.find(ph => ph.isHero) ?? photos[0];
  const nonHero = photos.filter(ph => !ph.isHero);
  const secondary = nonHero[0] ?? photos[0];
  const inset = nonHero[1] ?? secondary;
  const type = typeLabel(property);

  // Region line: "<city>, <county>, <state>" — dedupe county==state
  const regionParts = [property.city, property.county, property.stateProvince]
    .filter((s): s is string => Boolean(s));
  const regionLine = regionParts.filter((s, i, a) => a.indexOf(s) === i).join(", ");

  // Spec bullets — short factual lines drawn from SlideProperty fields only.
  const specs: string[] = [
    `${property.roomCount} boutique keys planned at stabilization`,
    type + (property.qualityTier ? ` · ${property.qualityTier} tier` : ""),
    regionLine,
    property.acquisitionStatus
      ? `${statusLabel(property.acquisitionStatus)} — ${property.businessModel || "Hospitality"} structure`
      : "",
  ].filter(Boolean);

  // Vision bullets — populated by visionText (LLM per-property); defensive
  // against partial payloads.
  const visionBullets: string[] = [
    visionText.visionBullet1,
    visionText.visionBullet2,
    visionText.programmingBullet,
  ].filter((s): s is string => Boolean(s) && s.length > 0);

  const heroCaption = `${property.name.toUpperCase()} · ${type.toUpperCase()}`;
  const insetCaption = (visionText.cinematicCaption || `${property.roomCount} KEYS · YEAR-ROUND DEMAND`).toUpperCase();

  const headerTitle = `Pipeline Spotlight: ${property.name}, ${property.stateProvince}`;
  const headerSubtitle = `${statusLabel(property.acquisitionStatus)} — ${regionLine}`;

  return (
    <div style={{ width: W, height: H, background: "#FFFFFF", position: "relative", overflow: "hidden" }}>
      {/* Top dark-green editorial header band (canonical 0,0,960,44 → 0,0,1920,88) */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 88, background: C.darkBg, display: "flex", flexDirection: "row", alignItems: "center", padding: "0 64px" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 30, fontWeight: 700, fontStyle: "italic", color: C.cream, letterSpacing: "0.01em", lineHeight: 1.05 }}>
            {headerTitle}
          </span>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 17, fontStyle: "italic", color: C.sage, marginTop: 4 }}>
            {headerSubtitle}
          </span>
        </div>
        <span style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.43em", color: C.mint, textTransform: "uppercase" }}>
          INVESTMENT SPOTLIGHT
        </span>
      </div>

      {/* Left column — hero photo (canonical 17,51,389,276 → 34,102,778,552) */}
      <div style={{ position: "absolute", left: 34, top: 102, width: 778, height: 552, overflow: "hidden", borderRadius: 4 }}>
        <PhotoBg photo={hero} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(28,43,30,0.7) 0%, transparent 38%)" }} />
        <div style={{ position: "absolute", left: 22, right: 22, bottom: 18 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 300, letterSpacing: "0.32em", color: C.cream, textTransform: "uppercase" }}>
            {heroCaption}
          </span>
        </div>
      </div>

      {/* Left column — secondary photo (canonical 16,331,387,168 → 32,662,774,336) */}
      <div style={{ position: "absolute", left: 32, top: 662, width: 774, height: 336, overflow: "hidden", borderRadius: 4 }}>
        <PhotoBg photo={secondary} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(28,43,30,0.65) 0%, transparent 42%)" }} />
        <div style={{ position: "absolute", left: 22, right: 22, bottom: 18 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 300, letterSpacing: "0.32em", color: C.cream, textTransform: "uppercase" }}>
            CURATED GUEST EXPERIENCE
          </span>
        </div>
      </div>

      {/* Right column — title row: name + italic descriptor + ASKING PRICE */}
      <div style={{ position: "absolute", left: 838, top: 118, right: 64, height: 110, display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32, minWidth: 0 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 38, fontWeight: 700, color: C.accent, letterSpacing: "0.04em", lineHeight: 1.05 }}>
            {property.name.toUpperCase()}
          </span>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 17, fontStyle: "italic", color: "#5A7A62", marginTop: 8, lineHeight: 1.35 }}>
            {property.description}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.43em", color: C.sage, textTransform: "uppercase" }}>
            ASKING PRICE
          </span>
          <span style={{ fontFamily: FONT_SANS, fontSize: 38, fontWeight: 700, color: C.darkBg, marginTop: 6, lineHeight: 1 }}>
            {fmtCurrency(property.purchasePrice)}
          </span>
        </div>
      </div>

      {/* Right column — Property Specs card (canonical 419,110,525,143 → 838,220,1018,286) */}
      <div style={{ position: "absolute", left: 838, top: 268, right: 64, borderRadius: 4, overflow: "hidden", border: `1px solid rgba(28,43,30,0.12)` }}>
        <div style={{ background: C.darkBg, padding: "14px 28px" }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", color: C.cream, textTransform: "uppercase" }}>
            Property Specs
          </span>
        </div>
        <div style={{ background: "#FFFFFF", padding: "22px 28px 24px 28px", display: "flex", flexDirection: "column" }}>
          {specs.map((spec, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", marginBottom: i < specs.length - 1 ? 14 : 0 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: C.accent, marginTop: 8, marginRight: 14, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT_SANS, fontSize: 17, fontWeight: 400, color: C.accent, lineHeight: 1.45, flex: 1 }}>
                {spec}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right column — The Vision card (canonical 419,258,260,241 → 838,560,520,~360) */}
      <div style={{ position: "absolute", left: 838, top: 590, width: 520, bottom: 100, borderRadius: 4, overflow: "hidden", border: `1px solid rgba(28,43,30,0.12)`, display: "flex", flexDirection: "column" }}>
        <div style={{ background: C.darkBg, padding: "14px 24px" }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", color: C.cream, textTransform: "uppercase" }}>
            The Vision
          </span>
        </div>
        <div style={{ flex: 1, background: "#FFFFFF", padding: "22px 24px", display: "flex", flexDirection: "column" }}>
          {visionBullets.map((bullet, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", marginBottom: i < visionBullets.length - 1 ? 16 : 0 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: C.accent, marginTop: 7, marginRight: 14, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT_SANS, fontSize: 16, fontWeight: 400, color: "#7AAA88", lineHeight: 1.5, flex: 1 }}>
                {bullet}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right column — inset photo (canonical 687,247,265,255 → 1374,494,~530,~510) */}
      <div style={{ position: "absolute", left: 1378, top: 590, right: 32, bottom: 100, borderRadius: 4, overflow: "hidden" }}>
        <PhotoBg photo={inset} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(28,43,30,0.7) 0%, transparent 45%)" }} />
        <div style={{ position: "absolute", left: 22, right: 22, bottom: 18 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 300, letterSpacing: "0.32em", color: C.cream, textTransform: "uppercase" }}>
            {insetCaption}
          </span>
        </div>
      </div>

      {/* Bottom dark-green footer band (canonical 0,507,960,33 → 0,1014,1920,66) */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 66, background: C.darkBg, display: "flex", flexDirection: "row", alignItems: "center", padding: "0 64px" }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 400, letterSpacing: "0.43em", color: C.mint, textTransform: "uppercase", flex: 1 }}>
          L+B Analytics · Investor Briefing
        </span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 400, letterSpacing: "0.43em", color: C.mint, textTransform: "uppercase" }}>
          Page 1
        </span>
      </div>
    </div>
  );
}

// ── Slide 2 — Alt View / Photo Gallery ───────────────────────────────────
export function Slide2({ p }: { p: SlidePayload }) {
  const { property, photos, visionText, financials } = p;
  const stable = getStableYear(financials.yearlyIS);
  const renovBudget = financials.renovationBudget;
  const panelPhotos = photos.filter(ph => !ph.isHero).slice(0, 4);

  return (
    <div style={{ width: W, height: H, background: C.darkBg, display: "flex", position: "relative", overflow: "hidden" }}>
      <div style={{ width: 520, display: "flex", flexDirection: "column", padding: "44px 40px 44px 48px", flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>
          INVESTMENT SPOTLIGHT
        </span>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 26, fontWeight: 700, color: C.cream, lineHeight: 1.2, marginBottom: 8 }}>
          {property.name.toUpperCase()}
        </span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.sage, marginBottom: 16 }}>
          {property.city}, {property.stateProvince}
        </span>

        <div style={{ width: 40, height: 2, background: C.accent, marginBottom: 16 }} />

        <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.12em", color: C.sage, marginBottom: 8 }}>Property Specs</span>
        {[
          ["Purchase Price", fmtCurrency(property.purchasePrice)],
          ["Renovation Budget", fmtCurrency(renovBudget)],
          ["Total Investment", fmtCurrency((property.purchasePrice ?? 0) + renovBudget)],
          ["Stabilized Revenue", fmtCurrency(stable?.revenueTotal)],
          ["Projected NOI", fmtCurrency(stable?.noi)],
          ["Est. IRR", fmtPct(financials.irr)],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.sage }}>{label}</span>
            <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.cream }}>{val}</span>
          </div>
        ))}

        <div style={{ width: "100%", height: 1, background: "rgba(37,125,65,0.3)", marginTop: 12, marginBottom: 16 }} />

        <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.12em", color: C.sage, marginBottom: 8 }}>The Vision</span>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 14, color: C.cream, fontStyle: "italic", marginBottom: 8 }}>
          Operational Model: {visionText.operationalModelText}
        </span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.dimWhite, marginBottom: 4 }}>• {visionText.revenueBullet}</span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.dimWhite }}>• {visionText.programmingBullet}</span>
      </div>

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
      <GreenRule y={H - FOOTER_RULE_OFFSET} />
      <PageNumber n={2} />
    </div>
  );
}

// ── Slide 3 — Investment Model ────────────────────────────────────────────
export function Slide3({ p }: { p: SlidePayload }) {
  const { property, photos, visionText } = p;
  const hero = photos.find(ph => ph.isHero) ?? photos[0];
  const secondary = photos[1] ?? photos[0];
  const type = typeLabel(property);

  return (
    <div style={{ width: W, height: H, background: C.darkBg, display: "flex", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", width: 480, position: "relative", flexShrink: 0 }}>
        <PhotoBg photo={hero} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 60%, rgba(28,43,30,0.95) 100%)" }} />
      </div>
      <div style={{ display: "flex", width: 340, position: "relative", flexShrink: 0 }}>
        <PhotoBg photo={secondary} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(28,43,30,0.4)" }} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "44px 48px 44px 40px" }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>
          INVESTMENT MODEL
        </span>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 26, fontWeight: 700, color: C.cream, lineHeight: 1.2, marginBottom: 4 }}>
          {property.city.toUpperCase()}, {property.stateProvince.toUpperCase()} · {type.toUpperCase()}
        </span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.sage, marginBottom: 16 }}>
          The L+B model applied to {type.toLowerCase()} assets in {property.city}, {property.stateProvince}
        </span>

        <div style={{ width: 40, height: 2, background: C.accent, marginBottom: 16 }} />

        <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.sage, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>The Concept</span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 13, color: C.dimWhite, lineHeight: 1.6, marginBottom: 16 }}>
          {visionText.investmentModelConcept}
        </span>

        <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.sage, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Why This Property?</span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 13, color: C.dimWhite, lineHeight: 1.6, marginBottom: 16 }}>
          {visionText.marketRationale}
        </span>

        {[
          [visionText.reason1Label, visionText.reason1Detail],
          [visionText.reason2Label, visionText.reason2Detail],
          [visionText.reason3Label, visionText.reason3Detail],
        ].map(([label, detail], i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
            <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.cream, fontWeight: 600, marginBottom: 2 }}>{label}</span>
            <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.sage, lineHeight: 1.5 }}>{detail}</span>
          </div>
        ))}

        <div style={{ display: "flex", marginTop: 16, padding: "10px 16px", borderLeft: `3px solid ${C.accent}` }}>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 15, color: C.cream, fontStyle: "italic" }}>{visionText.closingLine}</span>
        </div>
      </div>

      <LbBadge x={48} y={40} />
      <GreenRule y={H - FOOTER_RULE_OFFSET} />
      <PageNumber n={3} />
    </div>
  );
}

// ── Slide 4 — Portfolio Overview ─────────────────────────────────────────
function PortfolioCard({ prop, isCurrent }: { prop: SiblingProperty | null; isCurrent?: boolean }) {
  if (!prop) {
    return (
      <div style={{ display: "flex", flex: 1, position: "relative", borderRadius: 4, overflow: "hidden", border: `1px solid ${C.canvasRule}`, background: "rgba(28,43,30,0.08)", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.sage, letterSpacing: "0.15em" }}>COMING SOON</span>
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
          <span style={{ fontFamily: FONT_SANS, fontSize: 8, color: C.white, letterSpacing: "0.15em" }}>THIS PROPERTY</span>
        </div>
      )}
      <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 8, color: C.sage, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>
          {statusBadgeLabel(prop.acquisitionStatus)}
        </span>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 15, color: C.cream, lineHeight: 1.2, marginBottom: 3 }}>{prop.name}</span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 10, color: C.sage, marginBottom: 3 }}>
          {[prop.city, prop.stateProvince].filter(Boolean).join(", ")}
        </span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.sage, fontWeight: 600 }}>
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

  const allCards: (SiblingProperty | null)[] = [currentAsCard, ...siblings.slice(0, SIBLING_GRID_SLOTS - 1)];
  while (allCards.length < SIBLING_GRID_SLOTS) allCards.push(null);
  const row1 = allCards.slice(0, SIBLING_GRID_COLS);
  const row2 = allCards.slice(SIBLING_GRID_COLS, SIBLING_GRID_SLOTS);

  return (
    <div style={{ width: W, height: H, background: SLIDE_BACKGROUNDS[4], display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ padding: "30px 56px 18px 56px", display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>
            PROPERTY PIPELINE
          </span>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 26, color: C.darkBg }}>
            H+ Portfolio Overview
          </span>
        </div>
        <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.sage }}>
          {allCards.filter(Boolean).length} properties · {property.name} highlighted
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `0 40px 48px 40px` }}>
        <div style={{ display: "flex", flexDirection: "row", flex: 1, marginBottom: CARD_GAP }}>
          {row1.map((card, i) => (
            <div key={i} style={{ display: "flex", flex: 1, marginRight: i < SIBLING_GRID_COLS - 1 ? CARD_GAP : 0 }}>
              <PortfolioCard prop={card} isCurrent={i === 0} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "row", flex: 1 }}>
          {row2.map((card, i) => (
            <div key={i + SIBLING_GRID_COLS} style={{ display: "flex", flex: 1, marginRight: i < SIBLING_GRID_COLS - 1 ? CARD_GAP : 0 }}>
              <PortfolioCard prop={card} />
            </div>
          ))}
        </div>
      </div>

      <GreenRule y={H - FOOTER_RULE_OFFSET} />
      <PageNumber n={4} />
    </div>
  );
}

// ── Slide 5 — Financial Snapshot ─────────────────────────────────────────
export function Slide5({ p }: { p: SlidePayload }) {
  const { property, financials, visionText, improvements } = p;
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
      <div style={{ padding: "32px 56px 20px 56px", display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>
            FINANCIAL SNAPSHOT
          </span>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 26, color: C.darkBg }}>
            The Transformation Plan — {property.name}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "row", padding: "0 40px 48px 40px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", marginRight: 32 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.darkBg, lineHeight: 1.6, marginBottom: 20 }}>
            {visionText.transformationDescription}
          </span>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {transformRows.map((row, ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "row", padding: "7px 0", borderBottom: ri < transformRows.length - 1 ? `1px solid ${C.canvasRule}` : "none", background: ri === 0 ? C.canvasHeader : ri % 2 === 0 ? C.canvasZebra : "transparent" }}>
                {row.map((cell, ci) => (
                  <span key={ci} style={{ flex: ci === 0 ? 0.8 : 1, fontFamily: FONT_SANS, fontSize: ri === 0 ? 10 : 12, color: C.darkBg, fontWeight: ri === 0 || ci === 0 ? 600 : 400, paddingLeft: 8 }}>
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: 380, display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.12em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>
            Snapshot of Stable Year ({stableLabel})
          </span>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
            {snapshotRows.map(([label, val], ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.canvasRule}` }}>
                <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.sage }}>{label}</span>
                <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.darkBg }}>{val}</span>
              </div>
            ))}
          </div>

          <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.12em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>
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
                <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.sage }}>{label}</span>
                <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.darkBg, fontWeight: ri === 2 ? 600 : 400 }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 20, padding: "12px 16px", background: "rgba(37,125,65,0.15)", borderLeft: `3px solid ${C.accent}` }}>
            <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.accent, marginBottom: 6, display: "block" }}>Key Investor Metrics*</span>
            <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.darkBg, display: "block", marginBottom: 3 }}>GOP Margin: {fmtPct(grossMargin)}</span>
            <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.darkBg, display: "block", marginBottom: 6 }}>EBITDA ({stableLabel}): {fmtPct(ebitdaPct)}</span>
            <span style={{ fontFamily: FONT_SANS, fontSize: 10, color: C.sage }}>* Projections for first full stabilized year</span>
          </div>
        </div>
      </div>

      <GreenRule y={H - FOOTER_RULE_OFFSET} />
      <PageNumber n={5} />
    </div>
  );
}

// ── Slide 6 — Income Statement ────────────────────────────────────────────
export function Slide6({ p }: { p: SlidePayload }) {
  const { property, financials } = p;
  const years = financials.yearlyIS.slice(0, PROFORMA_YEARS);
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

  return (
    <div style={{ width: W, height: H, background: SLIDE_BACKGROUNDS[6], display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ padding: "32px 56px 16px 56px", display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.3em", color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>
          5-YEAR CONSOLIDATED PRO FORMA INCOME STATEMENT
        </span>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 22, color: C.darkBg }}>
          {property.name}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "row", padding: "0 40px 48px 40px" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: 32 }}>
          <div style={{ display: "flex", flexDirection: "row", padding: "8px 0", background: C.darkBg, borderBottom: `1px solid ${C.accent}`, marginBottom: 4 }}>
            <span style={{ flex: 1.4, fontFamily: FONT_SANS, fontSize: 10, color: C.sage, paddingLeft: 8 }}>Item</span>
            {years.map((y, i) => (
              <span key={i} style={{ flex: 1, fontFamily: FONT_NUMERIC, fontSize: 11, fontVariantNumeric: "tabular-nums", color: C.cream, textAlign: "right", paddingRight: 8, letterSpacing: "0.04em" }}>Yr {i + 1}</span>
            ))}
          </div>
          {isRows.map(([label, vals], ri) => (
            <div key={ri} style={{ display: "flex", flexDirection: "row", padding: "6px 0", background: ri % 2 === 0 ? C.canvasZebra : "transparent", borderBottom: `1px solid ${C.canvasRule}` }}>
              <span style={{ flex: 1.4, fontFamily: FONT_SANS, fontSize: 11, color: C.darkBg, paddingLeft: 8, fontWeight: ri === 2 ? 600 : 400 }}>{label}</span>
              {(vals as string[]).map((v, vi) => (
                <span key={vi} style={{ flex: 1, fontFamily: FONT_NUMERIC, fontSize: 13, fontVariantNumeric: "tabular-nums", color: ri === 2 ? C.accent : C.darkBg, textAlign: "right", paddingRight: 8, fontWeight: ri === 2 ? 700 : 400 }}>{v}</span>
              ))}
            </div>
          ))}
        </div>

        <div style={{ width: 320, display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: "0.12em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>
            Key Investor Metrics
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {investorRows.map(([label, val], ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "8px 12px", background: ri % 2 === 0 ? C.canvasZebra : "transparent", borderBottom: `1px solid ${C.canvasRule}` }}>
                <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.sage }}>{label}</span>
                <span style={{ fontFamily: FONT_NUMERIC, fontSize: 15, fontVariantNumeric: "tabular-nums", color: C.darkBg, fontWeight: ri < 2 ? 700 : 400 }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: 24, padding: "12px 16px", background: "rgba(37,125,65,0.15)", borderLeft: `3px solid ${C.accent}` }}>
            <span style={{ fontFamily: FONT_SERIF, fontSize: 14, color: C.darkBg, fontStyle: "italic", lineHeight: 1.6 }}>
              5-year pro forma based on H+ Analytics projection engine.
              Projections are estimates; actual results may vary.
            </span>
          </div>
        </div>
      </div>

      <GreenRule y={H - FOOTER_RULE_OFFSET} />
      <PageNumber n={6} />
    </div>
  );
}
