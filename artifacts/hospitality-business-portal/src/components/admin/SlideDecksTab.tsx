import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Presentation, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DownloadState = "idle" | "loading" | "done" | "error";

interface PropertyRow {
  id: number;
  name: string;
  city?: string | null;
  stateProvince?: string | null;
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
      className="gap-2 min-w-[140px]"
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
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const slug = propertyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      anchor.href = url;
      anchor.download = `${slug}-slides.pptx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setDownloadState(propertyId, "done");
      setTimeout(() => setDownloadState(propertyId, "idle"), 4_000);
    } catch (err) {
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
          const location = [p.city, p.stateProvince].filter(Boolean).join(", ");

          return (
            <Card key={p.id} className="flex flex-col border border-border/60 hover:border-border transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                    {p.name}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-[11px] shrink-0 border-0 font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES["pipeline"]}`}
                  >
                    {statusLabel(p.acquisitionStatus)}
                  </Badge>
                </div>
                {location && (
                  <p className="text-xs text-muted-foreground mt-0.5">{location}</p>
                )}
              </CardHeader>

              <CardContent className="flex flex-col gap-3 pt-0 flex-1">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {p.roomCount && (
                    <span>{p.roomCount} keys</span>
                  )}
                  <span>{typeLabel(p)}</span>
                  {p.purchasePrice && (
                    <span>{formatPrice(p.purchasePrice)}</span>
                  )}
                </div>

                <div className="text-xs text-muted-foreground/70 italic">
                  6 slides · L+B template · live financial data
                </div>

                <div className="mt-auto pt-1">
                  <DownloadButton
                    propertyId={p.id}
                    propertyName={p.name}
                    state={state}
                    onDownload={handleDownload}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
