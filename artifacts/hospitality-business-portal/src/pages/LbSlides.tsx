/**
 * LbSlides.tsx
 *
 * Admin page at `/lb-slides` for configuring and generating the LB Slide Deck —
 * ONE canonical portfolio investor deck (not per-property).
 *
 * Responsibilities:
 *   1. Assign properties to slides 1, 2, 3, 5 (admin-chosen spotlight properties)
 *   2. Render the 6-slide PDF (POST /api/lb-slides/render)
 *   3. Download the rendered PDF (GET /api/lb-slides/download/combined.pdf)
 *
 * Slides 4 and 6 are auto-generated:
 *   Slide 4 — portfolio grid (all properties as siblings)
 *   Slide 6 — 10-year aggregated USALI pro forma (sum across all properties)
 */

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const NONE = "__none__";
const POLL_INTERVAL_MS = 3000;

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

function propertyLabel(properties: Property[], id: number | null): string {
  if (!id) return "None selected";
  const p = properties.find(x => x.id === id);
  if (!p) return String(id);
  return `${p.name}${p.city ? ` — ${p.city}${p.stateProvince ? `, ${p.stateProvince}` : ""}` : ""}`;
}

export default function LbSlides() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: propertiesRaw = [], isLoading: propsLoading } = useProperties();
  const { data: savedConfig, isLoading: configLoading } = useLbConfig();

  const [slide1Id, setSlide1Id] = useState<number | null>(null);
  const [slide2Id, setSlide2Id] = useState<number | null>(null);
  const [slide3Id, setSlide3Id] = useState<number | null>(null);
  const [slide5Id, setSlide5Id] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const { data: renderStatus } = useRenderStatus(isPolling);

  // Hydrate local state from saved config
  useEffect(() => {
    if (!savedConfig) return;
    setSlide1Id(savedConfig.slide1PropertyId);
    setSlide2Id(savedConfig.slide2PropertyId);
    setSlide3Id(savedConfig.slide3PropertyId);
    setSlide5Id(savedConfig.slide5PropertyId);
  }, [savedConfig]);

  // Stop polling when render is no longer in progress
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
      toast({ title: "Render started", description: "PDF generation is underway. This takes ~30 seconds." });
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
    });
  };

  const handleRender = () => {
    renderMutation.mutate();
  };

  const allConfigured = slide1Id && slide2Id && slide3Id && slide5Id;
  const isLoading = propsLoading || configLoading;
  const status = renderStatus?.status ?? "idle";
  const properties = propertiesRaw;

  const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    idle: { label: "Not rendered", variant: "secondary" },
    rendering: { label: "Rendering…", variant: "outline" },
    ready: { label: "Ready", variant: "default" },
    error: { label: "Error", variant: "destructive" },
  };
  const badge = statusBadge[status] ?? statusBadge.idle;

  function makeSelector(
    label: string,
    slideNum: number,
    description: string,
    value: number | null,
    onChange: (v: number | null) => void,
  ) {
    return (
      <div key={slideNum} className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Slide {slideNum}
          </span>
          <span className="text-xs text-muted-foreground">— {description}</span>
        </div>
        <Select
          value={value ? String(value) : NONE}
          onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
          disabled={isLoading}
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

  return (
    <Layout>
      <AnimatedPage>
        <div className="max-w-3xl mx-auto space-y-6 p-4 sm:p-6">
          <PageHeader
            title="LB Slide Deck"
            subtitle="One canonical 6-slide portfolio investor deck. Assign four spotlight properties and render a single PDF."
          />

          {/* Property assignment card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Property Assignments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Slides 1, 2, 3, and 5 each spotlight one property you choose. Slides 4 and 6 are
                auto-generated from the full portfolio.
              </p>

              {makeSelector("Pipeline Spotlight", 1, "Property detail + hero photo", slide1Id, setSlide1Id)}
              {makeSelector("Photo Gallery", 2, "Photo-heavy showcase slide", slide2Id, setSlide2Id)}
              {makeSelector("Investment Model", 3, "5-year financial model", slide3Id, setSlide3Id)}
              {makeSelector("Financial Snapshot", 5, "Investor metrics + summary", slide5Id, setSlide5Id)}

              <div className="pt-2 border-t border-border/60 text-xs text-muted-foreground space-y-0.5">
                <div className="font-medium text-foreground/70">Auto-generated slides (no assignment needed)</div>
                <div>Slide 4 — Portfolio grid of all properties with hero photos</div>
                <div>Slide 6 — 10-year aggregated USALI consolidated income statement</div>
              </div>

              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || isLoading}
                className="w-full sm:w-auto"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save configuration
              </Button>
            </CardContent>
          </Card>

          {/* Render + download card */}
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
                Rendering opens a headless browser, loads all 6 slides at native 1920×1080, and
                exports a single print-ready PDF. Takes ~30–60 seconds.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleRender}
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
                  <Button
                    asChild
                    variant="outline"
                  >
                    <a
                      href="/api/lb-slides/download/combined.pdf"
                      download="lb-slide-deck.pdf"
                    >
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
        </div>
      </AnimatedPage>
    </Layout>
  );
}
