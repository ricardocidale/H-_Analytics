/**
 * helpers.tsx — Shared formatters and sub-components used across the six
 * investor deck slides.
 */
import React from "react";
import { C, FONT_SANS, FONT_SERIF } from "./theme";
import type { SlidePhoto, SlideProperty, YearlyIS } from "./types";

const ONE_MILLION = 1_000_000;
const ONE_THOUSAND = 1_000;
const PCT_SCALE = 100;
const STABLE_YEAR_INDEX_FALLBACK = 2;
const STABLE_OPERATIONAL_MONTHS_REQUIRED = 12;

export function fmtCurrency(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  const v = Math.round(n);
  if (Math.abs(v) >= ONE_MILLION) return `$${(v / ONE_MILLION).toFixed(1)}M`;
  if (Math.abs(v) >= ONE_THOUSAND) return `$${(v / ONE_THOUSAND).toFixed(0)}K`;
  return `$${v}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * PCT_SCALE)}%`;
}

function detectMime(b64: string): string {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  if (b64.startsWith("R0lG")) return "image/gif";
  return "image/jpeg";
}

export function photoSrc(photo: SlidePhoto | undefined): string | null {
  if (!photo) return null;
  if (photo.base64 && photo.base64.length > 0) {
    if (photo.base64.startsWith("data:")) return photo.base64;
    return `data:${detectMime(photo.base64)};base64,${photo.base64}`;
  }
  if (photo.url && photo.url.length > 0) return photo.url;
  return null;
}

export function getStableYear(yearlyIS: YearlyIS[]): YearlyIS | undefined {
  return (
    yearlyIS.find(y => y.operationalMonthsInYear >= STABLE_OPERATIONAL_MONTHS_REQUIRED && y.revenueTotal > 0) ??
    yearlyIS[STABLE_YEAR_INDEX_FALLBACK] ??
    yearlyIS[0]
  );
}

export function typeLabel(p: SlideProperty): string {
  const m = ((p.hospitalityType ?? "") + (p.businessModel ?? "")).toLowerCase();
  if (m.includes("retreat")) return "Retreat Center";
  if (m.includes("vrbo") || m.includes("vacation")) return "Luxury Vacation Rental";
  if (m.includes("boutique") || m.includes("hotel")) return "Boutique Hotel";
  if (m.includes("bnb")) return "Bed & Breakfast";
  if (m.includes("motel")) return "Boutique Motel";
  if (m.includes("resort")) return "Boutique Resort";
  return "Hospitality Property";
}

export function statusLabel(s: string): string {
  const MAP: Record<string, string> = {
    active: "Acquisition Target",
    pipeline: "Pipeline",
    closed: "Acquired",
    operating: "Operating",
    disposed: "Disposed",
  };
  return MAP[s.toLowerCase()] ?? "Pipeline";
}

export function statusBadgeLabel(s?: string): string {
  return statusLabel(s ?? "pipeline");
}

export function PhotoBg({ photo, style }: { photo: SlidePhoto | undefined; style?: React.CSSProperties }) {
  const src = photoSrc(photo);
  return (
    <div style={{ display: "flex", position: "absolute", inset: 0, overflow: "hidden", ...style }}>
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: C.darkBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 48, color: C.sage, letterSpacing: "0.3em" }}>L+B</span>
        </div>
      )}
    </div>
  );
}

export function LbBadge({ x = 48, y = 40 }: { x?: number; y?: number }) {
  return (
    <div style={{ position: "absolute", top: y, left: x, display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 400, letterSpacing: "0.35em", color: C.accent, textTransform: "uppercase" }}>
        L+B ANALYTICS
      </span>
    </div>
  );
}

export function PageNumber({ n }: { n: number }) {
  return (
    <div style={{ position: "absolute", bottom: 28, right: 48, display: "flex", alignItems: "center" }}>
      <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.sage, letterSpacing: "0.12em" }}>
        PAGE {n}
      </span>
    </div>
  );
}

export function GreenRule({ y }: { y: number }) {
  return (
    <div style={{ position: "absolute", top: y, left: 0, right: 0, height: 2, background: C.accent, opacity: 0.45 }} />
  );
}
