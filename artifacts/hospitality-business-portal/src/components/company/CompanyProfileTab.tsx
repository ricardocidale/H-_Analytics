import React, { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SaveButton } from "@/components/ui/save-button";
import { IconHotel } from "@/components/icons";
import { useGlobalAssumptions, useUpdateAdminConfig } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface CompanyProfileTabProps {
  onSaveStateChange?: (state: import("@/components/admin/save-state").AdminSaveState | null) => void;
}

export default function CompanyProfileTab({ onSaveStateChange }: CompanyProfileTabProps = {}) {
  const { data: global, isLoading: globalLoading } = useGlobalAssumptions();
  const updateGlobal = useUpdateAdminConfig();
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);

  const handleNestedChange = useCallback((group: string, field: string, value: any) => {
    setDraft((prev: any) => {
      const base = prev ?? global ?? {};
      const nested = { ...(base[group] ?? {}), [field]: typeof value === "string" && !isNaN(Number(value)) ? Number(value) : value };
      return { ...base, [group]: nested };
    });
  }, [global]);

  const handleSave = useCallback(() => {
    if (!draft) return;
    updateGlobal.mutate(draft, {
      onSuccess: () => {
        toast({ title: "Saved", description: "Portfolio description updated." });
        setDraft(null);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
      },
    });
  }, [draft, updateGlobal, toast]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const isPending = updateGlobal.isPending;
  const hasDraft = !!draft;
  useEffect(() => {
    if (hasDraft) {
      onSaveStateChange?.({
        isDirty: true,
        isPending,
        onSave: () => handleSaveRef.current(),
      });
    } else {
      onSaveStateChange?.(null);
    }
    return () => onSaveStateChange?.(null);
  }, [hasDraft, isPending, onSaveStateChange]);

  if (globalLoading && !global) return null;

  const current = draft ?? global ?? {};
  const assetDef = current.assetDefinition ?? {};
  const hasExternalSaveHandler = !!onSaveStateChange;

  return (
    <div className="space-y-6">
      {!hasExternalSaveHandler && (
        <div className="flex items-center justify-between">
          <div />
          <SaveButton onClick={handleSave} disabled={!draft} isPending={updateGlobal.isPending} />
        </div>
      )}

      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <IconHotel className="w-5 h-5 text-primary" />
            General Property Description
            <InfoTooltip text="Defines the target property profile for the portfolio. These parameters guide market research searches, comp set analysis, and financial benchmarks." manualSection="global-assumptions" />
          </CardTitle>
          <CardDescription className="label-text">Characterize the target property profile for the portfolio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-text flex items-center gap-1">Minimum Rooms <InfoTooltip text="Minimum number of guest rooms for the target property profile. Used to filter market research and comparable properties." /></Label>
                <span className="text-sm font-mono text-primary">{assetDef.minRooms ?? 10}</span>
              </div>
              <Slider
                value={[assetDef.minRooms ?? 10]}
                onValueChange={(vals) => handleNestedChange("assetDefinition", "minRooms", vals[0].toString())}
                min={5}
                max={50}
                step={5}
                data-testid="slider-asset-min-rooms"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5</span>
                <span>50</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-text flex items-center gap-1">Maximum Rooms <InfoTooltip text="Maximum number of guest rooms for the target property profile. Defines the upper bound for comp set analysis." /></Label>
                <span className="text-sm font-mono text-primary">{assetDef.maxRooms ?? 80}</span>
              </div>
              <Slider
                value={[assetDef.maxRooms ?? 80]}
                onValueChange={(vals) => handleNestedChange("assetDefinition", "maxRooms", vals[0].toString())}
                min={20}
                max={200}
                step={10}
                data-testid="slider-asset-max-rooms"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>20</span>
                <span>200</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-text flex items-center gap-1">Minimum ADR <InfoTooltip text="Minimum Average Daily Rate target. Sets the floor for market research rate comparisons." /></Label>
                <span className="text-sm font-mono text-primary">${assetDef.minAdr ?? 150}</span>
              </div>
              <Slider
                value={[assetDef.minAdr ?? 150]}
                onValueChange={(vals) => handleNestedChange("assetDefinition", "minAdr", vals[0].toString())}
                min={50}
                max={500}
                step={25}
                data-testid="slider-asset-min-adr"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$50</span>
                <span>$500</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-text flex items-center gap-1">Maximum ADR <InfoTooltip text="Maximum Average Daily Rate target. Sets the ceiling for market research rate comparisons." /></Label>
                <span className="text-sm font-mono text-primary">${assetDef.maxAdr ?? 600}</span>
              </div>
              <Slider
                value={[assetDef.maxAdr ?? 600]}
                onValueChange={(vals) => handleNestedChange("assetDefinition", "maxAdr", vals[0].toString())}
                min={200}
                max={1500}
                step={50}
                data-testid="slider-asset-max-adr"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$200</span>
                <span>$1,500</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <Label className="label-text flex items-center gap-1">Food & Beverage (F&B) <InfoTooltip text="Whether target properties include Food & Beverage operations like restaurants and bars." /></Label>
              <Switch
                checked={assetDef.hasFB ?? true}
                onCheckedChange={(checked) => handleNestedChange("assetDefinition", "hasFB", checked)}
                data-testid="switch-asset-fb"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <Label className="label-text flex items-center gap-1">Event Hosting <InfoTooltip text="Whether target properties host events such as weddings, corporate meetings, and social gatherings." /></Label>
              <Switch
                checked={assetDef.hasEvents ?? true}
                onCheckedChange={(checked) => handleNestedChange("assetDefinition", "hasEvents", checked)}
                data-testid="switch-asset-events"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <Label className="label-text flex items-center gap-1">Wellness Programming <InfoTooltip text="Whether target properties include spa or wellness services like massage, yoga, and fitness programs." /></Label>
              <Switch
                checked={assetDef.hasWellness ?? true}
                onCheckedChange={(checked) => handleNestedChange("assetDefinition", "hasWellness", checked)}
                data-testid="switch-asset-wellness"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="label-text flex items-center gap-1">Property Level <InfoTooltip text="Service tier classification: Budget, Average, or Luxury. Affects comp set selection and benchmark ranges." /></Label>
              <RadioGroup
                value={assetDef.level ?? "luxury"}
                onValueChange={(val) => handleNestedChange("assetDefinition", "level", val)}
                className="flex gap-6"
                data-testid="radio-asset-level"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="budget" id="level-budget" data-testid="radio-asset-level-budget" />
                  <Label htmlFor="level-budget" className="label-text cursor-pointer">Budget</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="average" id="level-average" data-testid="radio-asset-level-average" />
                  <Label htmlFor="level-average" className="label-text cursor-pointer">Average</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="luxury" id="level-luxury" data-testid="radio-asset-level-luxury" />
                  <Label htmlFor="level-luxury" className="label-text cursor-pointer">Luxury</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-3">
              <Label className="label-text flex items-center gap-1">Privacy Level <InfoTooltip text="Level of guest privacy: High for secluded estates, Moderate for suburban settings, Low for urban locations." /></Label>
              <RadioGroup
                value={assetDef.privacyLevel ?? "high"}
                onValueChange={(val) => handleNestedChange("assetDefinition", "privacyLevel", val)}
                className="flex gap-6"
                data-testid="radio-asset-privacy"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="low" id="privacy-low" data-testid="radio-asset-privacy-low" />
                  <Label htmlFor="privacy-low" className="label-text cursor-pointer">Low</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="moderate" id="privacy-moderate" data-testid="radio-asset-privacy-moderate" />
                  <Label htmlFor="privacy-moderate" className="label-text cursor-pointer">Moderate</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="high" id="privacy-high" data-testid="radio-asset-privacy-high" />
                  <Label htmlFor="privacy-high" className="label-text cursor-pointer">High</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-text flex items-center gap-1">Event Locations <InfoTooltip text="Number of distinct event spaces available on the property (ballrooms, gardens, terraces, etc.)." /></Label>
                <span className="text-sm font-mono text-primary">{assetDef.eventLocations ?? 2}</span>
              </div>
              <Slider
                value={[assetDef.eventLocations ?? 2]}
                onValueChange={(vals) => handleNestedChange("assetDefinition", "eventLocations", vals[0].toString())}
                min={0}
                max={10}
                step={1}
                data-testid="slider-asset-event-locations"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>10</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-text flex items-center gap-1">Max Event Capacity <InfoTooltip text="Maximum number of guests that can be accommodated at events across all event spaces." /></Label>
                <span className="text-sm font-mono text-primary">{assetDef.maxEventCapacity ?? 150}</span>
              </div>
              <Slider
                value={[assetDef.maxEventCapacity ?? 150]}
                onValueChange={(vals) => handleNestedChange("assetDefinition", "maxEventCapacity", vals[0].toString())}
                min={20}
                max={500}
                step={10}
                data-testid="slider-asset-max-event-capacity"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>20</span>
                <span>500</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-text flex items-center gap-1">Parking Spaces <InfoTooltip text="Number of on-site parking spaces available for guests and event attendees." /></Label>
                <span className="text-sm font-mono text-primary">{assetDef.parkingSpaces ?? 50}</span>
              </div>
              <Slider
                value={[assetDef.parkingSpaces ?? 50]}
                onValueChange={(vals) => handleNestedChange("assetDefinition", "parkingSpaces", vals[0].toString())}
                min={0}
                max={200}
                step={5}
                data-testid="slider-asset-parking"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>200</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-text flex items-center gap-1">Acreage <InfoTooltip text="Total property land area in acres. Larger acreage typically supports more amenities and privacy." /></Label>
                <span className="text-sm font-mono text-primary">{assetDef.acreage ?? 5} acres</span>
              </div>
              <Slider
                value={[assetDef.acreage ?? 5]}
                onValueChange={(vals) => handleNestedChange("assetDefinition", "acreage", vals[0].toString())}
                min={1}
                max={100}
                step={1}
                data-testid="slider-asset-acreage"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 acre</span>
                <span>100 acres</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
