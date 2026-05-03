import { type RefObject } from "react";
import { Button } from "@/components/ui/button";
import TornadoDiagram, { type TornadoVariable, type TornadoDiagramRef } from "@/components/charts/TornadoDiagram";

interface TornadoD3SectionProps {
  tornadoD3Ref: RefObject<TornadoDiagramRef | null>;
  tornadoMetric: "irr" | "noi";
  onMetricChange: (metric: "irr" | "noi") => void;
  variables: TornadoVariable[];
  baseValue: number;
}

export function TornadoD3Section({ tornadoD3Ref, tornadoMetric, onMetricChange, variables, baseValue }: TornadoD3SectionProps) {
  if (variables.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground" data-testid="text-tornado-d3-title">
              Assumption Impact Ranking
            </h3>
            <p className="text-xs text-muted-foreground">
              Variables sorted by magnitude of impact on {tornadoMetric === "irr" ? "IRR" : "NOI"} — each tested at ±10%
            </p>
          </div>
          <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
            <Button
              variant={tornadoMetric === "irr" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onMetricChange("irr")}
              className={`px-3 py-1.5 text-xs font-semibold ${tornadoMetric === "irr" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-tornado-d3-irr"
            >
              IRR
            </Button>
            <Button
              variant={tornadoMetric === "noi" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onMetricChange("noi")}
              className={`px-3 py-1.5 text-xs font-semibold ${tornadoMetric === "noi" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-tornado-d3-noi"
            >
              NOI
            </Button>
          </div>
        </div>
        <TornadoDiagram
          ref={tornadoD3Ref}
          variables={variables}
          baseValue={baseValue}
          metricLabel={tornadoMetric === "irr" ? "IRR" : "NOI"}
          metricFormat={
            tornadoMetric === "irr"
              ? (v) => `${(v * 100).toFixed(1)}%`
              : (v) => {
                  const abs = Math.abs(v);
                  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
                  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
                  return `$${v.toFixed(0)}`;
                }
          }
        />
      </div>
    </div>
  );
}
