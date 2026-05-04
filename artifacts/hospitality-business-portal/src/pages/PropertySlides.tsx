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

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import Layout from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { IconDownload, IconAlertCircle, IconRefreshCw, IconCheck, IconX } from "@/components/icons";
import { Loader2, RotateCcw } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  SLIDE1_HEADER_SUBTITLE_MAX,
  SLIDE1_VISION_BULLET_MAX,
  SLIDE1_VISION_BULLETS_COUNT,
  type Slide2Payload,
  SLIDE2_OPERATIONAL_MODEL_MAX,
  SLIDE2_REVENUE_BULLET_MAX,
  SLIDE2_PROGRAMMING_BULLET_MAX,
  type Slide3Payload,
  SLIDE3_CONCEPT_PARAGRAPH_MAX,
  SLIDE3_MARKET_RATIONALE_MAX,
  SLIDE3_REASON_LABEL_MAX,
  SLIDE3_REASON_DETAIL_MAX,
  SLIDE3_REASONS_COUNT,
  SLIDE3_CLOSING_LINE_MAX,
  type Slide5Payload,
  SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
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
import { useReadinessQuery } from "@/features/internal-deck/editor/editor-shared";

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
 * Client-side char-budget validation for a draft suggestion.
 * Mirrors the server-side SlotOutputValidator — keeps UI feedback in sync
 * without a round-trip.
 */
function validateSuggestionClient(slot: string, suggestion: unknown): string[] {
  if (!suggestion || typeof suggestion !== "object") return [];
  const s = suggestion as Record<string, unknown>;
  const errors: string[] = [];

  if (slot === "slide1.headerSubtitle" && typeof s.text === "string") {
    if (s.text.length > SLIDE1_HEADER_SUBTITLE_MAX)
      errors.push(`Exceeds ${SLIDE1_HEADER_SUBTITLE_MAX} chars (${s.text.length})`);
  } else if (slot === "slide1.visionBullets" && Array.isArray(s.bullets)) {
    (s.bullets as { text: string }[]).forEach((b, i) => {
      if (b.text.length > SLIDE1_VISION_BULLET_MAX)
        errors.push(`Bullet ${i + 1} exceeds ${SLIDE1_VISION_BULLET_MAX} chars (${b.text.length})`);
    });
  } else if (slot === "slide2.operationalModelText" && typeof s.text === "string") {
    if (s.text.length > SLIDE2_OPERATIONAL_MODEL_MAX)
      errors.push(`Exceeds ${SLIDE2_OPERATIONAL_MODEL_MAX} chars (${s.text.length})`);
  } else if (slot === "slide2.revenueBullet" && typeof s.text === "string") {
    if (s.text.length > SLIDE2_REVENUE_BULLET_MAX)
      errors.push(`Exceeds ${SLIDE2_REVENUE_BULLET_MAX} chars (${s.text.length})`);
  } else if (slot === "slide2.programmingBullet" && typeof s.text === "string") {
    if (s.text.length > SLIDE2_PROGRAMMING_BULLET_MAX)
      errors.push(`Exceeds ${SLIDE2_PROGRAMMING_BULLET_MAX} chars (${s.text.length})`);
  } else if (slot === "slide3.conceptParagraph" && typeof s.text === "string") {
    if (s.text.length > SLIDE3_CONCEPT_PARAGRAPH_MAX)
      errors.push(`Exceeds ${SLIDE3_CONCEPT_PARAGRAPH_MAX} chars (${s.text.length})`);
  } else if (slot === "slide3.marketRationale" && typeof s.text === "string") {
    if (s.text.length > SLIDE3_MARKET_RATIONALE_MAX)
      errors.push(`Exceeds ${SLIDE3_MARKET_RATIONALE_MAX} chars (${s.text.length})`);
  } else if (slot === "slide3.closingLine" && typeof s.text === "string") {
    if (s.text.length > SLIDE3_CLOSING_LINE_MAX)
      errors.push(`Exceeds ${SLIDE3_CLOSING_LINE_MAX} chars (${s.text.length})`);
  } else if (slot === "slide3.reasons" && Array.isArray(s.reasons)) {
    (s.reasons as { label: string; detail: string }[]).forEach((r, i) => {
      if (r.label.length > SLIDE3_REASON_LABEL_MAX)
        errors.push(`Reason ${i + 1} label exceeds ${SLIDE3_REASON_LABEL_MAX} chars (${r.label.length})`);
      if (r.detail.length > SLIDE3_REASON_DETAIL_MAX)
        errors.push(`Reason ${i + 1} detail exceeds ${SLIDE3_REASON_DETAIL_MAX} chars (${r.detail.length})`);
    });
  } else if (slot === "slide5.transformationDescription" && typeof s.text === "string") {
    if (s.text.length > SLIDE5_TRANSFORMATION_DESCRIPTION_MAX)
      errors.push(`Exceeds ${SLIDE5_TRANSFORMATION_DESCRIPTION_MAX} chars (${s.text.length})`);
  } else if (slot === "slide5.transformationRows" && Array.isArray(s.rows)) {
    (s.rows as { feature: string; existing: string; proposed: string }[]).forEach((r, i) => {
      if (r.feature.length > SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX)
        errors.push(`Row ${i + 1} feature exceeds ${SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX} chars (${r.feature.length})`);
      if (r.existing.length > SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX)
        errors.push(`Row ${i + 1} existing exceeds ${SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX} chars (${r.existing.length})`);
      if (r.proposed.length > SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX)
        errors.push(`Row ${i + 1} proposed exceeds ${SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX} chars (${r.proposed.length})`);
    });
  }

  return errors;
}

/**
 * Build a DeckPayloadV2 PATCH body from a selected subset of edited
 * suggestions. Callers provide only the slots they want to persist.
 */
function buildSelectedPatch(
  selected: { slot: string; suggestion: unknown }[],
  generatedAt: string,
): Partial<DeckPayloadV2> {
  const now = generatedAt;
  const prov = (source: "llm") => ({ source, updatedAt: now });
  const authored = (text: string) => ({ text, provenance: prov("llm") });

  const slide1: Partial<Slide1Payload> = {};
  const slide2: Partial<Slide2Payload> = {};
  const slide3: Partial<Slide3Payload> = {};
  const slide5: Partial<Slide5Payload> = {};

  for (const { slot, suggestion } of selected) {
    const s = suggestion as Record<string, unknown>;

    if (slot === "slide1.headerSubtitle" && typeof s.text === "string") {
      slide1.headerSubtitle = authored(s.text);
    } else if (slot === "slide1.visionBullets" && Array.isArray(s.bullets)) {
      slide1.visionBullets = (s.bullets as { text: string }[])
        .slice(0, SLIDE1_VISION_BULLETS_COUNT)
        .map(b => authored(b.text));
    } else if (slot === "slide2.operationalModelText" && typeof s.text === "string") {
      slide2.operationalModelText = authored(s.text);
    } else if (slot === "slide2.revenueBullet" && typeof s.text === "string") {
      slide2.revenueBullet = authored(s.text);
    } else if (slot === "slide2.programmingBullet" && typeof s.text === "string") {
      slide2.programmingBullet = authored(s.text);
    } else if (slot === "slide3.conceptParagraph" && typeof s.text === "string") {
      slide3.conceptParagraph = authored(s.text);
    } else if (slot === "slide3.marketRationale" && typeof s.text === "string") {
      slide3.marketRationale = authored(s.text);
    } else if (slot === "slide3.closingLine" && typeof s.text === "string") {
      slide3.closingLine = authored(s.text);
    } else if (slot === "slide3.reasons" && Array.isArray(s.reasons)) {
      slide3.reasons = (s.reasons as { label: string; detail: string }[])
        .slice(0, SLIDE3_REASONS_COUNT)
        .map(r => ({ label: authored(r.label), detail: authored(r.detail) }));
    } else if (slot === "slide5.transformationDescription" && typeof s.text === "string") {
      slide5.transformationDescription = authored(s.text);
    } else if (slot === "slide5.transformationRows" && Array.isArray(s.rows)) {
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

/**
 * Inline editor for a single draft slot. Renders slot-appropriate text
 * controls (single textarea, per-bullet textareas, per-reason/row pairs)
 * with real-time character-count feedback.
 */
function SlotEditor({
  slot,
  suggestion,
  onChange,
  disabled,
}: {
  slot: string;
  suggestion: unknown;
  onChange: (updated: unknown) => void;
  disabled?: boolean;
}) {
  const s = (suggestion as Record<string, unknown>) ?? {};

  if (slot === "slide1.visionBullets" && Array.isArray(s.bullets)) {
    const bullets = s.bullets as { text: string }[];
    return (
      <div className="space-y-2">
        {bullets.map((b, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Bullet {i + 1}</span>
              <span className={`text-[10px] tabular-nums ${b.text.length > SLIDE1_VISION_BULLET_MAX ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {b.text.length}/{SLIDE1_VISION_BULLET_MAX}
              </span>
            </div>
            <Textarea
              value={b.text}
              rows={2}
              className="text-xs resize-none"
              disabled={disabled}
              onChange={e => {
                const updated = bullets.map((x, j) => j === i ? { text: e.target.value } : x);
                onChange({ bullets: updated });
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (slot === "slide3.reasons" && Array.isArray(s.reasons)) {
    const reasons = s.reasons as { label: string; detail: string }[];
    return (
      <div className="space-y-3">
        {reasons.map((r, i) => (
          <div key={i} className="space-y-1.5 pl-2 border-l-2 border-border/60">
            <span className="text-[10px] font-medium text-muted-foreground">Reason {i + 1}</span>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Label</span>
                <span className={`text-[10px] tabular-nums ${r.label.length > SLIDE3_REASON_LABEL_MAX ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {r.label.length}/{SLIDE3_REASON_LABEL_MAX}
                </span>
              </div>
              <Textarea
                value={r.label}
                rows={1}
                className="text-xs resize-none"
                disabled={disabled}
                onChange={e => {
                  const updated = reasons.map((x, j) => j === i ? { ...x, label: e.target.value } : x);
                  onChange({ reasons: updated });
                }}
              />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Detail</span>
                <span className={`text-[10px] tabular-nums ${r.detail.length > SLIDE3_REASON_DETAIL_MAX ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {r.detail.length}/{SLIDE3_REASON_DETAIL_MAX}
                </span>
              </div>
              <Textarea
                value={r.detail}
                rows={2}
                className="text-xs resize-none"
                disabled={disabled}
                onChange={e => {
                  const updated = reasons.map((x, j) => j === i ? { ...x, detail: e.target.value } : x);
                  onChange({ reasons: updated });
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (slot === "slide5.transformationRows" && Array.isArray(s.rows)) {
    const rows = s.rows as { feature: string; existing: string; proposed: string }[];
    return (
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="space-y-1.5 pl-2 border-l-2 border-border/60">
            <span className="text-[10px] font-medium text-muted-foreground">Row {i + 1}</span>
            {(["feature", "existing", "proposed"] as const).map(field => {
              const maxMap = {
                feature: SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
                existing: SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
                proposed: SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
              };
              const max = maxMap[field];
              const val = r[field];
              return (
                <div key={field} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground capitalize">{field}</span>
                    <span className={`text-[10px] tabular-nums ${val.length > max ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {val.length}/{max}
                    </span>
                  </div>
                  <Textarea
                    value={val}
                    rows={1}
                    className="text-xs resize-none"
                    disabled={disabled}
                    onChange={e => {
                      const updated = rows.map((x, j) => j === i ? { ...x, [field]: e.target.value } : x);
                      onChange({ rows: updated });
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // Default: simple { text } slot
  const text = typeof s.text === "string" ? s.text : "";
  const SIMPLE_MAX: Partial<Record<string, number>> = {
    "slide1.headerSubtitle": SLIDE1_HEADER_SUBTITLE_MAX,
    "slide2.operationalModelText": SLIDE2_OPERATIONAL_MODEL_MAX,
    "slide2.revenueBullet": SLIDE2_REVENUE_BULLET_MAX,
    "slide2.programmingBullet": SLIDE2_PROGRAMMING_BULLET_MAX,
    "slide3.conceptParagraph": SLIDE3_CONCEPT_PARAGRAPH_MAX,
    "slide3.marketRationale": SLIDE3_MARKET_RATIONALE_MAX,
    "slide3.closingLine": SLIDE3_CLOSING_LINE_MAX,
    "slide5.transformationDescription": SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  };
  const max = SIMPLE_MAX[slot] ?? 320;
  const overBudget = text.length > max;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-end">
        <span className={`text-[10px] tabular-nums ${overBudget ? "text-destructive font-medium" : "text-muted-foreground"}`}>
          {text.length}/{max}
        </span>
      </div>
      <Textarea
        value={text}
        rows={3}
        className="text-xs resize-none"
        disabled={disabled}
        onChange={e => onChange({ text: e.target.value })}
      />
    </div>
  );
}

function DraftAllReviewPanel({
  drafts,
  generatedAt,
  propertyId,
  propertyUpdatedAt,
  onAccepted,
  onDismiss,
  onRedraftStale,
  isRedraftingStale,
}: {
  drafts: DraftResult[];
  generatedAt: string;
  propertyId: number;
  propertyUpdatedAt?: string;
  onAccepted: () => void;
  onDismiss: () => void;
  onRedraftStale?: () => void;
  isRedraftingStale?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const validDrafts = drafts.filter(d => !d.validationErrors || d.validationErrors.length === 0);
  const erroredDrafts = drafts.filter(d => d.validationErrors && d.validationErrors.length > 0);

  // Editable suggestion text per slot — initialized from the AI proposal.
  const [editedSuggestions, setEditedSuggestions] = useState<Record<string, unknown>>(
    () => Object.fromEntries(validDrafts.map(d => [d.slot, d.suggestion])),
  );

  // Per-slot inclusion checkboxes — all valid drafts selected by default.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(validDrafts.map(d => d.slot)),
  );

  // Track the original (LLM-generated) base suggestions per slot so we can
  // detect which slots were re-drafted vs which the admin has hand-edited.
  // When only stale slots are re-drafted, user edits on fresh slots are kept.
  const baseRef = useRef<Record<string, unknown>>(
    Object.fromEntries(validDrafts.map(d => [d.slot, d.suggestion])),
  );

  // When a slot is re-drafted in-place its new suggestion becomes the new
  // comparison base for the "Edited" badge — otherwise the badge would
  // incorrectly flag a freshly re-drafted slot as manually edited.
  const [redraftBases, setRedraftBases] = useState<Record<string, unknown>>({});

  // Which slots are currently awaiting a re-draft response.
  const [redraftingSlots, setRedraftingSlots] = useState<Set<string>>(new Set());

  async function redraftSlot(slot: string) {
    setRedraftingSlots(prev => new Set([...prev, slot]));
    try {
      const r = await apiRequest(
        "POST",
        `/api/admin/properties/${propertyId}/deck-payload/draft-slot`,
        { slot },
      );
      const result = (await r.json()) as DraftResult;
      // Replace the edited suggestion in-place; all other slots are untouched.
      setEditedSuggestions(prev => ({ ...prev, [slot]: result.suggestion }));
      // Record the new base so "Edited" badge reflects manual changes only.
      setRedraftBases(prev => ({ ...prev, [slot]: result.suggestion }));
      // Keep baseRef in sync so the useEffect re-sync doesn't stomp this slot.
      baseRef.current = { ...baseRef.current, [slot]: result.suggestion };
      toast({
        title: "Re-drafted",
        description: `${slotLabel(slot)} refreshed with a new Analyst suggestion.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Re-draft failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setRedraftingSlots(prev => {
        const next = new Set(prev);
        next.delete(slot);
        return next;
      });
    }
  }

  // Re-sync editable state when drafts change (e.g. re-draft stale or a
  // second Draft All run). Preserves admin edits on slots whose suggestion
  // did not change; resets to the fresh suggestion for re-drafted slots.
  useEffect(() => {
    const newBase = Object.fromEntries(validDrafts.map(d => [d.slot, d.suggestion]));

    setEditedSuggestions(prev => {
      const next: Record<string, unknown> = {};
      for (const d of validDrafts) {
        const prevBase = baseRef.current[d.slot];
        const suggestionChanged =
          JSON.stringify(prevBase) !== JSON.stringify(d.suggestion);
        if (suggestionChanged || !(d.slot in prev)) {
          next[d.slot] = d.suggestion;
        } else {
          next[d.slot] = prev[d.slot];
        }
      }
      return next;
    });

    setSelected(prev => {
      const validSlotSet = new Set(validDrafts.map(d => d.slot));
      const next = new Set([...prev].filter(s => validSlotSet.has(s)));
      for (const d of validDrafts) {
        if (!prev.has(d.slot)) next.add(d.slot);
      }
      return next;
    });

    setRedraftBases(prev => {
      const next: Record<string, unknown> = {};
      for (const [slot, base] of Object.entries(prev)) {
        const draft = validDrafts.find(d => d.slot === slot);
        if (draft && JSON.stringify(baseRef.current[slot]) === JSON.stringify(draft.suggestion)) {
          next[slot] = base;
        }
      }
      return next;
    });

    baseRef.current = newBase;
  // Only re-run when the set of slots or their raw suggestions actually changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  // Real-time char-budget validation against the current edited text.
  const localErrors = useMemo<Record<string, string[]>>(
    () => Object.fromEntries(
      validDrafts.map(d => [d.slot, validateSuggestionClient(d.slot, editedSuggestions[d.slot])]),
    ),
    [validDrafts, editedSuggestions],
  );

  const selectedWithErrors = validDrafts
    .filter(d => selected.has(d.slot) && localErrors[d.slot]?.length > 0)
    .length;

  const selectedCount = validDrafts.filter(d => selected.has(d.slot)).length;

  const editedSlots = validDrafts.filter(d => {
    const effectiveBase = redraftBases[d.slot] ?? d.suggestion;
    return JSON.stringify(editedSuggestions[d.slot]) !== JSON.stringify(effectiveBase);
  });
  const editedCount = editedSlots.length;

  const staleCount = propertyUpdatedAt
    ? drafts.filter(d => !d.validationErrors?.length && d.generatedAt < propertyUpdatedAt).length
    : 0;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const toAccept = validDrafts
        .filter(d => selected.has(d.slot) && !(localErrors[d.slot]?.length > 0))
        .map(d => ({ slot: d.slot, suggestion: editedSuggestions[d.slot] ?? d.suggestion }));
      const patch = buildSelectedPatch(toAccept, generatedAt);
      const r = await apiRequest(
        "PATCH",
        `/api/admin/properties/${propertyId}/deck-payload`,
        { schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION, ...patch },
      );
      return { json: await r.json(), count: toAccept.length };
    },
    onSuccess: ({ count }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-payload"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-token"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-payload", "readiness"] });
      toast({
        title: `${count} slot${count === 1 ? "" : "s"} accepted`,
        description: "Persisted. Open a slide editor to review or make further changes.",
      });
      onAccepted();
    },
    onError: (err: unknown) => {
      toast({
        title: "Accept failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  function toggleSlot(slot: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot); else next.add(slot);
      return next;
    });
  }

  return (
    <Card className="border border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/20">
      <CardContent className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">
              Analyst drafted {drafts.length} slot{drafts.length === 1 ? "" : "s"} — review &amp; edit before accepting
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {validDrafts.length} ready · {erroredDrafts.length > 0 ? `${erroredDrafts.length} skipped (validation errors)` : "no errors"}{editedCount > 0 ? ` · ${editedCount} of ${validDrafts.length} edited` : ""}.
              Check the slots you want to keep, edit the text if needed, then accept.
            </p>
            {editedCount > 0 && (
              <p className="text-[11px] text-violet-700 dark:text-violet-400 mt-1 leading-relaxed">
                Edited: {editedSlots.map(d => slotLabel(d.slot)).join(", ")}
              </p>
            )}
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

        {staleCount > 0 && (
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
            <IconAlertCircle className="h-3.5 w-3.5 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex-1 min-w-0">
              {staleCount === 1
                ? "1 draft was generated before the property was last edited."
                : `${staleCount} drafts were generated before the property was last edited.`}{" "}
              These may not reflect the latest property data.
            </p>
            {onRedraftStale && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRedraftStale}
                disabled={isRedraftingStale}
                className="shrink-0 gap-1.5 h-7 text-xs text-amber-800 border-amber-300 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-950/50"
              >
                {isRedraftingStale
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <IconRefreshCw className="h-3 w-3" />}
                Re-draft stale
              </Button>
            )}
          </div>
        )}

        <Separator />

        {/* Draft rows */}
        <div className="space-y-5 max-h-[560px] overflow-y-auto pr-1">
          {/* Valid drafts — editable + selectable */}
          {validDrafts.map(draft => {
            const isSelected = selected.has(draft.slot);
            const errs = localErrors[draft.slot] ?? [];
            const isStale = !!propertyUpdatedAt && draft.generatedAt < propertyUpdatedAt;
            // Compare against the re-drafted base when available so a freshly
            // re-drafted slot doesn't incorrectly show as manually edited.
            const effectiveBase = redraftBases[draft.slot] ?? draft.suggestion;
            const isDirty =
              JSON.stringify(editedSuggestions[draft.slot]) !== JSON.stringify(effectiveBase);
            const isRedrafting = redraftingSlots.has(draft.slot);
            return (
              <div
                key={draft.slot}
                className={`relative space-y-2 rounded-md border p-3 transition-colors ${
                  isRedrafting
                    ? "border-sky-400 dark:border-sky-500"
                    : isSelected
                      ? "border-sky-200 bg-white dark:border-sky-800 dark:bg-sky-950/10"
                      : "border-border/50 bg-muted/30 opacity-60"
                }`}
              >
                {isRedrafting && (
                  <div className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-sky-400/50 dark:ring-sky-500/40 animate-pulse" />
                )}
                {/* Row header: checkbox + label + badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Checkbox
                    id={`draft-cb-${draft.slot}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleSlot(draft.slot)}
                    aria-label={`Include ${slotLabel(draft.slot)}`}
                  />
                  <Label
                    htmlFor={`draft-cb-${draft.slot}`}
                    className="text-xs font-medium cursor-pointer leading-none"
                  >
                    {slotLabel(draft.slot)}
                  </Label>
                  <Badge variant="outline" className="text-sky-700 border-sky-300 bg-sky-50 dark:bg-sky-950/30 text-[10px]">
                    Analyst draft
                  </Badge>
                  {errs.length > 0 && (
                    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-[10px] gap-1">
                      <IconAlertCircle className="h-2.5 w-2.5" />
                      Over budget
                    </Badge>
                  )}
                  {isStale && (
                    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950/40">
                      Generated before property was last edited
                    </Badge>
                  )}
                  {isDirty && (
                    <Badge variant="outline" className="text-violet-700 border-violet-300 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-700 text-[10px]">
                      Edited
                    </Badge>
                  )}
                  {/* Right-aligned slot actions */}
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void redraftSlot(draft.slot)}
                      disabled={redraftingSlots.has(draft.slot)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Re-run the Analyst on this slot and replace the suggestion in-place"
                    >
                      {redraftingSlots.has(draft.slot)
                        ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        : <IconRefreshCw className="h-2.5 w-2.5" />}
                      Re-draft
                    </button>
                    {isDirty && isSelected && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditedSuggestions(prev => ({ ...prev, [draft.slot]: effectiveBase }))
                        }
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        title="Discard your edits and restore the current Analyst suggestion"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        Reset to original
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline editor */}
                {isSelected && (
                  <SlotEditor
                    slot={draft.slot}
                    suggestion={editedSuggestions[draft.slot] ?? draft.suggestion}
                    onChange={updated =>
                      setEditedSuggestions(prev => ({ ...prev, [draft.slot]: updated }))
                    }
                    disabled={isRedrafting}
                  />
                )}

                {/* Char-budget errors */}
                {isSelected && errs.length > 0 && (
                  <p className="text-[10px] text-destructive leading-snug">
                    {errs.join(" · ")} — shorten to accept this slot.
                  </p>
                )}
              </div>
            );
          })}

          {/* Errored drafts — read-only, always skipped */}
          {erroredDrafts.map(draft => (
            <div
              key={draft.slot}
              className="space-y-1 rounded-md border border-border/40 bg-muted/20 p-3 opacity-50"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium">{slotLabel(draft.slot)}</span>
                <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">
                  Validation error — skipped
                </Badge>
              </div>
              <p className="text-[10px] text-destructive">{draft.validationErrors!.join("; ")}</p>
            </div>
          ))}
        </div>

        {validDrafts.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {selectedCount} of {validDrafts.length} slot{validDrafts.length === 1 ? "" : "s"} selected
                {selectedWithErrors > 0 ? ` · ${selectedWithErrors} over budget (will be skipped)` : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDismiss}
                  disabled={acceptMutation.isPending}
                >
                  Discard
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending || selectedCount === 0 || (selectedCount - selectedWithErrors) === 0}
                  className="gap-1.5"
                >
                  {acceptMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <IconCheck className="h-3.5 w-3.5" />}
                  Accept {selectedCount - selectedWithErrors} selected
                </Button>
              </div>
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

  const initialView = useMemo<ViewMode>(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "edit" || v === "carousel") return v;
    return "grid";
  }, []);

  const [view, setView] = useState<ViewMode>(initialView);
  const [draftVersion, setDraftVersion] = useState<DraftVersion>("authored");
  const [editSlide, setEditSlide] = useState<number>(1);

  // Pending drafts from Draft All
  const [pendingDrafts, setPendingDrafts] = useState<DraftAllResponse | null>(null);

  const { toast } = useToast();

  // Readiness query — provides propertyUpdatedAt for stale-draft detection.
  const { data: readiness } = useReadinessQuery(propertyId);

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

  // ── Re-draft stale mutation ────────────────────────────────────────────
  //
  // Fires draft-slot calls in parallel for every slot in the current review
  // panel that was generated before the property's last edit. Non-stale slots
  // are left untouched — their entries in pendingDrafts are preserved as-is.

  const redraftStaleMutation = useMutation({
    mutationFn: async () => {
      if (!pendingDrafts || !readiness?.propertyUpdatedAt) return [];
      const staleSlots = pendingDrafts.drafts.filter(
        d =>
          (!d.validationErrors || d.validationErrors.length === 0) &&
          d.generatedAt < readiness.propertyUpdatedAt,
      );
      if (staleSlots.length === 0) return [];

      return Promise.all(
        staleSlots.map(async d => {
          const r = await apiRequest(
            "POST",
            `/api/admin/properties/${propertyId}/deck-payload/draft-slot`,
            { slot: d.slot },
          );
          return r.json() as Promise<DraftResult>;
        }),
      );
    },
    onSuccess: (freshDrafts) => {
      if (!freshDrafts || freshDrafts.length === 0) return;
      setPendingDrafts(prev => {
        if (!prev) return prev;
        const freshBySlot = new Map(freshDrafts.map(d => [d.slot, d]));
        return {
          ...prev,
          drafts: prev.drafts.map(d => freshBySlot.get(d.slot) ?? d),
        };
      });
      toast({
        title: `${freshDrafts.length} stale slot${freshDrafts.length === 1 ? "" : "s"} re-drafted`,
        description: "Fresh copy is ready — review and accept when satisfied.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Re-draft failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

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

  // Derive separate stale / missing counts from the readiness report so we
  // can show "Draft All · 3 stale, 2 missing" before the LLM runs.
  const draftAllStaleCount = readiness
    ? Object.values(readiness.report).filter(s => s === "stale").length
    : 0;
  const draftAllMissingCount = readiness
    ? Object.values(readiness.report).filter(s => s === "missing").length
    : 0;
  const draftAllHint = [
    draftAllStaleCount > 0 && `${draftAllStaleCount} stale`,
    draftAllMissingCount > 0 && `${draftAllMissingCount} missing`,
  ].filter(Boolean).join(", ");

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
        {!draftAllMutation.isPending && draftAllHint && (
          <span className="ml-0.5 text-[10px] font-normal text-muted-foreground tabular-nums">
            · {draftAllHint}
          </span>
        )}
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
          propertyUpdatedAt={readiness?.propertyUpdatedAt}
          onAccepted={() => setPendingDrafts(null)}
          onDismiss={() => setPendingDrafts(null)}
          onRedraftStale={() => redraftStaleMutation.mutate()}
          isRedraftingStale={redraftStaleMutation.isPending}
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
