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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface Form {
  operationalModelText: FormSlot;
  revenueBullet: FormSlot;
  programmingBullet: FormSlot;
}

// ── Hydration helpers ──────────────────────────────────────────────────────

function emptySlot(): FormSlot {
  return { text: "", source: "user", dirty: false, serverProvenance: null };
}

function hydrateSlot(authored: AuthoredString | undefined): FormSlot {
  if (!authored) return emptySlot();
  return { text: authored.text, source: authored.provenance.source, dirty: false, serverProvenance: authored.provenance };
}

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
  const stamp = (slot: FormSlot): AuthoredString => ({
    text: slot.text,
    provenance: { source: slot.source, updatedAt: now },
  });
  if (form.operationalModelText.dirty) slide2.operationalModelText = stamp(form.operationalModelText);
  if (form.revenueBullet.dirty) slide2.revenueBullet = stamp(form.revenueBullet);
  if (form.programmingBullet.dirty) slide2.programmingBullet = stamp(form.programmingBullet);
  if (Object.keys(slide2).length === 0) return null;
  return { slide2 };
}

// ── Small UI atoms ─────────────────────────────────────────────────────────

function ProvenancePill({ source, dirty }: { source: SlotProvenance["source"] | null; dirty: boolean }) {
  if (dirty) return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Unsaved</Badge>;
  if (!source) return <Badge variant="outline" className="text-muted-foreground">Empty — falls back to template</Badge>;
  if (source === "user") return <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">User</Badge>;
  return <Badge variant="outline" className="text-sky-700 border-sky-300 bg-sky-50">Analyst draft (approved)</Badge>;
}

function CharCounter({ length, max }: { length: number; max: number }) {
  const over = length > max;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>
      {length}/{max}
    </span>
  );
}

function SlotRow({
  label, description, slot, max, multiline, onChange,
}: {
  label: string;
  description: string;
  slot: FormSlot;
  max: number;
  multiline?: boolean;
  onChange: (text: string, source: SlotProvenance["source"]) => void;
}) {
  const id = `slide2-slot-${label.toLowerCase().replace(/\s+/g, "-")}`;
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
    </div>
  );
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
      toast({ title: "Slide 2 saved", description: "Editor copy persisted to the deck payload sidecar." });
    },
    onError: (err: unknown) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  function setSlot<K extends "operationalModelText" | "revenueBullet" | "programmingBullet">(
    key: K, text: string, source: SlotProvenance["source"],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: { ...prev[key], text, source, dirty: true } } : prev));
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
  const dirtyCount = patchBody?.slide2 ? Object.keys(patchBody.slide2).length : 0;

  return (
    <Card className="border border-border/60">
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

        <Separator />

        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Narrative</h3>
          <SlotRow
            label="Operational model"
            description='Appears as "Operational Model: {text}" in italic serif. Describe the operating concept in one phrase — e.g. "Owner-managed boutique with an F&B anchor".'
            slot={form.operationalModelText}
            max={SLIDE2_OPERATIONAL_MODEL_MAX}
            onChange={(t, s) => setSlot("operationalModelText", t, s)}
          />
          <SlotRow
            label="Revenue bullet"
            description="Revenue / rate strategy. How does this property generate its top-line — ADR positioning, channel mix, seasonality approach?"
            slot={form.revenueBullet}
            max={SLIDE2_REVENUE_BULLET_MAX}
            multiline
            onChange={(t, s) => setSlot("revenueBullet", t, s)}
          />
          <SlotRow
            label="Programming bullet"
            description="Programming / amenity strategy. What guest experiences, events, or F&B concepts differentiate this property?"
            slot={form.programmingBullet}
            max={SLIDE2_PROGRAMMING_BULLET_MAX}
            multiline
            onChange={(t, s) => setSlot("programmingBullet", t, s)}
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
              Discard changes
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
