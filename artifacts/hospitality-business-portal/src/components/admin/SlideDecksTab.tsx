import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Presentation, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type DownloadState = "idle" | "loading" | "done" | "error";

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

const STATUS_STYLES: Record<string, string> = {
  active:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  pipeline:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  closed:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  operating: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  disposed:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

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

// Deterministic accent hue per property so each slide render looks distinct
function accentHue(id: number): number {
  const HUES = [220, 195, 260, 175, 240, 210, 185, 250];
  return HUES[id % HUES.length];
}

function SlideRender({ property }: { property: PropertyRow }) {
  const location = [property.city, property.stateProvince].filter(Boolean).join(", ");
  const label = typeLabel(property);
  const hue = accentHue(property.id);
  const accentColor = `hsl(${hue}, 65%, 55%)`;
  const accentFaint = `hsla(${hue}, 65%, 55%, 0.18)`;

  return (
    // 16:9 aspect ratio render — full width, locked ratio
    <div
      className="relative w-full overflow-hidden rounded-t-[3px]"
      style={{ aspectRatio: "16 / 9", background: "#0f1621" }}
    >
      {/* subtle radial glow from top-right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 80% 10%, ${accentFaint}, transparent 70%)`,
        }}
      />

      {/* thin accent stripe down the left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-sm"
        style={{ background: `linear-gradient(to bottom, ${accentColor}, transparent)` }}
      />

      {/* bottom-left corner rule line (echoes L+B layout) */}
      <div
        className="absolute bottom-[22%] left-[6%] right-[20%] h-[1px] opacity-40"
        style={{ background: accentColor }}
      />

      {/* top label — type */}
      <div
        className="absolute top-[12%] left-[8%] text-[6px] font-semibold tracking-[0.18em] uppercase"
        style={{ color: accentColor, fontFamily: "system-ui, sans-serif", letterSpacing: "0.16em" }}
      >
        {label}
      </div>

      {/* property name */}
      <div
        className="absolute left-[8%] right-[10%]"
        style={{
          top: "26%",
          color: "#f0f4ff",
          fontFamily: "system-ui, sans-serif",
          fontSize: property.name.length > 22 ? "9px" : "11px",
          fontWeight: 700,
          lineHeight: 1.25,
          letterSpacing: "0.01em",
        }}
      >
        {property.name}
      </div>

      {/* location */}
      {location && (
        <div
          className="absolute left-[8%]"
          style={{
            top: "50%",
            color: "rgba(190,210,240,0.75)",
            fontFamily: "system-ui, sans-serif",
            fontSize: "6px",
            letterSpacing: "0.06em",
          }}
        >
          {location}
        </div>
      )}

      {/* stats row */}
      <div
        className="absolute left-[8%] flex items-center gap-[8px]"
        style={{ bottom: "14%", fontFamily: "system-ui, sans-serif", fontSize: "5.5px", color: "rgba(190,210,240,0.6)" }}
      >
        {property.roomCount && <span>{property.roomCount} keys</span>}
        {property.purchasePrice && <span>{formatPrice(property.purchasePrice)}</span>}
        <span>6 slides</span>
      </div>

      {/* L+B wordmark echo — bottom right */}
      <div
        className="absolute bottom-[10%] right-[6%] font-bold opacity-25"
        style={{ fontSize: "7px", color: "#fff", fontFamily: "system-ui, sans-serif", letterSpacing: "0.12em" }}
      >
        L+B
      </div>
    </div>
  );
}

function DownloadButton({ propertyId, propertyName, state, onDownload }: {
  propertyId: number;
  propertyName: string;
  state: DownloadState;
  onDownload: (id: number, name: string) => void;
}) {
  return (
    <Button
      size="sm"
      variant={state === "done" ? "outline" : "default"}
      disabled={state === "loading"}
      onClick={() => onDownload(propertyId, propertyName)}
      className="gap-2 w-full"
    >
      {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
      {state === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
      {state === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
      {state === "idle" && <Download className="h-4 w-4" />}
      {state === "loading" ? "Generating…" :
       state === "done"    ? "Downloaded" :
       state === "error"   ? "Retry" :
                             "Download Slides"}
    </Button>
  );
}

export default function SlideDecksTab() {
  const [downloadStates, setDownloadStates] = useState<Record<number, DownloadState>>({});

  const { data: properties, isLoading, isError } = useQuery<PropertyRow[]>({
    queryKey: ["/api/properties"],
    staleTime: 30_000,
  });

  function setDownloadState(id: number, state: DownloadState) {
    setDownloadStates(prev => ({ ...prev, [id]: state }));
  }

  async function handleDownload(propertyId: number, propertyName: string) {
    setDownloadState(propertyId, "loading");
    try {
      const resp = await fetch(`/api/properties/${propertyId}/slides`, {
        method: "GET",
        credentials: "include",
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const slug = propertyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const filename = `${slug}-slides.pptx`;

      // Native OS save dialog (Chrome / Edge)
      const win = window as unknown as Record<string, unknown>;
      if (typeof win["showSaveFilePicker"] === "function") {
        const showSaveFilePicker = win["showSaveFilePicker"] as (opts: unknown) => Promise<{
          createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
        }>;
        const handle = await showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: "PowerPoint Presentation",
            accept: {
              "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
            },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        // Fallback: anchor-click (Firefox, Safari)
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-3" />
        Loading properties…
      </div>
    );
  }

  if (isError || !properties) {
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
          Download a 6-slide investor deck for each property — generated from the L+B template with live data.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map(p => {
          const state = downloadStates[p.id] ?? "idle";
          const status = p.acquisitionStatus?.toLowerCase() ?? "pipeline";

          return (
            <Card key={p.id} className="flex flex-col border border-border/60 hover:border-border transition-colors overflow-hidden p-0">
              {/* slide render — full bleed at top */}
              <SlideRender property={p} />

              <CardContent className="flex flex-col gap-3 p-4">
                {/* name + status */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</p>
                  <Badge
                    variant="outline"
                    className={`text-[11px] shrink-0 border-0 font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES["pipeline"]}`}
                  >
                    {statusLabel(p.acquisitionStatus)}
                  </Badge>
                </div>

                <DownloadButton
                  propertyId={p.id}
                  propertyName={p.name}
                  state={state}
                  onDownload={handleDownload}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
