import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconDownload, IconAlertCircle, IconImage } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PropertyRow {
  id: number;
  name: string;
  city?: string | null;
  stateProvince?: string | null;
  imageUrl?: string | null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function getExtFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".gif")) return "gif";
  return "png";
}

function HeroCard({ property }: { property: PropertyRow }) {
  const [dlState, setDlState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const location = [property.city, property.stateProvince].filter(Boolean).join(", ");
  const hasImage = Boolean(property.imageUrl);

  async function handleDownload() {
    if (!property.imageUrl) return;
    setDlState("loading");
    try {
      const resp = await fetch(property.imageUrl, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const ext = getExtFromUrl(property.imageUrl);
      const filename = `${sanitizeFilename(property.name)}.${ext}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setDlState("done");
      setTimeout(() => setDlState("idle"), 4_000);
    } catch (err) {
      console.error(`Hero image download failed for property ${property.id}:`, err);
      setDlState("error");
      setTimeout(() => setDlState("idle"), 6_000);
    }
  }

  return (
    <Card className="flex flex-col border border-border/60 hover:border-border transition-colors overflow-hidden p-0">
      <div className="relative w-full bg-muted" style={{ aspectRatio: "4 / 3" }}>
        {hasImage ? (
          <img
            src={property.imageUrl!}
            alt={property.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <IconImage className="h-10 w-10 opacity-25" />
            <span className="text-xs">No hero image</span>
          </div>
        )}
      </div>

      <CardContent className="flex flex-col gap-2 p-4">
        <div>
          <p className="text-sm font-semibold leading-tight line-clamp-2">{property.name}</p>
          {location && (
            <p className="text-xs text-muted-foreground mt-0.5">{location}</p>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          disabled={!hasImage || dlState === "loading"}
          onClick={handleDownload}
          className="gap-1.5 w-full"
          title={hasImage ? "Download hero image" : "No hero image available"}
        >
          {dlState === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <IconDownload className="h-3.5 w-3.5" />
          )}
          {dlState === "loading" ? "Downloading…" : dlState === "done" ? "Downloaded" : dlState === "error" ? "Failed" : "Download"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PropertyHeroImagesTab() {
  const [zipState, setZipState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const { data: properties, isLoading, isError } = useQuery<PropertyRow[]>({
    queryKey: ["/api/properties"],
    staleTime: 30_000,
  });

  async function handleDownloadAll() {
    setZipState("loading");
    try {
      const resp = await fetch("/api/properties/hero-images/zip", { credentials: "include" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "property-hero-images.zip";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setZipState("done");
      setTimeout(() => setZipState("idle"), 5_000);
    } catch (err) {
      console.error("Hero images ZIP download failed:", err);
      setZipState("error");
      setTimeout(() => setZipState("idle"), 6_000);
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
        <IconAlertCircle className="h-8 w-8 text-destructive" />
        <p>Failed to load properties. Reload the page to try again.</p>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <IconImage className="h-10 w-10 opacity-30" />
        <p className="text-sm">No properties found.</p>
      </div>
    );
  }

  const withImage = properties.filter(p => Boolean(p.imageUrl));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Property Hero Images</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {withImage.length} of {properties.length} properties have a hero image.
            Download individually or grab all as a ZIP.
          </p>
        </div>

        <Button
          variant="outline"
          disabled={withImage.length === 0 || zipState === "loading"}
          onClick={handleDownloadAll}
          className="gap-2 shrink-0"
        >
          {zipState === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <IconDownload className="h-4 w-4" />
          )}
          {zipState === "loading" ? "Building ZIP…" : zipState === "done" ? "Downloaded" : zipState === "error" ? "Failed — retry" : "Download All as ZIP"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {properties.map(p => (
          <HeroCard key={p.id} property={p} />
        ))}
      </div>
    </div>
  );
}
