/**
 * Slide3EditorPanel.tsx
 *
 * Admin authoring surface for Slide 3 of the L+B canonical investor deck
 * (Investment Model).
 *
 * Authored slots (all LLM-draft + human-approved):
 *   - conceptParagraph   — "The Concept" narrative paragraph
 *   - marketRationale    — "Why This Property?" narrative paragraph
 *   - reasons[0..2]      — 3 bold-label + detail pairs
 *   - closingLine        — closing pull quote in the accent block
 *
 * Deterministic (NOT editable here):
 *   - City/state slide header, photo panels
 *
 * Wire format: lib/shared/src/deck-payload-v2.ts (slide3PayloadSchema).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertCircle, IconRefreshCw, IconCheck, IconX } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DECK_PAYLOAD_SCHEMA_VERSION,
  SLIDE3_CONCEPT_PARAGRAPH_MAX,
  SLIDE3_MARKET_RATIONALE_MAX,
  SLIDE3_REASON_LABEL_MAX,
  SLIDE3_REASON_DETAIL_MAX,
  SLIDE3_REASONS_COUNT,
  SLIDE3_CLOSING_LINE_MAX,
  type DeckPayloadV2,
  type Slide3Payload,
  type AuthoredString,
  type SlotProvenance,
} from "@shared/deck-payload-v2";
import {
  type FormSlot,
  type DeckPayloadResponse,
  emptySlot,
  hydrateSlot,
  stampSlot,
  ProvenancePill,
  CharCounter,
  ReadinessBadge,
  useReadinessQuery,
  isDraftStale,
  StaleDraftNotice,
  StaleDraftBanner,
  InlineDraftDiff,
} from "./editor-shared";

// ── Types ──────────────────────────────────────────────────────────────────

interface FormReasonPair {
  label: FormSlot;
  detail: FormSlot;
}

interface Form {
  conceptParagraph: FormSlot;
  marketRationale: FormSlot;
  reasons: FormReasonPair[];
  closingLine: FormSlot;
}

type Slide3ScalarSlot = "slide3.conceptParagraph" | "slide3.marketRationale" | "slide3.closingLine";
type Slide3DraftSlot = Slide3ScalarSlot | "slide3.reasons";

// ── Hydration helpers ──────────────────────────────────────────────────────

function hydrateForm(payload: DeckPayloadV2): Form {
  const s3: Slide3Payload = payload.slide3 ?? {};
  const serverReasons = s3.reasons ?? [];
  return {
    conceptParagraph: hydrateSlot(s3.conceptParagraph),
    marketRationale: hydrateSlot(s3.marketRationale),
    reasons: Array.from({ length: SLIDE3_REASONS_COUNT }, (_, i) => ({
      label: hydrateSlot(serverReasons[i]?.label),
      detail: hydrateSlot(serverReasons[i]?.detail),
    })),
    closingLine: hydrateSlot(s3.closingLine),
  };
}

function buildPatchBody(form: Form): { slide3?: Partial<Slide3Payload> } | null {
  const now = new Date().toISOString();
  const slide3: Partial<Slide3Payload> = {};
  const stamp = (slot: FormSlot): AuthoredString => stampSlot(slot, now);

  if (form.conceptParagraph.dirty) slide3.conceptParagraph = stamp(form.conceptParagraph);
  if (form.marketRationale.dirty) slide3.marketRationale = stamp(form.marketRationale);
  if (form.closingLine.dirty) slide3.closingLine = stamp(form.closingLine);

  const anyReasonDirty = form.reasons.some(r => r.label.dirty || r.detail.dirty);
  if (anyReasonDirty) {
    slide3.reasons = form.reasons
      .filter(r => r.label.text.trim().length > 0 || r.detail.text.trim().length > 0)
      .map(r => ({ label: stamp(r.label), detail: stamp(r.detail) }));
  }

  if (Object.keys(slide3).length === 0) return null;
  return { slide3 };
}

// ── Scalar slot row ────────────────────────────────────────────────────────

function ScalarSlotRow({
  label, description, slot, max, multiline, onChange, onDraft, isDrafting, readinessKey, readinessReport, propertyUpdatedAt, pendingSuggestion, onAcceptDraft, onDismissDraft,
}: {
  label: string;
  description: string;
  slot: FormSlot;
  max: number;
  multiline?: boolean;
  onChange: (text: string, source: SlotProvenance["source"]) => void;
  onDraft: () => void;
  isDrafting: boolean;
  readinessKey: string;
  readinessReport: Record<string, string> | undefined;
  propertyUpdatedAt?: string;
  pendingSuggestion?: string | null;
  onAcceptDraft?: () => void;
  onDismissDraft?: () => void;
}) {
  const id = `slide3-slot-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const InputComp = multiline ? Textarea : Input;
  const readinessStatus = readinessReport?.[readinessKey] as "complete" | "stale" | "missing" | undefined;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
          <Badge variant="outline" className="text-sky-700 border-sky-300 bg-sky-50 text-[10px] uppercase tracking-wide">
            llm-draft+approved
          </Badge>
          <ReadinessBadge status={readinessStatus} />
        </div>
        <div className="flex items-center gap-2">
          <ProvenancePill source={slot.serverProvenance?.source ?? null} dirty={slot.dirty} />
          <CharCounter length={slot.text.length} max={max} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <InputComp
        id={id}
        value={slot.text}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value, "user")}
        rows={multiline ? 3 : undefined}
        maxLength={max}
        className={slot.text.length > max ? "border-destructive" : undefined}
      />
      {isDraftStale(slot, propertyUpdatedAt) && <StaleDraftNotice />}
      {pendingSuggestion != null && onAcceptDraft && onDismissDraft ? (
        <InlineDraftDiff
          currentText={slot.text}
          suggestedText={pendingSuggestion}
          onAccept={onAcceptDraft}
          onDismiss={onDismissDraft}
        />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDraft}
          disabled={isDrafting}
          className="gap-1.5"
        >
          {isDrafting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <IconRefreshCw className="h-3.5 w-3.5" />}
          Re-draft
        </Button>
      )}
    </div>
  );
}

// ── Plain slot row (no draft button — for reason label/detail sub-fields) ──

function PlainSlotRow({
  label, description, slot, max, multiline, onChange, propertyUpdatedAt,
}: {
  label: string;
  description: string;
  slot: FormSlot;
  max: number;
  multiline?: boolean;
  onChange: (text: string, source: SlotProvenance["source"]) => void;
  propertyUpdatedAt?: string;
}) {
  const id = `slide3-slot-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const InputComp = multiline ? Textarea : Input;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
          <Badge variant="outline" className="text-sky-700 border-sky-300 bg-sky-50 text-[10px] uppercase tracking-wide">
            llm-draft+approved
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <ProvenancePill source={slot.serverProvenance?.source ?? null} dirty={slot.dirty} />
          <CharCounter length={slot.text.length} max={max} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <InputComp
        id={id}
        value={slot.text}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value, "user")}
        rows={multiline ? 3 : undefined}
        maxLength={max}
        className={slot.text.length > max ? "border-destructive" : undefined}
      />
      {isDraftStale(slot, propertyUpdatedAt) && <StaleDraftNotice />}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function Slide3EditorPanel({ propertyId }: { propertyId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = useMemo(
    () => ["/api/admin/properties", propertyId, "deck-payload"] as const,
    [propertyId],
  );

  const { data, isLoading, error } = useQuery<DeckPayloadResponse>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`/api/admin/properties/${propertyId}/deck-payload`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text().catch(() => r.statusText)}`);
      return r.json();
    },
    enabled: Number.isFinite(propertyId),
    staleTime: 10_000,
  });

  const { data: readinessData } = useReadinessQuery(propertyId);

  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => { if (data) setForm(hydrateForm(data.payload)); }, [data]);

  const patchMutation = useMutation({
    mutationFn: async (body: { slide3?: Partial<Slide3Payload> }) => {
      const r = await apiRequest(
        "PATCH",
        `/api/admin/properties/${propertyId}/deck-payload`,
        { schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION, ...body },
      );
      return r.json() as Promise<DeckPayloadResponse>;
    },
    onSuccess: (next) => {
      qc.setQueryData(queryKey, next);
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-token"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-payload", "readiness"] });
      toast({ title: "Slide 3 saved", description: "Editor copy persisted to the deck payload sidecar." });
    },
    onError: (err: unknown) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const [draftingSlot, setDraftingSlot] = useState<Slide3DraftSlot | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, {
    text?: string;
    reasons?: { label: string; detail: string }[];
    generatedAt: string;
  }>>({});

  const draftMutation = useMutation({
    mutationFn: async (slot: Slide3DraftSlot) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/properties/${propertyId}/deck-payload/draft-slot`,
        { slot },
      );
      return r.json() as Promise<{
        slot: string;
        suggestion: { text?: string; reasons?: { label: string; detail: string }[] };
        model: string;
        generatedAt: string;
      }>;
    },
    onSuccess: (result) => {
      const s = result.slot as Slide3DraftSlot;
      if ((s === "slide3.conceptParagraph" || s === "slide3.marketRationale" || s === "slide3.closingLine") && result.suggestion.text != null) {
        setPendingDrafts(prev => ({
          ...prev,
          [s]: { text: result.suggestion.text!, generatedAt: result.generatedAt },
        }));
      }
      if (s === "slide3.reasons" && result.suggestion.reasons) {
        setPendingDrafts(prev => ({
          ...prev,
          "slide3.reasons": { reasons: result.suggestion.reasons!, generatedAt: result.generatedAt },
        }));
      }
      toast({ title: "Analyst suggestion ready", description: "Review the proposal below the field — accept or dismiss it." });
    },
    onError: (err: unknown) => {
      toast({ title: "Draft failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
    onSettled: () => setDraftingSlot(null),
  });

  function setScalarSlot<K extends "conceptParagraph" | "marketRationale" | "closingLine">(
    key: K, text: string, source: SlotProvenance["source"],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: { ...prev[key], text, source, dirty: true } } : prev));
  }

  function setReasonSlot(
    idx: number,
    field: "label" | "detail",
    text: string,
    source: SlotProvenance["source"],
  ) {
    setForm((prev) => {
      if (!prev) return prev;
      const reasons = [...prev.reasons];
      reasons[idx] = { ...reasons[idx], [field]: { ...reasons[idx][field], text, source, dirty: true } };
      return { ...prev, reasons };
    });
  }

  function draft(slot: Slide3DraftSlot) {
    setDraftingSlot(slot);
    draftMutation.mutate(slot);
  }

  function acceptDraft(slotKey: string) {
    const pending = pendingDrafts[slotKey];
    if (!pending) return;
    if (pending.text != null) {
      const formKey = slotKey.replace("slide3.", "") as "conceptParagraph" | "marketRationale" | "closingLine";
      setForm(prev => prev ? { ...prev, [formKey]: { ...prev[formKey], text: pending.text!, source: "llm" as const, dirty: true, llmGeneratedAt: pending.generatedAt } } : prev);
    }
    if (slotKey === "slide3.reasons" && pending.reasons) {
      setForm(prev => {
        if (!prev) return prev;
        const incoming = pending.reasons!;
        const reasons = prev.reasons.map((pair, i) => {
          const r = incoming[i];
          if (!r) return pair;
          return {
            label: { ...pair.label, text: r.label ?? "", source: "llm" as const, dirty: true, llmGeneratedAt: pending.generatedAt },
            detail: { ...pair.detail, text: r.detail ?? "", source: "llm" as const, dirty: true, llmGeneratedAt: pending.generatedAt },
          };
        });
        return { ...prev, reasons };
      });
    }
    dismissDraft(slotKey);
  }

  function dismissDraft(slotKey: string) {
    setPendingDrafts(prev => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
  }

  if (!Number.isFinite(propertyId)) return <p className="text-destructive">Invalid property ID.</p>;
  if (isLoading || !form) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading editor…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <IconAlertCircle className="h-4 w-4" />
        Failed to load deck payload: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  const patchBody = buildPatchBody(form);
  const hasDirty = patchBody !== null;
  const report = readinessData?.report;
  const propertyUpdatedAt = readinessData?.propertyUpdatedAt;
  const reasonsStatus = report?.["slide3.reasons"] as "complete" | "stale" | "missing" | undefined;

  const allSlots: FormSlot[] = [
    form.conceptParagraph,
    form.marketRationale,
    form.closingLine,
    ...form.reasons.flatMap(r => [r.label, r.detail]),
  ];
  const staleCount = allSlots.filter(s => isDraftStale(s, propertyUpdatedAt)).length;

  return (
    <Card data-stale-panel="" className="border border-border/60">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Slide 3 — Editor copy</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Author the Investment Model narrative — concept, rationale, three investment reasons, and
              a closing pull quote. City/state header and photo panels are deterministic.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.updatedAt ? `Last saved ${new Date(data.updatedAt).toLocaleString()}` : "Never saved"}
          </div>
        </div>

        <StaleDraftBanner staleCount={staleCount} />

        <Separator />

        {/* Narrative paragraphs */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Narrative</h3>
          <ScalarSlotRow
            label="The Concept"
            description='Paragraph under the "The Concept" section header. Explain the L+B operating model as applied to this specific asset type and location.'
            slot={form.conceptParagraph}
            max={SLIDE3_CONCEPT_PARAGRAPH_MAX}
            multiline
            onChange={(t, s) => setScalarSlot("conceptParagraph", t, s)}
            onDraft={() => draft("slide3.conceptParagraph")}
            isDrafting={draftingSlot === "slide3.conceptParagraph" && draftMutation.isPending}
            readinessKey="slide3.conceptParagraph"
            readinessReport={report}
            propertyUpdatedAt={propertyUpdatedAt}
            pendingSuggestion={pendingDrafts["slide3.conceptParagraph"]?.text ?? null}
            onAcceptDraft={() => acceptDraft("slide3.conceptParagraph")}
            onDismissDraft={() => dismissDraft("slide3.conceptParagraph")}
          />
          <ScalarSlotRow
            label="Why This Property?"
            description='Paragraph under "Why This Property?". The market thesis: location dynamics, demand drivers, competitive gap, timing.'
            slot={form.marketRationale}
            max={SLIDE3_MARKET_RATIONALE_MAX}
            multiline
            onChange={(t, s) => setScalarSlot("marketRationale", t, s)}
            onDraft={() => draft("slide3.marketRationale")}
            isDrafting={draftingSlot === "slide3.marketRationale" && draftMutation.isPending}
            readinessKey="slide3.marketRationale"
            readinessReport={report}
            propertyUpdatedAt={propertyUpdatedAt}
            pendingSuggestion={pendingDrafts["slide3.marketRationale"]?.text ?? null}
            onAcceptDraft={() => acceptDraft("slide3.marketRationale")}
            onDismissDraft={() => dismissDraft("slide3.marketRationale")}
          />
        </div>

        <Separator />

        {/* Reasons */}
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Investment reasons ({SLIDE3_REASONS_COUNT} required)
              </h3>
              <ReadinessBadge status={reasonsStatus} />
            </div>
            {!pendingDrafts["slide3.reasons"] && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => draft("slide3.reasons")}
                disabled={draftingSlot === "slide3.reasons" && draftMutation.isPending}
                className="gap-1.5"
              >
                {draftingSlot === "slide3.reasons" && draftMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <IconRefreshCw className="h-3.5 w-3.5" />}
                Re-draft all 3
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            Three bold-label + detail pairs rendered as stacked rows. If any reason changes, all three
            are saved together.
          </p>
          {form.reasons.map((pair, i) => (
            <div key={i} className="space-y-3 rounded-md border border-border/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason {i + 1}</p>
              <PlainSlotRow
                label="Label"
                description="Bold short label — e.g. 'Underserved demand corridor' or 'Operational upside'."
                slot={pair.label}
                max={SLIDE3_REASON_LABEL_MAX}
                onChange={(t, s) => setReasonSlot(i, "label", t, s)}
                propertyUpdatedAt={propertyUpdatedAt}
              />
              <PlainSlotRow
                label="Detail"
                description="Supporting detail sentence for this reason."
                slot={pair.detail}
                max={SLIDE3_REASON_DETAIL_MAX}
                multiline
                onChange={(t, s) => setReasonSlot(i, "detail", t, s)}
                propertyUpdatedAt={propertyUpdatedAt}
              />
            </div>
          ))}
          {pendingDrafts["slide3.reasons"] && (
            <div className="rounded-md border border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-800 dark:text-sky-300 uppercase tracking-wide">
                  Analyst suggestion — {SLIDE3_REASONS_COUNT} reasons
                </span>
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="sm" variant="ghost" onClick={() => dismissDraft("slide3.reasons")} className="h-7 text-xs gap-1">
                    <IconX className="h-3 w-3" />
                    Dismiss
                  </Button>
                  <Button type="button" size="sm" onClick={() => acceptDraft("slide3.reasons")} className="h-7 text-xs gap-1">
                    <IconCheck className="h-3 w-3" />
                    Accept all
                  </Button>
                </div>
              </div>
              {pendingDrafts["slide3.reasons"].reasons!.map((r, i) => {
                const currentLabel = form.reasons[i]?.label.text ?? "";
                const currentDetail = form.reasons[i]?.detail.text ?? "";
                const labelChanged = currentLabel.trim() !== (r.label ?? "").trim();
                const detailChanged = currentDetail.trim() !== (r.detail ?? "").trim();
                return (
                  <div key={i} className="space-y-1 rounded border border-border/40 p-2">
                    <span className="text-xs font-medium text-muted-foreground">Reason {i + 1}</span>
                    {currentLabel.trim().length > 0 && labelChanged && (
                      <div className="text-xs text-muted-foreground line-through rounded px-2 py-1 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
                        <strong>Label:</strong> {currentLabel}
                      </div>
                    )}
                    <div className={`text-sm rounded px-2 py-1 ${labelChanged ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50" : "bg-muted border border-border"}`}>
                      <strong>Label:</strong> {r.label}
                    </div>
                    {currentDetail.trim().length > 0 && detailChanged && (
                      <div className="text-xs text-muted-foreground line-through rounded px-2 py-1 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
                        <strong>Detail:</strong> {currentDetail}
                      </div>
                    )}
                    <div className={`text-sm rounded px-2 py-1 ${detailChanged ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50" : "bg-muted border border-border"}`}>
                      <strong>Detail:</strong> {r.detail}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator />

        {/* Closing */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Closing</h3>
          <ScalarSlotRow
            label="Closing pull quote"
            description="Italic sentence in the green accent block at the bottom. Sets the tonal close for the Investment Model slide."
            slot={form.closingLine}
            max={SLIDE3_CLOSING_LINE_MAX}
            multiline
            onChange={(t, s) => setScalarSlot("closingLine", t, s)}
            onDraft={() => draft("slide3.closingLine")}
            isDrafting={draftingSlot === "slide3.closingLine" && draftMutation.isPending}
            readinessKey="slide3.closingLine"
            readinessReport={report}
            propertyUpdatedAt={propertyUpdatedAt}
            pendingSuggestion={pendingDrafts["slide3.closingLine"]?.text ?? null}
            onAcceptDraft={() => acceptDraft("slide3.closingLine")}
            onDismissDraft={() => dismissDraft("slide3.closingLine")}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {hasDirty ? "Unsaved changes." : "No unsaved changes."}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => data && setForm(hydrateForm(data.payload))}
              disabled={!hasDirty || patchMutation.isPending}
            >
              Discard changes
            </Button>
            <Button
              type="button"
              onClick={() => { if (patchBody) patchMutation.mutate(patchBody); }}
              disabled={!hasDirty || patchMutation.isPending}
              className="gap-1.5"
            >
              {patchMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Slide 3
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
