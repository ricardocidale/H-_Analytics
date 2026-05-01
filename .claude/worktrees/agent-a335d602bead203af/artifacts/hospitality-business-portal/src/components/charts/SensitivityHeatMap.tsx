import { useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { select } from "d3-selection";
import { min, max, range } from "d3-array";
import { scaleLinear, scaleDiverging } from "d3-scale";
import { hsl } from "d3-color";
import { interpolateRgbBasis } from "d3-interpolate";
import D3ChartContainer, { type D3ChartContainerRef } from "./D3ChartContainer";
import { CHART_COLORS } from "../graphics/formatters";
import { getComputedThemeColor } from "@/lib/theme-utils";

export interface HeatMapCell {
  row: number;
  col: number;
  rowLabel: string;
  colLabel: string;
  value: number;
  passes: boolean;
}

export interface SensitivityHeatMapRef {
  toCanvas: () => Promise<HTMLCanvasElement>;
}

interface SensitivityHeatMapProps {
  cells: HeatMapCell[];
  rowLabels: string[];
  colLabels: string[];
  rowAxisLabel?: string;
  colAxisLabel?: string;
  valueLabel?: string;
  breakeven?: number;
  valueFormat?: (v: number) => string;
  className?: string;
}

const SensitivityHeatMap = forwardRef<SensitivityHeatMapRef, SensitivityHeatMapProps>(
  (
    {
      cells,
      rowLabels,
      colLabels,
      rowAxisLabel = "Rate Shock (bps)",
      colAxisLabel = "NOI Shock (%)",
      valueLabel = "DSCR",
      breakeven = 1.25,
      valueFormat = (v) => v.toFixed(2),
      className = "",
    },
    ref
  ) => {
    const containerRef = useRef<D3ChartContainerRef>(null);

    useImperativeHandle(ref, () => ({
      toCanvas: () => containerRef.current!.toCanvas(),
    }));

    const renderChart = useCallback(
      (svg: SVGSVGElement, width: number, height: number) => {
        const d3svg = select(svg);
        d3svg.selectAll("*").remove();
        if (!cells.length) return;

        const margin = { top: 50, right: 30, bottom: 60, left: 80 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const g = d3svg
          .append("g")
          .attr("transform", `translate(${margin.left},${margin.top})`);

        const nCols = colLabels.length;
        const nRows = rowLabels.length;

        const cellW = innerW / nCols;
        const cellH = innerH / nRows;

        const values = cells.map((c) => c.value);
        const minVal = min(values) ?? 0;
        const maxVal = max(values) ?? 2;

        const colorScale = scaleDiverging<string>()
          .domain([minVal, breakeven, maxVal])
          .interpolator(interpolateRgbBasis([
            getComputedThemeColor("--destructive"),
            getComputedThemeColor("--warning"),
            getComputedThemeColor("--success"),
          ]));

        const tooltip = select(svg.parentElement!)
          .selectAll(".heatmap-tooltip")
          .data([null])
          .join("div")
          .attr("class", "heatmap-tooltip")
          .style("position", "absolute")
          .style("pointer-events", "none")
          .style("opacity", "0")
          .style("background", CHART_COLORS.tooltipBg)
          .style("color", CHART_COLORS.tooltipText)
          .style("border-radius", "8px")
          .style("padding", "8px 12px")
          .style("font-size", "12px")
          .style("z-index", "10")
          .style("white-space", "nowrap");

        g.selectAll(".cell")
          .data(cells)
          .join("rect")
          .attr("class", "cell")
          .attr("x", (d) => d.col * cellW)
          .attr("y", (d) => d.row * cellH)
          .attr("width", cellW - 1)
          .attr("height", cellH - 1)
          .attr("rx", 3)
          .attr("fill", (d) => colorScale(d.value))
          .style("cursor", "pointer")
          .on("mouseenter", function (event, d) {
            select(this).attr("stroke", CHART_COLORS.tooltipText).attr("stroke-width", 2);
            tooltip
              .style("opacity", "1")
              .html(
                `<strong>${valueLabel}: ${valueFormat(d.value)}</strong><br/>${rowAxisLabel}: ${d.rowLabel}<br/>${colAxisLabel}: ${d.colLabel}<br/>${d.passes ? "✓ Pass" : "✗ Fail"}`
              );
          })
          .on("mousemove", function (event) {
            const rect = svg.parentElement!.getBoundingClientRect();
            tooltip
              .style("left", `${event.clientX - rect.left + 12}px`)
              .style("top", `${event.clientY - rect.top - 30}px`);
          })
          .on("mouseleave", function () {
            select(this).attr("stroke", "none");
            tooltip.style("opacity", "0");
          });

        const fontSize = Math.min(12, Math.max(8, cellW / 4));
        g.selectAll(".cell-label")
          .data(cells)
          .join("text")
          .attr("class", "cell-label")
          .attr("x", (d) => d.col * cellW + cellW / 2)
          .attr("y", (d) => d.row * cellH + cellH / 2)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .style("font-size", `${fontSize}px`)
          .style("font-weight", "600")
          .style("fill", (d) => {
            const lum = hsl(colorScale(d.value)).l;
            return lum > 0.5 ? getComputedThemeColor("--foreground") : getComputedThemeColor("--background");
          })
          .style("pointer-events", "none")
          .text((d) => valueFormat(d.value));

        g.selectAll(".col-label")
          .data(colLabels)
          .join("text")
          .attr("x", (_, i) => i * cellW + cellW / 2)
          .attr("y", -8)
          .attr("text-anchor", "middle")
          .style("font-size", "11px")
          .style("fill", "currentColor")
          .text((d) => d);

        g.selectAll(".row-label")
          .data(rowLabels)
          .join("text")
          .attr("x", -10)
          .attr("y", (_, i) => i * cellH + cellH / 2)
          .attr("text-anchor", "end")
          .attr("dominant-baseline", "central")
          .style("font-size", "11px")
          .style("fill", "currentColor")
          .text((d) => d);

        g.append("text")
          .attr("x", innerW / 2)
          .attr("y", -30)
          .attr("text-anchor", "middle")
          .style("font-size", "13px")
          .style("font-weight", "600")
          .style("fill", "currentColor")
          .text(colAxisLabel);

        g.append("text")
          .attr("transform", `translate(-55,${innerH / 2}) rotate(-90)`)
          .attr("text-anchor", "middle")
          .style("font-size", "13px")
          .style("font-weight", "600")
          .style("fill", "currentColor")
          .text(rowAxisLabel);

        const legendW = Math.min(200, innerW * 0.4);
        const legendH = 12;
        const legendX = innerW - legendW;
        const legendY = innerH + 30;

        const legendScale = scaleLinear().domain([minVal, maxVal]).range([0, legendW]);
        const legendData = range(minVal, maxVal, (maxVal - minVal) / 50);

        g.selectAll(".legend-bar")
          .data(legendData)
          .join("rect")
          .attr("x", (d) => legendX + legendScale(d))
          .attr("y", legendY)
          .attr("width", legendW / 50 + 1)
          .attr("height", legendH)
          .attr("fill", (d) => colorScale(d));

        g.append("text")
          .attr("x", legendX)
          .attr("y", legendY + legendH + 14)
          .style("font-size", "10px")
          .style("fill", "currentColor")
          .text(valueFormat(minVal));

        g.append("text")
          .attr("x", legendX + legendW)
          .attr("y", legendY + legendH + 14)
          .attr("text-anchor", "end")
          .style("font-size", "10px")
          .style("fill", "currentColor")
          .text(valueFormat(maxVal));

        g.append("text")
          .attr("x", legendX + legendW / 2)
          .attr("y", legendY + legendH + 14)
          .attr("text-anchor", "middle")
          .style("font-size", "10px")
          .style("fill", "currentColor")
          .text(`${valueLabel} = ${valueFormat(breakeven)} (breakeven)`);
      },
      [cells, rowLabels, colLabels, rowAxisLabel, colAxisLabel, valueLabel, breakeven, valueFormat]
    );

    return (
      <D3ChartContainer
        ref={containerRef}
        className={className}
        renderChart={renderChart}
        minHeight={350}
      />
    );
  }
);

SensitivityHeatMap.displayName = "SensitivityHeatMap";

export default SensitivityHeatMap;
