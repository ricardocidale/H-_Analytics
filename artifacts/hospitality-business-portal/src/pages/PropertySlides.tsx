/**
 * PropertySlides.tsx
 *
 * Slide deck detail page at `/slide-decks/:propertyId` (Investor Materials).
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
 *   - "edit"      — per-slide editor panels with live preview thumbnail;
 *                   tab row selects which of the 6 slides is being authored
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
import { useRoute } from "wouter";
import Layout from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { IconDownload, IconAlertCircle, IconRefreshCw, IconCheck, IconX } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/ui/page-header";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Slide1, Slide2, Slide3, Slide4, Slide5, Slide6 } from "@/features/internal-deck/slides";
// TODO (T_RENDER_REWRITE): migrate to SLIDE_WIDTH_PX / SLIDE_HEIGHT_PX from
// contract.ts (960×540) once slides.tsx is rewritten at canonical dimensions.
// Until then, these must stay at 1920×1080 to match slides.tsx layout space.
import { SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX } from "@/features/internal-deck/theme";
import "@/features/internal-deck/fonts.css";
import type { SlidePayload } from "@/features/internal-deck/types";
import {
  EMPTY_DECK_PAYLOAD_V2,
  DECK_PAYLOAD_SCHEMA_VERSION,
  type DeckPayloadV2,
  type Slide1Payload,
  SLIDE1_VISION_BULLETS_COUNT,
  type Slide2Payload,
  type Slide3Payload,
  SLIDE3_REASONS_COUNT,
  type Slide5Payload,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
} from "@shared/deck-payload-v2";
import { Slide1EditorPanel } from "@/features/internal-deck/editor/Slide1EditorPanel";
import { Slide2EditorPanel } from "@/features/internal-deck/editor/Slide2EditorPanel";
import { Slide3EditorPanel } from "@/features/internal-deck/editor/Slide3EditorPanel";
import { Slide4EditorPanel } from "@/features/internal-deck/editor/Slide4EditorPanel";
import { Slide5EditorPanel } from "@/features/internal-deck/editor/Slide5EditorPanel";
import { Slide6EditorPanel } from "@/features/internal-deck/editor/Slide6EditorPanel";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  EditorPanel: React.ComponentType<{ propertyId: number }>;
}> = [
  { n: 1, title: "Slide 1 — Property Spotlight",    Component: Slide1, EditorPanel: Slide1EditorPanel },
  { n: 2, title: "Slide 2 — Vision & Transformation", Component: Slide2, EditorPanel: Slide2EditorPanel },
  { n: 3, title: "Slide 3 — Financial Snapshot",    Component: Slide3, EditorPanel: Slide3EditorPanel },
  { n: 4, title: "Slide 4 — Improvements & Photos", Component: Slide4, EditorPanel: Slide4EditorPanel },
  { n: 5, title: "Slide 5 — Operational Model",     Component: Slide5, EditorPanel: Slide5EditorPanel },
  { n: 6, title: "Slide 6 — Year-One Statements",   Component: Slide6, EditorPanel: Slide6EditorPanel },
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
type DraftVersion = "authored" | "template";

// ── Draft-All types ───────────────────────────────────────────────────────

interface DraftResult {
  slot: string;
  suggestion: unknown;
  model: string;
  generatedAt: string;
  validationErrors?: string[];
}

interface DraftAllResponse {
  propertyId: number;
  drafts: DraftResult[];
  draftedCount: number;
  errorCount: number;
  message?: string;
  note?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

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

/**
 * Convert a DraftResult array (from /draft-all) into a DeckPayloadV2 PATCH
 * body that can be sent to the PATCH endpoint. Only drafts without validation
 * errors are included.
 */
function buildAcceptAllPatch(drafts: DraftResult[], generatedAt: string): Partial<DeckPayloadV2> {
  const now = generatedAt;
  const prov = (source: "llm") => ({ source, updatedAt: now });
  const authored = (text: string) => ({ text, provenance: prov("llm") });

  const slide1: Partial<Slide1Payload> = {};
  const slide2: Partial<Slide2Payload> = {};
  const slide3: Partial<Slide3Payload> = {};
  const slide5: Partial<Slide5Payload> = {};

  for (const d of drafts) {
    if (d.validationErrors && d.validationErrors.length > 0) continue;
    const s = d.suggestion as Record<string, unknown>;

    if (d.slot === "slide1.headerSubtitle" && typeof s.text === "string") {
      slide1.headerSubtitle = authored(s.text);
    } else if (d.slot === "slide1.visionBullets" && Array.isArray(s.bullets)) {
      slide1.visionBullets = (s.bullets as { text: string }[])
        .slice(0, SLIDE1_VISION_BULLETS_COUNT)
        .map(b => authored(b.text));
    } else if (d.slot === "slide2.operationalModelText" && typeof s.text === "string") {
      slide2.operationalModelText = authored(s.text);
    } else if (d.slot === "slide2.revenueBullet" && typeof s.text === "string") {
      slide2.revenueBullet = authored(s.text);
    } else if (d.slot === "slide2.programmingBullet" && typeof s.text === "string") {
      slide2.programmingBullet = authored(s.text);
    } else if (d.slot === "slide3.conceptParagraph" && typeof s.text === "string") {
      slide3.conceptParagraph = authored(s.text);
    } else if (d.slot === "slide3.marketRationale" && typeof s.text === "string") {
      slide3.marketRationale = authored(s.text);
    } else if (d.slot === "slide3.closingLine" && typeof s.text === "string") {
      slide3.closingLine = authored(s.text);
    } else if (d.slot === "slide3.reasons" && Array.isArray(s.reasons)) {
      slide3.reasons = (s.reasons as { label: string; detail: string }[])
        .slice(0, SLIDE3_REASONS_COUNT)
        .map(r => ({ label: authored(r.label), detail: authored(r.detail) }));
    } else if (d.slot === "slide5.transformationDescription" && typeof s.text === "string") {
      slide5.transformationDescription = authored(s.text);
    } else if (d.slot === "slide5.transformationRows" && Array.isArray(s.rows)) {
      slide5.transformationRows = (s.rows as { feature: string; existing: string; proposed: string }[])
        .slice(0, SLIDE5_TRANSFORMATION_ROWS_COUNT)
        .map(r => ({
          feature: authored(r.feature),
          existing: authored(r.existing),
          proposed: authored(r.proposed),
        }));
    }
  }

  const patch: Partial<DeckPayloadV2> = {};
  if (Object.keys(slide1).length > 0) patch.slide1 = slide1 as Slide1Payload;
  if (Object.keys(slide2).length > 0) patch.slide2 = slide2 as Slide2Payload;
  if (Object.keys(slide3).length > 0) patch.slide3 = slide3 as Slide3Payload;
  if (Object.keys(slide5).length > 0) patch.slide5 = slide5 as Slide5Payload;
  return patch;
}

/** Human-readable label for a draft slot key. */
function slotLabel(slot: string): string {
  const LABELS: Record<string, string> = {
    "slide1.headerSubtitle": "Slide 1 — Header subtitle",
    "slide1.visionBullets": "Slide 1 — Vision bullets",
    "slide2.operationalModelText": "Slide 2 — Operational model",
    "slide2.revenueBullet": "Slide 2 — Revenue bullet",
    "slide2.programmingBullet": "Slide 2 — Programming bullet",
    "slide3.conceptParagraph": "Slide 3 — The Concept",
    "slide3.marketRationale": "Slide 3 — Why This Property?",
    "slide3.reasons": "Slide 3 — Investment reasons (×3)",
    "slide3.closingLine": "Slide 3 — Closing pull quote",
    "slide5.transformationDescription": "Slide 5 — Transformation intro",
    "slide5.transformationRows": "Slide 5 — Comparison rows",
  };
  return LABELS[slot] ?? slot;
}

/** Short preview of a suggestion value for display in the review panel. */
function suggestionPreview(slot: string, suggestion: unknown): string {
  if (!suggestion || typeof suggestion !== "object") return String(suggestion ?? "");
  const s = suggestion as Record<string, unknown>;
  if (typeof s.text === "string") return s.text;
  if (slot === "slide1.visionBullets" && Array.isArray(s.bullets)) {
    return (s.bullets as { text: string }[]).map((b, i) => `${i + 1}. ${b.text}`).join(" • ");
  }
  if (slot === "slide3.reasons" && Array.isArray(s.reasons)) {
    return (s.reasons as { label: string; detail: string }[])
      .map(r => `${r.label}: ${r.detail}`)
      .join(" | ");
  }
  if (slot === "slide5.transformationRows" && Array.isArray(s.rows)) {
    return (s.rows as { feature: string }[]).map(r => r.feature).join(", ");
  }
  return JSON.stringify(suggestion);
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

// ── Slide thumbnail (for the live preview panel in Edit mode) ─────────────

function SlideMiniPreview({
  Component,
  payload,
  label,
}: {
  Component: React.ComponentType<{ p: SlidePayload }>;
  payload: SlidePayload;
  label: string;
}) {
  return (
    <Card className="border border-border/60 self-start sticky top-4 overflow-hidden p-0">
      <div className="px-4 py-3 border-b border-border/60">
        <p className="text-sm font-semibold leading-tight">Live preview — {label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Shows authored copy from the editor. Save changes to update.
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
          <Component p={payload} />
        </div>
      </div>
    </Card>
  );
}

// ── Draft All review panel ────────────────────────────────────────────────

function DraftAllReviewPanel({
  drafts,
  generatedAt,
  propertyId,
  onAccepted,
  onDismiss,
}: {
  drafts: DraftResult[];
  generatedAt: string;
  propertyId: number;
  onAccepted: () => void;
  onDismiss: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const validDrafts = drafts.filter(d => !d.validationErrors || d.validationErrors.length === 0);
  const erroredDrafts = drafts.filter(d => d.validationErrors && d.validationErrors.length > 0);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const patch = buildAcceptAllPatch(validDrafts, generatedAt);
      const r = await apiRequest(
        "PATCH",
        `/api/admin/properties/${propertyId}/deck-payload`,
        { schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION, ...patch },
      );
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-payload"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-token"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-payload", "readiness"] });
      toast({
        title: `${validDrafts.length} slot${validDrafts.length === 1 ? "" : "s"} accepted`,
        description: "All Analyst drafts have been persisted. Open a slide editor to review and save any individual slot.",
      });
      onAccepted();
    },
    onError: (err: unknown) => {
      toast({
        title: "Accept all failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="border border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">
              Analyst drafted {drafts.length} slot{drafts.length === 1 ? "" : "s"} — review before accepting
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {validDrafts.length} ready to accept
              {erroredDrafts.length > 0 ? `, ${erroredDrafts.length} with validation errors (skipped)` : ""}.
              Accepting persists all valid drafts; individual slots can be revised in the editor.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="gap-1 text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss draft review"
          >
            <IconX className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        </div>

        <Separator />

        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {drafts.map((draft) => {
            const hasErrors = draft.validationErrors && draft.validationErrors.length > 0;
            return (
              <div key={draft.slot} className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">{slotLabel(draft.slot)}</span>
                  {hasErrors ? (
                    <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">
                      Validation error — skipped
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-sky-700 border-sky-300 bg-sky-50 text-[10px]">
                      Analyst draft
                    </Badge>
                  )}
                </div>
                {hasErrors ? (
                  <p className="text-xs text-destructive">{draft.validationErrors!.join("; ")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {suggestionPreview(draft.slot, draft.suggestion)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {validDrafts.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDismiss}
                disabled={acceptMutation.isPending}
              >
                Discard drafts
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="gap-1.5"
              >
                {acceptMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <IconCheck className="h-3.5 w-3.5" />}
                Accept all {validDrafts.length} draft{validDrafts.length === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function PropertySlides() {
  const [, params] = useRoute<{ propertyId: string }>("/slide-decks/:propertyId");
  const propertyId = params?.propertyId ? Number(params.propertyId) : NaN;
  const [view, setView] = useState<ViewMode>("grid");
  const [draftVersion, setDraftVersion] = useState<DraftVersion>("authored");
  const [editSlide, setEditSlide] = useState<number>(1);

  // Pending drafts from Draft All
  const [pendingDrafts, setPendingDrafts] = useState<DraftAllResponse | null>(null);

  const { toast } = useToast();

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

  const templatePayload = useMemo<SlidePayload | null>(
    () => payload ? { ...payload, deckPayloadV2: EMPTY_DECK_PAYLOAD_V2 } : null,
    [payload],
  );
  const activePayload = draftVersion === "template" ? templatePayload : payload;

  const actions = useSlideActions(propertyId, property?.name ?? `property-${propertyId}`);

  // ── Draft All mutation ─────────────────────────────────────────────────

  const draftAllMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/properties/${propertyId}/deck-payload/draft-all`,
        {},
      );
      return r.json() as Promise<DraftAllResponse>;
    },
    onSuccess: (result) => {
      if (result.drafts.length === 0) {
        toast({
          title: "All slots are complete",
          description: result.message ?? "Nothing to draft — all 11 LLM slots already have up-to-date copy.",
        });
        return;
      }
      setPendingDrafts(result);
    },
    onError: (err: unknown) => {
      toast({
        title: "Draft All failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  if (!Number.isFinite(propertyId)) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <p className="text-destructive">Invalid property ID.</p>
        </div>
      </Layout>
    );
  }

  // Resolve the active slide entry for the edit view.
  const activeSlideEntry = SLIDES.find(s => s.n === editSlide) ?? SLIDES[0];

  const viewActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Draft All — always visible; most useful in Edit mode */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => draftAllMutation.mutate()}
        disabled={draftAllMutation.isPending}
        className="gap-1.5"
        title="Ask the Analyst to draft all missing or stale LLM slots in one batch. Returns proposals for review before persisting."
      >
        {draftAllMutation.isPending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <IconRefreshCw className="h-3.5 w-3.5" />}
        Draft All
      </Button>

      <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
        <button
          type="button"
          onClick={() => setView("grid")}
          className={`px-3 py-1.5 transition-colors ${
            view === "grid"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
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
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
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
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          aria-pressed={view === "edit"}
        >
          Edit copy
        </button>
      </div>

      {view !== "edit" && (
        <div className="inline-flex items-center rounded-md border border-border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setDraftVersion("template")}
            className={`px-3 py-1.5 transition-colors ${
              draftVersion === "template"
                ? "bg-accent-pop text-accent-pop-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            aria-pressed={draftVersion === "template"}
          >
            System Draft
          </button>
          <button
            type="button"
            onClick={() => setDraftVersion("authored")}
            className={`px-3 py-1.5 border-l border-border transition-colors ${
              draftVersion === "authored"
                ? "bg-accent-pop-2 text-accent-pop-2-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            aria-pressed={draftVersion === "authored"}
          >
            Your Version
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Layout>
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl">
      <PageHeader
        title={`${property?.name ?? `Property ${propertyId}`} — Slide Deck`}
        subtitle="Each slide downloads as its own 1-page PDF. Toggle between System Draft and Your Version to compare auto-generated versus authored copy."
        backLink="/slide-decks"
        actions={viewActions}
      />

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

      {/* Draft All review panel — shown when pending drafts exist */}
      {pendingDrafts && pendingDrafts.drafts.length > 0 && (
        <DraftAllReviewPanel
          drafts={pendingDrafts.drafts}
          generatedAt={pendingDrafts.drafts[0]?.generatedAt ?? new Date().toISOString()}
          propertyId={propertyId}
          onAccepted={() => setPendingDrafts(null)}
          onDismiss={() => setPendingDrafts(null)}
        />
      )}

      {activePayload && view === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SLIDES.map(s => (
            <SlideThumbCard
              key={s.n}
              n={s.n}
              title={s.title}
              Component={s.Component}
              payload={activePayload}
              actions={actions}
            />
          ))}
        </div>
      )}

      {activePayload && view === "carousel" && (
        <SlidesCarousel payload={activePayload} actions={actions} />
      )}

      {view === "edit" && (
        <div className="space-y-4">
          {/* Per-slide tab strip */}
          <div className="inline-flex rounded-md border border-border overflow-hidden text-sm flex-wrap">
            {SLIDES.map((s, i) => (
              <button
                key={s.n}
                type="button"
                onClick={() => setEditSlide(s.n)}
                className={`px-3 py-1.5 transition-colors whitespace-nowrap ${
                  i > 0 ? "border-l border-border" : ""
                } ${
                  editSlide === s.n
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                aria-pressed={editSlide === s.n}
              >
                Slide {s.n}
              </button>
            ))}
          </div>

          {/* Active slide title hint */}
          <p className="text-xs text-muted-foreground -mt-2">
            Editing: <span className="font-medium text-foreground">{activeSlideEntry.title}</span>
          </p>

          {/* Editor + live preview layout */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <activeSlideEntry.EditorPanel propertyId={propertyId} />
            {payload && (
              <SlideMiniPreview
                Component={activeSlideEntry.Component}
                payload={payload}
                label={`Slide ${activeSlideEntry.n}`}
              />
            )}
          </div>
        </div>
      )}
    </div>
    </Layout>
  );
}
