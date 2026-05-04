import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { IconPresentation, IconAlertCircle, IconLayers, IconDownload } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
  status?: string | null;
  purchasePrice?: number | null;
  roomCount?: number | null;
  imageUrl?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  pipeline:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  planned:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  closed:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  operating: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  disposed:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function downloadViaAnchor(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

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

// ── Slide render thumbnail ─────────────────────────────────────────────────
// These are slide template colors, not app design tokens — intentionally
// standalone so the thumbnail mirrors the actual PPTX output.
const SLIDE_BG = "#0f1621";
const SLIDE_TEXT_PRIMARY = "#f0f4ff";
const SLIDE_TEXT_MUTED = "rgba(190,210,240,0.75)";
const SLIDE_TEXT_FAINT = "rgba(190,210,240,0.6)";
const SLIDE_BRAND_LABEL = "rgba(255,255,255,0.25)";

function SlideRender({ property }: { property: PropertyRow }) {
  const location = [property.city, property.stateProvince].filter(Boolean).join(", ");
  const label = typeLabel(property);
  const hue = accentHue(property.id);
  const accentColor = `hsl(${hue}, 65%, 55%)`;
  const accentFaint = `hsla(${hue}, 65%, 55%, 0.18)`;

  return (
    <div
      className="relative w-full overflow-hidden rounded-t-[3px]"
      style={{ aspectRatio: "16 / 9", background: SLIDE_BG }}
    >
      {property.imageUrl && (
        <img
          src={property.imageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: property.imageUrl
            ? "rgba(0,0,0,0.45)"
            : `radial-gradient(ellipse 70% 60% at 80% 10%, ${accentFaint}, transparent 70%)`,
        }}
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
          color: SLIDE_TEXT_PRIMARY,
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
          style={{ top: "50%", color: SLIDE_TEXT_MUTED, fontFamily: "system-ui, sans-serif", fontSize: "6px" }}
        >
          {location}
        </div>
      )}
      <div
        className="absolute left-[8%] flex items-center gap-[8px]"
        style={{ bottom: "14%", fontFamily: "system-ui, sans-serif", fontSize: "5.5px", color: SLIDE_TEXT_FAINT }}
      >
        {property.roomCount && <span>{property.roomCount} keys</span>}
        {property.purchasePrice && <span>{formatPrice(property.purchasePrice)}</span>}
        <span>6 slides</span>
      </div>
      <div
        className="absolute bottom-[10%] right-[6%] font-bold opacity-25"
        style={{ fontSize: "7px", color: SLIDE_BRAND_LABEL, fontFamily: "system-ui, sans-serif", letterSpacing: "0.12em" }}
      >
        L+B
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SlideDecksTab() {
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());

  async function handleDownloadDeck(p: PropertyRow) {
    if (downloadingIds.has(p.id)) return;
    setDownloadingIds(prev => new Set(prev).add(p.id));
    try {
      const r = await fetch(`/api/properties/${p.id}/deck.pdf`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      downloadViaAnchor(url, `${slugify(p.name)}-deck.pdf`);
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
    }
  }

  // Properties list
  const { data: properties, isLoading: propsLoading, isError: propsError } = useQuery<PropertyRow[]>({
    queryKey: ["/api/properties"],
    staleTime: 30_000,
  });

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
        <IconAlertCircle className="h-8 w-8 text-destructive" />
        <p>Failed to load properties. Reload the page to try again.</p>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <IconPresentation className="h-10 w-10 opacity-30" />
        <p className="text-sm">No properties found. Add a property to generate slides.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Property Slide Decks</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Click <strong>Download PDF</strong> to get the full 6-slide deck in one file, or click <strong>Slides</strong> to open the per-slide view.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map(p => {
          const acqStatus = (p.acquisitionStatus ?? p.status)?.toLowerCase() ?? "pipeline";

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
                    {statusLabel(p.acquisitionStatus ?? p.status)}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1.5 flex-1"
                    title="Download the full 6-slide deck as a single PDF"
                    disabled={downloadingIds.has(p.id)}
                    onClick={() => handleDownloadDeck(p)}
                  >
                    {downloadingIds.has(p.id)
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <IconDownload className="h-3.5 w-3.5" />}
                    Download PDF
                  </Button>
                  <Link href={`/slide-decks/${p.id}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      title="Open per-slide view: download or regenerate each of the six slides independently"
                    >
                      <IconLayers className="h-3.5 w-3.5" />
                      Slides
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
