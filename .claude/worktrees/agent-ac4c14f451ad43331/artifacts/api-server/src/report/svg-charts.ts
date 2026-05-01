import type { ChartSeries, DesignTokens } from "./types";

function fmtCompact(v: number): string {
  if (v === 0) return "$0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000).toLocaleString()}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function monotoneCubicPath(pts: Array<{ x: number; y: number }>): string {
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
    if (m[i - 1] * m[i] <= 0) alpha.push(0);
    else alpha.push(3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  }
  alpha.push(m[n - 2]);
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const t = dx[i] / 3;
    d += `C${(pts[i].x + t).toFixed(1)},${(pts[i].y + alpha[i] * t).toFixed(1)} ${(pts[i + 1].x - t).toFixed(1)},${(pts[i + 1].y - alpha[i + 1] * t).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderChartSvg(
  series: ChartSeries[],
  years: string[],
  tokens: DesignTokens,
  opts?: { width?: number; height?: number },
): string {
  if (!series.length || !years.length) return "";

  const svgW = opts?.width ?? 700;
  const svgH = opts?.height ?? 260;
  const padL = 70, padR = 30, padT = 20, padB = 50;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  let globalMax = 1;
  for (const s of series) {
    for (const v of s.values) {
      if (typeof v === "number" && Math.abs(v) > globalMax) globalMax = Math.abs(v);
    }
  }
  globalMax *= 1.08;
  const gridN = 5;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);

  for (let g = 0; g <= gridN; g++) {
    const y = padT + (plotH / gridN) * g;
    const gVal = globalMax - (globalMax / gridN) * g;
    parts.push(`<line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="${tokens.border}" stroke-width="0.7"/>`);
    parts.push(`<text x="${padL - 8}" y="${y + 3}" font-size="8" text-anchor="end" fill="${tokens.border}">${esc(fmtCompact(gVal / 1.08))}</text>`);
  }

  parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${svgW - padR}" y2="${padT + plotH}" stroke="${tokens.border}" stroke-width="1"/>`);
  parts.push(`<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="${tokens.border}" stroke-width="0.5"/>`);

  for (let i = 0; i < years.length; i++) {
    const x = padL + (i / Math.max(years.length - 1, 1)) * plotW;
    const label = years[i].length === 4 ? "'" + years[i].slice(2) : years[i];
    parts.push(`<text x="${x}" y="${padT + plotH + 16}" font-size="8" text-anchor="middle" fill="${tokens.border}">${esc(label)}</text>`);
  }

  for (let si = 0; si < series.length; si++) {
    const s = series[si];
    const color = s.color || tokens.chart[si % tokens.chart.length];
    const values = s.values.map(v => typeof v === "number" ? v : 0);
    if (values.length < 2) continue;
    const pts = values.map((v, i) => ({
      x: padL + (i / Math.max(values.length - 1, 1)) * plotW,
      y: padT + plotH - (v / globalMax) * plotH,
    }));
    const curvePath = monotoneCubicPath(pts);
    parts.push(`<path d="${curvePath}" fill="none" stroke="${color}" stroke-width="1.5"/>`);
    for (const p of pts) {
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#ffffff" stroke="${color}" stroke-width="1.5"/>`);
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="1.2" fill="${color}"/>`);
    }
  }

  for (let si = 0; si < series.length; si++) {
    const s = series[si];
    const color = s.color || tokens.chart[si % tokens.chart.length];
    const xOff = si * 160;
    const legendY = svgH - 10;
    parts.push(`<line x1="${padL + xOff}" y1="${legendY}" x2="${padL + xOff + 16}" y2="${legendY}" stroke="${color}" stroke-width="1.5"/>`);
    parts.push(`<circle cx="${padL + xOff + 8}" cy="${legendY}" r="2" fill="#ffffff" stroke="${color}" stroke-width="1.2"/>`);
    parts.push(`<text x="${padL + xOff + 22}" y="${legendY + 3}" font-size="8" font-weight="600" fill="${tokens.foreground}">${esc(s.label || "")}</text>`);
  }

  parts.push("</svg>");
  return parts.join("\n");
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function renderSeasonalityBarSvg(
  profile: number[],
  tokens: DesignTokens,
  opts?: { width?: number; height?: number },
): string {
  if (!profile || profile.length !== 12) return "";

  const svgW = opts?.width ?? 600;
  const svgH = opts?.height ?? 220;
  const padL = 50, padR = 20, padT = 20, padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const maxVal = Math.max(...profile) * 1.15;
  const minVal = Math.min(0, Math.min(...profile));
  const range = maxVal - minVal || 1;
  const barW = plotW / 12 - 4;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);

  const baseline = 1.0;
  const baselineY = padT + plotH - ((baseline - minVal) / range) * plotH;
  parts.push(`<line x1="${padL}" y1="${baselineY}" x2="${svgW - padR}" y2="${baselineY}" stroke="${tokens.border}" stroke-width="0.8" stroke-dasharray="4,3"/>`);
  parts.push(`<text x="${padL - 6}" y="${baselineY + 3}" font-size="8" text-anchor="end" fill="${tokens.border}">1.0×</text>`);

  parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${svgW - padR}" y2="${padT + plotH}" stroke="${tokens.border}" stroke-width="1"/>`);
  parts.push(`<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="${tokens.border}" stroke-width="0.5"/>`);

  for (let i = 0; i < 12; i++) {
    const x = padL + (i / 12) * plotW + 2;
    const val = profile[i];
    const barH = ((val - minVal) / range) * plotH;
    const y = padT + plotH - barH;
    const color = val >= baseline ? tokens.chart[0] : tokens.chart[1] || tokens.border;

    parts.push(`<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2" opacity="0.85"/>`);
    parts.push(`<text x="${x + barW / 2}" y="${y - 4}" font-size="7" text-anchor="middle" fill="${tokens.foreground}" font-weight="600">${val.toFixed(2)}×</text>`);
    parts.push(`<text x="${x + barW / 2}" y="${padT + plotH + 14}" font-size="8" text-anchor="middle" fill="${tokens.border}">${esc(MONTH_LABELS[i])}</text>`);
  }

  parts.push("</svg>");
  return parts.join("\n");
}
