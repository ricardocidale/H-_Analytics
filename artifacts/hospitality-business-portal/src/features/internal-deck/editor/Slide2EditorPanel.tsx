/**
 * Slide2EditorPanel.tsx
 *
 * Admin authoring surface for Slide 2 of the L+B canonical investor deck
 * (Alt View / Photo Gallery).
 *
 * Authored slots (all LLM-draft + human-approved):
 *   - operationalModelText  — "Operational Model: …" italic serif line
 *   - revenueBullet         — revenue / rate strategy bullet
 *   - programmingBullet     — programming / amenity strategy bullet
 *
 * Deterministic (NOT editable here — comes from property record or financials):
 *   - Property name, city/state, all financial stats, photo grid
 *
 * Wire format: lib/shared/src/deck-payload-v2.ts (slide2PayloadSchema).
 * Endpoints: /api/admin/properties/:id/deck-payload (same as Slide 1).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertCircle } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DECK_PAYLOAD_SCHEMA_VERSION,
  SLIDE2_OPERATIONAL_MODEL_MAX,
  SLIDE2_REVENUE_BULLET_MAX,
  SLIDE2_PROGRAMMING_BULLET_MAX,
  type DeckPayloadV2,
  type Slide2Payload,
  type AuthoredString,
  type SlotProvenance,
} from "@shared/deck-payload-v2";
import {
  type FormSlot,
  type DeckPayloadResponse,
  hydrateSlot,
  stampSlot,
  SlotRow,
  useReadinessQuery,
  isDraftStale,
  StaleDraftBanner,
} from "./editor-shared";

// ── Types ──────────────────────────────────────────────────────────────────

interface Form {
  operationalModelText: FormSlot;
  revenueBullet: FormSlot;
  programmingBullet: FormSlot;
}

type DraftSlotKey2 =
  | "slide2.operationalModelText"
  | "slide2.revenueBullet"
  | "slide2.programmingBullet";

interface DraftResult {
  slot: string;
  suggestion: { text?: string };
  model: string;
  generatedAt: string;
}
// ── Hydration helpers ──────────────────────────────────────────────────────

function hydrateForm(payload: DeckPayloadV2): Form {
  const s2: Slide2Payload = payload.slide2 ?? {};
  return {
    operationalModelText: hydrateSlot(s2.operationalModelText),
    revenueBullet: hydrateSlot(s2.revenueBullet),
    programmingBullet: hydrateSlot(s2.programmingBullet),
  };
}

function buildPatchBody(form: Form): { slide2?: Partial<Slide2Payload> } | null {
  const now = new Date().toISOString();
  const slide2: Partial<Slide2Payload> = {};
  const stamp = (slot: FormSlot): AuthoredString => stampSlot(slot, now);
  if (form.operationalModelText.dirty) slide2.operationalModelText = stamp(form.operationalModelText);
  if (form.revenueBullet.dirty) slide2.revenueBullet = stamp(form.revenueBullet);
  if (form.programmingBullet.dirty) slide2.programmingBullet = stamp(form.programmingBullet);
  if (Object.keys(slide2).length === 0) return null;
  return { slide2 };
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function Slide2EditorPanel({ propertyId }: { propertyId: number }) {
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
    mutationFn: async (body: { slide2?: Partial<Slide2Payload> }) => {
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
      toast({ title: "Slide 2 saved", description: "Editor copy persisted to the deck payload sidecar." });
    },
    onError: (err: unknown) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const [draftingSlot, setDraftingSlot] = useState<DraftSlotKey2 | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, { text: string; generatedAt: string }>>({});

  const draftMutation = useMutation({
    mutationFn: async (slot: DraftSlotKey2) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/properties/${propertyId}/deck-payload/draft-slot`,
        { slot },
      );
      return r.json() as Promise<DraftResult>;
    },
    onSuccess: (result) => {
      const text = result.suggestion.text;
      if (text == null) return;
      setPendingDrafts(prev => ({
        ...prev,
        [result.slot]: { text, generatedAt: result.generatedAt },
      }));
      toast({ title: "Analyst suggestion ready", description: "Review the proposal below the field — accept or dismiss it." });
    },
    onError: (err: unknown) => {
      toast({ title: "Draft failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
    onSettled: () => setDraftingSlot(null),
  });

  function fireDraft(slot: DraftSlotKey2) {
    setDraftingSlot(slot);
    draftMutation.mutate(slot);
  }

  function setSlot<K extends keyof Form>(key: K, text: string, source: SlotProvenance["source"]) {
    setForm((prev) => (prev ? { ...prev, [key]: { ...prev[key], text, source, dirty: true } } : prev));
  }

  function acceptDraft(slotKey: DraftSlotKey2, editedText: string) {
    const pending = pendingDrafts[slotKey];
    if (!pending) return;
    const formKey = slotKey.replace("slide2.", "") as keyof Form;
    setForm(prev => prev ? { ...prev, [formKey]: { ...prev[formKey], text: editedText, source: "llm" as const, dirty: true, llmGeneratedAt: pending.generatedAt } } : prev);
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
  const dirtyCount = patchBody?.slide2 ? Object.keys(patchBody.slide2).length : 0;
  const report = readinessData?.report;
  const propertyUpdatedAt = readinessData?.propertyUpdatedAt;

  const allSlots: FormSlot[] = [
    form.operationalModelText,
    form.revenueBullet,
    form.programmingBullet,
  ];
  const staleCount = allSlots.filter(s => isDraftStale(s, propertyUpdatedAt)).length;

  return (
    <Card data-stale-panel="" className="border border-border/60">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Slide 2 — Editor copy</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Author the narrative slots for the Alt View / Photo Gallery slide.
              Financial stats, property name, city/state, and the photo grid are deterministic
              and not edited here.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.updatedAt ? `Last saved ${new Date(data.updatedAt).toLocaleString()}` : "Never saved"}
          </div>
        </div>

        <StaleDraftBanner staleCount={staleCount} />

        <Separator />

        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Narrative</h3>
          <SlotRow
            label="Operational model"
            description='Appears as "Operational Model: {text}" in italic serif. Describe the operating concept in one phrase — e.g. "Owner-managed boutique with an F&B anchor".'
            bucket="llm-draft+approved"
            slot={form.operationalModelText}
            max={SLIDE2_OPERATIONAL_MODEL_MAX}
            onChange={(t, s) => setSlot("operationalModelText", t, s)}
            onDraft={() => fireDraft("slide2.operationalModelText")}
            isDrafting={draftingSlot === "slide2.operationalModelText" && draftMutation.isPending}
            readinessStatus={report?.["slide2.operationalModelText"] as "complete" | "stale" | "missing" | undefined}
            propertyUpdatedAt={propertyUpdatedAt}
            pendingSuggestion={pendingDrafts["slide2.operationalModelText"]?.text ?? null}
            onAcceptDraft={(editedText) => acceptDraft("slide2.operationalModelText", editedText)}
            onDismissDraft={() => dismissDraft("slide2.operationalModelText")}
          />
          <SlotRow
            label="Revenue bullet"
            description="Revenue / rate strategy. How does this property generate its top-line — ADR positioning, channel mix, seasonality approach?"
            bucket="llm-draft+approved"
            slot={form.revenueBullet}
            max={SLIDE2_REVENUE_BULLET_MAX}
            multiline
            onChange={(t, s) => setSlot("revenueBullet", t, s)}
            onDraft={() => fireDraft("slide2.revenueBullet")}
            isDrafting={draftingSlot === "slide2.revenueBullet" && draftMutation.isPending}
            readinessStatus={report?.["slide2.revenueBullet"] as "complete" | "stale" | "missing" | undefined}
            propertyUpdatedAt={propertyUpdatedAt}
            pendingSuggestion={pendingDrafts["slide2.revenueBullet"]?.text ?? null}
            onAcceptDraft={(editedText) => acceptDraft("slide2.revenueBullet", editedText)}
            onDismissDraft={() => dismissDraft("slide2.revenueBullet")}
          />
          <SlotRow
            label="Programming bullet"
            description="Programming / amenity strategy. What guest experiences, events, or F&B concepts differentiate this property?"
            bucket="llm-draft+approved"
            slot={form.programmingBullet}
            max={SLIDE2_PROGRAMMING_BULLET_MAX}
            multiline
            onChange={(t, s) => setSlot("programmingBullet", t, s)}
            onDraft={() => fireDraft("slide2.programmingBullet")}
            isDrafting={draftingSlot === "slide2.programmingBullet" && draftMutation.isPending}
            readinessStatus={report?.["slide2.programmingBullet"] as "complete" | "stale" | "missing" | undefined}
            propertyUpdatedAt={propertyUpdatedAt}
            pendingSuggestion={pendingDrafts["slide2.programmingBullet"]?.text ?? null}
            onAcceptDraft={(editedText) => acceptDraft("slide2.programmingBullet", editedText)}
            onDismissDraft={() => dismissDraft("slide2.programmingBullet")}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {dirtyCount === 0 ? "No unsaved changes." : `${dirtyCount} unsaved field${dirtyCount === 1 ? "" : "s"}.`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => data && setForm(hydrateForm(data.payload))}
              disabled={dirtyCount === 0 || patchMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => { if (patchBody) patchMutation.mutate(patchBody); }}
              disabled={dirtyCount === 0 || patchMutation.isPending}
              className="gap-1.5"
            >
              {patchMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Slide 2
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
