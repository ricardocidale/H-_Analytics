import { useState, useCallback } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  IconPresentation,
  IconAlertCircle,
  IconLayers,
  IconDownload,
  IconPencil,
  IconCheckCircle2,
  IconAlertTriangle,
  IconWand2,
  IconExternalLink,
  IconFileText,
  IconRefreshCw,
  IconHistory,
  IconUser,
  IconClock,
} from "@/components/icons";
import { Loader2, ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DECK_PAYLOAD_SCHEMA_VERSION } from "@shared/deck-payload-v2";

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

interface SlideStatusRow {
  propertyId: number;
  format: string;
  status: string;
  r2Key: string | null;
  fileSizeBytes: number | null;
  generatedAt: string | null;
  triggeredBy: string | null;
  errorMessage: string | null;
}

type DeckReadiness = "ready" | "generating" | "error" | "not_generated";

type SlotStatus = "complete" | "stale" | "missing" | "deterministic";

interface ReadinessResponse {
  propertyId: number;
  report: Record<string, SlotStatus>;
  staleMissingSlots: string[];
  staleMissingCount: number;
  payloadUpdatedAt: string | null;
  propertyUpdatedAt: string;
}

interface CopyReadinessSummary {
  staleCount: number;
  missingCount: number;
}

type BulkDraftStatus = "idle" | "drafting" | "done" | "error";

interface BulkDraftPropertyResult {
  propertyId: number;
  propertyName: string;
  status: "done" | "error";
  draftedSlots: string[];
  skippedSlots: string[];
}

interface DraftResult {
  slot: string;
  suggestion: unknown;
  model: string;
  generatedAt: string;
  validationErrors?: string[];
}

interface BulkDraftRunRow {
  id: number;
  userId: number;
  userName: string;
  ranAt: string;
  totalDrafted: number;
  totalSkipped: number;
  totalErrors: number;
  propertyCount: number;
  propertyResults: BulkDraftPropertyResult[];
}

// ── Constants ─────────────────────────────────────────────────────────────

const ACQSTATUS_STYLES: Record<string, string> = {
  active:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  pipeline:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  planned:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  closed:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  operating: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  disposed:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const DECK_READINESS_STYLES: Record<DeckReadiness, string> = {
  ready:         "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  generating:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  error:         "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  not_generated: "bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400",
};

const DECK_READINESS_LABELS: Record<DeckReadiness, string> = {
  ready:         "Ready",
  generating:    "Generating…",
  error:         "Error",
  not_generated: "Not generated",
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

function deckReadinessFromStatus(rawStatus: string | undefined): DeckReadiness {
  if (!rawStatus || rawStatus === "idle") return "not_generated";
  if (rawStatus === "ready") return "ready";
  if (rawStatus === "generating") return "generating";
  if (rawStatus === "error") return "error";
  return "not_generated";
}

function summaryFromReadiness(r: ReadinessResponse): CopyReadinessSummary {
  let staleCount = 0;
  let missingCount = 0;
  for (const status of Object.values(r.report)) {
    if (status === "stale") staleCount++;
    else if (status === "missing") missingCount++;
  }
  return { staleCount, missingCount };
}

/**
 * Convert the array of DraftResult items returned by draft-all into a
 * partial DeckPayloadV2 patch that can be sent to PATCH /deck-payload.
 *
 * Each authored value needs a provenance envelope:
 *   { text: "...", provenance: { source: "llm", updatedAt: "...", model: "..." } }
 */
function draftsToPatch(drafts: DraftResult[]): Record<string, unknown> {
  const patch: Record<string, Record<string, unknown>> = {};

  function makeProvenance(d: DraftResult) {
    return { source: "llm" as const, updatedAt: d.generatedAt, model: d.model };
  }

  for (const d of drafts) {
    // Skip drafts with validation errors — don't persist bad data
    if (d.validationErrors && d.validationErrors.length > 0) continue;

    const [slideKey, slotName] = d.slot.split(".");
    if (!slideKey || !slotName) continue;

    const suggestion = d.suggestion as Record<string, unknown>;
    if (!patch[slideKey]) patch[slideKey] = {};

    if (slotName === "visionBullets") {
      // suggestion: { bullets: [{ text: "..." }, ...] }
      const bullets = (suggestion.bullets as Array<{ text: string }> | undefined) ?? [];
      patch[slideKey][slotName] = bullets.map(b => ({
        text: b.text,
        provenance: makeProvenance(d),
      }));
    } else if (slotName === "reasons") {
      // suggestion: { reasons: [{ label: "...", detail: "..." }, ...] }
      const reasons = (suggestion.reasons as Array<{ label: string; detail: string }> | undefined) ?? [];
      patch[slideKey][slotName] = reasons.map(r => ({
        label: { text: r.label, provenance: makeProvenance(d) },
        detail: { text: r.detail, provenance: makeProvenance(d) },
      }));
    } else if (slotName === "transformationRows") {
      // suggestion: { rows: [{ feature: "...", existing: "...", proposed: "..." }, ...] }
      const rows = (suggestion.rows as Array<{ feature: string; existing: string; proposed: string }> | undefined) ?? [];
      patch[slideKey][slotName] = rows.map(r => ({
        feature: { text: r.feature, provenance: makeProvenance(d) },
        existing: { text: r.existing, provenance: makeProvenance(d) },
        proposed: { text: r.proposed, provenance: makeProvenance(d) },
      }));
    } else {
      // All simple text slots: suggestion: { text: "..." }
      patch[slideKey][slotName] = {
        text: suggestion.text as string,
        provenance: makeProvenance(d),
      };
    }
  }

  return { schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION, ...patch };
}

// ── Copy readiness badge ───────────────────────────────────────────────────

function CopyReadinessBadge({
  summary,
  isError,
  propertyId,
}: {
  summary: CopyReadinessSummary | null;
  isError: boolean;
  propertyId: number;
}) {
  if (isError) {
    return (
      <Link href={`/slide-decks/${propertyId}?view=edit`}>
        <Badge
          variant="outline"
          className="text-[11px] shrink-0 border-0 font-medium bg-gray-100 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500 cursor-pointer hover:opacity-80 transition-opacity"
          title="Copy status unavailable — click to open editor"
        >
          Copy status unavailable
        </Badge>
      </Link>
    );
  }

  if (!summary) {
    return (
      <Badge
        variant="outline"
        className="text-[11px] shrink-0 border-0 font-medium bg-gray-100 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500 cursor-default"
      >
        Checking copy…
      </Badge>
    );
  }

  const { staleCount, missingCount } = summary;
  const total = staleCount + missingCount;

  if (total === 0) return null;

  let label: string;
  let classes: string;

  if (missingCount === 0) {
    label = `${staleCount} slot${staleCount === 1 ? "" : "s"} stale`;
    classes = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  } else if (staleCount === 0) {
    label = `${missingCount} slot${missingCount === 1 ? "" : "s"} missing`;
    classes = "bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400";
  } else {
    label = `${missingCount} missing · ${staleCount} stale`;
    classes = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }

  const title = "Open this deck's editor to fix missing or stale copy";

  return (
    <Link href={`/slide-decks/${propertyId}?view=edit`}>
      <Badge
        variant="outline"
        className={`text-[11px] shrink-0 border-0 font-medium cursor-pointer hover:opacity-80 transition-opacity gap-1 ${classes}`}
        title={title}
      >
        <IconPencil className="h-2.5 w-2.5 inline-block" />
        {label}
      </Badge>
    </Link>
  );
}

// ── Per-card bulk draft overlay ────────────────────────────────────────────

function BulkDraftOverlay({ status }: { status: BulkDraftStatus }) {
  if (status === "idle") return null;

  if (status === "drafting") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1">
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        Drafting copy…
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded px-2 py-1">
        <IconCheckCircle2 className="h-3 w-3 shrink-0" />
        Copy drafted &amp; saved
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
        <IconAlertTriangle className="h-3 w-3 shrink-0" />
        Draft failed — open editor
      </div>
    );
  }

  return null;
}

// ── Bulk draft summary dialog ──────────────────────────────────────────────

function humanSlotName(slot: string): string {
  const parts = slot.split(".");
  const slideKey = parts[0] ?? "";
  const slotName = parts[1] ?? slot;

  const slideNum = slideKey.replace(/^slide/, "");

  const SLOT_LABELS: Record<string, string> = {
    conceptParagraph: "Concept Paragraph",
    operationalModelText: "Operational Model",
    visionBullets: "Vision Bullets",
    reasons: "Reasons",
    transformationRows: "Transformation Table",
    marketPositioningText: "Market Positioning",
    investmentHighlightText: "Investment Highlight",
    propertyDescription: "Property Description",
    locationHighlight: "Location Highlight",
    subtitle: "Subtitle",
    tagline: "Tagline",
  };

  const label = SLOT_LABELS[slotName] ?? slotName;
  return slideNum ? `Slide ${slideNum} — ${label}` : label;
}

function BulkDraftSummaryDialog({
  open,
  onOpenChange,
  results,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: BulkDraftPropertyResult[];
  onRetry: (propertyId: number) => Promise<void>;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRetry = async (propertyId: number) => {
    setRetryingIds(prev => new Set(prev).add(propertyId));
    try {
      await onRetry(propertyId);
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(propertyId);
        return next;
      });
    }
  };

  const totalDrafted = results.reduce((sum, r) => sum + r.draftedSlots.length, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skippedSlots.length, 0);
  const successCount = results.filter(r => r.status === "done").length;
  const errorCount = results.filter(r => r.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconFileText className="h-5 w-5 text-muted-foreground" />
            Bulk Draft Summary
          </DialogTitle>
          <DialogDescription>
            {totalDrafted} slot{totalDrafted === 1 ? "" : "s"} drafted across{" "}
            {successCount} propert{successCount === 1 ? "y" : "ies"}
            {errorCount > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {" "}· {errorCount} failed
              </span>
            )}
            {totalSkipped > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}· {totalSkipped} skipped (validation errors)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-1 pr-3">
            {results.map(r => {
              const isExpanded = expandedIds.has(r.propertyId);
              const hasSlotDetails = r.draftedSlots.length > 0 || r.skippedSlots.length > 0;
              const isRetrying = retryingIds.has(r.propertyId);

              return (
                <div
                  key={r.propertyId}
                  className="rounded-md border border-border/60"
                >
                  <div className="flex w-full items-center gap-2 px-3 py-2.5 text-sm">
                    {hasSlotDetails ? (
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 hover:bg-muted/80 transition-colors"
                        onClick={() => toggleExpanded(r.propertyId)}
                        aria-label={isExpanded ? "Collapse slot list" : "Expand slot list"}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}

                    <span className="font-medium truncate flex-1">
                      {r.propertyName}
                    </span>

                    {isRetrying ? (
                      <Badge variant="outline" className="text-[11px] border-0 font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0 gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        Retrying…
                      </Badge>
                    ) : r.status === "error" ? (
                      <Badge variant="outline" className="text-[11px] border-0 font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                        Failed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] border-0 font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 shrink-0">
                        {r.draftedSlots.length} slot{r.draftedSlots.length === 1 ? "" : "s"}
                      </Badge>
                    )}

                    {r.status === "error" && !isRetrying && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
                        title="Retry draft for this property"
                        onClick={() => handleRetry(r.propertyId)}
                      >
                        <IconRefreshCw className="h-3 w-3" />
                        Retry
                      </button>
                    )}

                    <Link href={`/slide-decks/${r.propertyId}?view=edit`}>
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
                        title="Open deck editor for this property"
                      >
                        Edit
                        <IconExternalLink className="h-3 w-3" />
                      </span>
                    </Link>
                  </div>

                  {isExpanded && hasSlotDetails && (
                    <div className="px-3 pb-2.5 pt-0">
                      <div className="ml-6 border-l border-border/60 pl-3 space-y-0.5">
                        {r.draftedSlots.map(slot => (
                          <div
                            key={slot}
                            className="flex items-center gap-1.5 text-[12px] text-muted-foreground py-0.5"
                          >
                            <IconCheckCircle2 className="h-3 w-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
                            {humanSlotName(slot)}
                          </div>
                        ))}
                        {r.skippedSlots.length > 0 && r.skippedSlots.map(slot => (
                          <div
                            key={slot}
                            className="flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400 py-0.5"
                          >
                            <IconAlertTriangle className="h-3 w-3 shrink-0" />
                            {humanSlotName(slot)}
                            <span className="text-[10px] text-muted-foreground">(skipped)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
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

// ── Deck readiness badge ───────────────────────────────────────────────────

function DeckReadinessBadge({ readiness }: { readiness: DeckReadiness }) {
  return (
    <Badge
      variant="outline"
      className={`text-[11px] shrink-0 border-0 font-medium ${DECK_READINESS_STYLES[readiness]}`}
    >
      {readiness === "generating" && (
        <Loader2 className="h-2.5 w-2.5 animate-spin mr-1 inline-block" />
      )}
      {DECK_READINESS_LABELS[readiness]}
    </Badge>
  );
}

// ── Draft history section ──────────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function DraftHistorySection({ runs }: { runs: BulkDraftRunRow[] }) {
  const [expandedRunIds, setExpandedRunIds] = useState<Set<number>>(new Set());
  const [expandedPropertyIds, setExpandedPropertyIds] = useState<Set<string>>(new Set());

  const toggleRun = (id: number) => {
    setExpandedRunIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProperty = (runId: number, propertyId: number) => {
    const key = `${runId}-${propertyId}`;
    setExpandedPropertyIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <IconHistory className="h-4.5 w-4.5 text-muted-foreground" />
        <h3 className="text-base font-semibold text-foreground">Draft History</h3>
        <Badge variant="outline" className="text-[11px] border-0 font-medium bg-muted text-muted-foreground">
          {runs.length} run{runs.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="space-y-1.5">
        {runs.map(run => {
          const isExpanded = expandedRunIds.has(run.id);
          const successCount = run.propertyResults.filter(r => r.status === "done").length;

          return (
            <div
              key={run.id}
              className="rounded-md border border-border/60"
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-sm text-left hover:bg-muted/40 transition-colors rounded-md"
                onClick={() => toggleRun(run.id)}
              >
                {isExpanded
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

                <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                  <IconClock className="h-3.5 w-3.5" />
                  <span className="text-[12px] font-medium">{formatRelativeTime(run.ranAt)}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                  <IconUser className="h-3.5 w-3.5" />
                  <span className="text-[12px] font-medium truncate max-w-[120px]">{run.userName}</span>
                </div>

                <div className="flex-1" />

                <Badge variant="outline" className="text-[11px] border-0 font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 shrink-0">
                  {run.totalDrafted} drafted
                </Badge>

                {run.totalSkipped > 0 && (
                  <Badge variant="outline" className="text-[11px] border-0 font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">
                    {run.totalSkipped} skipped
                  </Badge>
                )}

                {run.totalErrors > 0 && (
                  <Badge variant="outline" className="text-[11px] border-0 font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                    {run.totalErrors} failed
                  </Badge>
                )}

                <Badge variant="outline" className="text-[11px] border-0 font-medium bg-muted text-muted-foreground shrink-0">
                  {successCount}/{run.propertyCount} propert{run.propertyCount === 1 ? "y" : "ies"}
                </Badge>
              </button>

              {isExpanded && (
                <div className="px-3.5 pb-3 pt-0">
                  <div className="ml-5 border-l border-border/60 pl-3 space-y-0.5">
                    {run.propertyResults.map(pr => {
                      const propKey = `${run.id}-${pr.propertyId}`;
                      const isPropExpanded = expandedPropertyIds.has(propKey);
                      const hasSlotDetails = pr.draftedSlots.length > 0 || pr.skippedSlots.length > 0;

                      return (
                        <div key={pr.propertyId}>
                          <div className="flex items-center gap-2 py-1">
                            {hasSlotDetails ? (
                              <button
                                type="button"
                                className="shrink-0 rounded p-0.5 hover:bg-muted/80 transition-colors"
                                onClick={() => toggleProperty(run.id, pr.propertyId)}
                                aria-label={isPropExpanded ? "Collapse slot list" : "Expand slot list"}
                              >
                                {isPropExpanded
                                  ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                  : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                              </button>
                            ) : (
                              <span className="w-3 shrink-0" />
                            )}

                            <span className="text-[12px] font-medium truncate flex-1">
                              {pr.propertyName}
                            </span>

                            {pr.status === "error" ? (
                              <Badge variant="outline" className="text-[10px] border-0 font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                                Failed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-0 font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 shrink-0">
                                {pr.draftedSlots.length} slot{pr.draftedSlots.length === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </div>

                          {isPropExpanded && hasSlotDetails && (
                            <div className="ml-6 border-l border-border/40 pl-2.5 space-y-0.5 pb-1">
                              {pr.draftedSlots.map(slot => (
                                <div
                                  key={slot}
                                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground py-0.5"
                                >
                                  <IconCheckCircle2 className="h-2.5 w-2.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                                  {humanSlotName(slot)}
                                </div>
                              ))}
                              {pr.skippedSlots.map(slot => (
                                <div
                                  key={slot}
                                  className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 py-0.5"
                                >
                                  <IconAlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                  {humanSlotName(slot)}
                                  <span className="text-[10px] text-muted-foreground">(skipped)</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SlideDecksTab() {
  const queryClient = useQueryClient();
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [bulkDraftStatuses, setBulkDraftStatuses] = useState<Map<number, BulkDraftStatus>>(new Map());
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkDraftResults, setBulkDraftResults] = useState<BulkDraftPropertyResult[]>([]);
  const [showBulkSummary, setShowBulkSummary] = useState(false);

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

  const { data: properties, isLoading: propsLoading, isError: propsError } = useQuery<PropertyRow[]>({
    queryKey: ["/api/properties"],
    staleTime: 30_000,
  });

  const { data: slideStatuses } = useQuery<SlideStatusRow[]>({
    queryKey: ["/api/slides/status"],
    staleTime: 15_000,
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (Array.isArray(rows) && rows.some(r => r.status === "generating")) return 3_000;
      return false;
    },
  });

  const deckStatusByPropertyId = new Map<number, DeckReadiness>();
  if (slideStatuses) {
    for (const row of slideStatuses) {
      const current = deckStatusByPropertyId.get(row.propertyId);
      const next = deckReadinessFromStatus(row.status);
      if (!current) {
        deckStatusByPropertyId.set(row.propertyId, next);
      } else {
        const PRIORITY: DeckReadiness[] = ["ready", "generating", "error", "not_generated"];
        if (PRIORITY.indexOf(next) < PRIORITY.indexOf(current)) {
          deckStatusByPropertyId.set(row.propertyId, next);
        }
      }
    }
  }

  const propertyIds = properties?.map(p => p.id) ?? [];
  const readinessResults = useQueries({
    queries: propertyIds.map(id => ({
      queryKey: ["/api/admin/properties", id, "deck-payload", "readiness"] as const,
      queryFn: async (): Promise<ReadinessResponse> => {
        const r = await fetch(`/api/admin/properties/${id}/deck-payload/readiness`, {
          credentials: "include",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      staleTime: 0,
      refetchInterval: 60_000,
      retry: 1,
    })),
  });

  const copyReadinessByPropertyId = new Map<number, CopyReadinessSummary>();
  const copyReadinessErrorIds = new Set<number>();
  propertyIds.forEach((id, i) => {
    const result = readinessResults[i];
    if (result?.data) {
      copyReadinessByPropertyId.set(id, summaryFromReadiness(result.data));
    } else if (result?.isError) {
      copyReadinessErrorIds.add(id);
    }
  });

  // Properties that have at least one missing or stale slot
  const deficientPropertyIds = propertyIds.filter(id => {
    const summary = copyReadinessByPropertyId.get(id);
    return summary != null && (summary.staleCount + summary.missingCount) > 0;
  });

  const draftSingleProperty = useCallback(async (
    propertyId: number,
  ): Promise<BulkDraftPropertyResult> => {
    const propName = properties?.find(p => p.id === propertyId)?.name ?? `Property ${propertyId}`;

    try {
      const draftRes = await fetch(
        `/api/admin/properties/${propertyId}/deck-payload/draft-all`,
        { method: "POST", credentials: "include" },
      );
      if (!draftRes.ok) throw new Error(`draft-all HTTP ${draftRes.status}`);
      const draftData = (await draftRes.json()) as { drafts: DraftResult[] };

      const usableDrafts = draftData.drafts.filter(
        d => !d.validationErrors || d.validationErrors.length === 0,
      );
      const skippedDrafts = draftData.drafts.filter(
        d => d.validationErrors && d.validationErrors.length > 0,
      );

      if (usableDrafts.length > 0) {
        const patch = draftsToPatch(usableDrafts);
        const patchRes = await fetch(
          `/api/admin/properties/${propertyId}/deck-payload`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        if (!patchRes.ok) throw new Error(`PATCH HTTP ${patchRes.status}`);
      }

      setBulkDraftStatuses(prev => new Map(prev).set(propertyId, "done"));

      if (usableDrafts.length > 0) {
        fetch(`/api/properties/${propertyId}/deck.pdf/regenerate`, {
          method: "POST",
          credentials: "include",
        })
          .then(r => {
            if (r.ok) {
              queryClient.invalidateQueries({ queryKey: ["/api/slides/status"] });
            } else {
              console.warn(`[bulk-draft] PDF regen queue failed for property ${propertyId}: HTTP ${r.status}`);
              queryClient.invalidateQueries({ queryKey: ["/api/slides/status"] });
            }
          })
          .catch(() => {});
      }

      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/properties", propertyId, "deck-payload", "readiness"],
      });

      return {
        propertyId,
        propertyName: propName,
        status: "done",
        draftedSlots: usableDrafts.map(d => d.slot),
        skippedSlots: skippedDrafts.map(d => d.slot),
      };
    } catch {
      setBulkDraftStatuses(prev => new Map(prev).set(propertyId, "error"));
      return {
        propertyId,
        propertyName: propName,
        status: "error",
        draftedSlots: [],
        skippedSlots: [],
      };
    }
  }, [properties, queryClient]);

  const handleDraftAllMissing = useCallback(async () => {
    if (isBulkRunning || deficientPropertyIds.length === 0) return;
    setIsBulkRunning(true);
    const runResults: BulkDraftPropertyResult[] = [];

    setBulkDraftStatuses(() => {
      const next = new Map<number, BulkDraftStatus>();
      for (const id of deficientPropertyIds) next.set(id, "drafting");
      return next;
    });

    for (const propertyId of deficientPropertyIds) {
      const result = await draftSingleProperty(propertyId);
      runResults.push(result);
    }

    setBulkDraftResults(runResults);
    setShowBulkSummary(true);
    setIsBulkRunning(false);

    try {
      await fetch("/api/admin/bulk-draft-runs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyResults: runResults }),
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/bulk-draft-runs"],
      });
    } catch {
    }
  }, [isBulkRunning, deficientPropertyIds, draftSingleProperty, queryClient]);

  const handleRetryProperty = useCallback(async (propertyId: number) => {
    setBulkDraftStatuses(prev => new Map(prev).set(propertyId, "drafting"));
    const result = await draftSingleProperty(propertyId);

    setBulkDraftResults(prev =>
      prev.map(r => r.propertyId === propertyId ? result : r),
    );
  }, [draftSingleProperty]);

  const { data: draftHistory } = useQuery<BulkDraftRunRow[]>({
    queryKey: ["/api/admin/bulk-draft-runs"],
    staleTime: 30_000,
  });

  // Count how many are still in-flight or queued
  const draftingCount = [...bulkDraftStatuses.values()].filter(s => s === "drafting").length;
  const doneCount = [...bulkDraftStatuses.values()].filter(s => s === "done").length;
  const errorCount = [...bulkDraftStatuses.values()].filter(s => s === "error").length;
  const bulkHasRun = bulkDraftStatuses.size > 0;

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Property Slide Decks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Click <strong>Download PDF</strong> to get the full 6-slide deck in one file, or click <strong>Slides</strong> to open the per-slide view.
          </p>
        </div>

        {/* Bulk draft button — only visible when there are deficient decks */}
        {deficientPropertyIds.length > 0 && (
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 whitespace-nowrap"
              disabled={isBulkRunning}
              onClick={handleDraftAllMissing}
              title={`Draft and save copy for ${deficientPropertyIds.length} propert${deficientPropertyIds.length === 1 ? "y" : "ies"} with missing or stale slots`}
            >
              {isBulkRunning
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <IconWand2 className="h-3.5 w-3.5" />}
              {isBulkRunning
                ? `Drafting ${draftingCount} of ${deficientPropertyIds.length}…`
                : `Draft all missing copy`}
            </Button>

            {bulkHasRun && !isBulkRunning && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <p>
                  {doneCount > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {doneCount} saved
                    </span>
                  )}
                  {doneCount > 0 && errorCount > 0 && " · "}
                  {errorCount > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      {errorCount} failed
                    </span>
                  )}
                </p>
                {bulkDraftResults.length > 0 && (
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setShowBulkSummary(true)}
                  >
                    View details
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map(p => {
          const acqStatus = (p.acquisitionStatus ?? p.status)?.toLowerCase() ?? "pipeline";
          const deckReadiness = deckStatusByPropertyId.get(p.id) ?? "not_generated";
          const bulkStatus = bulkDraftStatuses.get(p.id) ?? "idle";

          return (
            <Card key={p.id} className="flex flex-col border border-border/60 hover:border-border transition-colors overflow-hidden p-0">
              <SlideRender property={p} />

              <CardContent className="flex flex-col gap-3 p-4">
                {/* Name + acquisition badge */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</p>
                  <Badge
                    variant="outline"
                    className={`text-[11px] shrink-0 border-0 font-medium ${ACQSTATUS_STYLES[acqStatus] ?? ACQSTATUS_STYLES["pipeline"]}`}
                  >
                    {statusLabel(p.acquisitionStatus ?? p.status)}
                  </Badge>
                </div>

                {/* PDF generation status + copy readiness badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <DeckReadinessBadge readiness={deckReadiness} />
                  <CopyReadinessBadge
                    summary={copyReadinessByPropertyId.get(p.id) ?? null}
                    isError={copyReadinessErrorIds.has(p.id)}
                    propertyId={p.id}
                  />
                </div>

                {/* Per-property bulk draft progress indicator */}
                {bulkStatus !== "idle" && (
                  <BulkDraftOverlay status={bulkStatus} />
                )}

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

      <BulkDraftSummaryDialog
        open={showBulkSummary}
        onOpenChange={setShowBulkSummary}
        results={bulkDraftResults}
        onRetry={handleRetryProperty}
      />

      {draftHistory && draftHistory.length > 0 && (
        <DraftHistorySection runs={draftHistory} />
      )}
    </div>
  );
}
