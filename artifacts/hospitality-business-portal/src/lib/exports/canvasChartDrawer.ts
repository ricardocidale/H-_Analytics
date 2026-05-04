/**
 * canvasChartDrawer.ts — Off-screen canvas area-chart renderer for exports
 *
 * Produces a PNG data-URL that can be embedded directly into jsPDF (via
 * doc.addImage) or pptxgenjs (via slide.addImage).  Styling deliberately
 * mirrors the Recharts AreaChart used by ExitScenariosSection.tsx:
 *   - Smooth cubic-bezier curves (Catmull-Rom approximation)
 *   - Vertical gradient area fill under each series
 *   - Cartesian grid lines (horizontal, dashed)
 *   - Labelled X and Y axes
 *   - Bottom legend with color swatch + series name
 */

export interface CanvasChartSeries {
  name: string;
  values: number[];
  color: string;
}

export interface CanvasAreaChartOptions {
  title: string;
  labels: string[];
  series: CanvasChartSeries[];
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
  backgroundColor?: string;
  plotBgColor?: string;
  gridColor?: string;
  textColor?: string;
  mutedColor?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function renderAreaChartToDataUrl(opts: CanvasAreaChartOptions): string {
  const W = opts.width ?? 400;
  const H = opts.height ?? 540;
  const DPR = 2;

  const canvas = document.createElement("canvas");
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);

  const bg = opts.backgroundColor ?? "#ffffff";
  const plotBg = opts.plotBgColor ?? "#fafafa";
  const gridColor = opts.gridColor ?? "#e4e4e7";
  const textColor = opts.textColor ?? "#18181b";
  const mutedColor = opts.mutedColor ?? "#a1a1aa";
  const fmt = opts.formatValue ?? ((v: number) => `$${(v / 1_000_000).toFixed(1)}M`);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const titleH = 22;
  const padL = 56;
  const padR = 10;
  const padTop = titleH + 6;
  const legendH = 20;
  const padBottom = 26 + legendH;

  const plotX = padL;
  const plotY = padTop;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;

  ctx.fillStyle = textColor;
  ctx.font = "bold 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(opts.title, W / 2, 4);

  ctx.fillStyle = plotBg;
  ctx.fillRect(plotX, plotY, plotW, plotH);

  let minVal = Infinity;
  let maxVal = -Infinity;
  opts.series.forEach(s => s.values.forEach(v => {
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }));
  const span = maxVal - minVal || 1;
  minVal = Math.max(0, minVal - span * 0.05);
  maxVal = maxVal + span * 0.05;

  const toY = (v: number) => plotY + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;
  const toX = (i: number) => plotX + (i / Math.max(opts.labels.length - 1, 1)) * plotW;

  const GRID_LINES = 5;
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 0.5;
  for (let gi = 0; gi <= GRID_LINES; gi++) {
    const gy = plotY + plotH - (gi / GRID_LINES) * plotH;
    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();

    const val = minVal + (gi / GRID_LINES) * (maxVal - minVal);
    ctx.fillStyle = mutedColor;
    ctx.font = "8px Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fmt(val), plotX - 3, gy);
  }
  ctx.restore();

  ctx.fillStyle = mutedColor;
  ctx.font = "8px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  opts.labels.forEach((lbl, i) => {
    ctx.fillText(lbl, toX(i), plotY + plotH + 4);
  });

  opts.series.forEach(s => {
    if (s.values.length < 2) return;
    const [r, g, b] = hexToRgb(s.color);

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(s.values[0]));
    for (let i = 1; i < s.values.length; i++) {
      const x0 = toX(i - 1);
      const y0 = toY(s.values[i - 1]);
      const x1 = toX(i);
      const y1 = toY(s.values[i]);
      const cpx = (x0 + x1) / 2;
      ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
    }
    ctx.lineTo(toX(s.values.length - 1), plotY + plotH);
    ctx.lineTo(plotX, plotY + plotH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
    grad.addColorStop(0.05, `rgba(${r},${g},${b},0.40)`);
    grad.addColorStop(0.95, `rgba(${r},${g},${b},0.00)`);
    ctx.fillStyle = grad;
    ctx.fill();
  });

  opts.series.forEach(s => {
    if (s.values.length < 2) return;
    const [r, g, b] = hexToRgb(s.color);

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(s.values[0]));
    for (let i = 1; i < s.values.length; i++) {
      const x0 = toX(i - 1);
      const y0 = toY(s.values[i - 1]);
      const x1 = toX(i);
      const y1 = toY(s.values[i]);
      const cpx = (x0 + x1) / 2;
      ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
    }
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(plotX, plotY, plotW, plotH);

  const legY = H - legendH + 4;
  ctx.font = "8px Arial, sans-serif";
  ctx.textBaseline = "middle";
  const itemWidths = opts.series.map(s => {
    ctx.font = "8px Arial, sans-serif";
    return ctx.measureText(s.name).width + 18;
  });
  const totalLegW = itemWidths.reduce((acc, w) => acc + w, 0);
  let legX = (W - totalLegW) / 2;

  opts.series.forEach((s, idx) => {
    const [r, g, b] = hexToRgb(s.color);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(legX, legY - 3, 12, 6);
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.fillText(s.name, legX + 14, legY);
    legX += itemWidths[idx];
  });

  return canvas.toDataURL("image/png");
}
