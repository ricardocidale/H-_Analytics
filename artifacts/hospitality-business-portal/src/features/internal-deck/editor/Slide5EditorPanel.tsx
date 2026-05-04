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
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertCircle, IconRefreshCw } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  ProvenancePill,
  CharCounter,
  ReadinessBadge,
  useReadinessQuery,
  isDraftStale,
  StaleDraftNotice,
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

// ── Scalar slot row (description field with Draft button) ──────────────────

function ScalarSlotRow({
  label, description, slot, max, multiline, onChange, onDraft, isDrafting, readinessKey, readinessReport, propertyUpdatedAt,
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
}) {
  const id = `slide5-slot-${label.toLowerCase().replace(/\s+/g, "-")}`;
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
        Draft via Analyst
      </Button>
    </div>
  );
}

// ── Plain slot row (row sub-fields: Feature / Existing / Proposed) ─────────
//
// onDraft is optional. When provided, a "Draft via Analyst" button is shown.
// Callers pass the per-row slot key (e.g. slide5.transformationRows[0]) so
// only that row is updated on success; sibling rows are left intact.

function PlainSlotRow({
  label, description, slot, max, onChange, onDraft, isDrafting, buttonDisabled, propertyUpdatedAt,
}: {
  label: string;
  description: string;
  slot: FormSlot;
  max: number;
  onChange: (text: string, source: SlotProvenance["source"]) => void;
  onDraft?: () => void;
  /** Controls the spinner icon — true only for the row currently being drafted. */
  isDrafting?: boolean;
  /** Controls button.disabled — may be wider than isDrafting (e.g. any draft in flight). */
  buttonDisabled?: boolean;
  propertyUpdatedAt?: string;
}) {
  const id = `slide5-slot-${label.toLowerCase().replace(/\s+/g, "-")}`;
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
      <Input
        id={id}
        value={slot.text}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value, "user")}
        maxLength={max}
        className={slot.text.length > max ? "border-destructive" : undefined}
      />
      {isDraftStale(slot, propertyUpdatedAt) && <StaleDraftNotice />}
      {onDraft !== undefined && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDraft}
          disabled={buttonDisabled ?? isDrafting}
          className="gap-1.5"
        >
          {isDrafting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <IconRefreshCw className="h-3.5 w-3.5" />}
          Draft via Analyst
        </Button>
      )}
    </div>
  );
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
      setForm((prev) => {
        if (!prev) return prev;
        if (result.slot === "slide5.transformationDescription") {
          const text = result.suggestion?.text ?? "";
          return {
            ...prev,
            transformationDescription: { ...prev.transformationDescription, text, source: "llm", dirty: true, llmGeneratedAt: result.generatedAt },
          };
        }
        if (result.slot === "slide5.transformationRows" && result.suggestion.rows) {
          const drafted = result.suggestion.rows;
          const transformationRows = Array.from({ length: SLIDE5_TRANSFORMATION_ROWS_COUNT }, (_, i) => {
            const r = drafted[i];
            if (!r) return { feature: emptySlot(), existing: emptySlot(), proposed: emptySlot() };
            const makeSlot = (text: string): FormSlot => ({ text, source: "llm", dirty: true, serverProvenance: null, llmGeneratedAt: result.generatedAt });
            return { feature: makeSlot(r.feature), existing: makeSlot(r.existing), proposed: makeSlot(r.proposed) };
          });
          return { ...prev, transformationRows };
        }
        // Per-row slot: update only the target row index, leaving all others intact.
        const perRowMatch = /^slide5\.transformationRows\[(\d)\]$/.exec(result.slot);
        if (perRowMatch) {
          const rowIdx = parseInt(perRowMatch[1], 10);
          const makeSlot = (text: string): FormSlot => ({ text, source: "llm", dirty: true, serverProvenance: null, llmGeneratedAt: result.generatedAt });
          const rows = [...prev.transformationRows];
          rows[rowIdx] = {
            feature: makeSlot(result.suggestion.feature ?? ""),
            existing: makeSlot(result.suggestion.existing ?? ""),
            proposed: makeSlot(result.suggestion.proposed ?? ""),
          };
          return { ...prev, transformationRows: rows };
        }
        return prev;
      });
      toast({
        title: "Analyst draft loaded",
        description: "Review the proposal in the editor, then save to persist it.",
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

  function fireDraft(slot: DraftSlotKey5) {
    setDraftingSlot(slot);
    draftMutation.mutate(slot);
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
          <ScalarSlotRow
            label="Transformation description"
            description="Paragraph above the comparison table. Describe the before-after narrative — what the asset is today and what it will become."
            slot={form.transformationDescription}
            max={SLIDE5_TRANSFORMATION_DESCRIPTION_MAX}
            multiline
            onChange={setDescriptionSlot}
            onDraft={() => fireDraft("slide5.transformationDescription")}
            isDrafting={draftingSlot === "slide5.transformationDescription" && draftMutation.isPending}
            readinessKey="slide5.transformationDescription"
            readinessReport={report}
            propertyUpdatedAt={propertyUpdatedAt}
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fireDraft("slide5.transformationRows")}
              disabled={draftingSlot === "slide5.transformationRows" && draftMutation.isPending}
              className="gap-1.5"
            >
              {draftingSlot === "slide5.transformationRows" && draftMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <IconRefreshCw className="h-3.5 w-3.5" />}
              Draft all rows via Analyst
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            Three columns: Feature, Existing, Proposed. Leave Feature blank to omit a row.
            If any row changes, all rows are saved together.
          </p>
          {form.transformationRows.map((row, i) => {
            // Per-row draft fires the per-row endpoint (slide5.transformationRows[i]),
            // updating only this row. The section-level "Draft all rows" button
            // remains available for drafting the whole table at once.
            const rowSlotKey = `slide5.transformationRows[${i}]` as DraftSlotKey5;
            const thisRowDrafting = draftingSlot === rowSlotKey && draftMutation.isPending;
            const anyDrafting = draftMutation.isPending;
            const onRowDraft = () => fireDraft(rowSlotKey);
            return (
              <div key={i} className="space-y-3 rounded-md border border-border/40 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Row {i + 1}</p>
                <PlainSlotRow
                  label="Feature"
                  description="What aspect of the property is being transformed (e.g. 'Guest Capacity')."
                  slot={row.feature}
                  max={SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX}
                  onChange={(t, s) => setRowSlot(i, "feature", t, s)}
                  onDraft={onRowDraft}
                  isDrafting={thisRowDrafting}
                  buttonDisabled={anyDrafting}
                  propertyUpdatedAt={propertyUpdatedAt}
                />
                <div className="grid grid-cols-2 gap-3">
                  <PlainSlotRow
                    label="Existing"
                    description="Current state."
                    slot={row.existing}
                    max={SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX}
                    onChange={(t, s) => setRowSlot(i, "existing", t, s)}
                    onDraft={onRowDraft}
                    isDrafting={thisRowDrafting}
                    buttonDisabled={anyDrafting}
                    propertyUpdatedAt={propertyUpdatedAt}
                  />
                  <PlainSlotRow
                    label="Proposed"
                    description="Target state after transformation."
                    slot={row.proposed}
                    max={SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX}
                    onChange={(t, s) => setRowSlot(i, "proposed", t, s)}
                    onDraft={onRowDraft}
                    isDrafting={thisRowDrafting}
                    buttonDisabled={anyDrafting}
                    propertyUpdatedAt={propertyUpdatedAt}
                  />
                </div>
                {thisRowDrafting && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Drafting row {i + 1}…
                  </p>
                )}
              </div>
            );
          })}
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
              Save Slide 5
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
