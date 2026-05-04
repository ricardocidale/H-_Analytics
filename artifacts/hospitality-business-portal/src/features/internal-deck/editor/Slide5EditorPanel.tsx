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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertCircle, IconRefreshCw } from "@/components/icons";
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

// ── Types ──────────────────────────────────────────────────────────────────

interface DeckPayloadResponse {
  propertyId: number;
  payload: DeckPayloadV2;
  updatedBy: number | null;
  updatedAt: string | null;
}

interface FormSlot {
  text: string;
  source: SlotProvenance["source"];
  dirty: boolean;
  serverProvenance: SlotProvenance | null;
}

interface FormRow {
  feature: FormSlot;
  existing: FormSlot;
  proposed: FormSlot;
}

interface Form {
  transformationDescription: FormSlot;
  transformationRows: FormRow[];
}

type Slide5DraftSlot = "slide5.transformationDescription" | "slide5.transformationRows";

// ── Hydration helpers ──────────────────────────────────────────────────────

function emptySlot(): FormSlot {
  return { text: "", source: "user", dirty: false, serverProvenance: null };
}

function hydrateSlot(authored: AuthoredString | undefined): FormSlot {
  if (!authored) return emptySlot();
  return { text: authored.text, source: authored.provenance.source, dirty: false, serverProvenance: authored.provenance };
}

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
  const stamp = (slot: FormSlot): AuthoredString => ({
    text: slot.text,
    provenance: { source: slot.source, updatedAt: now },
  });

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

// ── Small UI atoms ─────────────────────────────────────────────────────────

function ProvenancePill({ source, dirty }: { source: SlotProvenance["source"] | null; dirty: boolean }) {
  if (dirty) return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Unsaved</Badge>;
  if (!source) return <Badge variant="outline" className="text-muted-foreground">Empty — falls back to template</Badge>;
  if (source === "user") return <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">User</Badge>;
  return <Badge variant="outline" className="text-sky-700 border-sky-300 bg-sky-50">Analyst draft (approved)</Badge>;
}

function CharCounter({ length, max }: { length: number; max: number }) {
  return (
    <span className={`text-xs tabular-nums ${length > max ? "text-destructive" : "text-muted-foreground"}`}>
      {length}/{max}
    </span>
  );
}

function SlotRow({
  label, description, slot, max, multiline, onChange, onDraft, isDrafting,
}: {
  label: string;
  description: string;
  slot: FormSlot;
  max: number;
  multiline?: boolean;
  onChange: (text: string, source: SlotProvenance["source"]) => void;
  onDraft?: () => void;
  isDrafting?: boolean;
}) {
  const id = `slide5-slot-${label.toLowerCase().replace(/\s+/g, "-")}`;
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
      {onDraft && (
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
      toast({ title: "Slide 5 saved", description: "Editor copy persisted to the deck payload sidecar." });
    },
    onError: (err: unknown) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const [draftingSlot, setDraftingSlot] = useState<Slide5DraftSlot | null>(null);
  const draftMutation = useMutation({
    mutationFn: async (slot: Slide5DraftSlot) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/properties/${propertyId}/deck-payload/draft-slot`,
        { slot },
      );
      return r.json() as Promise<{
        slot: string;
        suggestion: {
          text?: string;
          rows?: { feature: string; existing: string; proposed: string }[];
        };
        model: string;
        generatedAt: string;
      }>;
    },
    onSuccess: (result) => {
      setForm(prev => {
        if (!prev) return prev;
        const s = result.slot as Slide5DraftSlot;

        if (s === "slide5.transformationDescription" && result.suggestion.text != null) {
          return {
            ...prev,
            transformationDescription: {
              ...prev.transformationDescription,
              text: result.suggestion.text,
              source: "llm" as const,
              dirty: true,
            },
          };
        }

        if (s === "slide5.transformationRows" && result.suggestion.rows) {
          const incoming = result.suggestion.rows;
          const transformationRows = prev.transformationRows.map((row, i) => {
            const r = incoming[i];
            if (!r) return row;
            return {
              feature:  { ...row.feature,  text: r.feature  ?? "", source: "llm" as const, dirty: true },
              existing: { ...row.existing, text: r.existing ?? "", source: "llm" as const, dirty: true },
              proposed: { ...row.proposed, text: r.proposed ?? "", source: "llm" as const, dirty: true },
            };
          });
          return { ...prev, transformationRows };
        }

        return prev;
      });
      toast({ title: "Analyst draft loaded", description: "Review the proposal, then save to persist it." });
    },
    onError: (err: unknown) => {
      toast({ title: "Draft failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
    onSettled: () => setDraftingSlot(null),
  });

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

  function draft(slot: Slide5DraftSlot) {
    setDraftingSlot(slot);
    draftMutation.mutate(slot);
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

  return (
    <Card className="border border-border/60">
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

        <Separator />

        {/* Transformation description */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Introduction</h3>
          <SlotRow
            label="Transformation description"
            description="Paragraph above the comparison table. Describe the before-after narrative — what the asset is today and what it will become."
            slot={form.transformationDescription}
            max={SLIDE5_TRANSFORMATION_DESCRIPTION_MAX}
            multiline
            onChange={setDescriptionSlot}
            onDraft={() => draft("slide5.transformationDescription")}
            isDrafting={draftingSlot === "slide5.transformationDescription" && draftMutation.isPending}
          />
        </div>

        <Separator />

        {/* Transformation rows */}
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Comparison rows (up to {SLIDE5_TRANSFORMATION_ROWS_COUNT})
            </h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => draft("slide5.transformationRows")}
              disabled={draftingSlot === "slide5.transformationRows" && draftMutation.isPending}
              className="gap-1.5"
            >
              {draftingSlot === "slide5.transformationRows" && draftMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <IconRefreshCw className="h-3.5 w-3.5" />}
              Draft all rows
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            Three columns: Feature, Existing, Proposed. Leave Feature blank to omit a row.
            If any row changes, all rows are saved together.
          </p>
          {form.transformationRows.map((row, i) => (
            <div key={i} className="space-y-3 rounded-md border border-border/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Row {i + 1}</p>
              <SlotRow
                label="Feature"
                description="What aspect of the property is being transformed (e.g. 'Guest Capacity')."
                slot={row.feature}
                max={SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX}
                onChange={(t, s) => setRowSlot(i, "feature", t, s)}
              />
              <div className="grid grid-cols-2 gap-3">
                <SlotRow
                  label="Existing"
                  description="Current state."
                  slot={row.existing}
                  max={SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX}
                  onChange={(t, s) => setRowSlot(i, "existing", t, s)}
                />
                <SlotRow
                  label="Proposed"
                  description="Target state after transformation."
                  slot={row.proposed}
                  max={SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX}
                  onChange={(t, s) => setRowSlot(i, "proposed", t, s)}
                />
              </div>
            </div>
          ))}
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
