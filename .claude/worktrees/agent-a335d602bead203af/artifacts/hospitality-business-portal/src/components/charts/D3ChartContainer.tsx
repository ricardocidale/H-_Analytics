import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

export interface D3ChartContainerRef {
  toCanvas: () => Promise<HTMLCanvasElement>;
  getSvgElement: () => SVGSVGElement | null;
}

interface D3ChartContainerProps {
  className?: string;
  renderChart: (svg: SVGSVGElement, width: number, height: number) => void;
  minHeight?: number;
}

const D3ChartContainer = forwardRef<D3ChartContainerRef, D3ChartContainerProps>(
  ({ className = "", renderChart, minHeight = 300 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const updateChart = useCallback(() => {
      if (!containerRef.current || !svgRef.current) return;
      const { width } = containerRef.current.getBoundingClientRect();
      const height = Math.max(minHeight, containerRef.current.clientHeight);
      svgRef.current.setAttribute("width", String(width));
      svgRef.current.setAttribute("height", String(height));
      renderChart(svgRef.current, width, height);
    }, [renderChart, minHeight]);

    useEffect(() => {
      updateChart();
      const container = containerRef.current;
      if (!container) return;
      const ro = new ResizeObserver(() => updateChart());
      ro.observe(container);
      return () => ro.disconnect();
    }, [updateChart]);

    const toCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
      const svg = svgRef.current;
      if (!svg) throw new Error("SVG element not available");

      const clone = svg.cloneNode(true) as SVGSVGElement;
      const computed = getComputedStyle(document.documentElement);

      const cssVars: Record<string, string> = {};
      const varNames = [
        "--background", "--foreground", "--card", "--primary",
        "--muted-foreground", "--border", "--destructive",
      ];
      for (const name of varNames) {
        cssVars[name] = computed.getPropertyValue(name).trim();
      }

      const allElements = clone.querySelectorAll("*");
      allElements.forEach((el) => {
        const htmlEl = el as SVGElement;
        const style = htmlEl.getAttribute("style") || "";
        let newStyle = style;
        for (const [varName, value] of Object.entries(cssVars)) {
          if (value) {
            newStyle = newStyle.replace(new RegExp(`var\\(${varName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\)`, "g"), value);
          }
        }
        htmlEl.setAttribute("style", newStyle);
      });

      clone.querySelectorAll("text").forEach((textEl) => {
        const fill = textEl.getAttribute("fill");
        if (fill && fill.includes("var(")) {
          for (const [varName, value] of Object.entries(cssVars)) {
            if (fill.includes(`var(${varName})`)) {
              textEl.setAttribute("fill", `hsl(${value})`);
            }
          }
        }
      });

      const width = parseInt(svg.getAttribute("width") || "800");
      const height = parseInt(svg.getAttribute("height") || "400");

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const canvas = document.createElement("canvas");
      const dpr = 2;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);

      return new Promise<HTMLCanvasElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(canvas);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to render SVG to canvas"));
        };
        img.src = url;
      });
    }, []);

    useImperativeHandle(ref, () => ({
      toCanvas,
      getSvgElement: () => svgRef.current,
    }));

    return (
      <div
        ref={containerRef}
        className={`w-full ${className}`}
        style={{ minHeight }}
        data-testid="d3-chart-container"
      >
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    );
  }
);

D3ChartContainer.displayName = "D3ChartContainer";

export default D3ChartContainer;
