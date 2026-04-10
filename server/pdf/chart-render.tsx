import React from "react";
import { Page, View, Text, Svg, Line, Circle, Path, G } from "@react-pdf/renderer";
import { type PdfTheme } from "./theme";
import type { LayoutHints } from "./design-pass";
import { PAGE_LANDSCAPE, PAGE_PORTRAIT, PageHeader, PageFooter } from "./theme-mappers";

export function fmtCompact(v: number): string {
  if (v === 0) return "$0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000).toLocaleString()}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function monotoneCubicPath(pts: Array<{ x: number; y: number }>): string {
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

export function ChartSvgBody({ series, years, theme, isLandscape, hints }: {
  series: Array<{ label: string; values: number[]; color: string }>;
  years: string[];
  theme: PdfTheme;
  isLandscape: boolean;
  hints: LayoutHints;
}) {
  const svgW = isLandscape ? 700 : 440;
  const svgH = isLandscape ? 260 : 300;
  const padL = 70, padR = 30, padT = 20, padB = 50;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const baselineY = padT + plotH;

  let globalMax = 1;
  for (const s of series) {
    for (const v of (s.values || [])) {
      if (typeof v === "number" && Math.abs(v) > globalMax) globalMax = Math.abs(v);
    }
  }
  globalMax *= 1.08;
  const gridN = 5;
  const legendItemWidth = isLandscape ? 150 : 110;

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", maxHeight: isLandscape ? 320 : 380 }}>
        {Array.from({ length: gridN + 1 }).map((_, g) => {
          const y = padT + (plotH / gridN) * g;
          const gVal = globalMax - (globalMax / gridN) * g;
          return (
            <G key={`grid-${g}`}>
              <Line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke={theme.border} strokeWidth={0.7} />
              <Text x={padL - 8} y={y + 3} style={{ fontSize: 8, textAnchor: "end" }} fill={theme.foreground}>{fmtCompact(gVal / 1.08)}</Text>
            </G>
          );
        })}

        <Line x1={padL} y1={padT + plotH} x2={svgW - padR} y2={padT + plotH} stroke={theme.foreground} strokeWidth={1} />
        <Line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={theme.foreground} strokeWidth={0.5} />

        {years.map((yr, i) => {
          const x = padL + (i / Math.max(years.length - 1, 1)) * plotW;
          const label = yr.length === 4 ? "'" + yr.slice(2) : yr;
          return <Text key={`xl-${i}`} x={x} y={padT + plotH + 16} style={{ fontSize: 8, textAnchor: "middle" }} fill={theme.foreground}>{label}</Text>;
        })}

        {series.map((s, si) => {
          const seriesColorList = hints.seriesColors.length > 0 ? hints.seriesColors : theme.chart;
          const color = s.color || seriesColorList[si % seriesColorList.length];
          const values: number[] = (s.values || []).map((v) => typeof v === "number" ? v : 0);
          if (values.length < 2) return null;
          const pts = values.map((v, i) => ({
            x: padL + (i / Math.max(values.length - 1, 1)) * plotW,
            y: padT + plotH - (v / globalMax) * plotH,
          }));
          const curvePath = monotoneCubicPath(pts);
          const firstPt = pts[0];
          const lastPt = pts[pts.length - 1];
          const fillPath = `${curvePath} L${lastPt.x.toFixed(1)},${baselineY} L${firstPt.x.toFixed(1)},${baselineY} Z`;
          return (
            <G key={`series-${si}`}>
              <Path d={fillPath} fill={color} fillOpacity={hints.chartAreaOpacity} stroke="none" />
              <Path d={curvePath} fill="none" stroke={color} strokeWidth={2} />
              {pts.map((p, pi) => (
                <G key={`dot-${pi}`}>
                  <Circle cx={p.x} cy={p.y} r={2.5} fill={theme.white} stroke={color} strokeWidth={1.5} />
                  <Circle cx={p.x} cy={p.y} r={1.2} fill={color} />
                </G>
              ))}
            </G>
          );
        })}

        {series.map((s, si) => {
          const seriesColorList = hints.seriesColors.length > 0 ? hints.seriesColors : theme.chart;
          const color = s.color || seriesColorList[si % seriesColorList.length];
          const legendX = svgW - padR - (series.length - si) * legendItemWidth;
          const legendY = padT + 10;
          return (
            <G key={`legend-${si}`}>
              <Line x1={legendX} y1={legendY} x2={legendX + 16} y2={legendY} stroke={color} strokeWidth={2} />
              <Circle cx={legendX + 8} cy={legendY} r={2} fill={theme.white} stroke={color} strokeWidth={1.2} />
              <Text x={legendX + 22} y={legendY + 3} style={{ fontSize: 8, fontWeight: 600 }} fill={theme.foreground}>{s.label || ""}</Text>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export function LineChart({ title, series, years, companyName, entityName, theme, isLandscape, hints }: {
  title: string;
  series: Array<{ label: string; values: number[]; color: string }>;
  years: string[];
  companyName: string;
  entityName: string;
  theme: PdfTheme;
  isLandscape: boolean;
  hints: LayoutHints;
}) {
  const pageSize: [number, number] = isLandscape ? PAGE_LANDSCAPE : PAGE_PORTRAIT;
  if (!series.length || !years.length) return null;

  return (
    <Page size={pageSize} style={{ paddingTop: 10, paddingHorizontal: isLandscape ? 60 : 50, paddingBottom: 30, backgroundColor: theme.white }}>
      <PageHeader title={title} companyName={companyName} entityName={entityName} theme={theme} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ChartSvgBody series={series} years={years} theme={theme} isLandscape={isLandscape} hints={hints} />
      </View>
      <PageFooter companyName={companyName} theme={theme} />
    </Page>
  );
}
