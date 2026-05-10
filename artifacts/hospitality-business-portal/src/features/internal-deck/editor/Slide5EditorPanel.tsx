/**
 * Slide5EditorPanel.tsx
 *
 * Admin authoring surface for Slide 5 of the L+B canonical investor deck
 * (Financial Snapshot / Transformation Plan).
 *
 * Authored slots (all LLM-draft + human-approved):
 *   - transformationDescription  — intro paragraph above the comparison table
 *   - transformationRows[0..3]   — up to 4 feature/existing/proposed rows
 *
 * Deterministic (NOT editable here):
 *   - All financial KPIs (RevPAR, ADR, Occupancy, NOI, etc.), financing summary,
 *     the "Snapshot of Stable Year" section
 *
 * Wire format: lib/shared/src/deck-payload-v2.ts (slide5PayloadSchema).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertCircle, IconRefreshCw, IconCheck, IconX } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DECK_PAYLOAD_SCHEMA_VERSION,
  SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
  type DeckPayloadV2,
  type Slide5Payload,
  type AuthoredString,
  type SlotProvenance,
} from "@shared/deck-payload-v2";
import {
  type FormSlot,
  type DeckPayloadResponse,
  hydrateSlot,
  stampSlot,
  emptySlot,
  SlotRow,
  ReadinessBadge,
  useReadinessQuery,
  isDraftStale,
  StaleDraftBanner,
} from "./editor-shared";

// ── Types ──────────────────────────────────────────────────────────────────

interface FormRow {
  feature: FormSlot;
  existing: FormSlot;
  proposed: FormSlot;
}

interface Form {
  transformationDescription: FormSlot;
  transformationRows: FormRow[];
}

type DraftSlotKey5 =
  | "slide5.transformationDescription"
  | "slide5.transformationRows"
  | "slide5.transformationRows[0]"
  | "slide5.transformationRows[1]"
  | "slide5.transformationRows[2]"
  | "slide5.transformationRows[3]";

interface DraftResult {
  slot: string;
  suggestion: {
    text?: string;
    rows?: { feature: string; existing: string; proposed: string }[];
    feature?: string;
    existing?: string;
    proposed?: string;
  };
  model: string;
  generatedAt: string;
}

// ── Hydration helpers ──────────────────────────────────────────────────────

function hydrateForm(payload: DeckPayloadV2): Form {
  const s5: Slide5Payload = payload.slide5 ?? {};
  const serverRows = s5.transformationRows ?? [];
  return {
    transformationDescription: hydrateSlot(s5.transformationDescription),
    transformationRows: Array.from({ length: SLIDE5_TRANSFORMATION_ROWS_COUNT }, (_, i) => ({
      feature: hydrateSlot(serverRows[i]?.feature),
      existing: hydrateSlot(serverRows[i]?.existing),
      proposed: hydrateSlot(serverRows[i]?.proposed),
    })),
  };
}

function buildPatchBody(form: Form): { slide5?: Partial<Slide5Payload> } | null {
  const now = new Date().toISOString();
  const slide5: Partial<Slide5Payload> = {};
  const stamp = (slot: FormSlot): AuthoredString => stampSlot(slot, now);

  if (form.transformationDescription.dirty) {
    slide5.transformationDescription = stamp(form.transformationDescription);
  }

  const anyRowDirty = form.transformationRows.some(r => r.feature.dirty || r.existing.dirty || r.proposed.dirty);
  if (anyRowDirty) {
    slide5.transformationRows = form.transformationRows
      .filter(r => r.feature.text.trim().length > 0)
      .map(r => ({
        feature: stamp(r.feature),
        existing: stamp(r.existing),
        proposed: stamp(r.proposed),
      }));
  }

  if (Object.keys(slide5).length === 0) return null;
  return { slide5 };
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function Slide5EditorPanel({ propertyId }: { propertyId: number }) {
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
    mutationFn: async (body: { slide5?: Partial<Slide5Payload> }) => {
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
      toast({ title: "Slide 5 saved", description: "Editor copy persisted to the deck payload sidecar." });
    },
    onError: (err: unknown) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const [draftingSlot, setDraftingSlot] = useState<DraftSlotKey5 | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, {
    text?: string;
    rows?: { feature: string; existing: string; proposed: string }[];
    feature?: string;
    existing?: string;
    proposed?: string;
    generatedAt: string;
  }>>({});

  const draftMutation = useMutation({
    mutationFn: async (slot: DraftSlotKey5) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/properties/${propertyId}/deck-payload/draft-slot`,
        { slot },
      );
      return r.json() as Promise<DraftResult>;
    },
    onSuccess: (result) => {
      if (result.slot === "slide5.transformationDescription" && result.suggestion?.text != null) {
        setPendingDrafts(prev => ({
          ...prev,
          "slide5.transformationDescription": { text: result.suggestion.text!, generatedAt: result.generatedAt },
        }));
      }
      if (result.slot === "slide5.transformationRows" && result.suggestion.rows) {
        setPendingDrafts(prev => ({
          ...prev,
          "slide5.transformationRows": { rows: result.suggestion.rows!, generatedAt: result.generatedAt },
        }));
      }
      const perRowMatch = /^slide5\.transformationRows\[(\d)\]$/.exec(result.slot);
      if (perRowMatch) {
        setPendingDrafts(prev => ({
          ...prev,
          [result.slot]: {
            feature: result.suggestion.feature,
            existing: result.suggestion.existing,
            proposed: result.suggestion.proposed,
            generatedAt: result.generatedAt,
          },
        }));
      }
      toast({
        title: "Analyst suggestion ready",
        description: "Review the proposal below the field — accept or dismiss it.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Draft failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
    onSettled: () => setDraftingSlot(null),
  });

  const [draftingAllRows, setDraftingAllRows] = useState(false);

  function fireDraft(slot: DraftSlotKey5) {
    setDraftingSlot(slot);
    draftMutation.mutate(slot);
  }

  function isRowUserApproved(row: FormRow): boolean {
    return row.feature.source === "user" || row.existing.source === "user" || row.proposed.source === "user";
  }

  async function fireDraftAllRows() {
    if (!form) return;
    const rowsToDraft: number[] = [];
    for (let i = 0; i < form.transformationRows.length; i++) {
      if (!isRowUserApproved(form.transformationRows[i])) {
        rowsToDraft.push(i);
      }
    }
    if (rowsToDraft.length === 0) return;

    setDraftingAllRows(true);
    try {
      const results = await Promise.all(
        rowsToDraft.map(async (idx) => {
          const slot = `slide5.transformationRows[${idx}]` as DraftSlotKey5;
          const r = await apiRequest(
            "POST",
            `/api/admin/properties/${propertyId}/deck-payload/draft-slot`,
            { slot },
          );
          return r.json() as Promise<DraftResult>;
        }),
      );
      setForm((prev) => {
        if (!prev) return prev;
        const rows = [...prev.transformationRows];
        for (const result of results) {
          const m = /^slide5\.transformationRows\[(\d)\]$/.exec(result.slot);
          if (!m) continue;
          const idx = parseInt(m[1], 10);
          const makeSlot = (text: string): FormSlot => ({ text, source: "llm", dirty: true, serverProvenance: null, llmGeneratedAt: result.generatedAt });
          rows[idx] = {
            feature: makeSlot(result.suggestion.feature ?? ""),
            existing: makeSlot(result.suggestion.existing ?? ""),
            proposed: makeSlot(result.suggestion.proposed ?? ""),
          };
        }
        return { ...prev, transformationRows: rows };
      });
      const skipped = form.transformationRows.length - rowsToDraft.length;
      toast({
        title: `Drafted ${results.length} row${results.length === 1 ? "" : "s"}`,
        description: skipped > 0
          ? `${skipped} user-edited row${skipped === 1 ? "" : "s"} preserved. Review the proposals, then save.`
          : "Review the proposals in the editor, then save to persist.",
      });
    } catch (err: unknown) {
      toast({
        title: "Draft failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setDraftingAllRows(false);
    }
  }

  function setDescriptionSlot(text: string, source: SlotProvenance["source"]) {
    setForm((prev) =>
      prev ? { ...prev, transformationDescription: { ...prev.transformationDescription, text, source, dirty: true } } : prev,
    );
  }

  function setRowSlot(
    rowIdx: number,
    field: "feature" | "existing" | "proposed",
    text: string,
    source: SlotProvenance["source"],
  ) {
    setForm((prev) => {
      if (!prev) return prev;
      const rows = [...prev.transformationRows];
      rows[rowIdx] = { ...rows[rowIdx], [field]: { ...rows[rowIdx][field], text, source, dirty: true } };
      return { ...prev, transformationRows: rows };
    });
  }

  function acceptDraft(slotKey: string, editedText?: string) {
    const pending = pendingDrafts[slotKey];
    if (!pending) return;
    if (slotKey === "slide5.transformationDescription") {
      const text = editedText ?? pending.text ?? "";
      setForm(prev => prev ? {
        ...prev,
        transformationDescription: { ...prev.transformationDescription, text, source: "llm", dirty: true, llmGeneratedAt: pending.generatedAt },
      } : prev);
    }
    if (slotKey === "slide5.transformationRows" && pending.rows) {
      setForm(prev => {
        if (!prev) return prev;
        const drafted = pending.rows!;
        const transformationRows = Array.from({ length: SLIDE5_TRANSFORMATION_ROWS_COUNT }, (_, i) => {
          const r = drafted[i];
          if (!r) return { feature: emptySlot(), existing: emptySlot(), proposed: emptySlot() };
          const makeSlot = (text: string): FormSlot => ({ text, source: "llm", dirty: true, serverProvenance: null, llmGeneratedAt: pending.generatedAt });
          return { feature: makeSlot(r.feature), existing: makeSlot(r.existing), proposed: makeSlot(r.proposed) };
        });
        return { ...prev, transformationRows };
      });
    }
    const perRowMatch = /^slide5\.transformationRows\[(\d)\]$/.exec(slotKey);
    if (perRowMatch) {
      const rowIdx = parseInt(perRowMatch[1], 10);
      const makeSlot = (text: string): FormSlot => ({ text, source: "llm", dirty: true, serverProvenance: null, llmGeneratedAt: pending.generatedAt });
      setForm(prev => {
        if (!prev) return prev;
        const rows = [...prev.transformationRows];
        rows[rowIdx] = {
          feature: makeSlot(pending.feature ?? ""),
          existing: makeSlot(pending.existing ?? ""),
          proposed: makeSlot(pending.proposed ?? ""),
        };
        return { ...prev, transformationRows: rows };
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
        <Loader2 className="h-5 w-5 animate-spin text-accent-pop" />
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
  const rowsStatus = report?.["slide5.transformationRows"] as "complete" | "stale" | "missing" | undefined;

  const allSlots: FormSlot[] = [
    form.transformationDescription,
    ...form.transformationRows.flatMap(r => [r.feature, r.existing, r.proposed]),
  ];
  const staleCount = allSlots.filter(s => isDraftStale(s, propertyUpdatedAt)).length;

  return (
    <Card data-stale-panel="" className="border border-border/60">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Slide 5 — Editor copy</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Author the Transformation Plan section — an intro paragraph and up to{" "}
              {SLIDE5_TRANSFORMATION_ROWS_COUNT} feature comparison rows. Financial snapshot and
              financing summary on the right are deterministic from the engine.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.updatedAt ? `Last saved ${new Date(data.updatedAt).toLocaleString()}` : "Never saved"}
          </div>
        </div>

        <StaleDraftBanner staleCount={staleCount} />

        <Separator />

        {/* Transformation description */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Introduction</h3>
          <SlotRow
            label="Transformation description"
            description="Paragraph above the comparison table. Describe the before-after narrative — what the asset is today and what it will become."
            bucket="llm-draft+approved"
            slot={form.transformationDescription}
            max={SLIDE5_TRANSFORMATION_DESCRIPTION_MAX}
            multiline
            onChange={setDescriptionSlot}
            onDraft={() => fireDraft("slide5.transformationDescription")}
            isDrafting={draftingSlot === "slide5.transformationDescription" && draftMutation.isPending}
            readinessStatus={report?.["slide5.transformationDescription"] as "complete" | "stale" | "missing" | undefined}
            propertyUpdatedAt={propertyUpdatedAt}
            pendingSuggestion={pendingDrafts["slide5.transformationDescription"]?.text ?? null}
            onAcceptDraft={(editedText) => acceptDraft("slide5.transformationDescription", editedText)}
            onDismissDraft={() => dismissDraft("slide5.transformationDescription")}
          />
        </div>

        <Separator />

        {/* Transformation rows */}
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Comparison rows (up to {SLIDE5_TRANSFORMATION_ROWS_COUNT})
              </h3>
              <ReadinessBadge status={rowsStatus} />
            </div>
            {(() => {
              const userApprovedCount = form.transformationRows.filter(isRowUserApproved).length;
              const draftableCount = SLIDE5_TRANSFORMATION_ROWS_COUNT - userApprovedCount;
              const allApproved = draftableCount === 0;
              const isDrafting = draftingAllRows || (draftingSlot === "slide5.transformationRows" && draftMutation.isPending);
              const hasPendingBulk = !!pendingDrafts["slide5.transformationRows"];
              return (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={fireDraftAllRows}
                  disabled={isDrafting || allApproved || hasPendingBulk}
                  className="gap-1.5"
                  title={allApproved ? "All rows have been user-edited — nothing to draft" : undefined}
                >
                  {isDrafting
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <IconRefreshCw className="h-3.5 w-3.5" />}
                  {allApproved
                    ? "All rows user-edited"
                    : userApprovedCount > 0
                      ? `Draft ${draftableCount} row${draftableCount === 1 ? "" : "s"} via Analyst`
                      : "Draft all rows via Analyst"}
                  {userApprovedCount > 0 && !allApproved && (
                    <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0 h-4 text-emerald-700 border-emerald-300 bg-emerald-50">
                      {userApprovedCount} preserved
                    </Badge>
                  )}
                </Button>
              );
            })()}
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            Three columns: Feature, Existing, Proposed. Leave Feature blank to omit a row.
            If any row changes, all rows are saved together.
          </p>
          {form.transformationRows.map((row, i) => {
            const rowSlotKey = `slide5.transformationRows[${i}]` as DraftSlotKey5;
            const thisRowDrafting = draftingSlot === rowSlotKey && draftMutation.isPending;
            const anyDrafting = draftMutation.isPending || draftingAllRows;
            const rowPending = pendingDrafts[rowSlotKey];
            const onRowDraft = rowPending ? undefined : () => fireDraft(rowSlotKey);
            const rowIsUserApproved = isRowUserApproved(row);
            return (
              <div key={i} className={`space-y-3 rounded-md border p-4 ${rowIsUserApproved ? "border-emerald-200 dark:border-emerald-800" : "border-border/40"}`}>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Row {i + 1}</p>
                  {rowIsUserApproved && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:bg-emerald-950/40">
                      User-edited
                    </Badge>
                  )}
                </div>
                <SlotRow
                  label="Feature"
                  description="What aspect of the property is being transformed (e.g. 'Guest Capacity')."
                  bucket="llm-draft+approved"
                  slot={row.feature}
                  max={SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX}
                  onChange={(t, s) => setRowSlot(i, "feature", t, s)}
                  onDraft={onRowDraft}
                  isDrafting={thisRowDrafting}
                  draftDisabled={anyDrafting}
                  draftLabel="Draft via Analyst"
                  propertyUpdatedAt={propertyUpdatedAt}
                />
                <div className="grid grid-cols-2 gap-3">
                  <SlotRow
                    label="Existing"
                    description="Current state."
                    bucket="llm-draft+approved"
                    slot={row.existing}
                    max={SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX}
                    onChange={(t, s) => setRowSlot(i, "existing", t, s)}
                    onDraft={onRowDraft}
                    isDrafting={thisRowDrafting}
                    draftDisabled={anyDrafting}
                    draftLabel="Draft via Analyst"
                    propertyUpdatedAt={propertyUpdatedAt}
                  />
                  <SlotRow
                    label="Proposed"
                    description="Target state after transformation."
                    bucket="llm-draft+approved"
                    slot={row.proposed}
                    max={SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX}
                    onChange={(t, s) => setRowSlot(i, "proposed", t, s)}
                    onDraft={onRowDraft}
                    isDrafting={thisRowDrafting}
                    draftDisabled={anyDrafting}
                    draftLabel="Draft via Analyst"
                    propertyUpdatedAt={propertyUpdatedAt}
                  />
                </div>
                {thisRowDrafting && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-accent-pop" />
                    Drafting row {i + 1}…
                  </p>
                )}
                {rowPending && (
                  <div className="rounded-md border border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-sky-800 dark:text-sky-300 uppercase tracking-wide">
                        Analyst suggestion — Row {i + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button type="button" size="sm" variant="ghost" onClick={() => dismissDraft(rowSlotKey)} className="h-7 text-xs gap-1">
                          <IconX className="h-3 w-3" />
                          Dismiss
                        </Button>
                        <Button type="button" size="sm" onClick={() => acceptDraft(rowSlotKey)} className="h-7 text-xs gap-1">
                          <IconCheck className="h-3 w-3" />
                          Accept
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Feature", current: row.feature.text, suggested: rowPending.feature ?? "" },
                        { label: "Existing", current: row.existing.text, suggested: rowPending.existing ?? "" },
                        { label: "Proposed", current: row.proposed.text, suggested: rowPending.proposed ?? "" },
                      ].map(col => {
                        const changed = col.current.trim() !== col.suggested.trim();
                        return (
                          <div key={col.label} className="space-y-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">{col.label}</span>
                            {col.current.trim().length > 0 && changed && (
                              <div className="text-[11px] text-muted-foreground line-through rounded px-1.5 py-0.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 whitespace-pre-wrap">
                                {col.current}
                              </div>
                            )}
                            <div className={`text-xs rounded px-1.5 py-0.5 whitespace-pre-wrap ${
                              changed
                                ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50"
                                : "bg-muted border border-border"
                            }`}>
                              {col.suggested}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {pendingDrafts["slide5.transformationRows"] && (
            <div className="rounded-md border border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-800 dark:text-sky-300 uppercase tracking-wide">
                  Analyst suggestion — {SLIDE5_TRANSFORMATION_ROWS_COUNT} rows
                </span>
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="sm" variant="ghost" onClick={() => dismissDraft("slide5.transformationRows")} className="h-7 text-xs gap-1">
                    <IconX className="h-3 w-3" />
                    Dismiss
                  </Button>
                  <Button type="button" size="sm" onClick={() => acceptDraft("slide5.transformationRows")} className="h-7 text-xs gap-1">
                    <IconCheck className="h-3 w-3" />
                    Accept all
                  </Button>
                </div>
              </div>
              {pendingDrafts["slide5.transformationRows"].rows!.map((r, i) => {
                const currentRow = form.transformationRows[i];
                const featureChanged = (currentRow?.feature.text ?? "").trim() !== r.feature.trim();
                const existingChanged = (currentRow?.existing.text ?? "").trim() !== r.existing.trim();
                const proposedChanged = (currentRow?.proposed.text ?? "").trim() !== r.proposed.trim();
                return (
                  <div key={i} className="space-y-1 rounded border border-border/40 p-2">
                    <span className="text-xs font-medium text-muted-foreground">Row {i + 1}</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Feature", current: currentRow?.feature.text ?? "", suggested: r.feature, changed: featureChanged },
                        { label: "Existing", current: currentRow?.existing.text ?? "", suggested: r.existing, changed: existingChanged },
                        { label: "Proposed", current: currentRow?.proposed.text ?? "", suggested: r.proposed, changed: proposedChanged },
                      ].map(col => (
                        <div key={col.label} className="space-y-0.5">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">{col.label}</span>
                          {col.current.trim().length > 0 && col.changed && (
                            <div className="text-[11px] text-muted-foreground line-through rounded px-1.5 py-0.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 whitespace-pre-wrap">
                              {col.current}
                            </div>
                          )}
                          <div className={`text-xs rounded px-1.5 py-0.5 whitespace-pre-wrap ${
                            col.changed
                              ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50"
                              : "bg-muted border border-border"
                          }`}>
                            {col.suggested}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => { if (patchBody) patchMutation.mutate(patchBody); }}
              disabled={!hasDirty || patchMutation.isPending}
              className="gap-1.5"
            >
              {patchMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Slide 5
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
