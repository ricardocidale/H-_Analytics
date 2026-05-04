/**
 * LbSlides.tsx — LB Slide Studio
 *
 * Full authoring environment for the ONE canonical L+B portfolio investor
 * deck (6 slides). Responsibilities:
 *
 *   1. Property assignment for slides 1, 2, 3, 5 (top-level Config tab)
 *   2. Per-slide tabbed editor panels (Slide 1…6 tabs) — each embeds the
 *      corresponding SlideNEditorPanel component
 *   3. Slide readiness tracking badges on each tab
 *   4. PDF render trigger + download (Config tab)
 *
 * Slides 4 and 6 are auto-generated and have minimal authoring surfaces.
 */

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { IconDownload, IconRefreshCw } from "@/components/icons";
import { Slide1EditorPanel } from "@/features/internal-deck/editor/Slide1EditorPanel";
import { Slide2EditorPanel } from "@/features/internal-deck/editor/Slide2EditorPanel";
import { Slide3EditorPanel } from "@/features/internal-deck/editor/Slide3EditorPanel";
import { Slide5EditorPanel } from "@/features/internal-deck/editor/Slide5EditorPanel";
import type { ReadinessResponse } from "@/features/internal-deck/editor/editor-shared";

// ── Types ──────────────────────────────────────────────────────────────────

interface Property {
  id: number;
  name: string;
  city?: string;
  stateProvince?: string;
}

interface LbConfig {
  slide1PropertyId: number | null;
  slide2PropertyId: number | null;
  slide3PropertyId: number | null;
  slide5PropertyId: number | null;
  updatedAt?: string | null;
}

interface RenderStatus {
  status: "idle" | "rendering" | "ready" | "error";
  lastRenderedAt: string | null;
  lastError: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const NONE = "__none__";
const POLL_INTERVAL_MS = 3_000;
const SLIDE_TABS = ["config", "s1", "s2", "s3", "s4", "s5", "s6"] as const;
type SlideTab = (typeof SLIDE_TABS)[number];

// ── Data hooks ─────────────────────────────────────────────────────────────

function useProperties() {
  return useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: async () => {
      const r = await fetch("/api/properties", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load properties");
      return r.json() as Promise<Property[]>;
    },
  });
}

function useLbConfig() {
  return useQuery<LbConfig>({
    queryKey: ["lb-slides-config"],
    queryFn: async () => {
      const r = await fetch("/api/lb-slides/config", { credentials: "include" });
      if (!r.ok) return { slide1PropertyId: null, slide2PropertyId: null, slide3PropertyId: null, slide5PropertyId: null };
      return r.json() as Promise<LbConfig>;
    },
  });
}

function useRenderStatus(enabled: boolean) {
  return useQuery<RenderStatus>({
    queryKey: ["lb-slides-render-status"],
    queryFn: async () => {
      const r = await fetch("/api/lb-slides/render-status", { credentials: "include" });
      if (!r.ok) return { status: "idle" as const, lastRenderedAt: null, lastError: null };
      return r.json() as Promise<RenderStatus>;
    },
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
  });
}

function useSlideReadiness(propertyId: number | null) {
  return useQuery<ReadinessResponse>({
    queryKey: ["/api/admin/properties", propertyId, "deck-payload", "readiness"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/properties/${propertyId}/deck-payload/readiness`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<ReadinessResponse>;
    },
    enabled: propertyId != null && Number.isFinite(propertyId),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function propertyLabel(properties: Property[], id: number | null): string {
  if (!id) return "None selected";
  const p = properties.find(x => x.id === id);
  if (!p) return String(id);
  return `${p.name}${p.city ? ` — ${p.city}${p.stateProvince ? `, ${p.stateProvince}` : ""}` : ""}`;
}

function ReadinessTabBadge({ staleMissingCount }: { staleMissingCount: number | undefined }) {
  if (staleMissingCount == null) return null;
  if (staleMissingCount === 0) {
    return (
      <span className="ml-1.5 inline-flex items-center justify-center rounded-full w-4 h-4 text-[9px] font-bold bg-emerald-100 text-emerald-700">
        ✓
      </span>
    );
  }
  return (
    <span className="ml-1.5 inline-flex items-center justify-center rounded-full w-4 h-4 text-[9px] font-bold bg-amber-100 text-amber-700">
      {staleMissingCount}
    </span>
  );
}

// ── Property selector for a single slide assignment ────────────────────────

function SlidePropertySelector({
  slideNum,
  description,
  value,
  onChange,
  properties,
  disabled,
}: {
  slideNum: number;
  description: string;
  value: number | null;
  onChange: (v: number | null) => void;
  properties: Property[];
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Slide {slideNum}
        </span>
        <span className="text-xs text-muted-foreground">— {description}</span>
      </div>
      <Select
        value={value ? String(value) : NONE}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a property…">
            {value ? propertyLabel(properties, value) : "Select a property…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— None —</SelectItem>
          {properties.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}{p.city ? ` — ${p.city}${p.stateProvince ? `, ${p.stateProvince}` : ""}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LbSlides() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: propertiesRaw = [], isLoading: propsLoading } = useProperties();
  const { data: savedConfig, isLoading: configLoading } = useLbConfig();

  const [activeTab, setActiveTab] = useState<SlideTab>("config");

  const [slide1Id, setSlide1Id] = useState<number | null>(null);
  const [slide2Id, setSlide2Id] = useState<number | null>(null);
  const [slide3Id, setSlide3Id] = useState<number | null>(null);
  const [slide5Id, setSlide5Id] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const { data: renderStatus } = useRenderStatus(isPolling);

  // Readiness for each assigned property
  const { data: r1 } = useSlideReadiness(slide1Id);
  const { data: r2 } = useSlideReadiness(slide2Id);
  const { data: r3 } = useSlideReadiness(slide3Id);
  const { data: r5 } = useSlideReadiness(slide5Id);

  // Hydrate local state from saved config
  useEffect(() => {
    if (!savedConfig) return;
    setSlide1Id(savedConfig.slide1PropertyId);
    setSlide2Id(savedConfig.slide2PropertyId);
    setSlide3Id(savedConfig.slide3PropertyId);
    setSlide5Id(savedConfig.slide5PropertyId);
  }, [savedConfig]);

  // Stop polling when render finishes
  useEffect(() => {
    if (renderStatus?.status && renderStatus.status !== "rendering") {
      setIsPolling(false);
    }
  }, [renderStatus?.status]);

  const saveMutation = useMutation({
    mutationFn: async (config: LbConfig) => {
      const r = await fetch("/api/lb-slides/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to save config");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration saved" });
      void qc.invalidateQueries({ queryKey: ["lb-slides-config"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const renderMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/lb-slides/render", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to start render");
      }
      return r.json();
    },
    onSuccess: () => {
      setIsPolling(true);
      toast({ title: "Render started", description: "PDF generation underway — takes ~30 seconds." });
      void qc.invalidateQueries({ queryKey: ["lb-slides-render-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Render failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({ slide1PropertyId: slide1Id, slide2PropertyId: slide2Id, slide3PropertyId: slide3Id, slide5PropertyId: slide5Id });
  };

  const allConfigured = Boolean(slide1Id && slide2Id && slide3Id && slide5Id);
  const isLoading = propsLoading || configLoading;
  const status = renderStatus?.status ?? "idle";

  const statusBadgeMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    idle: { label: "Not rendered", variant: "secondary" },
    rendering: { label: "Rendering…", variant: "outline" },
    ready: { label: "Ready", variant: "default" },
    error: { label: "Error", variant: "destructive" },
  };
  const badge = statusBadgeMap[status] ?? statusBadgeMap.idle;

  // Guard: if a slide tab is active but that property isn't assigned yet
  const noPropertyForTab: Record<SlideTab, boolean> = {
    config: false,
    s1: !slide1Id,
    s2: !slide2Id,
    s3: !slide3Id,
    s4: false,
    s5: !slide5Id,
    s6: false,
  };

  return (
    <Layout>
      <AnimatedPage>
        <div className="max-w-4xl mx-auto space-y-4 p-4 sm:p-6">
          <PageHeader
            title="LB Slide Studio"
            subtitle="Canonical 6-slide portfolio investor deck. Assign properties, author each slide, then render the PDF."
          />

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SlideTab)}>
            <TabsList className="flex flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="config" className="text-xs">Config & Render</TabsTrigger>
              <TabsTrigger value="s1" className="text-xs">
                Slide 1
                <ReadinessTabBadge staleMissingCount={r1?.staleMissingCount} />
              </TabsTrigger>
              <TabsTrigger value="s2" className="text-xs">
                Slide 2
                <ReadinessTabBadge staleMissingCount={r2?.staleMissingCount} />
              </TabsTrigger>
              <TabsTrigger value="s3" className="text-xs">
                Slide 3
                <ReadinessTabBadge staleMissingCount={r3?.staleMissingCount} />
              </TabsTrigger>
              <TabsTrigger value="s4" className="text-xs">Slide 4</TabsTrigger>
              <TabsTrigger value="s5" className="text-xs">
                Slide 5
                <ReadinessTabBadge staleMissingCount={r5?.staleMissingCount} />
              </TabsTrigger>
              <TabsTrigger value="s6" className="text-xs">Slide 6</TabsTrigger>
            </TabsList>

            {/* ── Config & Render tab ─────────────────────────────────── */}
            <TabsContent value="config" className="mt-4 space-y-4">
              {/* Property assignments */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Property Assignments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Slides 1, 2, 3, and 5 each spotlight one property. Slides 4 and 6 are auto-generated.
                    After saving here, use the slide tabs to author copy for each property.
                  </p>

                  <SlidePropertySelector slideNum={1} description="Pipeline Spotlight · hero photo + specs" value={slide1Id} onChange={setSlide1Id} properties={propertiesRaw} disabled={isLoading} />
                  <SlidePropertySelector slideNum={2} description="Photo Gallery · 2×2 photo showcase" value={slide2Id} onChange={setSlide2Id} properties={propertiesRaw} disabled={isLoading} />
                  <SlidePropertySelector slideNum={3} description="Investment Model · concept + market rationale" value={slide3Id} onChange={setSlide3Id} properties={propertiesRaw} disabled={isLoading} />
                  <SlidePropertySelector slideNum={5} description="Financial Snapshot · transformation plan" value={slide5Id} onChange={setSlide5Id} properties={propertiesRaw} disabled={isLoading} />

                  <div className="pt-2 border-t border-border/60 text-xs text-muted-foreground space-y-0.5">
                    <div className="font-medium text-foreground/70">Auto-generated (no assignment needed)</div>
                    <div>Slide 4 — Portfolio grid of all properties with hero photos</div>
                    <div>Slide 6 — 10-year aggregated USALI consolidated income statement</div>
                  </div>

                  <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending || isLoading}
                    className="w-full sm:w-auto"
                  >
                    {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Save configuration
                  </Button>
                </CardContent>
              </Card>

              {/* Readiness summary */}
              {(slide1Id || slide2Id || slide3Id || slide5Id) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Slide Readiness</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { num: 1, label: "Pipeline Spotlight", r: r1 },
                        { num: 2, label: "Photo Gallery", r: r2 },
                        { num: 3, label: "Investment Model", r: r3 },
                        { num: 5, label: "Financial Snapshot", r: r5 },
                      ].map(({ num, label, r }) => {
                        const missing = r?.staleMissingCount;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setActiveTab(`s${num}` as SlideTab)}
                            className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                          >
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Slide {num}
                            </span>
                            <span className="text-xs text-foreground">{label}</span>
                            {missing == null ? (
                              <Badge variant="secondary" className="text-[10px]">Loading…</Badge>
                            ) : missing === 0 ? (
                              <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 text-[10px]">Ready</Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]">{missing} slot{missing !== 1 ? "s" : ""} missing/stale</Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* PDF render */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">PDF Render</CardTitle>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {renderStatus?.lastRenderedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last rendered: {new Date(renderStatus.lastRenderedAt).toLocaleString()}
                    </p>
                  )}
                  {renderStatus?.lastError && (
                    <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
                      Error: {renderStatus.lastError}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Opens a headless browser, loads all 6 slides at native 960×540, and exports a single
                    print-ready PDF. Takes ~30–60 seconds.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={() => renderMutation.mutate()}
                      disabled={!allConfigured || renderMutation.isPending || status === "rendering"}
                      variant="default"
                      title={!allConfigured ? "Assign all four properties before rendering" : undefined}
                    >
                      {status === "rendering" ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <IconRefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {status === "rendering" ? "Rendering…" : "Render PDF"}
                    </Button>
                    {status === "ready" && (
                      <Button asChild variant="outline">
                        <a href="/api/lb-slides/download/combined.pdf" download="lb-slide-deck.pdf">
                          <IconDownload className="w-4 h-4 mr-2" />
                          Download PDF
                        </a>
                      </Button>
                    )}
                  </div>
                  {!allConfigured && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Assign all four properties above and save before rendering.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Slide editor tabs ──────────────────────────────────── */}
            <TabsContent value="s1" className="mt-4">
              {noPropertyForTab.s1 ? (
                <NoPropertyNotice slideNum={1} onGoToConfig={() => setActiveTab("config")} />
              ) : (
                <Slide1EditorPanel propertyId={slide1Id!} />
              )}
            </TabsContent>

            <TabsContent value="s2" className="mt-4">
              {noPropertyForTab.s2 ? (
                <NoPropertyNotice slideNum={2} onGoToConfig={() => setActiveTab("config")} />
              ) : (
                <Slide2EditorPanel propertyId={slide2Id!} />
              )}
            </TabsContent>

            <TabsContent value="s3" className="mt-4">
              {noPropertyForTab.s3 ? (
                <NoPropertyNotice slideNum={3} onGoToConfig={() => setActiveTab("config")} />
              ) : (
                <Slide3EditorPanel propertyId={slide3Id!} />
              )}
            </TabsContent>

            <TabsContent value="s4" className="mt-4">
              <Slide4AutoNotice />
            </TabsContent>

            <TabsContent value="s5" className="mt-4">
              {noPropertyForTab.s5 ? (
                <NoPropertyNotice slideNum={5} onGoToConfig={() => setActiveTab("config")} />
              ) : (
                <Slide5EditorPanel propertyId={slide5Id!} />
              )}
            </TabsContent>

            <TabsContent value="s6" className="mt-4">
              <Slide6AutoNotice />
            </TabsContent>
          </Tabs>
        </div>
      </AnimatedPage>
    </Layout>
  );
}

// ── Guard notice ───────────────────────────────────────────────────────────

function Slide4AutoNotice() {
  return (
    <Card>
      <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-medium">Slide 4 — Portfolio Overview</p>
        <p className="text-sm text-muted-foreground max-w-md">
          This slide is fully auto-generated from the property portfolio — a 3×2 grid of all
          properties with hero photos, status badges, and acquisition prices. No authoring is
          required here.
        </p>
        <Badge variant="secondary">Auto-generated</Badge>
      </CardContent>
    </Card>
  );
}

function Slide6AutoNotice() {
  return (
    <Card>
      <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-medium">Slide 6 — Consolidated Income Statement</p>
        <p className="text-sm text-muted-foreground max-w-md">
          This slide is fully auto-generated from the H+ Analytics financial engine — a
          5-year pro forma income statement with key investor metrics (IRR, equity multiple,
          exit value). No authoring is required here.
        </p>
        <Badge variant="secondary">Auto-generated</Badge>
      </CardContent>
    </Card>
  );
}

function NoPropertyNotice({ slideNum, onGoToConfig }: { slideNum: number; onGoToConfig: () => void }) {
  return (
    <Card>
      <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          No property assigned to Slide {slideNum} yet.
        </p>
        <Button variant="outline" size="sm" onClick={onGoToConfig}>
          Go to Config tab to assign a property
        </Button>
      </CardContent>
    </Card>
  );
}
