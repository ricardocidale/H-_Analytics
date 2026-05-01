import { BRAND } from "./routes/premium-export-prompts";

export interface ThemeColorMap {
  navy: string;
  sage: string;
  darkGreen: string;
  darkText: string;
  gray: string;
  altRow: string;
  sectionBg: string;
  white: string;
  lightGray: string;
  negativeRed: string;
  chart: string[];
  line: string[];
}

export interface PdfTemplateData {
  orientation: "landscape" | "portrait";
  companyName: string;
  entityName: string;
  sections: any[];
  reportTitle?: string;
  colors?: ThemeColorMap;
  densePagination?: boolean;
}

export function adjustHex(hex: string, amount: number): string {
  const h = hex.replace(/^#/, "");
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [clamp(r + amount), clamp(g + amount), clamp(b + amount)]
    .map(c => c.toString(16).padStart(2, "0")).join("");
}

export function resolveThemeColors(themeColors?: Array<{name: string; hexCode: string; rank?: number; description?: string}>): ThemeColorMap {
  const strip = (hex: string) => hex.replace(/^#/, "");

  if (!themeColors?.length) {
    return {
      navy: BRAND.PRIMARY_HEX, sage: BRAND.SECONDARY_HEX, darkGreen: BRAND.ACCENT_HEX,
      darkText: BRAND.FOREGROUND_HEX, gray: BRAND.BORDER_HEX,
      altRow: BRAND.SURFACE_HEX, sectionBg: BRAND.BACKGROUND_HEX,
      white: BRAND.WHITE_HEX, lightGray: BRAND.MUTED_HEX, negativeRed: BRAND.NEGATIVE_HEX,
      chart: [BRAND.ACCENT_HEX, BRAND.SECONDARY_HEX, BRAND.PRIMARY_HEX, BRAND.MUTED_HEX, BRAND.BORDER_HEX],
      line: [BRAND.ACCENT_HEX, BRAND.SECONDARY_HEX, BRAND.PRIMARY_HEX, BRAND.MUTED_HEX],
    };
  }

  const entries = themeColors.map(c => ({
    h: strip(c.hexCode),
    d: (c.description || "").toLowerCase(),
  }));

  const byDesc = (...keywords: string[]): string | undefined => {
    for (const c of entries) {
      if (keywords.some(k => c.d.includes(k))) return c.h;
    }
    return undefined;
  };

  const collectByPrefix = (prefix: string): string[] => {
    return entries
      .filter(c => c.d.startsWith(prefix))
      .sort((a, b) => {
        const ra = themeColors.find(t => strip(t.hexCode) === a.h)?.rank ?? 99;
        const rb = themeColors.find(t => strip(t.hexCode) === b.h)?.rank ?? 99;
        return ra - rb;
      })
      .map(c => c.h);
  };

  const accent   = byDesc("palette: accent", "accent:")        ?? BRAND.ACCENT_HEX;
  const border   = byDesc("palette: border")                   ?? BRAND.BORDER_HEX;
  const chartArr = collectByPrefix("chart:");
  const lineArr  = collectByPrefix("line:");
  const negRed   = byDesc("line: line 3", "destructive")       ?? (lineArr[2] || adjustHex(accent, -60));

  return {
    navy:       byDesc("palette: primary")                  ?? BRAND.PRIMARY_HEX,
    sage:       byDesc("palette: secondary")                ?? BRAND.SECONDARY_HEX,
    darkGreen:  accent,
    darkText:   byDesc("palette: foreground")               ?? BRAND.FOREGROUND_HEX,
    gray:       border,
    altRow:     byDesc("palette: muted")                    ?? BRAND.SURFACE_HEX,
    sectionBg:  byDesc("palette: background")               ?? BRAND.BACKGROUND_HEX,
    white:      byDesc("palette: background")               ?? BRAND.WHITE_HEX,
    lightGray:  chartArr[3] || adjustHex(border, 30),
    negativeRed: negRed,
    chart:      chartArr.length ? chartArr : [accent, byDesc("palette: secondary") ?? BRAND.SECONDARY_HEX, byDesc("palette: primary") ?? BRAND.PRIMARY_HEX, adjustHex(border, 30), border],
    line:       lineArr.length ? [accent, ...lineArr] : [accent, byDesc("palette: secondary") ?? BRAND.SECONDARY_HEX, byDesc("palette: primary") ?? BRAND.PRIMARY_HEX, adjustHex(border, 30)],
  };
}

export function esc(str: string): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function fmtCompact(v: number): string {
  if (v === 0) return "$0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000).toLocaleString()}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function pageHeader(title: string, d: PdfTemplateData): string {
  return `
    <div class="page-hdr">
      <div class="page-hdr-bar">
        <div class="page-hdr-left">
          <h2 class="page-hdr-title">${esc(title)}</h2>
          <span class="page-hdr-sub">${esc(d.companyName)} \u2014 ${esc(d.entityName)}</span>
        </div>
        <span class="page-hdr-brand">${esc(d.companyName)}</span>
      </div>
    </div>`;
}
