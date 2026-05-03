import { useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { select } from "d3-selection";
import { min, max, range } from "d3-array";
import { scaleLinear, scaleBand } from "d3-scale";
import { axisBottom, axisLeft } from "d3-axis";
import D3ChartContainer, { type D3ChartContainerRef } from "./D3ChartContainer";
import { CHART_COLORS } from "@/components/graphics/formatters";

export interface WaterfallItem {
  label: string;
  value: number;
  type: "positive" | "negative" | "subtotal";
}

export interface WaterfallChartRef {
  toCanvas: () => Promise<HTMLCanvasElement>;
}

interface WaterfallChartProps {
  data: WaterfallItem[];
  totalRevenue?: number;
  className?: string;
}

const COLORS = {
  positive: CHART_COLORS.positive,
  negative: CHART_COLORS.negative,
  subtotal: CHART_COLORS.subtotal,
  connector: CHART_COLORS.connector,
  tooltip: {
    bg: CHART_COLORS.tooltipBg,
    text: CHART_COLORS.tooltipText,
  },
};

const WaterfallChart = forwardRef<WaterfallChartRef, WaterfallChartProps>(
  ({ data, totalRevenue, className = "" }, ref) => {
    const containerRef = useRef<D3ChartContainerRef>(null);

    useImperativeHandle(ref, () => ({
      toCanvas: () => containerRef.current!.toCanvas(),
    }));

    const renderChart = useCallback(
      (svg: SVGSVGElement, width: number, height: number) => {
        const d3svg = select(svg);
        d3svg.selectAll("*").remove();
        if (!data.length) return;

        const margin = { top: 30, right: 20, bottom: 80, left: 80 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const g = d3svg
          .append("g")
          .attr("transform", `translate(${margin.left},${margin.top})`);

        let cumulative = 0;
        const bars = data.map((d) => {
          let y0: number, y1: number;
          if (d.type === "subtotal") {
            y0 = 0;
            y1 = d.value;
            cumulative = d.value;
          } else if (d.type === "positive") {
            y0 = cumulative;
            y1 = cumulative + d.value;
            cumulative = y1;
          } else {
            y0 = cumulative;
            y1 = cumulative + d.value;
            cumulative = y1;
          }
          return { ...d, y0, y1 };
        });

        const allValues = bars.flatMap((b) => [b.y0, b.y1]);
        const yMin = Math.min(0, min(allValues) ?? 0);
        const yMax = max(allValues) ?? 0;
        const yPad = (yMax - yMin) * 0.1;

        const x = scaleBand<number>()
          .domain(range(bars.length))
          .range([0, innerW])
          .padding(0.25);

        const y = scaleLinear()
          .domain([yMin - yPad, yMax + yPad])
          .range([innerH, 0]);

        g.append("g")
          .attr("transform", `translate(0,${innerH})`)
          .call(
            axisBottom(x).tickFormat((i) => {
              const item = bars[i as number];
              return item ? item.label : "";
            })
          )
          .selectAll("text")
          .attr("transform", "rotate(-35)")
          .style("text-anchor", "end")
          .style("font-size", "11px")
          .style("fill", "currentColor");

        g.append("g")
          .call(
            axisLeft(y)
              .ticks(6)
              .tickFormat((d) => {
                const v = d as number;
                const abs = Math.abs(v);
                if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
                if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
                return `$${v}`;
              })
          )
          .selectAll("text")
          .style("font-size", "11px")
          .style("fill", "currentColor");

        const tooltip = select(svg.parentElement!)
          .selectAll(".waterfall-tooltip")
          .data([null])
          .join("div")
          .attr("class", "waterfall-tooltip")
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

        g.selectAll(".bar")
          .data(bars)
          .join("rect")
          .attr("class", "bar")
          .attr("x", (_, i) => x(i)!)
          .attr("y", (d) => y(Math.max(d.y0, d.y1)))
          .attr("width", x.bandwidth())
          .attr("height", (d) => Math.abs(y(d.y0) - y(d.y1)))
          .attr("rx", 3)
          .attr("fill", (d) => COLORS[d.type])
          .style("cursor", "pointer")
          .on("mouseenter", function (event, d) {
            select(this).attr("opacity", 0.85);
            const fmt = (v: number) => {
              const abs = Math.abs(v);
              if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
              if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
              return `$${v.toFixed(0)}`;
            };
            const pctStr =
              totalRevenue && totalRevenue > 0
                ? ` (${((d.value / totalRevenue) * 100).toFixed(1)}% of revenue)`
                : "";
            tooltip
              .style("opacity", "1")
              .html(`<strong>${d.label}</strong><br/>${fmt(d.value)}${pctStr}`);
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

        for (let i = 0; i < bars.length - 1; i++) {
          const curr = bars[i];
          const next = bars[i + 1];
          if (next.type === "subtotal") continue;
          const xEnd = x(i)! + x.bandwidth();
          const xStart = x(i + 1)!;
          const yVal = y(curr.y1);
          g.append("line")
            .attr("x1", xEnd)
            .attr("x2", xStart)
            .attr("y1", yVal)
            .attr("y2", yVal)
            .attr("stroke", COLORS.connector)
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "3,3");
        }
      },
      [data, totalRevenue]
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

WaterfallChart.displayName = "WaterfallChart";

export default WaterfallChart;
