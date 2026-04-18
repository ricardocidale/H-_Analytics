import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useExportSave } from "@/hooks/useExportSave";
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { useGlobalAssumptions, useUpdateAdminConfig, useProperties } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  IconCheck, IconInfo, IconPencil,
} from "@/components/icons";
import { Loader2, ChevronDown } from "@/components/icons/themed-icons";
import { ExportMenu, pdfAction, pptxAction } from "@/components/ui/export-toolbar";
import {
  type IcpConfig, type IcpDescriptive,
  DEFAULT_ICP_CONFIG, DEFAULT_ICP_DESCRIPTIVE,
} from "@/components/admin/icp-config";
import { useToast } from "@/hooks/use-toast";

const AMENITY_LABELS: Record<string, string> = {
  pool: "Pool", spa: "Spa", sauna: "Sauna", steamRoom: "Steam Room", coldPlunge: "Cold Plunge",
  yogaStudio: "Yoga Studio", gym: "Gym", tennis: "Tennis", pickleball: "Pickleball",
  hikingTrails: "Hiking Trails", garden: "Garden", vineyard: "Vineyard", casitas: "Casitas",
  barn: "Barn", glamping: "Glamping", firePit: "Fire Pit", wineCellar: "Wine Cellar",
  outdoorKitchen: "Outdoor Kitchen", hotTub: "Hot Tub", horseFacilities: "Horse Facilities",
};

const AMENITY_KEYS = Object.keys(AMENITY_LABELS);

const DESCRIPTIVE_SECTIONS = [
  { key: "propertyTypes", label: "Property Types" },
  { key: "fbLevel", label: "F&B Operations" },
  { key: "locationCharacteristics", label: "Location Characteristics" },
  { key: "locationDetails", label: "Target Markets" },
  { key: "conditionNotes", label: "Condition Requirements" },
  { key: "groundsTopography", label: "Grounds & Topography" },
  { key: "vendorServices", label: "Vendor Services" },
  { key: "regulatoryNotes", label: "Regulatory Notes" },
  { key: "exclusions", label: "Exclusions" },
];

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatNumber(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString();
}

function RangeValue({ min, max, median, prefix = "", suffix = "" }: { min?: number | null; max?: number | null; median?: number | null; prefix?: string; suffix?: string }) {
  if (min == null && max == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {prefix}{formatNumber(min)}{suffix}–{prefix}{formatNumber(max)}{suffix}
      {median != null && <span className="text-muted-foreground text-xs ml-1">(median {prefix}{formatNumber(median)}{suffix})</span>}
    </span>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-semibold text-foreground">{children}</p>
    </div>
  );
}

function ParamCard({ title, items }: { title: string; items: { label: string; value: React.ReactNode }[] }) {
  return (
    <Card className="p-4 space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {items.map(item => (
          <div key={item.label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AmenityChips({ icpConfig }: { icpConfig: IcpConfig }) {
  const priorityColors: Record<string, string> = {
    must: "bg-green-100 text-green-800 border-green-200",
    major: "bg-blue-100 text-blue-800 border-blue-200",
    nice: "bg-gray-100 text-gray-700 border-gray-200",
  };

  const amenities = AMENITY_KEYS
    .map(key => ({ key, label: AMENITY_LABELS[key], priority: (icpConfig as any)[key] as string | undefined }))
    .filter(a => a.priority && a.priority !== "no");

  if (amenities.length === 0) return <p className="text-sm text-muted-foreground">No amenity priorities set.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {amenities.map(a => (
        <span key={a.key} className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${priorityColors[a.priority!] || priorityColors.nice}`}>
          {a.label}
          <span className="ml-1 opacity-60">({a.priority})</span>
        </span>
      ))}
    </div>
  );
}

export default function CompanyIcpDefinition() {
  const queryClient = useQueryClient();
  const { data: global, isLoading } = useGlobalAssumptions();
  const updateMutation = useUpdateAdminConfig();
  const { data: properties = [] } = useProperties();
  const contentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { requestSave, SaveDialog } = useExportSave();

  const [generating, setGenerating] = useState<"quick" | "ai" | null>(null);
  const [defEditing, setDefEditing] = useState(false);
  const [defDraft, setDefDraft] = useState("");
  const [paramsOpen, setParamsOpen] = useState(false);

  const icpConfig: IcpConfig = useMemo(() => ({
    ...DEFAULT_ICP_CONFIG,
    ...((global as any)?.icpConfig && typeof (global as any).icpConfig === "object" ? (global as any).icpConfig : {}),
  }), [global]);

  const icpDescriptive: IcpDescriptive = useMemo(() => ({
    ...DEFAULT_ICP_DESCRIPTIVE,
    ...((global as any)?.icpDescriptive && typeof (global as any).icpDescriptive === "object" ? (global as any).icpDescriptive : {}),
  }), [global]);

  const companyName = global?.companyName ?? "Hospitality Business";
  const meta = (icpConfig as any);
  const isGenerated = !!meta._generated;
  const generatedAt = meta._generatedAt ? new Date(meta._generatedAt) : null;
  const source: string = meta._source ?? "";
  const definition: string = meta._definition ?? "";
  const portfolio = meta._portfolioAnalysis ?? {};

  useEffect(() => {
    if (!global || properties.length === 0) return;
    const ga = (global as any)?.icpConfig?._generatedAt;
    if (!ga) {
      fetch("/api/icp/generate-quick", { method: "POST", credentials: "include" })
        .then(r => r.json())
        .then(() => queryClient.invalidateQueries({ queryKey: ["global-assumptions"] }))
        .catch(() => { /* ignore — auto-generate is best-effort; user can retry from the UI */ });
    }
  }, [global, properties.length, queryClient]);

  const handleGenerate = useCallback(async (mode: "quick" | "ai") => {
    setGenerating(mode);
    try {
      const endpoint = mode === "quick" ? "/api/icp/generate-quick" : "/api/icp/generate";
      const res = await fetch(endpoint, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Generation failed");
      await res.json();
      await queryClient.invalidateQueries({ queryKey: ["global-assumptions"] });
      toast({ title: mode === "quick" ? "Quick ICP Generated" : "AI ICP Generated", description: "ICP updated from your portfolio." });
    } catch {
      toast({ title: "Generation failed", description: "Could not generate ICP. Please try again.", variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  }, [queryClient, toast]);

  const handleSaveDefinition = useCallback(() => {
    const existing = (global as any)?.icpConfig ?? {};
    updateMutation.mutate(
      { icpConfig: { ...existing, _definition: defDraft } } as any,
      {
        onSuccess: () => { setDefEditing(false); toast({ title: "Saved", description: "ICP definition saved." }); },
        onError: () => { toast({ title: "Error", description: "Failed to save.", variant: "destructive" }); },
      }
    );
  }, [global, defDraft, updateMutation, toast]);

  const exportData = useMemo(() => ({
    companyName,
    propertyLabel: global?.propertyLabel ?? "Boutique Hotel",
    companyInputs: [],
    icpConfig,
    icpDescriptive,
    icpQualitative: {},
    icpDefinition: definition,
    qualitativeSections: [],
    amenityItems: [],
    focusAreas: [],
    regions: [],
    customInstructions: null,
    enabledTools: [],
    customSources: [],
    timeHorizon: null,
    preferredLlm: null,
  }), [companyName, global, icpConfig, icpDescriptive, definition]);

  const handleExportPDF = async (customFilename?: string) => {
    try {
      const response = await fetch("/api/premium-export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "pdf", reportType: "company-research-criteria", title: `${companyName} Co. — ICP Definition`, data: exportData }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = customFilename || `${companyName.replace(/\s+/g, "-")}-ICP-Definition.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: "PDF downloaded successfully." });
    } catch {
      toast({ title: "Export failed", description: "Could not generate PDF.", variant: "destructive" });
    }
  };

  const handleExportPPTX = async (customFilename?: string) => {
    try {
      const response = await fetch("/api/premium-export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "pptx", reportType: "company-research-criteria", title: `${companyName} Co. — ICP Definition`, data: exportData }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = customFilename || `${companyName.replace(/\s+/g, "-")}-ICP-Definition.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: "PowerPoint downloaded successfully." });
    } catch {
      toast({ title: "Export failed", description: "Could not generate PowerPoint.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (<Layout><div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></Layout>);
  }

  if (!global) {
    return (<Layout><div className="flex flex-col items-center justify-center h-[60vh]"><p className="text-muted-foreground">Failed to load company data.</p></div></Layout>);
  }

  const noProperties = properties.length === 0;

  return (
    <Layout>
      {SaveDialog}
      <AnimatedPage>
        <div className="space-y-6 max-w-5xl" ref={contentRef}>
          <PageHeader
            title={`ICP Definition — ${companyName}`}
            subtitle="Auto-generated from your portfolio"
            variant="dark"
            backLink="/company/assumptions"
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerate("quick")}
                  disabled={noProperties || generating !== null}
                  data-testid="button-quick-generate"
                >
                  {generating === "quick" ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Quick Generate
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleGenerate("ai")}
                  disabled={noProperties || generating !== null}
                  data-testid="button-ai-generate"
                >
                  {generating === "ai" ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Generate with AI
                </Button>
                <ExportMenu actions={[pdfAction(() => requestSave(`${companyName} ICP Definition`, ".pdf", (f) => handleExportPDF(f))), pptxAction(() => requestSave(`${companyName} ICP Definition`, ".pptx", (f) => handleExportPPTX(f)))]} />
              </div>
            }
          />

          {noProperties && (
            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-4" data-testid="no-properties-warning">
              <div className="flex gap-3">
                <IconInfo className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-200">Add at least one property first to generate your ICP.</p>
              </div>
            </Card>
          )}

          {isGenerated ? (
            <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 p-4" data-testid="status-generated">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                  <IconCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    ICP generated from {portfolio.propertyCount ?? "—"} properties
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {generatedAt && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        {generatedAt.toLocaleDateString()} at {generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {source === "portfolio+ai" ? "Portfolio + AI" : "Portfolio Only"}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="bg-primary/5 border-primary/20 p-4" data-testid="status-not-generated">
              <div className="flex gap-3">
                <IconInfo className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  ICP has not been generated yet. Click Generate to build from your portfolio.
                </p>
              </div>
            </Card>
          )}

          <section className="space-y-3" data-testid="section-investment-thesis">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display font-semibold text-foreground">Investment Thesis</h2>
              {!defEditing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setDefDraft(definition || ""); setDefEditing(true); }}
                  data-testid="button-edit-thesis"
                >
                  <IconPencil className="w-4 h-4 mr-1.5" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDefEditing(false)} data-testid="button-cancel-thesis">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveDefinition} disabled={updateMutation.isPending} data-testid="button-save-thesis">
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                    Save
                  </Button>
                </div>
              )}
            </div>
            <Card className="p-6">
              {defEditing ? (
                <Textarea
                  value={defDraft}
                  onChange={e => setDefDraft(e.target.value)}
                  rows={12}
                  className="font-serif text-base leading-relaxed resize-y"
                  data-testid="textarea-thesis"
                />
              ) : definition ? (
                <div className="prose prose-sm dark:prose-invert max-w-none font-serif text-base leading-relaxed whitespace-pre-wrap" data-testid="text-thesis-content">
                  {definition}
                </div>
              ) : (
                <p className="text-muted-foreground italic text-center py-8" data-testid="text-thesis-placeholder">
                  Click &ldquo;Generate with AI&rdquo; to create an investor-ready ICP narrative
                </p>
              )}
            </Card>
          </section>

          {isGenerated && portfolio && (
            <section className="space-y-4" data-testid="section-portfolio-snapshot">
              <h2 className="text-xl font-display font-semibold text-foreground">Portfolio Snapshot</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Properties">
                  {formatNumber(portfolio.propertyCount)}
                </StatCard>
                <StatCard label="Rooms">
                  <RangeValue min={portfolio.rooms?.min} max={portfolio.rooms?.max} median={portfolio.rooms?.median} />
                </StatCard>
                <StatCard label="ADR">
                  <RangeValue min={portfolio.adr?.min} max={portfolio.adr?.max} median={portfolio.adr?.median} prefix="$" />
                </StatCard>
                <StatCard label="Acquisition">
                  {portfolio.purchasePrice ? (
                    <span>{formatCurrency(portfolio.purchasePrice.min)}–{formatCurrency(portfolio.purchasePrice.max)}</span>
                  ) : "—"}
                </StatCard>
                <StatCard label="Quality">
                  <span>{portfolio.dominantQualityTier || "—"}</span>
                  {portfolio.qualityTiers && Object.keys(portfolio.qualityTiers).length > 1 && (
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      {Object.entries(portfolio.qualityTiers).map(([tier, count]) => `${tier}: ${count}`).join(", ")}
                    </span>
                  )}
                </StatCard>
                <StatCard label="F&B Rating">
                  {portfolio.fbRating != null ? `${portfolio.fbRating}/5` : "—"}
                </StatCard>
              </div>

              {(portfolio.regions?.length > 0 || portfolio.businessModels) && (
                <div className="flex flex-wrap gap-4">
                  {portfolio.regions?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Regions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {portfolio.regions.map((r: string) => (
                          <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {portfolio.businessModels && Object.keys(portfolio.businessModels).length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Business Models</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(portfolio.businessModels).map(([model, count]) => (
                          <Badge key={model} variant="outline" className="text-xs">{model}: {count as number}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <Collapsible open={paramsOpen} onOpenChange={setParamsOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 w-full text-left" data-testid="trigger-key-parameters">
                <h2 className="text-xl font-display font-semibold text-foreground">Key Parameters</h2>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${paramsOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ParamCard title="Target Property" items={[
                  { label: "Rooms", value: `${icpConfig.roomsMin ?? "—"}–${icpConfig.roomsMax ?? "—"}` },
                  { label: "Sweet Spot", value: `${(icpConfig as any).roomsSweetSpotMin ?? "—"}–${(icpConfig as any).roomsSweetSpotMax ?? "—"}` },
                  { label: "Land (acres)", value: `${icpConfig.landAcresMin ?? "—"}–${icpConfig.landAcresMax ?? "—"}` },
                  { label: "Built SqFt", value: `${formatNumber(icpConfig.builtSqFtMin)}–${formatNumber(icpConfig.builtSqFtMax)}` },
                  { label: "ADR", value: `$${icpConfig.adrMin ?? "—"}–$${icpConfig.adrMax ?? "—"}` },
                  { label: "Occupancy", value: `${icpConfig.occupancyMin ?? "—"}%–${icpConfig.occupancyMax ?? "—"}%` },
                  { label: "F&B Rating", value: `${icpConfig.fbRating ?? "—"}/5` },
                ]} />

                <ParamCard title="Financial Targets" items={[
                  { label: "Acquisition", value: `${formatCurrency(icpConfig.acquisitionMin)}–${formatCurrency(icpConfig.acquisitionMax)}` },
                  { label: "Target Acq.", value: `${formatCurrency((icpConfig as any).acquisitionTargetMin)}–${formatCurrency((icpConfig as any).acquisitionTargetMax)}` },
                  { label: "Total Investment", value: `${formatCurrency((icpConfig as any).totalInvestmentMin)}–${formatCurrency((icpConfig as any).totalInvestmentMax)}` },
                  { label: "Renovation", value: `${formatCurrency((icpConfig as any).renovationMin)}–${formatCurrency((icpConfig as any).renovationMax)}` },
                  { label: "Target IRR", value: `${(icpConfig as any).targetIrr ?? "—"}%` },
                  { label: "Equity Multiple", value: `${(icpConfig as any).equityMultipleMin ?? "—"}x–${(icpConfig as any).equityMultipleMax ?? "—"}x` },
                  { label: "Hold Years", value: `${icpConfig.holdYearsMin ?? "—"}–${icpConfig.holdYearsMax ?? "—"}` },
                  { label: "Exit Cap Rate", value: `${(icpConfig as any).exitCapRateMin ?? "—"}%–${(icpConfig as any).exitCapRateMax ?? "—"}%` },
                ]} />

                <ParamCard title="Revenue Mix" items={[
                  { label: "F&B Share", value: `${(icpConfig as any).fbShareMin ?? "—"}%–${(icpConfig as any).fbShareMax ?? "—"}%` },
                  { label: "Events Share", value: `${(icpConfig as any).eventsShareMin ?? "—"}%–${(icpConfig as any).eventsShareMax ?? "—"}%` },
                  { label: "Total Ancillary", value: `${(icpConfig as any).totalAncillaryMin ?? "—"}%–${(icpConfig as any).totalAncillaryMax ?? "—"}%` },
                  { label: "Base Mgmt Fee", value: `${(icpConfig as any).baseMgmtFeeMin ?? "—"}%–${(icpConfig as any).baseMgmtFeeMax ?? "—"}%` },
                  { label: "Incentive Fee", value: `${(icpConfig as any).incentiveFeeMin ?? "—"}%–${(icpConfig as any).incentiveFeeMax ?? "—"}%` },
                ]} />

                <Card className="p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">Amenities</h4>
                  <AmenityChips icpConfig={icpConfig} />
                </Card>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <section className="space-y-2" data-testid="section-qualitative">
            <h2 className="text-xl font-display font-semibold text-foreground">Qualitative Sections</h2>
            <Accordion type="multiple" className="space-y-1">
              {DESCRIPTIVE_SECTIONS.map(({ key, label }) => {
                const content = (icpDescriptive as any)[key] as string | undefined;
                return (
                  <AccordionItem key={key} value={key} className="border rounded-lg px-4">
                    <AccordionTrigger className="text-sm font-medium" data-testid={`accordion-${key}`}>
                      {label}
                    </AccordionTrigger>
                    <AccordionContent>
                      {content?.trim() ? (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid={`text-${key}`}>
                          {content}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic" data-testid={`text-${key}-empty`}>
                          Generate ICP to populate.
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </section>
        </div>
      </AnimatedPage>
    </Layout>
  );
}
