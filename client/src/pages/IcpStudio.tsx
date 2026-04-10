/**
 * IcpStudio.tsx — Three-panel ICP configuration studio.
 *
 * Left: Qualitative Vision (rich text sections)
 * Center: Quantitative Parameters (collapsible accordion groups)
 * Right: Generated Prompt (auto/manual mode with live preview)
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { AnimatedPage, AnimatedSection } from "@/components/graphics/AnimatedPage";
import { useGlobalAssumptions, useUpdateAdminConfig } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  IconSave, IconHistory, IconTarget, IconSparkles, IconFileText,
  IconEye, IconRefreshCw, IconZap, IconSettings,
} from "@/components/icons";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  type IcpConfig, type IcpDescriptive, type IcpLocation, type Priority,
  DEFAULT_ICP_CONFIG, DEFAULT_ICP_DESCRIPTIVE,
  generateIcpPrompt,
} from "@/components/admin/icp-config";

// ── Qualitative Sections ─────────────────────────────────────────────────────

const QUALITATIVE_SECTIONS = [
  { key: "investmentThesis", label: "Investment Thesis", placeholder: "Define the overarching investment strategy, target returns, and value creation thesis for the portfolio...", icon: IconTarget },
  { key: "targetProperty", label: "Target Property Character", placeholder: "Describe the ideal property archetype: architectural style, guest capacity, sense of place, exclusivity level...", icon: IconSparkles },
  { key: "guestExperience", label: "Guest Experience Vision", placeholder: "What does the ideal guest journey look like? Service philosophy, programming, F&B concept, wellness offering...", icon: IconEye },
  { key: "geographicStrategy", label: "Geographic Strategy", placeholder: "Primary and secondary markets, seasonal diversification, expansion corridors, international targets...", icon: IconSettings },
  { key: "competitiveEdge", label: "Competitive Edge", placeholder: "What differentiates this portfolio from competitors? Unique amenities, brand positioning, operational model...", icon: IconZap },
  { key: "brandIdentity", label: "Brand Identity", placeholder: "Brand voice, visual identity, guest demographic, price positioning, marketing narrative...", icon: IconFileText },
] as const;

// ── Quantitative Field Groups (key ~20 fields across 5 categories) ───────────

interface QField {
  key: keyof IcpConfig;
  label: string;
  suffix?: string;
  pairKey?: keyof IcpConfig;
  tooltip?: string;
}

interface QGroup {
  id: string;
  title: string;
  summary: (c: IcpConfig) => string;
  fields: QField[];
}

const fmt$ = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;

const QUANT_GROUPS: QGroup[] = [
  {
    id: "physical",
    title: "Physical",
    summary: (c) => `${c.roomsMin}-${c.roomsMax} rooms, ${c.landAcresMin}-${c.landAcresMax} acres`,
    fields: [
      { key: "roomsMin", label: "Rooms", pairKey: "roomsMax", tooltip: "Minimum number of rooms" },
      { key: "roomsSweetSpotMin", label: "Sweet spot", pairKey: "roomsSweetSpotMax", tooltip: "Minimum sweet spot value" },
      { key: "landAcresMin", label: "Land acres", pairKey: "landAcresMax", suffix: "acres", tooltip: "Minimum land area" },
      { key: "builtSqFtMin", label: "Built area", pairKey: "builtSqFtMax", suffix: "sq ft", tooltip: "Minimum built area" },
    ],
  },
  {
    id: "financial",
    title: "Financial",
    summary: (c) => `${fmt$(c.acquisitionMin)}-${fmt$(c.acquisitionMax)}, ${c.targetIrr}%+ IRR`,
    fields: [
      { key: "acquisitionMin", label: "Acquisition", pairKey: "acquisitionMax", suffix: "$", tooltip: "Minimum acquisition price" },
      { key: "adrMin", label: "ADR", pairKey: "adrMax", suffix: "$/night", tooltip: "Minimum average daily rate" },
      { key: "targetIrr", label: "Target IRR", suffix: "%" },
      { key: "exitCapRateMin", label: "Exit cap rate", pairKey: "exitCapRateMax", suffix: "%", tooltip: "Minimum exit cap rate" },
      { key: "equityMultipleMin", label: "Equity multiple", pairKey: "equityMultipleMax", suffix: "x", tooltip: "Minimum equity multiple" },
    ],
  },
  {
    id: "amenities",
    title: "Amenities",
    summary: (c) => {
      const musts = (["pool", "spa", "gym", "horseFacilities"] as (keyof IcpConfig)[])
        .filter((k) => c[k] === "must").length;
      return `${musts} required, ${c.spaTreatmentRooms} spa rooms`;
    },
    fields: [
      { key: "spaTreatmentRooms", label: "Spa treatment rooms" },
      { key: "parkingMin", label: "Parking", pairKey: "parkingMax", tooltip: "Minimum parking spaces" },
      { key: "diningCapacityMin", label: "Dining capacity", pairKey: "diningCapacityMax", tooltip: "Minimum dining capacity" },
    ],
  },
  {
    id: "location",
    title: "Location",
    summary: (c) => `${c.prefAirportMin}-${c.maxAirportMin} min airport, ${c.prefHospitalMin}-${c.maxHospitalMin} min hospital`,
    fields: [
      { key: "maxAirportMin", label: "Max to airport", suffix: "min" },
      { key: "prefAirportMin", label: "Preferred to airport", suffix: "min" },
      { key: "maxHospitalMin", label: "Max to hospital", suffix: "min" },
      { key: "prefHospitalMin", label: "Preferred to hospital", suffix: "min" },
    ],
  },
  {
    id: "condition",
    title: "Condition",
    summary: (c) => `Roof <${c.maxRoofAge}yr, ${c.minElectricalAmps}A+, reno <${fmt$(c.maxRenovationBudget)}`,
    fields: [
      { key: "maxRoofAge", label: "Max roof age", suffix: "years" },
      { key: "minElectricalAmps", label: "Min electrical", suffix: "amps" },
      { key: "maxRenovationBudget", label: "Max renovation budget", suffix: "$" },
    ],
  },
];

// ── Prompt Generation ────────────────────────────────────────────────────────

function generateStudioPrompt(
  qualitative: Record<string, string>,
  quantitative: IcpConfig,
  descriptive: IcpDescriptive,
  locations?: IcpLocation[],
  customAmenities?: { label: string; priority: Priority }[],
): string {
  const sections: string[] = [];

  sections.push("# IDEAL CUSTOMER PROFILE — STRATEGIC RESEARCH DIRECTIVE\n");

  for (const s of QUALITATIVE_SECTIONS) {
    const text = qualitative[s.key]?.trim();
    if (text) {
      sections.push(`## ${s.label}\n${text}\n`);
    }
  }

  sections.push("## Quantitative Parameters\n");
  for (const g of QUANT_GROUPS) {
    sections.push(`### ${g.title}`);
    sections.push(g.summary(quantitative));
    for (const f of g.fields) {
      const val = quantitative[f.key];
      if (f.pairKey) {
        sections.push(`- ${f.label}: ${val} - ${quantitative[f.pairKey]}${f.suffix ? ` ${f.suffix}` : ""}`);
      } else {
        sections.push(`- ${f.label}: ${val}${f.suffix ? ` ${f.suffix}` : ""}`);
      }
    }
    sections.push("");
  }

  sections.push("---\n");
  sections.push(generateIcpPrompt(quantitative, descriptive, "Portfolio", { locations, customAmenities }));

  return sections.join("\n");
}

// ── Version History Entry ────────────────────────────────────────────────────

interface VersionEntry {
  timestamp: string;
  prompt: string;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function IcpStudio() {
  const { data: global, isLoading } = useGlobalAssumptions();
  const updateGlobal = useUpdateAdminConfig();
  const { toast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────

  const [qualitative, setQualitative] = useState<Record<string, string>>({});
  const [quantitative, setQuantitative] = useState<IcpConfig>(DEFAULT_ICP_CONFIG);
  const [descriptive, setDescriptive] = useState<IcpDescriptive>(DEFAULT_ICP_DESCRIPTIVE);
  const [promptMode, setPromptMode] = useState<"auto" | "manual">("auto");
  const [manualPrompt, setManualPrompt] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[]>([]);

  // ── Load from global assumptions ───────────────────────────────────────────

  useEffect(() => {
    if (!global) return;
    const g = global as unknown as Record<string, unknown>;

    // Load quantitative ICP config
    if (g.icpConfig && typeof g.icpConfig === "object") {
      setQuantitative({ ...DEFAULT_ICP_CONFIG, ...(g.icpConfig as Partial<IcpConfig>) });
    }

    // Load descriptive fields
    if (g.icpDescriptive && typeof g.icpDescriptive === "object") {
      setDescriptive({ ...DEFAULT_ICP_DESCRIPTIVE, ...(g.icpDescriptive as Partial<IcpDescriptive>) });
    }

    // Load qualitative vision
    if (g.icpQualitative && typeof g.icpQualitative === "object") {
      setQualitative(g.icpQualitative as Record<string, string>);
    }

    // Load manual prompt
    if (g.icpGeneratedPrompt) {
      setManualPrompt(g.icpGeneratedPrompt as string);
    }

    // Load version history
    if (Array.isArray(g.icpVersionHistory)) {
      setVersions(g.icpVersionHistory as VersionEntry[]);
    }

    // Load prompt mode
    if (g.icpPromptMode === "manual") {
      setPromptMode("manual");
    }
  }, [global]);

  // ── Auto-generated prompt ──────────────────────────────────────────────────

  const locations = useMemo(() => (global?.icpConfig?._locations ?? []) as IcpLocation[], [global]);
  const customAmenities = useMemo(() => (global?.icpConfig?._customAmenities ?? []) as { label: string; priority: Priority }[], [global]);

  const autoPrompt = useMemo(
    () => generateStudioPrompt(qualitative, quantitative, descriptive, locations, customAmenities),
    [qualitative, quantitative, descriptive, locations, customAmenities],
  );

  const activePrompt = promptMode === "auto" ? autoPrompt : manualPrompt;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const updateQualitative = useCallback((key: string, value: string) => {
    setQualitative((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateQuantField = useCallback((key: keyof IcpConfig, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setQuantitative((prev) => ({ ...prev, [key]: num }));
    }
  }, []);

  const resetToAuto = useCallback(() => {
    setPromptMode("auto");
    setManualPrompt(autoPrompt);
  }, [autoPrompt]);

  const handleSave = useCallback(async () => {
    const newVersion: VersionEntry = {
      timestamp: new Date().toISOString(),
      prompt: activePrompt,
    };
    const updatedVersions = [newVersion, ...versions].slice(0, 20);

    try {
      await updateGlobal.mutateAsync({
        icpConfig: quantitative,
        icpDescriptive: descriptive,
        icpQualitative: qualitative,
        icpGeneratedPrompt: activePrompt,
        icpPromptMode: promptMode,
        icpVersionHistory: updatedVersions,
      } as any);
      setVersions(updatedVersions);
      toast({ title: "ICP saved", description: "Profile and prompt updated successfully." });
    } catch {
      toast({ title: "Save failed", description: "Could not save ICP configuration.", variant: "destructive" });
    }
  }, [quantitative, descriptive, qualitative, activePrompt, promptMode, versions, updateGlobal, toast]);

  // ── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-4 p-4 sm:p-6">
          {/* Header */}
          <PageHeader
            title="ICP Studio"
            subtitle="Strategic Research Profile — Define the ideal customer profile that drives all AI research"
            backLink="/admin"
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="gap-1.5"
                >
                  <IconHistory className="w-4 h-4" />
                  History
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateGlobal.isPending}
                  className="gap-1.5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                >
                  {updateGlobal.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <IconSave className="w-4 h-4" />
                  )}
                  Save
                </Button>
              </div>
            }
          />

          {/* Three-Panel Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* ── Left Panel: Qualitative Vision ───────────────────────────── */}
            <AnimatedSection delay={0.1}>
              <Card className="bg-white/60 dark:bg-card/60 backdrop-blur-xl border-primary/10 shadow-lg h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 font-display text-base">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-chart-3/20 to-chart-3/20">
                      <IconSparkles className="w-4 h-4 text-chart-3 dark:text-chart-3" />
                    </div>
                    Qualitative Vision
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Strategic narratives that shape research direction
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                  {QUALITATIVE_SECTIONS.map((section, i) => {
                    const SectionIcon = section.icon;
                    return (
                      <motion.div
                        key={section.key}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.05 }}
                        className="space-y-1.5"
                      >
                        <Label className="flex items-center gap-1.5 text-xs font-medium">
                          <SectionIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          {section.label}
                        </Label>
                        <Textarea
                          value={qualitative[section.key] || ""}
                          onChange={(e) => updateQualitative(section.key, e.target.value)}
                          placeholder={section.placeholder}
                          rows={3}
                          className="resize-none bg-white/80 dark:bg-background/50 border-primary/10 text-sm focus:ring-2 focus:ring-chart-3/20 transition-shadow"
                        />
                      </motion.div>
                    );
                  })}
                </CardContent>
              </Card>
            </AnimatedSection>

            {/* ── Center Panel: Quantitative Parameters ────────────────────── */}
            <AnimatedSection delay={0.2}>
              <Card className="bg-white/60 dark:bg-card/60 backdrop-blur-xl border-primary/10 shadow-lg h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 font-display text-base">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-accent-pop-2/20">
                      <IconTarget className="w-4 h-4 text-primary dark:text-primary" />
                    </div>
                    Quantitative Parameters
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Numeric thresholds and ranges for property screening
                  </p>
                </CardHeader>
                <CardContent className="max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                  <Accordion type="multiple" defaultValue={["physical", "financial"]} className="space-y-2">
                    {QUANT_GROUPS.map((group, gi) => (
                      <motion.div
                        key={group.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + gi * 0.06 }}
                      >
                        <AccordionItem
                          value={group.id}
                          className="border border-primary/10 rounded-xl overflow-hidden bg-white/40 dark:bg-background/30"
                        >
                          <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-primary/5 transition-colors">
                            <div className="flex items-center justify-between w-full pr-2">
                              <span className="text-sm font-semibold">{group.title}</span>
                              <Badge variant="outline" className="text-[10px] font-mono ml-2 bg-primary/5">
                                {group.summary(quantitative)}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-3 pb-3">
                            <div className="space-y-3 pt-1">
                              {group.fields.map((field) => (
                                <div key={field.key} className="space-y-1">
                                  <Label className="text-xs text-muted-foreground flex items-center">
                                    {field.label}
                                    {field.tooltip && <InfoTooltip text={field.tooltip} />}
                                    {field.suffix && (
                                      <span className="text-[10px] ml-1 text-muted-foreground/60">({field.suffix})</span>
                                    )}
                                  </Label>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      value={quantitative[field.key] as number}
                                      onChange={(e) => updateQuantField(field.key, e.target.value)}
                                      className="h-8 text-sm bg-white/80 dark:bg-background/50 border-primary/10"
                                    />
                                    {field.pairKey && (
                                      <>
                                        <span className="text-xs text-muted-foreground shrink-0">to</span>
                                        <Input
                                          type="number"
                                          value={quantitative[field.pairKey] as number}
                                          onChange={(e) => updateQuantField(field.pairKey!, e.target.value)}
                                          className="h-8 text-sm bg-white/80 dark:bg-background/50 border-primary/10"
                                        />
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </motion.div>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            </AnimatedSection>

            {/* ── Right Panel: Generated Prompt ────────────────────────────── */}
            <AnimatedSection delay={0.3}>
              <Card className="bg-white/60 dark:bg-card/60 backdrop-blur-xl border-primary/10 shadow-lg h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 font-display text-base">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-accent-pop/20 to-accent-pop/20">
                        <IconFileText className="w-4 h-4 text-accent-pop dark:text-accent-pop" />
                      </div>
                      Generated Prompt
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="prompt-mode" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {promptMode === "auto" ? "Auto" : "Manual"}
                      </Label>
                      <Switch
                        id="prompt-mode"
                        checked={promptMode === "manual"}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setManualPrompt(autoPrompt);
                            setPromptMode("manual");
                          } else {
                            setPromptMode("auto");
                          }
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {promptMode === "auto"
                      ? "Live preview — updates as you change inputs"
                      : "Manual mode — edit the prompt directly"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Prompt preview / editor */}
                  <div className="relative">
                    {promptMode === "auto" ? (
                      <div className="max-h-[calc(100vh-360px)] overflow-y-auto rounded-xl bg-gradient-to-br from-foreground to-foreground/90 p-4 font-mono text-xs leading-relaxed shadow-inner">
                        <PromptPreview text={autoPrompt} />
                      </div>
                    ) : (
                      <Textarea
                        value={manualPrompt}
                        onChange={(e) => setManualPrompt(e.target.value)}
                        className="min-h-[calc(100vh-360px)] font-mono text-xs bg-foreground text-background border-primary/10 resize-none leading-relaxed"
                      />
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    {promptMode === "manual" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetToAuto}
                        className="gap-1.5 text-xs"
                      >
                        <IconRefreshCw className="w-3.5 h-3.5" />
                        Reset to Auto
                      </Button>
                    )}
                    <div className="flex-1" />
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {activePrompt.length.toLocaleString()} chars
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </AnimatedSection>
          </div>

          {/* ── Version History Drawer ──────────────────────────────────────── */}
          {showHistory && (
            <AnimatedSection delay={0.1}>
              <Card className="bg-white/60 dark:bg-card/60 backdrop-blur-xl border-primary/10 shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 font-display text-base">
                      <IconHistory className="w-4 h-4 text-primary" />
                      Version History
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                      Close
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No saved versions yet. Save the profile to create the first snapshot.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {versions.map((v, i) => (
                        <motion.div
                          key={v.timestamp}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="flex items-center justify-between p-3 rounded-lg border border-primary/10 bg-white/40 dark:bg-background/30 hover:bg-primary/5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-primary/60" />
                            <div>
                              <p className="text-xs font-medium">
                                {new Date(v.timestamp).toLocaleDateString("en-US", {
                                  month: "short", day: "numeric", year: "numeric",
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {v.prompt.length.toLocaleString()} chars
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => {
                              setManualPrompt(v.prompt);
                              setPromptMode("manual");
                              toast({ title: "Version loaded", description: "Switched to manual mode with the selected version." });
                            }}
                          >
                            Restore
                          </Button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </AnimatedSection>
          )}
        </div>
      </AnimatedPage>
    </Layout>
  );
}

// ── Prompt Preview with Syntax Highlighting ──────────────────────────────────

function PromptPreview({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-0">
      {lines.map((line, i) => {
        let className = "text-muted";

        if (line.startsWith("# ")) {
          className = "text-accent-pop font-bold text-sm mt-2";
        } else if (line.startsWith("## ")) {
          className = "text-primary font-semibold mt-1.5";
        } else if (line.startsWith("### ")) {
          className = "text-chart-1 font-medium mt-1";
        } else if (line.startsWith("- ") || line.startsWith("• ")) {
          className = "text-muted pl-3";
        } else if (line.startsWith("(M)")) {
          className = "text-destructive pl-2";
        } else if (line.startsWith("(N)")) {
          className = "text-chart-1 pl-2";
        } else if (line.match(/^━/)) {
          className = "text-primary/60 font-bold mt-2";
        } else if (line.trim() === "---") {
          className = "text-muted-foreground border-t border-muted-foreground/40 pt-2 mt-2";
        }

        return (
          <div key={i} className={className}>
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}
