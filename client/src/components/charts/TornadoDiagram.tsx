import { useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { select } from "d3-selection";
import { min, max, range } from "d3-array";
import { scaleLinear, scaleBand } from "d3-scale";
import { axisBottom } from "d3-axis";
import D3ChartContainer, { type D3ChartContainerRef } from "./D3ChartContainer";
import { CHART_COLORS } from "@/components/graphics/formatters";

export interface TornadoVariable {
  name: string;
  upside: number;
  downside: number;
  upsideLabel?: string;
  downsideLabel?: string;
}

export interface TornadoDiagramRef {
  toCanvas: () => Promise<HTMLCanvasElement>;
}

interface TornadoDiagramProps {
  variables: TornadoVariable[];
  baseValue: number;
  metricLabel?: string;
  metricFormat?: (v: number) => string;
  className?: string;
}

const COLORS = {
  upside: CHART_COLORS.positive,
  downside: CHART_COLORS.negative,
  baseline: CHART_COLORS.neutral,
  tooltip: {
    bg: CHART_COLORS.tooltipBg,
    text: CHART_COLORS.tooltipText,
  },
};

const TornadoDiagram = forwardRef<TornadoDiagramRef, TornadoDiagramProps>(
  (
    {
      variables,
      baseValue,
      metricLabel = "IRR",
      metricFormat = (v) => `${(v * 100).toFixed(1)}%`,
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
        if (!variables.length) return;

        const sorted = [...variables].sort(
          (a, b) =>
            Math.abs(b.upside - b.downside) - Math.abs(a.upside - a.downside)
        );

        const margin = { top: 40, right: 60, bottom: 40, left: 140 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const g = d3svg
          .append("g")
          .attr("transform", `translate(${margin.left},${margin.top})`);

        const allValues = sorted.flatMap((v) => [v.upside, v.downside, baseValue]);
        const xMin = min(allValues)! * 0.95;
        const xMax = max(allValues)! * 1.05;

        const x = scaleLinear().domain([xMin, xMax]).range([0, innerW]);

        const y = scaleBand<number>()
          .domain(range(sorted.length))
          .range([0, innerH])
          .padding(0.3);

        const barHeight = y.bandwidth();

        g.append("g")
          .attr("transform", `translate(0,${innerH})`)
          .call(axisBottom(x).ticks(6).tickFormat((d) => metricFormat(d as number)))
          .selectAll("text")
          .style("font-size", "11px")
          .style("fill", "currentColor");

        g.selectAll(".var-label")
          .data(sorted)
          .join("text")
          .attr("x", -10)
          .attr("y", (_, i) => y(i)! + barHeight / 2)
          .attr("text-anchor", "end")
          .attr("dominant-baseline", "central")
          .style("font-size", "12px")
          .style("font-weight", "500")
          .style("fill", "currentColor")
          .text((d) => d.name);

        const tooltip = select(svg.parentElement!)
          .selectAll(".tornado-tooltip")
          .data([null])
          .join("div")
          .attr("class", "tornado-tooltip")
          .style("position", "absolute")
          .style("pointer-events", "none")
          .style("opacity", "0")
          .style("background", COLORS.tooltip.bg)
          .style("color", COLORS.tooltip.text)
          .style("border-radius", "8px")
          .style("padding", "8px 12px")
          .style("font-size", "12px")
          .style("z-index", "10")
          .style("white-space", "nowrap");

        sorted.forEach((v, i) => {
          const baseX = x(baseValue);
          const upsideX = x(v.upside);
          const downsideX = x(v.downside);

          const upsideStart = Math.min(baseX, upsideX);
          const upsideWidth = Math.abs(upsideX - baseX);
          g.append("rect")
            .attr("x", upsideStart)
            .attr("y", y(i)!)
            .attr("width", upsideWidth)
            .attr("height", barHeight / 2)
            .attr("rx", 3)
            .attr("fill", COLORS.upside)
            .style("cursor", "pointer")
            .on("mouseenter", function (_event) {
              select(this).attr("opacity", 0.85);
              tooltip
                .style("opacity", "1")
                .html(
                  `<strong>${v.name}</strong><br/>Upside: ${metricFormat(v.upside)}<br/>Change: ${v.upsideLabel || "+10%"}`
                );
            })
            .on("mousemove", function (event) {
              const rect = svg.parentElement!.getBoundingClientRect();
              tooltip
                .style("left", `${event.clientX - rect.left + 12}px`)
                .style("top", `${event.clientY - rect.top - 30}px`);
            })
            .on("mouseleave", function () {
              select(this).attr("opacity", 1);
              tooltip.style("opacity", "0");
            });

          const downsideStart = Math.min(baseX, downsideX);
          const downsideWidth = Math.abs(downsideX - baseX);
          g.append("rect")
            .attr("x", downsideStart)
            .attr("y", y(i)! + barHeight / 2)
            .attr("width", downsideWidth)
            .attr("height", barHeight / 2)
            .attr("rx", 3)
            .attr("fill", COLORS.downside)
            .style("cursor", "pointer")
            .on("mouseenter", function (_event) {
              select(this).attr("opacity", 0.85);
              tooltip
                .style("opacity", "1")
                .html(
                  `<strong>${v.name}</strong><br/>Downside: ${metricFormat(v.downside)}<br/>Change: ${v.downsideLabel || "-10%"}`
                );
            })
            .on("mousemove", function (event) {
              const rect = svg.parentElement!.getBoundingClientRect();
              tooltip
                .style("left", `${event.clientX - rect.left + 12}px`)
                .style("top", `${event.clientY - rect.top - 30}px`);
            })
            .on("mouseleave", function () {
              select(this).attr("opacity", 1);
              tooltip.style("opacity", "0");
            });
        });

        g.append("line")
          .attr("x1", x(baseValue))
          .attr("x2", x(baseValue))
          .attr("y1", -10)
          .attr("y2", innerH + 5)
          .attr("stroke", COLORS.baseline)
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "6,3");

        g.append("text")
          .attr("x", x(baseValue))
          .attr("y", -18)
          .attr("text-anchor", "middle")
          .style("font-size", "12px")
          .style("font-weight", "600")
          .style("fill", "currentColor")
          .text(`Base: ${metricFormat(baseValue)}`);

        g.append("text")
          .attr("x", innerW / 2)
          .attr("y", -30)
          .attr("text-anchor", "middle")
          .style("font-size", "14px")
          .style("font-weight", "600")
          .style("fill", "currentColor")
          .text(`${metricLabel} Sensitivity — Assumption Impact Ranking`);

        const legendY = -22;
        const legendX = innerW - 160;
        [
          { color: COLORS.upside, label: "Upside (+10%)" },
          { color: COLORS.downside, label: "Downside (−10%)" },
        ].forEach((item, i) => {
          g.append("rect")
            .attr("x", legendX + i * 90)
            .attr("y", legendY - 6)
            .attr("width", 12)
            .attr("height", 12)
            .attr("rx", 2)
            .attr("fill", item.color);
          g.append("text")
            .attr("x", legendX + i * 90 + 16)
            .attr("y", legendY)
            .attr("dominant-baseline", "central")
            .style("font-size", "10px")
            .style("fill", "currentColor")
            .text(item.label);
        });
      },
      [variables, baseValue, metricLabel, metricFormat]
    );

    return (
      <D3ChartContainer
        ref={containerRef}
        className={className}
        renderChart={renderChart}
        minHeight={Math.max(300, variables.length * 50 + 100)}
      />
    );
  }
);

TornadoDiagram.displayName = "TornadoDiagram";

export default TornadoDiagram;
