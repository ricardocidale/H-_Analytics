import { type RefObject } from "react";
import { Button } from "@/components/ui/button";
import SensitivityHeatMap, { type HeatMapCell, type SensitivityHeatMapRef } from "@/components/charts/SensitivityHeatMap";

interface HeatMapSectionProps {
  heatmapRef: RefObject<SensitivityHeatMapRef | null>;
  heatMapMetric: "irr" | "noi" | "equityMultiple";
  onMetricChange: (metric: "irr" | "noi" | "equityMultiple") => void;
  cells: HeatMapCell[];
  rowLabels: string[];
  colLabels: string[];
}

export function HeatMapSection({ heatmapRef, heatMapMetric, onMetricChange, cells, rowLabels, colLabels }: HeatMapSectionProps) {
  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground" data-testid="text-heatmap-title">
              Sensitivity Heat Map
            </h3>
            <p className="text-xs text-muted-foreground">
              ADR growth × Occupancy scenario grid — color-coded by outcome
            </p>
          </div>
          <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
            {(["irr", "noi", "equityMultiple"] as const).map((m) => (
              <Button
                key={m}
                variant={heatMapMetric === m ? "secondary" : "ghost"}
                size="sm"
                onClick={() => onMetricChange(m)}
                className={`px-3 py-1.5 text-xs font-semibold ${heatMapMetric === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                data-testid={`button-heatmap-metric-${m}`}
              >
                {m === "irr" ? "IRR" : m === "noi" ? "NOI" : "NOI Margin"}
              </Button>
            ))}
          </div>
        </div>
        <SensitivityHeatMap
          ref={heatmapRef}
          cells={cells}
          rowLabels={rowLabels}
          colLabels={colLabels}
          rowAxisLabel="Occupancy Shock"
          colAxisLabel="ADR Growth Shock"
          valueLabel={heatMapMetric === "irr" ? "IRR" : heatMapMetric === "noi" ? "NOI" : "NOI Margin"}
          breakeven={heatMapMetric === "irr" ? 0.15 : heatMapMetric === "noi" ? 0 : 0.3}
          valueFormat={
            heatMapMetric === "irr"
              ? (v) => `${(v * 100).toFixed(1)}%`
              : heatMapMetric === "noi"
                ? (v) => {
                    const abs = Math.abs(v);
                    if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
                    if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
                    return `$${v.toFixed(0)}`;
                  }
                : (v) => `${(v * 100).toFixed(1)}%`
          }
        />
      </div>
    </div>
  );
}
