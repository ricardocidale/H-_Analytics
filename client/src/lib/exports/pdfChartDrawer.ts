/**
 * pdfChartDrawer.ts — High-fidelity line charts for jsPDF documents
 *
 * Renders charts that closely match the on-screen Recharts appearance:
 *   - Catmull-Rom smooth bezier curves (not straight segments)
 *   - Gradient-style area fill under each line (light tint of series colour)
 *   - Large data-point markers: white outer ring + filled inner circle
 *   - Plot-area background with alternating band shading
 *   - Legend rendered as a short line segment + marker + label
 *   - Card background with drop-shadow simulation and rounded corners
 *
 * All structural colors derive from the active theme via BrandPalette.
 */

import type { BrandPalette } from "./exportStyles";

interface ChartData {
  label: string;
  value: number;
}

interface ChartSeries {
  name: string;
  data: ChartData[];
  color: string;
}

interface DrawChartOptions {
  doc: any;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  series: ChartSeries[];
  formatValue?: (value: number) => string;
  brand?: BrandPalette;
}

interface Point {
  x: number;
  y: number;
}

type RGB = [number, number, number];

function blendRgb(base: RGB, target: RGB, factor: number): RGB {
  return [
    Math.round(base[0] + (target[0] - base[0]) * factor),
    Math.round(base[1] + (target[1] - base[1]) * factor),
    Math.round(base[2] + (target[2] - base[2]) * factor),
  ];
}

const FALLBACK_BRAND: Pick<BrandPalette,
  "FOREGROUND_RGB" | "BORDER_RGB" | "MUTED_RGB" | "WHITE_RGB" |
  "BACKGROUND_RGB" | "SURFACE_RGB"
> = {
  FOREGROUND_RGB: [24, 24, 27],
  BORDER_RGB: [228, 228, 231],
  MUTED_RGB: [161, 161, 170],
  WHITE_RGB: [255, 255, 255],
  BACKGROUND_RGB: [255, 255, 255],
  SURFACE_RGB: [244, 244, 245],
};

export function drawLineChart(options: DrawChartOptions): void {
  const {
    doc: docAny,
    x, y, width, height,
    title, series,
    formatValue = (v) => `$${(v / 1_000_000).toFixed(1)}M`,
    brand: b,
  } = options;
  const doc = docAny;

  const FOREGROUND: RGB = b?.FOREGROUND_RGB ?? FALLBACK_BRAND.FOREGROUND_RGB;
  const BORDER: RGB = b?.BORDER_RGB ?? FALLBACK_BRAND.BORDER_RGB;
  const MUTED: RGB = b?.MUTED_RGB ?? FALLBACK_BRAND.MUTED_RGB;
  const WHITE: RGB = b?.WHITE_RGB ?? FALLBACK_BRAND.WHITE_RGB;
  const BACKGROUND: RGB = b?.BACKGROUND_RGB ?? FALLBACK_BRAND.BACKGROUND_RGB;
  const SURFACE: RGB = b?.SURFACE_RGB ?? FALLBACK_BRAND.SURFACE_RGB;

  const SHADOW: RGB = blendRgb(BORDER, FOREGROUND, 0.15);
  const PLOT_BG: RGB = blendRgb(BACKGROUND, SURFACE, 0.3);
  const BAND_EVEN: RGB = blendRgb(BACKGROUND, SURFACE, 0.6);
  const BAND_ODD: RGB = blendRgb(BACKGROUND, SURFACE, 0.25);
  const LEGEND_TEXT: RGB = blendRgb(FOREGROUND, BORDER, 0.15);

  doc.setFillColor(...SHADOW);
  doc.roundedRect(x + 0.6, y + 0.6, width, height, 2, 2, "F");

  doc.setFillColor(...WHITE);
  doc.roundedRect(x, y, width, height, 2, 2, "F");

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.15);
  doc.roundedRect(x, y, width, height, 2, 2, "S");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...FOREGROUND);
  doc.text(title, x + width / 2, y + 9, { align: "center" });

  const legendH   = 14;
  const xAxisH    = 11;
  const yAxisW    = 34;
  const topPad    = 16;
  const rightPad  = 8;

  const cX = x + yAxisW;
  const cY = y + topPad;
  const cW = width  - yAxisW - rightPad;
  const cH = height - topPad - xAxisH - legendH;

  doc.setFillColor(...PLOT_BG);
  doc.rect(cX, cY, cW, cH, "F");

  let minVal =  Infinity;
  let maxVal = -Infinity;
  series.forEach(s => s.data.forEach(d => {
    if (d.value < minVal) minVal = d.value;
    if (d.value > maxVal) maxVal = d.value;
  }));
  const range = maxVal - minVal || 1;
  minVal = Math.max(0, minVal - range * 0.05);
  maxVal = maxVal + range * 0.05;

  const toY = (val: number) =>
    cY + cH - ((val - minVal) / (maxVal - minVal)) * cH;

  const toX = (i: number, total: number) =>
    cX + (i / Math.max(total - 1, 1)) * cW;

  const gridCount = 5;
  for (let i = 0; i <= gridCount; i++) {
    const gy   = cY + cH - (i / gridCount) * cH;
    const band = cH / gridCount;

    if (i < gridCount) {
      const shade = i % 2 === 0 ? BAND_EVEN : BAND_ODD;
      doc.setFillColor(shade[0], shade[1], shade[2]);
      doc.rect(cX, gy - band, cW, band, "F");
    }

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.12);
    doc.setLineDashPattern(i === 0 ? [] : [1.5, 1.5], 0);
    doc.line(cX, gy, cX + cW, gy);

    const val = minVal + (i / gridCount) * (maxVal - minVal);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(formatValue(val), cX - 2, gy + 1.5, { align: "right" });
  }
  doc.setLineDashPattern([], 0);

  if (series.length > 0 && series[0].data.length > 0) {
    const n = series[0].data.length;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    series[0].data.forEach((d, i) => {
      doc.text(String(d.label), toX(i, n), cY + cH + 6, { align: "center" });
    });
  }

  const buildBezierSegments = (pts: Point[]): number[][] => {
    const segs: number[][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      const tension = 0.18;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      segs.push([
        cp1x - p1.x, cp1y - p1.y,
        cp2x - p1.x, cp2y - p1.y,
        p2.x  - p1.x, p2.y  - p1.y,
      ]);
    }
    return segs;
  };

  series.forEach(s => {
    if (s.data.length < 2) return;
    const [r, g, b2] = hexToRgb(s.color);

    const n    = s.data.length;
    const pts  = s.data.map((d, i) => ({ x: toX(i, n), y: toY(d.value) }));
    const baseY = cY + cH;

    const lr = Math.round(r + (255 - r) * 0.88);
    const lg = Math.round(g + (255 - g) * 0.88);
    const lb = Math.round(b2 + (255 - b2) * 0.88);
    doc.setFillColor(lr, lg, lb);
    doc.setDrawColor(lr, lg, lb);

    const segments: number[][] = [];
    segments.push([0, -(baseY - pts[0].y)]);
    segments.push(...buildBezierSegments(pts));
    segments.push([0, baseY - pts[n - 1].y]);
    segments.push([pts[0].x - pts[n - 1].x, 0]);

    doc.lines(segments, pts[0].x, baseY, [1, 1], "F", true);
  });

  series.forEach(s => {
    if (s.data.length < 2) return;
    const [r, g, b2] = hexToRgb(s.color);

    const n   = s.data.length;
    const pts = s.data.map((d, i) => ({ x: toX(i, n), y: toY(d.value) }));

    doc.setDrawColor(r, g, b2);
    doc.setLineWidth(1.4);

    doc.lines(buildBezierSegments(pts), pts[0].x, pts[0].y, [1, 1], "S", false);

    pts.forEach(p => {
      doc.setFillColor(...WHITE);
      doc.setDrawColor(r, g, b2);
      doc.setLineWidth(0.6);
      doc.circle(p.x, p.y, 2.4, "FD");

      doc.setFillColor(r, g, b2);
      doc.circle(p.x, p.y, 1.3, "F");
    });
  });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.15);
  doc.rect(cX, cY, cW, cH, "S");

  const legY = y + height - 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");

  const itemWidths = series.map(s => {
    const tw = doc.getTextWidth(s.name) * (7 / doc.getFontSize());
    return tw + 17;
  });
  const totalLegW = itemWidths.reduce((a, b2) => a + b2, 0) - 2;
  let legX = x + (width - totalLegW) / 2;

  series.forEach((s, idx) => {
    const [r, g, b2] = hexToRgb(s.color);

    doc.setDrawColor(r, g, b2);
    doc.setLineWidth(1.4);
    doc.line(legX, legY, legX + 9, legY);

    doc.setFillColor(...WHITE);
    doc.setDrawColor(r, g, b2);
    doc.setLineWidth(0.6);
    doc.circle(legX + 4.5, legY, 2.0, "FD");
    doc.setFillColor(r, g, b2);
    doc.circle(legX + 4.5, legY, 1.1, "F");

    doc.setTextColor(...LEGEND_TEXT);
    doc.text(s.name, legX + 11, legY + 0.9);

    legX += itemWidths[idx];
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [0, 0, 0];
}
