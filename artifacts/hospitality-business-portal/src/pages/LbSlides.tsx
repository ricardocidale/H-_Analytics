/**
 * LbSlides.tsx — LB Slide Studio
 *
 * Full authoring environment for the ONE canonical L+B portfolio investor
 * deck (6 slides). Responsibilities:
 *
 *   1. Property assignment for slides 1, 2, 3, 5 (top-level Config tab)
 *   2. Per-slide tabbed editor panels (Slide 1…6 tabs) — each embeds the
 *      corresponding SlideNEditorPanel component
 *   3. Canonical reference PNG toggle on every slide tab
 *   4. Global copy fields for slides 4 (section subtitle) and 6 (disclaimer)
 *   5. PDF render trigger + download (Config tab)
 */

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { Slide1EditorPanel } from "@/features/internal-deck/editor/Slide1EditorPanel";
import { Slide2EditorPanel } from "@/features/internal-deck/editor/Slide2EditorPanel";
import { Slide3EditorPanel } from "@/features/internal-deck/editor/Slide3EditorPanel";
import { Slide5EditorPanel } from "@/features/internal-deck/editor/Slide5EditorPanel";
import type { ReadinessResponse } from "@/features/internal-deck/editor/editor-shared";

// ── Constants ──────────────────────────────────────────────────────────────

const NONE = "__none__";
const POLL_INTERVAL_MS = 3_000;
const SLIDE_TABS = ["config", "s1", "s2", "s3", "s4", "s5", "s6"] as const;
type SlideTab = (typeof SLIDE_TABS)[number];
const SLIDE4_SUBTITLE_MAX = 80;
const SLIDE6_DISCLAIMER_MAX = 200;

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
  slide4SectionSubtitle?: string | null;
  slide6Disclaimer?: string | null;
  updatedAt?: string | null;
}

interface RenderStatus {
  status: "idle" | "rendering" | "ready" | "error";
  lastRenderedAt: string | null;
  lastError: string | null;
}

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
      if (!r.ok) return {
        slide1PropertyId: null,
        slide2PropertyId: null,
        slide3PropertyId: null,
        slide5PropertyId: null,
      };
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
      const r = await fetch(
        `/api/admin/properties/${propertyId}/deck-payload/readiness`,
        { credentials: "include" },
      );
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

// ── Canonical reference PNG toggle ─────────────────────────────────────────

function CanonicalReferenceToggle({
  slideNum,
  showCanonical,
  onToggle,
}: {
  slideNum: number;
  showCanonical: Record<string, boolean>;
  onToggle: (tab: string) => void;
}) {
  const tab = `s${slideNum}`;
  const isShown = showCanonical[tab] ?? false;

  const Icon = isShown ? ChevronDown : ChevronRight;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onToggle(tab)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded px-1.5 py-1 hover:bg-muted/50"
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {isShown ? "Hide canonical reference" : "Show canonical reference"}
      </button>
      {isShown && (
        <div className="rounded-md border overflow-hidden bg-muted/30">
          <img
            src={`/api/lb-slides/canonical/${slideNum}`}
            alt={`Canonical reference for slide ${slideNum}`}
            className="w-full"
            loading="lazy"
          />
        </div>
      )}
    </div>
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
  const [slide4Subtitle, setSlide4Subtitle] = useState<string>("");
  const [slide6Disclaimer, setSlide6Disclaimer] = useState<string>("");
  const [showCanonical, setShowCanonical] = useState<Record<string, boolean>>({});
  const [isPolling, setIsPolling] = useState(false);

  const { data: renderStatus } = useRenderStatus(isPolling);

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
    setSlide4Subtitle(savedConfig.slide4SectionSubtitle ?? "");
    setSlide6Disclaimer(savedConfig.slide6Disclaimer ?? "");
  }, [savedConfig]);

  // Stop polling when render finishes
  useEffect(() => {
    if (renderStatus?.status && renderStatus.status !== "rendering") {
      setIsPolling(false);
    }
  }, [renderStatus?.status]);

  const toggleCanonical = (tab: string) => {
    setShowCanonical(prev => ({ ...prev, [tab]: !prev[tab] }));
  };

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
    saveMutation.mutate({
      slide1PropertyId: slide1Id,
      slide2PropertyId: slide2Id,
      slide3PropertyId: slide3Id,
      slide5PropertyId: slide5Id,
      slide4SectionSubtitle: slide4Subtitle.trim() || null,
      slide6Disclaimer: slide6Disclaimer.trim() || null,
    });
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
              <TabsTrigger value="config" className="text-xs">Setup</TabsTrigger>
              <TabsTrigger value="s1" className="text-xs">
                1 · Spotlight
                <ReadinessTabBadge staleMissingCount={r1?.staleMissingCount} />
              </TabsTrigger>
              <TabsTrigger value="s2" className="text-xs">
                2 · Gallery
                <ReadinessTabBadge staleMissingCount={r2?.staleMissingCount} />
              </TabsTrigger>
              <TabsTrigger value="s3" className="text-xs">
                3 · Investment
                <ReadinessTabBadge staleMissingCount={r3?.staleMissingCount} />
              </TabsTrigger>
              <TabsTrigger value="s4" className="text-xs">4 · Portfolio</TabsTrigger>
              <TabsTrigger value="s5" className="text-xs">
                5 · Financials
                <ReadinessTabBadge staleMissingCount={r5?.staleMissingCount} />
              </TabsTrigger>
              <TabsTrigger value="s6" className="text-xs">6 · Statement</TabsTrigger>
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

                  <div className="rounded-md bg-muted/40 border border-border/50 px-3 py-2.5 text-sm space-y-0.5">
                    <p className="font-medium text-foreground/80 text-xs uppercase tracking-wide mb-1">Auto-generated — no assignment needed</p>
                    <p className="text-muted-foreground text-xs">Slide 4 — Portfolio grid of all properties with hero photos</p>
                    <p className="text-muted-foreground text-xs">Slide 6 — 10-year aggregated USALI consolidated income statement</p>
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
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Slide Readiness</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { num: 1, label: "Spotlight", r: r1 },
                      { num: 2, label: "Gallery", r: r2 },
                      { num: 3, label: "Investment", r: r3 },
                      { num: 5, label: "Financials", r: r5 },
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
                </div>
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
            <TabsContent value="s1" className="mt-4 space-y-3">
              <CanonicalReferenceToggle slideNum={1} showCanonical={showCanonical} onToggle={toggleCanonical} />
              {noPropertyForTab.s1 ? (
                <NoPropertyNotice slideNum={1} onGoToConfig={() => setActiveTab("config")} />
              ) : (
                <Slide1EditorPanel propertyId={slide1Id!} />
              )}
            </TabsContent>

            <TabsContent value="s2" className="mt-4 space-y-3">
              <CanonicalReferenceToggle slideNum={2} showCanonical={showCanonical} onToggle={toggleCanonical} />
              {noPropertyForTab.s2 ? (
                <NoPropertyNotice slideNum={2} onGoToConfig={() => setActiveTab("config")} />
              ) : (
                <Slide2EditorPanel propertyId={slide2Id!} />
              )}
            </TabsContent>

            <TabsContent value="s3" className="mt-4 space-y-3">
              <CanonicalReferenceToggle slideNum={3} showCanonical={showCanonical} onToggle={toggleCanonical} />
              {noPropertyForTab.s3 ? (
                <NoPropertyNotice slideNum={3} onGoToConfig={() => setActiveTab("config")} />
              ) : (
                <Slide3EditorPanel propertyId={slide3Id!} />
              )}
            </TabsContent>

            <TabsContent value="s4" className="mt-4 space-y-4">
              <CanonicalReferenceToggle slideNum={4} showCanonical={showCanonical} onToggle={toggleCanonical} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Slide 4 — Portfolio Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Slide 4 is a portfolio grid auto-generated from all properties. You can add an optional
                    section subtitle that appears below the slide header.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Section subtitle{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <Input
                      value={slide4Subtitle}
                      onChange={e => setSlide4Subtitle(e.target.value.slice(0, SLIDE4_SUBTITLE_MAX))}
                      placeholder="e.g. Current acquisition pipeline across active markets"
                      maxLength={SLIDE4_SUBTITLE_MAX}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {slide4Subtitle.length}/{SLIDE4_SUBTITLE_MAX}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    Save Slide 4
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="s5" className="mt-4 space-y-3">
              <CanonicalReferenceToggle slideNum={5} showCanonical={showCanonical} onToggle={toggleCanonical} />
              {noPropertyForTab.s5 ? (
                <NoPropertyNotice slideNum={5} onGoToConfig={() => setActiveTab("config")} />
              ) : (
                <Slide5EditorPanel propertyId={slide5Id!} />
              )}
            </TabsContent>

            <TabsContent value="s6" className="mt-4 space-y-4">
              <CanonicalReferenceToggle slideNum={6} showCanonical={showCanonical} onToggle={toggleCanonical} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Slide 6 — Consolidated Income Statement</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Slide 6 is the 10-year aggregated USALI pro forma, calculated automatically from all
                    portfolio properties. You can add an optional disclaimer for the callout box at the bottom.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Disclaimer{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <Textarea
                      value={slide6Disclaimer}
                      onChange={e => setSlide6Disclaimer(e.target.value.slice(0, SLIDE6_DISCLAIMER_MAX))}
                      placeholder="e.g. All projections are based on management's best estimates and subject to change."
                      rows={3}
                      maxLength={SLIDE6_DISCLAIMER_MAX}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {slide6Disclaimer.length}/{SLIDE6_DISCLAIMER_MAX}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    Save Slide 6
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AnimatedPage>
    </Layout>
  );
}

// ── Guard notice ───────────────────────────────────────────────────────────

function NoPropertyNotice({
  slideNum,
  onGoToConfig,
}: {
  slideNum: number;
  onGoToConfig: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-medium">No property assigned to Slide {slideNum}</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Go to the Config tab and assign a property to Slide {slideNum}, then save.
        </p>
        <Button size="sm" variant="outline" onClick={onGoToConfig}>
          Go to Config →
        </Button>
      </CardContent>
    </Card>
  );
}
