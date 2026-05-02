import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Presentation, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import type { FreshnessStatus } from "@/components/intelligence/AnalystButton";

// ── Types ─────────────────────────────────────────────────────────────────

interface PropertyRow {
  id: number;
  name: string;
  city?: string | null;
  stateProvince?: string | null;
  country?: string | null;
  businessModel?: string | null;
  hospitalityType?: string | null;
  acquisitionStatus?: string | null;
  purchasePrice?: number | null;
  roomCount?: number | null;
}

interface SlideStatus {
  propertyId: number;
  status: "idle" | "generating" | "ready" | "error";
  fileSizeBytes: number | null;
  generatedAt: string | null;
  triggeredBy: string | null;
  errorMessage: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  pipeline:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  closed:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  operating: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  disposed:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STALE_DAYS = 7;

// ── Helpers ────────────────────────────────────────────────────────────────

function statusLabel(status?: string | null): string {
  const s = status?.toLowerCase() ?? "pipeline";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatPrice(v?: number | null): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function typeLabel(p: PropertyRow): string {
  const model = (p.hospitalityType ?? p.businessModel ?? "").toLowerCase();
  if (model.includes("retreat")) return "Retreat Center";
  if (model.includes("vrbo") || model.includes("vacation")) return "Luxury Vacation Rental";
  if (model.includes("hotel") || model.includes("boutique")) return "Boutique Hotel";
  if (model.includes("bnb") || model.includes("bed")) return "Bed & Breakfast";
  if (model.includes("motel")) return "Boutique Motel";
  return p.businessModel ?? "Hospitality";
}

function accentHue(id: number): number {
  const HUES = [220, 195, 260, 175, 240, 210, 185, 250];
  return HUES[id % HUES.length];
}

function freshnessFromStatus(slide: SlideStatus | undefined): FreshnessStatus {
  if (!slide || slide.status === "idle") return "missing";
  if (slide.status === "generating") return "running";
  if (slide.status === "error") return "very_stale";
  if (slide.status === "ready" && slide.generatedAt) {
    const ageMs = Date.now() - new Date(slide.generatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > STALE_DAYS ? "stale" : "current";
  }
  return "missing";
}

function formatGeneratedAt(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n >= 1_000_000) return ` · ${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return ` · ${Math.round(n / 1_000)} KB`;
  return ` · ${n} B`;
}

// ── Slide render thumbnail ─────────────────────────────────────────────────

function SlideRender({ property }: { property: PropertyRow }) {
  const location = [property.city, property.stateProvince].filter(Boolean).join(", ");
  const label = typeLabel(property);
  const hue = accentHue(property.id);
  const accentColor = `hsl(${hue}, 65%, 55%)`;
  const accentFaint = `hsla(${hue}, 65%, 55%, 0.18)`;

  return (
    <div
      className="relative w-full overflow-hidden rounded-t-[3px]"
      style={{ aspectRatio: "16 / 9", background: "#0f1621" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 60% at 80% 10%, ${accentFaint}, transparent 70%)` }}
      />
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-sm"
        style={{ background: `linear-gradient(to bottom, ${accentColor}, transparent)` }}
      />
      <div
        className="absolute bottom-[22%] left-[6%] right-[20%] h-[1px] opacity-40"
        style={{ background: accentColor }}
      />
      <div
        className="absolute top-[12%] left-[8%] text-[6px] font-semibold tracking-[0.18em] uppercase"
        style={{ color: accentColor, fontFamily: "system-ui, sans-serif" }}
      >
        {label}
      </div>
      <div
        className="absolute left-[8%] right-[10%]"
        style={{
          top: "26%",
          color: "#f0f4ff",
          fontFamily: "system-ui, sans-serif",
          fontSize: property.name.length > 22 ? "9px" : "11px",
          fontWeight: 700,
          lineHeight: 1.25,
        }}
      >
        {property.name}
      </div>
      {location && (
        <div
          className="absolute left-[8%]"
          style={{ top: "50%", color: "rgba(190,210,240,0.75)", fontFamily: "system-ui, sans-serif", fontSize: "6px" }}
        >
          {location}
        </div>
      )}
      <div
        className="absolute left-[8%] flex items-center gap-[8px]"
        style={{ bottom: "14%", fontFamily: "system-ui, sans-serif", fontSize: "5.5px", color: "rgba(190,210,240,0.6)" }}
      >
        {property.roomCount && <span>{property.roomCount} keys</span>}
        {property.purchasePrice && <span>{formatPrice(property.purchasePrice)}</span>}
        <span>6 slides</span>
      </div>
      <div
        className="absolute bottom-[10%] right-[6%] font-bold opacity-25"
        style={{ fontSize: "7px", color: "#fff", fontFamily: "system-ui, sans-serif", letterSpacing: "0.12em" }}
      >
        L+B
      </div>
    </div>
  );
}

// ── Slide status badge ─────────────────────────────────────────────────────

function SlideStatusBadge({ slide }: { slide: SlideStatus | undefined }) {
  if (!slide || slide.status === "idle") {
    return <span className="text-[11px] text-muted-foreground">Not generated</span>;
  }
  if (slide.status === "generating") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Generating…
      </span>
    );
  }
  if (slide.status === "error") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-destructive" title={slide.errorMessage ?? undefined}>
        <AlertCircle className="h-3 w-3" />
        Error — click Analyst to retry
      </span>
    );
  }
  if (slide.status === "ready") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 text-green-500" />
        Generated {formatGeneratedAt(slide.generatedAt)}{formatBytes(slide.fileSizeBytes)}
      </span>
    );
  }
  return null;
}

// ── Main component ─────────────────────────────────────────────────────────

type DownloadState = "idle" | "loading" | "done" | "error";

export default function SlideDecksTab() {
  const queryClient = useQueryClient();
  const [downloadStates, setDownloadStates] = useState<Record<number, DownloadState>>({});

  // Properties list
  const { data: properties, isLoading: propsLoading, isError: propsError } = useQuery<PropertyRow[]>({
    queryKey: ["/api/properties"],
    staleTime: 30_000,
  });

  // Slide status — poll every 5s while any property is generating
  const { data: slideStatuses } = useQuery<SlideStatus[]>({
    queryKey: ["/api/slides/status"],
    staleTime: 3_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      const anyGenerating = Array.isArray(data) && data.some(s => s.status === "generating");
      return anyGenerating ? 5_000 : false;
    },
  });

  const statusMap = new Map<number, SlideStatus>(
    (slideStatuses ?? []).map(s => [s.propertyId, s]),
  );

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async (propertyId: number) => {
      const resp = await fetch(`/api/properties/${propertyId}/slides/generate`, {
        method: "POST",
        credentials: "include",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      return resp.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/slides/status"] });
    },
  });

  function setDownloadState(id: number, state: DownloadState) {
    setDownloadStates(prev => ({ ...prev, [id]: state }));
  }

  async function handleDownload(propertyId: number, propertyName: string) {
    setDownloadState(propertyId, "loading");
    try {
      const resp = await fetch(`/api/properties/${propertyId}/slides`, {
        credentials: "include",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const slug = propertyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const filename = `${slug}-slides.pptx`;

      const win = window as unknown as Record<string, unknown>;
      if (typeof win["showSaveFilePicker"] === "function") {
        const showSaveFilePicker = win["showSaveFilePicker"] as (opts: unknown) => Promise<{
          createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
        }>;
        const handle = await showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "PowerPoint Presentation", accept: { "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }

      setDownloadState(propertyId, "done");
      setTimeout(() => setDownloadState(propertyId, "idle"), 4_000);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setDownloadState(propertyId, "idle");
        return;
      }
      console.error(`Slide download failed for property ${propertyId}:`, err);
      setDownloadState(propertyId, "error");
      setTimeout(() => setDownloadState(propertyId, "idle"), 6_000);
    }
  }

  if (propsLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-3" />
        Loading properties…
      </div>
    );
  }

  if (propsError || !properties) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p>Failed to load properties. Reload the page to try again.</p>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <Presentation className="h-10 w-10 opacity-30" />
        <p className="text-sm">No properties found. Add a property to generate slides.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Property Slide Decks</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Click <strong>Analyst</strong> to generate a 6-slide investor deck — stored and ready to download on demand.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map(p => {
          const slide = statusMap.get(p.id);
          const dlState = downloadStates[p.id] ?? "idle";
          const acqStatus = p.acquisitionStatus?.toLowerCase() ?? "pipeline";
          const isGenerating = slide?.status === "generating" || generateMutation.variables === p.id;
          const isReady = slide?.status === "ready";
          const freshness = freshnessFromStatus(slide);

          return (
            <Card key={p.id} className="flex flex-col border border-border/60 hover:border-border transition-colors overflow-hidden p-0">
              <SlideRender property={p} />

              <CardContent className="flex flex-col gap-3 p-4">
                {/* Name + acquisition badge */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</p>
                  <Badge
                    variant="outline"
                    className={`text-[11px] shrink-0 border-0 font-medium ${STATUS_STYLES[acqStatus] ?? STATUS_STYLES["pipeline"]}`}
                  >
                    {statusLabel(p.acquisitionStatus)}
                  </Badge>
                </div>

                {/* Slide status line */}
                <SlideStatusBadge slide={slide} />

                {/* Action row: Analyst (generate) + Download */}
                <div className="flex items-center gap-2">
                  <AnalystButton
                    onClick={() => generateMutation.mutate(p.id)}
                    isRunning={isGenerating}
                    disabled={isGenerating}
                    suffix={isReady ? "Regenerate" : "Generate"}
                    size="sm"
                    freshnessStatus={freshness}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isReady || dlState === "loading"}
                    onClick={() => handleDownload(p.id, p.name)}
                    className="gap-1.5 flex-1"
                    title={isReady ? "Download PPTX" : "Generate slides first"}
                  >
                    {dlState === "loading" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : dlState === "done" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {dlState === "loading" ? "Saving…" : dlState === "done" ? "Saved" : "Download"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
