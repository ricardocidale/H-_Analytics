import { BRAND } from "./routes/premium-export-prompts";
import type { ThemeColorMap, PdfTemplateData } from "./theme-resolver";
import { adjustHex, esc, fmtCompact, pageHeader } from "./theme-resolver";
import { CHART_HEADROOM_FACTOR } from "./constants";

export function buildChartPalette(colors?: ThemeColorMap): string[] {
  if (colors?.chart?.length) {
    const base = colors.chart.map(c => `#${c}`);
    while (base.length < 7) base.push(`#${adjustHex(colors.chart[base.length % colors.chart.length], 40)}`);
    return base;
  }
  const dk = colors?.darkGreen || BRAND.ACCENT_HEX;
  const sg = colors?.sage || BRAND.SECONDARY_HEX;
  const nv = colors?.navy || BRAND.PRIMARY_HEX;
  return [
    `#${dk}`, `#${sg}`, `#${nv}`,
    `#${adjustHex(dk, 30)}`, `#${adjustHex(sg, 30)}`,
    `#${adjustHex(dk, 50)}`, `#${adjustHex(nv, 40)}`,
  ];
}

export function monotoneCubicPath(pts: Array<{x: number; y: number}>): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`;

  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dy[i] / dx[i]);
  }

  const alpha: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      alpha.push(0);
    } else {
      alpha.push(3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
    }
  }
  alpha.push(m[n - 2]);

  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const t = dx[i] / 3;
    const cp1x = pts[i].x + t;
    const cp1y = pts[i].y + alpha[i] * t;
    const cp2x = pts[i + 1].x - t;
    const cp2y = pts[i + 1].y - alpha[i + 1] * t;
    d += `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

interface LineSeries {
  label?: string;
  values?: (number | null | undefined)[];
  color?: string;
}

interface LineChartSection {
  title?: string;
  content?: { series?: LineSeries[]; years?: string[] };
}

export function renderLineChartSection(section: LineChartSection, d: PdfTemplateData): string {
  const series: LineSeries[] = section.content?.series || [];
  const years: string[] = section.content?.years || [];
  if (!series.length || !years.length) return "";
  const isL = d.orientation === "landscape";

  const svgW = isL ? 700 : 440;
  const svgH = isL ? 195 : 240;
  const padL = 70, padR = 30, padT = 20, padB = 38;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  let globalMax = 1;
  for (const s of series) {
    for (const v of (s.values || [])) {
      if (typeof v === "number" && Math.abs(v) > globalMax) globalMax = Math.abs(v);
    }
  }
  globalMax *= CHART_HEADROOM_FACTOR;

  const chartGrid = d.colors?.gray || BRAND.BORDER_HEX;
  const chartLabel = d.colors?.lightGray || BRAND.MUTED_HEX;
  const chartText = d.colors?.darkText || BRAND.FOREGROUND_HEX;

  const gridN = 5;
  let gridSvg = "";
  for (let g = 0; g <= gridN; g++) {
    const y = padT + (plotH / gridN) * g;
    const gVal = globalMax - (globalMax / gridN) * g;
    gridSvg += `<line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="#${chartGrid}" stroke-width="0.7"/>`;
    gridSvg += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="#${chartLabel}" font-size="9" font-weight="500" font-family="Helvetica,Arial,sans-serif">${fmtCompact(gVal / CHART_HEADROOM_FACTOR)}</text>`;
  }

  let xLabels = "";
  const n = years.length;
  years.forEach((yr, i) => {
    const x = padL + (i / Math.max(n - 1, 1)) * plotW;
    const label = yr.length === 4 ? "'" + yr.slice(2) : yr;
    xLabels += `<text x="${x}" y="${padT + plotH + 18}" text-anchor="middle" fill="#${chartLabel}" font-size="9" font-weight="500" font-family="Helvetica,Arial,sans-serif">${label}</text>`;
  });

  const palette = buildChartPalette(d.colors);

  let defsSvg = "";
  series.forEach((s, si) => {
    const color = s.color || palette[si % palette.length];
    const gradId = `area-grad-${si}`;
    defsSvg += `
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.01"/>
      </linearGradient>`;
  });

  let seriesSvg = "";
  series.forEach((s, si) => {
    const color = s.color || palette[si % palette.length];
    const values: number[] = (s.values || []).map((v) => typeof v === "number" ? v : 0);
    if (values.length < 2) return;

    const pts = values.map((v, i) => ({
      x: padL + (i / Math.max(values.length - 1, 1)) * plotW,
      y: padT + plotH - (v / globalMax) * plotH,
    }));

    const curvePath = monotoneCubicPath(pts);

    const baseY = padT + plotH;
    const areaPath = `${curvePath}L${pts[pts.length - 1].x.toFixed(1)},${baseY}L${pts[0].x.toFixed(1)},${baseY}Z`;
    seriesSvg += `<path d="${areaPath}" fill="url(#area-grad-${si})" stroke="none"/>`;

    seriesSvg += `<path d="${curvePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;

    pts.forEach((p) => {
      seriesSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#fff" stroke="${color}" stroke-width="1.5"/>`;
      seriesSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.2" fill="${color}" stroke="none"/>`;
    });
  });

  const legendY = svgH - 6;
  const legendSpacing = isL ? 170 : 135;
  const legendItems = series.map((s, si) => {
    const color = s.color || palette[si % palette.length];
    const xOff = si * legendSpacing;
    return `
      <line x1="${padL + xOff}" y1="${legendY}" x2="${padL + xOff + 16}" y2="${legendY}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="${padL + xOff + 8}" cy="${legendY}" r="2" fill="#fff" stroke="${color}" stroke-width="1.2"/>
      <text x="${padL + xOff + 22}" y="${legendY + 3.5}" fill="#${chartText}" font-size="9" font-weight="600" font-family="Helvetica,Arial,sans-serif">${esc(s.label || "")}</text>`;
  }).join("");

  return `
    <div class="content-page">
      ${pageHeader(esc(section.title || "Performance Trends"), d)}
      <div class="line-chart-container">
        <svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet" class="line-chart-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>${defsSvg}</defs>
          ${gridSvg}
          <line x1="${padL}" y1="${padT + plotH}" x2="${svgW - padR}" y2="${padT + plotH}" stroke="#${chartLabel}" stroke-width="1"/>
          <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#${chartGrid}" stroke-width="0.5"/>
          ${xLabels}
          ${seriesSvg}
          ${legendItems}
        </svg>
      </div>
    </div>`;
}
