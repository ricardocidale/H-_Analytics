/**
 * Gauge.tsx — Semi-circular gauge visualization for single KPI values.
 *
 * Renders a SVG arc that fills proportionally between min and max values.
 * Optional color thresholds highlight whether the value is in a "good"
 * (green), "warning" (amber), or "critical" (red) range. Commonly used
 * for occupancy rates, DSCR (Debt Service Coverage Ratio), or margin
 * percentages where the user needs an at-a-glance status indicator.
 */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CHART_COLORS } from "../formatters";

interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  label: string;
  format?: (v: number) => string;
  size?: "sm" | "md" | "lg";
  color?: string;
  thresholds?: { good: number; warn: number };
  className?: string;
  markers?: number[];
  "data-testid"?: string;
}

const sizeMap = {
  sm: { svg: 120, radius: 44, stroke: 8, text: "text-xl", label: "text-[10px]", markerSize: 4 },
  md: { svg: 160, radius: 60, stroke: 10, text: "text-3xl", label: "text-xs", markerSize: 6 },
  lg: { svg: 200, radius: 76, stroke: 12, text: "text-4xl", label: "text-sm", markerSize: 8 },
};

function getColor(value: number, thresholds?: { good: number; warn: number }, fallback?: string): string {
  if (!thresholds) return fallback || CHART_COLORS.good;
  if (value >= thresholds.good) return CHART_COLORS.good;
  if (value >= thresholds.warn) return CHART_COLORS.warn;
  return CHART_COLORS.bad;
}

export function Gauge({ value, min = 0, max = 100, label, format, size = "md", color, thresholds, className, markers, ...props }: GaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const s = sizeMap[size];
  const clampedValue = Math.max(min, Math.min(max, value));
  const percentage = (clampedValue - min) / (max - min);
  const strokeColor = color || getColor(value, thresholds);
  const displayValue = format ? format(value) : `${value.toFixed(1)}%`;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(percentage), 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  const centerX = s.svg / 2;
  const centerY = s.svg * 0.6;

  const getMarkerPos = (val: number) => {
    const p = (Math.max(min, Math.min(max, val)) - min) / (max - min);
    const angle = Math.PI + p * Math.PI;
    return {
      x: centerX + s.radius * Math.cos(angle),
      y: centerY + s.radius * Math.sin(angle),
    };
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`flex flex-col items-center ${className || ""}`}
      data-testid={props["data-testid"]}
    >
      <div className="relative" style={{ width: s.svg, height: s.svg * 0.65 }}>
        <svg width={s.svg} height={s.svg * 0.65} viewBox={`0 0 ${s.svg} ${s.svg * 0.65}`}>
          <path
            d={`M ${centerX - s.radius} ${centerY} A ${s.radius} ${s.radius} 0 0 1 ${centerX + s.radius} ${centerY}`}
            fill="none"
            stroke={CHART_COLORS.gridStroke}
            strokeWidth={s.stroke}
            strokeLinecap="round"
          />
          <motion.path
            d={`M ${centerX - s.radius} ${centerY} A ${s.radius} ${s.radius} 0 0 1 ${centerX + s.radius} ${centerY}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={s.stroke}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: animatedValue }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
            style={{ filter: `drop-shadow(0 0 6px ${strokeColor}40)` }}
          />
          {markers?.map((m, i) => {
            const pos = getMarkerPos(m);
            return (
              <circle
                key={i}
                cx={pos.x}
                cy={pos.y}
                r={s.markerSize / 2}
                fill="currentColor"
                className="text-foreground/40"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className={`${s.text} font-bold font-mono text-foreground`}>{displayValue}</span>
        </div>
      </div>
      <span className={`${s.label} text-muted-foreground font-medium mt-1 label-text`}>{label}</span>
    </motion.div>
  );
}
