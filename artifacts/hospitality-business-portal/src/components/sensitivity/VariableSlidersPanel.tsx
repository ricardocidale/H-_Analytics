import { IconSliders, IconRefreshCw } from "@/components/icons";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { SensitivityVariable } from "./types";

interface VariableSlidersPanelProps {
  variables: SensitivityVariable[];
  adjustments: Record<string, number>;
  onAdjustmentChange: (id: string, value: number) => void;
}

export function VariableSlidersPanel({ variables, adjustments, onAdjustmentChange }: VariableSlidersPanelProps) {
  return (
    <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <IconSliders className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="text-adjustments-title">
            Variable Adjustments
          </h3>
          <p className="text-xs text-muted-foreground">Fine-tune assumptions to see impact</p>
        </div>
      </div>

      <div className="space-y-8">
        {variables.map((v) => {
          const currentVal = adjustments[v.id] ?? v.defaultValue;
          const isChanged = currentVal !== v.defaultValue;

          return (
            <div key={v.id} className="group space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-foreground">{v.label}</label>
                    {v.tooltip && <InfoTooltip text={v.tooltip} />}
                    {isChanged && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors"
                        onClick={() => onAdjustmentChange(v.id, v.defaultValue)}
                        title="Reset to default"
                        data-testid={`button-reset-${v.id}`}
                      >
                        <IconRefreshCw className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight max-w-[200px]">
                    {v.description}
                  </p>
                </div>
                <div
                  className={`text-sm font-mono font-bold px-2 py-1 rounded-md min-w-[60px] text-center transition-colors ${
                    currentVal > 0
                      ? "text-primary bg-primary/10 dark:bg-primary/10"
                      : currentVal < 0
                      ? "text-destructive bg-destructive/10 dark:bg-destructive/10"
                      : "text-muted-foreground bg-muted"
                  }`}
                  data-testid={`value-${v.id}`}
                >
                  {currentVal > 0 ? "+" : ""}
                  {currentVal.toFixed(v.step < 1 ? 1 : 0)}
                  {v.unit === "%" ? "pp" : v.unit}
                </div>
              </div>

              <div className="px-1">
                <Slider
                  min={v.range[0]}
                  max={v.range[1]}
                  step={v.step}
                  value={[currentVal]}
                  onValueChange={([val]) => onAdjustmentChange(v.id, val)}
                  className="py-4"
                  data-testid={`slider-${v.id}`}
                />
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground/50">
                    {v.range[0]}{v.unit === "%" ? "pp" : v.unit}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground/50">
                    +{v.range[1]}{v.unit === "%" ? "pp" : v.unit}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
