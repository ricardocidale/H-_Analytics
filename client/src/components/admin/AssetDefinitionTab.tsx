import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X } from "@/components/icons/themed-icons";
import { IconSave } from "@/components/icons";
import { Loader2 } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useGlobalAssumptions, useUpdateAdminConfig } from "@/lib/api";
import { ADMIN_TEXTAREA } from "./styles";
import {
  type IcpConfig,
  type IcpDescriptive,
  type IcpLocation,
  type Priority,
  type UnitType,
  DEFAULT_ICP_CONFIG,
  DEFAULT_ICP_DESCRIPTIVE,
  PARAMETER_SECTIONS,
  DESCRIPTIVE_SECTIONS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  PRIORITY_LABELS,
  UNIT_DEFS,
  generateIcpPrompt,
  type ParameterField,
} from "./icp-config";

const PRIORITY_COLORS: Record<Priority, { ring: string; bg: string; text: string; dot: string }> = {
  must: { ring: "ring-primary/30", bg: "bg-primary/10", text: "text-primary", dot: "bg-primary" },
  major: { ring: "ring-secondary/30", bg: "bg-secondary/10", text: "text-secondary dark:text-secondary", dot: "bg-secondary" },
  nice: { ring: "ring-accent-pop/30", bg: "bg-accent-pop/10", text: "text-accent-pop dark:text-accent-pop", dot: "bg-accent-pop" },
  no: { ring: "ring-destructive/30", bg: "bg-destructive/10", text: "text-destructive", dot: "bg-destructive" },
};

const RADIO_OPTIONS: { value: Priority; label: string }[] = [
  { value: "must", label: "Required" },
  { value: "major", label: "Major Plus" },
  { value: "nice", label: "Nice to Have" },
];

function PriorityRadio({ value, onChange }: { value: Priority; onChange: (v: Priority) => void }) {
  return (
    <div className="flex items-center gap-3" data-testid="radio-priority">
      {RADIO_OPTIONS.map((opt) => {
        const colors = PRIORITY_COLORS[opt.value];
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            className={`flex items-center gap-1.5 cursor-pointer text-[11px] font-medium transition-colors ${
              selected ? colors.text : "text-muted-foreground/60 hover:text-muted-foreground"
            }`}
            data-testid={`radio-${opt.value}`}
          >
            <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
              selected ? `border-current` : "border-muted-foreground/30"
            }`}>
              {selected && <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />}
            </span>
            <input
              type="radio"
              name={`priority-${Math.random()}`}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

function CurrencyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const display = value >= 1000 ? value.toLocaleString() : String(value);
  const [local, setLocal] = useState(display);

  useEffect(() => {
    setLocal(value >= 1000 ? value.toLocaleString() : String(value));
  }, [value]);

  return (
    <Input
      value={local}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        setLocal(raw ? Number(raw).toLocaleString() : "");
      }}
      onBlur={() => {
        const parsed = Number(local.replace(/[^0-9]/g, ""));
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      className="h-7 text-xs bg-card w-[110px] text-right tabular-nums"
    />
  );
}

function NumberInput({ value, onChange, step }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Input
      type="number"
      value={value}
      step={step || 1}
      onChange={(e) => {
        const parsed = Number(e.target.value);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      className="h-7 text-xs bg-card w-[80px] text-right tabular-nums"
    />
  );
}

function UnitLabel({ unitType, suffix }: { unitType?: UnitType; suffix?: string }) {
  if (unitType && unitType !== "none") {
    const def = UNIT_DEFS[unitType];
    return (
      <span className="text-[10px] text-muted-foreground ml-1 whitespace-nowrap">
        {def.imperial}
      </span>
    );
  }
  if (suffix) {
    return <span className="text-[10px] text-muted-foreground ml-1 whitespace-nowrap">{suffix}</span>;
  }
  return null;
}


interface CustomAmenity {
  id: string;
  label: string;
  priority: Priority;
}

export interface AssetDefinitionTabProps {
  onSaveStateChange?: (state: import("@/components/admin/save-state").AdminSaveState | null) => void;
}

export default function AssetDefinitionTab({ onSaveStateChange }: AssetDefinitionTabProps = {}) {
  const { toast } = useToast();
  const { data: ga, isLoading: gaLoading } = useGlobalAssumptions();
  const updateMutation = useUpdateAdminConfig();

  const [propertyLabel, setPropertyLabel] = useState("");
  const [config, setConfig] = useState<IcpConfig>(DEFAULT_ICP_CONFIG);
  const [desc, setDesc] = useState<IcpDescriptive>(DEFAULT_ICP_DESCRIPTIVE);
  const [dirty, setDirty] = useState(false);
  const [customAmenities, setCustomAmenities] = useState<CustomAmenity[]>([]);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (ga) {
      setPropertyLabel(ga.propertyLabel || "Boutique Hotel");
      if (ga.icpConfig) {
        setConfig({ ...DEFAULT_ICP_CONFIG, ...(ga.icpConfig as Partial<IcpConfig>) });
        if (ga.icpConfig._descriptive) {
          const saved = ga.icpConfig._descriptive as Record<string, unknown>;
          const migrated = { ...saved };
          if (!migrated.locationDetails && (migrated.usRegions || migrated.latAmRegions || migrated.emeaRegions)) {
            const parts: string[] = [];
            if (migrated.usRegions) parts.push(`United States:\n${migrated.usRegions}`);
            if (migrated.latAmRegions) parts.push(`Latin America:\n${migrated.latAmRegions}`);
            if (migrated.emeaRegions) parts.push(`EMEA:\n${migrated.emeaRegions}`);
            migrated.locationDetails = parts.join("\n\n");
          }
          delete migrated.usRegions;
          delete migrated.latAmRegions;
          delete migrated.emeaRegions;
          setDesc({ ...DEFAULT_ICP_DESCRIPTIVE, ...(migrated as Partial<IcpDescriptive>) });
        }
        if (ga.icpConfig._customAmenities) {
          setCustomAmenities(ga.icpConfig._customAmenities as CustomAmenity[]);
        }
        if (ga.icpConfig._hiddenFields) {
          setHiddenFields(new Set(ga.icpConfig._hiddenFields as string[]));
        }
      }
      setDirty(false);
    }
  }, [ga]);

  const updateConfig = useCallback(<K extends keyof IcpConfig>(key: K, value: IcpConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const updateDesc = useCallback(<K extends keyof IcpDescriptive>(key: K, value: string) => {
    setDesc((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const locations = useMemo(() => (ga?.icpConfig?._locations ?? []) as IcpLocation[], [ga?.icpConfig]);

  const generatedPrompt = useMemo(
    () => generateIcpPrompt(config, desc, propertyLabel, { locations, customAmenities }),
    [config, desc, propertyLabel, locations, customAmenities]
  );

  const handleSave = useCallback(() => {
    const icpConfig = {
      ...config,
      _descriptive: desc,
      _customAmenities: customAmenities,
      _hiddenFields: Array.from(hiddenFields),
    };
    updateMutation.mutate(
      { propertyLabel, assetDescription: generatedPrompt, icpConfig },
      {
        onSuccess: () => {
          setDirty(false);
          toast({ title: "Saved", description: "Amenities profile and generated context saved." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
        },
      }
    );
  }, [config, desc, customAmenities, hiddenFields, propertyLabel, generatedPrompt, updateMutation, toast]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const isPending = updateMutation.isPending;
  useEffect(() => {
    if (dirty) {
      onSaveStateChange?.({
        isDirty: true,
        isPending,
        onSave: () => handleSaveRef.current(),
      });
    } else {
      onSaveStateChange?.(null);
    }
    return () => onSaveStateChange?.(null);
  }, [dirty, isPending, onSaveStateChange]);

  if (gaLoading && !ga) return null;

  const addCustomAmenity = () => {
    const newAmenity: CustomAmenity = {
      id: `custom-${Date.now()}`,
      label: "New Amenity",
      priority: "nice",
    };
    setCustomAmenities((prev) => [...prev, newAmenity]);
    setDirty(true);
  };

  const updateCustomAmenity = (id: string, updates: Partial<CustomAmenity>) => {
    setCustomAmenities((prev) => prev.map((a) => a.id === id ? { ...a, ...updates } : a));
    setDirty(true);
  };

  const deleteCustomAmenity = (id: string) => {
    setCustomAmenities((prev) => prev.filter((a) => a.id !== id));
    setDirty(true);
  };

  const hideField = (key: string) => {
    setHiddenFields((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setDirty(true);
  };

  const restoreField = (key: string) => {
    setHiddenFields((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            Ideal Customer Profile — Property Description
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Define the target property profile with deterministic parameters and descriptive context.
            The generated prompt combines both into an optimized context served to AI research engines.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-1">
            <Label className="label-text text-foreground text-xs">ICP Management Co Label</Label>
            <Input
              value={propertyLabel}
              onChange={(e) => { setPropertyLabel(e.target.value); setDirty(true); }}
              placeholder="e.g., Boutique Hotel"
              className="bg-card h-8 text-sm"
              data-testid="input-property-label"
            />
          </div>

          <Tabs defaultValue="amenities" className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-9">
              <TabsTrigger value="amenities" className="text-xs" data-testid="tab-amenities">
                Amenities
              </TabsTrigger>
              <TabsTrigger value="descriptive" className="text-xs" data-testid="tab-descriptive">
                Descriptive
              </TabsTrigger>
            </TabsList>

            <TabsContent value="amenities" className="mt-3">
              <AmenitiesTab
                config={config}
                updateConfig={updateConfig}
                customAmenities={customAmenities}
                addCustomAmenity={addCustomAmenity}
                updateCustomAmenity={updateCustomAmenity}
                deleteCustomAmenity={deleteCustomAmenity}
                hiddenFields={hiddenFields}
                hideField={hideField}
                restoreField={restoreField}
              />
            </TabsContent>

            <TabsContent value="descriptive" className="mt-3">
              <DescriptiveTab desc={desc} updateDesc={updateDesc} />
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-end pt-0 pb-4 px-6">
          <Button
            onClick={handleSave}
            disabled={!dirty || updateMutation.isPending}
            size="sm"
            data-testid="button-save-icp"
          >
            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <IconSave className="w-3.5 h-3.5 mr-1.5" />}
            Save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function AmenityCard({
  field,
  config,
  updateConfig,
  priority,
  onPriorityChange,
  onDelete,
}: {
  field: ParameterField;
  config: IcpConfig;
  updateConfig: <K extends keyof IcpConfig>(key: K, value: IcpConfig[K]) => void;
  priority: Priority;
  onPriorityChange: (v: Priority) => void;
  onDelete: () => void;
}) {
  const colors = PRIORITY_COLORS[priority];
  const hasValue = field.type !== "priority";

  return (
    <div
      className={`relative rounded-lg border ring-1 ${colors.ring} ${colors.bg} p-3 transition-all hover:shadow-sm group`}
      data-testid={`card-amenity-${field.key}`}
    >
      <button
        type="button"
        onClick={onDelete}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-destructive"
        data-testid={`button-delete-${field.key}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="space-y-2.5">
        <div className="flex items-start gap-1.5 pr-5">
          <span className="text-xs font-semibold text-foreground leading-tight">{field.label}</span>
          {field.help && <InfoTooltip text={field.help} />}
        </div>

        <PriorityRadio value={priority} onChange={onPriorityChange} />

        {hasValue && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {field.type === "currency" ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">$</span>
                <CurrencyInput
                  value={config[field.key as keyof IcpConfig] as number}
                  onChange={(v) => updateConfig(field.key as keyof IcpConfig, v as IcpConfig[keyof IcpConfig])}
                />
              </div>
            ) : (
              <NumberInput
                value={config[field.key as keyof IcpConfig] as number}
                onChange={(v) => updateConfig(field.key as keyof IcpConfig, v as IcpConfig[keyof IcpConfig])}
                step={field.suffix === "%" && !field.key.includes("Share") ? 1 : undefined}
              />
            )}
            {field.pair && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">{field.pairLabel}</span>
                {field.type === "currency" ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">$</span>
                    <CurrencyInput
                      value={config[field.pair as keyof IcpConfig] as number}
                      onChange={(v) => updateConfig(field.pair as keyof IcpConfig, v as IcpConfig[keyof IcpConfig])}
                    />
                  </div>
                ) : (
                  <NumberInput
                    value={config[field.pair as keyof IcpConfig] as number}
                    onChange={(v) => updateConfig(field.pair as keyof IcpConfig, v as IcpConfig[keyof IcpConfig])}
                  />
                )}
              </div>
            )}
            <UnitLabel unitType={field.unitType} suffix={field.suffix} />
          </div>
        )}
      </div>
    </div>
  );
}

function CustomAmenityCard({
  amenity,
  onUpdate,
  onDelete,
}: {
  amenity: CustomAmenity;
  onUpdate: (updates: Partial<CustomAmenity>) => void;
  onDelete: () => void;
}) {
  const colors = PRIORITY_COLORS[amenity.priority];

  return (
    <div
      className={`relative rounded-lg border ring-1 ${colors.ring} ${colors.bg} p-3 transition-all hover:shadow-sm group`}
      data-testid={`card-custom-amenity-${amenity.id}`}
    >
      <button
        type="button"
        onClick={onDelete}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-destructive"
        data-testid={`button-delete-custom-${amenity.id}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="space-y-2.5">
        <Input
          value={amenity.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-7 text-xs font-semibold bg-transparent border-none px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          data-testid={`input-custom-name-${amenity.id}`}
        />
        <PriorityRadio
          value={amenity.priority}
          onChange={(v) => onUpdate({ priority: v })}
        />
      </div>
    </div>
  );
}

function AmenitiesTab({
  config,
  updateConfig,
  customAmenities,
  addCustomAmenity,
  updateCustomAmenity,
  deleteCustomAmenity,
  hiddenFields,
  hideField,
  restoreField,
}: {
  config: IcpConfig;
  updateConfig: <K extends keyof IcpConfig>(key: K, value: IcpConfig[K]) => void;
  customAmenities: CustomAmenity[];
  addCustomAmenity: () => void;
  updateCustomAmenity: (id: string, updates: Partial<CustomAmenity>) => void;
  deleteCustomAmenity: (id: string) => void;
  hiddenFields: Set<string>;
  hideField: (key: string) => void;
  restoreField: (key: string) => void;
}) {
  const hiddenFieldsList = useMemo(() => {
    const all: ParameterField[] = [];
    for (const section of PARAMETER_SECTIONS) {
      for (const field of section.fields) {
        if (hiddenFields.has(field.key)) all.push(field);
      }
    }
    return all;
  }, [hiddenFields]);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Each feature is shown as a card with its priority level. Use the radio buttons to set
        <span className="font-medium text-primary dark:text-primary"> Required</span>,
        <span className="font-medium text-chart-1 dark:text-chart-1"> Major Plus</span>, or
        <span className="font-medium text-accent-pop dark:text-accent-pop"> Nice to Have</span>.
        Hover to reveal the delete button. Add custom amenities at the bottom.
      </p>

      {PARAMETER_SECTIONS.map((section) => {
        const visibleFields = section.fields.filter((f) => !hiddenFields.has(f.key));
        if (visibleFields.length === 0) return null;

        return (
          <div key={section.title}>
            <h3
              className="text-sm font-semibold text-foreground mb-3 pb-1.5 border-b border-border/60"
              data-testid={`section-${section.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
            >
              {section.title}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground tabular-nums">
                {visibleFields.length} {visibleFields.length === 1 ? "feature" : "features"}
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleFields.map((field) => {
                const priority: Priority = field.type === "priority"
                  ? (config[field.key as keyof IcpConfig] as Priority)
                  : field.linkedPriority
                    ? (config[field.linkedPriority as keyof IcpConfig] as Priority)
                    : field.defaultPriority || "must";

                const handlePriorityChange = (v: Priority) => {
                  if (field.type === "priority") {
                    updateConfig(field.key as keyof IcpConfig, v as IcpConfig[keyof IcpConfig]);
                  } else if (field.linkedPriority) {
                    updateConfig(field.linkedPriority as keyof IcpConfig, v as IcpConfig[keyof IcpConfig]);
                  }
                };

                return (
                  <AmenityCard
                    key={field.key}
                    field={field}
                    config={config}
                    updateConfig={updateConfig}
                    priority={priority}
                    onPriorityChange={handlePriorityChange}
                    onDelete={() => hideField(field.key)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {customAmenities.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 pb-1.5 border-b border-border/60">
            Custom Amenities
            <span className="ml-2 text-[11px] font-normal text-muted-foreground tabular-nums">
              {customAmenities.length} {customAmenities.length === 1 ? "feature" : "features"}
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customAmenities.map((amenity) => (
              <CustomAmenityCard
                key={amenity.id}
                amenity={amenity}
                onUpdate={(updates) => updateCustomAmenity(amenity.id, updates)}
                onDelete={() => deleteCustomAmenity(amenity.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCustomAmenity}
          className="text-xs h-8 gap-1.5"
          data-testid="button-add-amenity"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Amenity
        </Button>
      </div>

      {hiddenFieldsList.length > 0 && (
        <div className="pt-2 border-t border-border/40">
          <p className="text-[11px] text-muted-foreground mb-2">
            Removed features ({hiddenFieldsList.length}):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hiddenFieldsList.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => restoreField(field.key)}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-foreground bg-muted/40 hover:bg-muted/60 rounded-full px-2.5 py-1 transition-colors"
                data-testid={`button-restore-${field.key}`}
              >
                <Plus className="w-2.5 h-2.5" />
                {field.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DescriptiveTab({
  desc,
  updateDesc,
}: {
  desc: IcpDescriptive;
  updateDesc: <K extends keyof IcpDescriptive>(key: K, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Qualitative descriptions and preferences. These are combined with the numeric parameters
        to produce the full ICP Management Co context.
      </p>
      {DESCRIPTIVE_SECTIONS.map((section) => (
        <div key={section.key} className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground/80">{section.label}</Label>
          <textarea
            value={desc[section.key]}
            onChange={(e) => updateDesc(section.key, e.target.value)}
            rows={section.rows}
            className={ADMIN_TEXTAREA + " text-xs"}
            data-testid={`input-icp-${section.key}`}
          />
          <p className="text-[10px] text-muted-foreground">{section.help}</p>
        </div>
      ))}
    </div>
  );
}
