/**
 * PropertySlides.tsx
 *
 * Admin LB-Slides detail page at `/admin/lb-slides/:propertyId`.
 *
 * Shows all six slides of a property's investor deck as miniature live React
 * renders (Slide1..Slide6 from `@/features/internal-deck/slides`, scaled down
 * via CSS transform), each with its own Download (single-slide PDF) and
 * Regenerate (Analyst) buttons.
 *
 * Two view modes:
 *   - "grid"      — 2×3 / 3×2 thumbnails (default), good for at-a-glance review
 *   - "carousel"  — large single-slide-at-a-time view via shadcn Carousel,
 *                   good for inspecting layout/typography/photos full-size
 *
 * Why mini live renders instead of iframes or cached PNGs:
 *   - One deck-payload fetch, six in-page renders. No 6× iframe payload reload.
 *   - Updates after Regenerate appear immediately on the next payload refetch.
 *   - Reuses the exact Slide1..Slide6 components used for the PDF, so what you
 *     see is what the PDF will be.
 *
 * Auth model:
 *   The admin session mints a short-TTL HMAC deck token via
 *   `GET /api/admin/properties/:id/deck-token`, then this page uses the
 *   existing token-authenticated payload route at
 *   `/api/internal/deck-payload/:id?token=…` — same code path used by
 *   InternalDeck during PDF rendering.
 */

import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { IconDownload, IconAlertCircle, IconRefreshCw } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Slide1, Slide2, Slide3, Slide4, Slide5, Slide6 } from "@/features/internal-deck/slides";
import { SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX } from "@/features/internal-deck/theme";
import "@/features/internal-deck/fonts.css";
import type { SlidePayload } from "@/features/internal-deck/types";
import { Slide1EditorPanel } from "@/features/internal-deck/editor/Slide1EditorPanel";
import { useToast } from "@/hooks/use-toast";

// ── Slide registry ────────────────────────────────────────────────────────
//
// One row per slide. `Component` is the React renderer; `title` is the
// admin-facing label shown above each thumbnail. Keeping this here (rather
// than importing from a shared module) keeps slides truly independent —
// adding/removing a slide is a one-line change in this list and the
// corresponding `slides.tsx` export, with no other coordination required.

const SLIDES: ReadonlyArray<{
  n: number;
  title: string;
  Component: React.ComponentType<{ p: SlidePayload }>;
}> = [
  { n: 1, title: "Slide 1 — Property Spotlight",       Component: Slide1 },
  { n: 2, title: "Slide 2 — Vision & Transformation",  Component: Slide2 },
  { n: 3, title: "Slide 3 — Financial Snapshot",       Component: Slide3 },
  { n: 4, title: "Slide 4 — Improvements & Photos",    Component: Slide4 },
  { n: 5, title: "Slide 5 — Operational Model",        Component: Slide5 },
  { n: 6, title: "Slide 6 — Year-One Statements",      Component: Slide6 },
];

// Mini-thumb dimensions: 1920×1080 scaled by 0.25 → 480×270 (16:9).
const THUMB_SCALE = 0.25;
const THUMB_WIDTH_PX = Math.round(SLIDE_WIDTH_PX * THUMB_SCALE);
const THUMB_HEIGHT_PX = Math.round(SLIDE_HEIGHT_PX * THUMB_SCALE);

// Carousel slide dimensions: scale the 1920×1080 native slide so it fits
// within a typical viewport while staying as large as practical. We pick
// 0.55 → 1056×594, which fits in a 1280-wide window with breathing room and
// a 1920-wide window comfortably. Containers cap at viewport size via CSS.
const CAROUSEL_SCALE = 0.55;
const CAROUSEL_WIDTH_PX = Math.round(SLIDE_WIDTH_PX * CAROUSEL_SCALE);
const CAROUSEL_HEIGHT_PX = Math.round(SLIDE_HEIGHT_PX * CAROUSEL_SCALE);

interface DeckTokenResponse {
  token: string;
  expiresAtMs: number;
}

interface PropertyRow {
  id: number;
  name: string;
}

type ViewMode = "grid" | "carousel" | "edit";

function downloadViaAnchor(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Per-slide actions hook ────────────────────────────────────────────────
//
// Encapsulates Download + Regenerate behavior so both grid cards and the
// carousel toolbar share the exact same logic, including toast feedback.

function useSlideActions(propertyId: number, propertyName: string) {
  const { toast } = useToast();
  const [downloadingSlide, setDownloadingSlide] = useState<number | null>(null);

  const regen = useMutation({
    mutationFn: async (slide: number) => {
      const r = await fetch(`/api/properties/${propertyId}/deck/slide/${slide}/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status}: ${body || r.statusText}`);
      }
      return { slide, ...(await r.json()) };
    },
    onSuccess: ({ slide }: { slide: number }) => {
      toast({
        title: `Slide ${slide} marked for regeneration`,
        description: "Full-deck PDF cache invalidated; the next per-slide or full-deck download will re-render from scratch. (Per-slide caching is not yet implemented.)",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Regenerate failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  function download(slide: number) {
    setDownloadingSlide(slide);
    const filename = `${slugify(propertyName)}-slide-${slide}.pdf`;
    const url = `/api/properties/${propertyId}/deck/slide/${slide}.pdf`;
    downloadViaAnchor(url, filename);
    setTimeout(() => setDownloadingSlide(curr => (curr === slide ? null : curr)), 4_000);
  }

  return {
    download,
    regenerate: (slide: number) => regen.mutate(slide),
    downloadingSlide,
    regeneratingSlide: regen.isPending ? (regen.variables ?? null) : null,
  };
}

// ── Per-slide button row ──────────────────────────────────────────────────

function SlideActionRow({
  n,
  download,
  regenerate,
  isDownloading,
  isRegenerating,
}: {
  n: number;
  download: () => void;
  regenerate: () => void;
  isDownloading: boolean;
  isRegenerating: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="default"
        onClick={download}
        disabled={isDownloading}
        className="gap-1.5 flex-1"
        title={`Download slide ${n} as a 1-page PDF`}
      >
        {isDownloading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <IconDownload className="h-3.5 w-3.5" />}
        Download
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={regenerate}
        disabled={isRegenerating}
        className="gap-1.5 flex-1"
        title="Invalidate the full-deck PDF cache so the next download re-renders from scratch. Future hook: trigger the Analyst specialist for the data fields backing this slide only."
      >
        {isRegenerating
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <IconRefreshCw className="h-3.5 w-3.5" />}
        Regenerate (Analyst)
      </Button>
    </div>
  );
}

// ── Grid thumbnail card ───────────────────────────────────────────────────

function SlideThumbCard({
  n,
  title,
  Component,
  payload,
  actions,
}: {
  n: number;
  title: string;
  Component: React.ComponentType<{ p: SlidePayload }>;
  payload: SlidePayload;
  actions: ReturnType<typeof useSlideActions>;
}) {
  return (
    <Card className="flex flex-col border border-border/60 hover:border-border transition-colors overflow-hidden p-0">
      <div
        className="relative bg-[#0f1621] overflow-hidden"
        style={{ width: THUMB_WIDTH_PX, height: THUMB_HEIGHT_PX, maxWidth: "100%" }}
      >
        <div
          style={{
            width: SLIDE_WIDTH_PX,
            height: SLIDE_HEIGHT_PX,
            transform: `scale(${THUMB_SCALE})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <Component p={payload} />
        </div>
      </div>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <SlideActionRow
          n={n}
          download={() => actions.download(n)}
          regenerate={() => actions.regenerate(n)}
          isDownloading={actions.downloadingSlide === n}
          isRegenerating={actions.regeneratingSlide === n}
        />
      </CardContent>
    </Card>
  );
}

// ── Carousel large viewer ─────────────────────────────────────────────────

function SlidesCarousel({
  payload,
  actions,
}: {
  payload: SlidePayload;
  actions: ReturnType<typeof useSlideActions>;
}) {
  return (
    <Carousel
      opts={{ align: "center", loop: true }}
      className="w-full max-w-[1100px] mx-auto"
    >
      <CarouselContent>
        {SLIDES.map(s => (
          <CarouselItem key={s.n} className="basis-full">
            <Card className="flex flex-col border border-border/60 hover:border-border transition-colors overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-border/60">
                <p className="text-sm font-semibold leading-tight">{s.title}</p>
              </div>
              {/*
                Centered large preview. Outer container reserves the post-scale
                size so neighbouring layout doesn't jump as the carousel cycles.
              */}
              <div className="flex justify-center bg-[#0f1621] p-4">
                <div
                  className="relative overflow-hidden"
                  style={{
                    width: CAROUSEL_WIDTH_PX,
                    height: CAROUSEL_HEIGHT_PX,
                    maxWidth: "100%",
                  }}
                >
                  <div
                    style={{
                      width: SLIDE_WIDTH_PX,
                      height: SLIDE_HEIGHT_PX,
                      transform: `scale(${CAROUSEL_SCALE})`,
                      transformOrigin: "top left",
                      position: "absolute",
                      top: 0,
                      left: 0,
                    }}
                  >
                    <s.Component p={payload} />
                  </div>
                </div>
              </div>
              <CardContent className="p-4">
                <SlideActionRow
                  n={s.n}
                  download={() => actions.download(s.n)}
                  regenerate={() => actions.regenerate(s.n)}
                  isDownloading={actions.downloadingSlide === s.n}
                  isRegenerating={actions.regeneratingSlide === s.n}
                />
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function PropertySlides() {
  const [, params] = useRoute<{ propertyId: string }>("/admin/lb-slides/:propertyId");
  const propertyId = params?.propertyId ? Number(params.propertyId) : NaN;
  const [view, setView] = useState<ViewMode>("grid");

  // Property info — for header + filename.
  const { data: properties } = useQuery<PropertyRow[]>({
    queryKey: ["/api/properties"],
    staleTime: 30_000,
  });
  const property = useMemo(
    () => (properties ?? []).find(p => p.id === propertyId),
    [properties, propertyId],
  );

  // Mint a deck token so we can call the existing token-authenticated
  // payload route. This is the same payload InternalDeck.tsx uses during
  // PDF rendering, so the in-page mini renders match the PDF byte-for-byte.
  const { data: tokenData, error: tokenError } = useQuery<DeckTokenResponse>({
    queryKey: ["/api/admin/properties", propertyId, "deck-token"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/properties/${propertyId}/deck-token`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    enabled: Number.isFinite(propertyId),
    refetchInterval: 4 * 60 * 1000,
    staleTime: 3 * 60 * 1000,
  });

  // Fetch deck payload using the minted token.
  const [payload, setPayload] = useState<SlidePayload | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  useEffect(() => {
    if (!tokenData?.token || !Number.isFinite(propertyId)) return;
    let cancelled = false;
    const url = `/api/internal/deck-payload/${propertyId}?token=${encodeURIComponent(tokenData.token)}`;
    setPayloadError(null);
    fetch(url, { credentials: "omit" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}: ${body || r.statusText}`);
        }
        return r.json() as Promise<SlidePayload>;
      })
      .then((p) => { if (!cancelled) setPayload(p); })
      .catch((e: unknown) => {
        if (!cancelled) setPayloadError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [tokenData?.token, propertyId]);

  const actions = useSlideActions(propertyId, property?.name ?? `property-${propertyId}`);

  if (!Number.isFinite(propertyId)) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-destructive">Invalid property ID.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin#slide-decks">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back to LB Slides
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">
              {property?.name ?? `Property ${propertyId}`} — Slides
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Each slide downloads as its own 1-page PDF. Regenerate currently busts the full-deck cache so the next render picks up code/data changes for any slide.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`px-3 py-1.5 transition-colors ${
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted"
            }`}
            aria-pressed={view === "grid"}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView("carousel")}
            className={`px-3 py-1.5 border-l border-border transition-colors ${
              view === "carousel"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted"
            }`}
            aria-pressed={view === "carousel"}
          >
            Carousel
          </button>
          <button
            type="button"
            onClick={() => setView("edit")}
            className={`px-3 py-1.5 border-l border-border transition-colors ${
              view === "edit"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted"
            }`}
            aria-pressed={view === "edit"}
          >
            Edit copy
          </button>
        </div>
      </div>

      {tokenError && (
        <div className="flex items-center gap-2 text-destructive">
          <IconAlertCircle className="h-4 w-4" />
          Failed to mint deck token: {String(tokenError)}
        </div>
      )}
      {payloadError && (
        <div className="flex items-center gap-2 text-destructive">
          <IconAlertCircle className="h-4 w-4" />
          Failed to load deck payload: {payloadError}
        </div>
      )}

      {!payload && !payloadError && (
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading slides…
        </div>
      )}

      {payload && view === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SLIDES.map(s => (
            <SlideThumbCard
              key={s.n}
              n={s.n}
              title={s.title}
              Component={s.Component}
              payload={payload}
              actions={actions}
            />
          ))}
        </div>
      )}

      {payload && view === "carousel" && (
        <SlidesCarousel payload={payload} actions={actions} />
      )}

      {view === "edit" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Slide1EditorPanel propertyId={propertyId} />
          {payload && (
            <Card className="border border-border/60 self-start sticky top-4 overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-border/60">
                <p className="text-sm font-semibold leading-tight">Live preview — Slide 1</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Currently shows the legacy renderer. The new renderer that
                  consumes editor copy lands in the next slice (T004).
                </p>
              </div>
              <div
                className="relative bg-[#0f1621] overflow-hidden"
                style={{ width: THUMB_WIDTH_PX, height: THUMB_HEIGHT_PX }}
              >
                <div
                  style={{
                    width: SLIDE_WIDTH_PX,
                    height: SLIDE_HEIGHT_PX,
                    transform: `scale(${THUMB_SCALE})`,
                    transformOrigin: "top left",
                    position: "absolute",
                    top: 0,
                    left: 0,
                  }}
                >
                  <Slide1 p={payload} />
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
