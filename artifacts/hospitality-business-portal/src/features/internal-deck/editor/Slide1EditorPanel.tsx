/**
 * Slide1EditorPanel.tsx
 *
 * Admin authoring surface for Slide 1 of the L+B canonical investor deck.
 *
 * Design contract (architect 2026-05-03) — slot bucketization:
 *   - Deterministic (rendered direct from properties/finance):
 *       propertyName, headerTitle, askingPrice.headline, propertySpecs
 *   - Human-only (only a person knows the answer):
 *       propertySubtitle, photoCaptions, closingTagline
 *   - LLM-draft + human-approved (Analyst proposes, admin approves):
 *       headerSubtitle, visionBullets
 *
 * This panel exposes ONLY the slots that fall in the second and third
 * buckets above. Deterministic slots are not editable — they update via
 * the property record itself.
 *
 * Wire format: see lib/shared/src/deck-payload-v2.ts. Each slot persists
 * as `{ text, provenance: { source: "user" | "llm", updatedAt, model? } }`.
 *
 * Endpoints (all admin-only — see artifacts/api-server/src/routes/property-deck-payload.ts):
 *   GET   /api/admin/properties/:id/deck-payload
 *   PATCH /api/admin/properties/:id/deck-payload                — shallow per-slide merge
 *   POST  /api/admin/properties/:id/deck-payload/draft-slot     — LLM proposal, no persist
 *
 * Save model: single "Save Slide 1" button. Only dirty fields are sent.
 * On save, every changed slot is stamped with provenance.source = "user"
 * unless the draft popover marked it as "llm" (admin accepted an Analyst
 * proposal verbatim).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertCircle, IconRefreshCw, IconCheck, IconX } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DECK_PAYLOAD_SCHEMA_VERSION,
  SLIDE1_PROPERTY_SUBTITLE_MAX,
  SLIDE1_HEADER_SUBTITLE_MAX,
  SLIDE1_VISION_BULLET_MAX,
  SLIDE1_VISION_BULLETS_COUNT,
  SLIDE1_CLOSING_TAGLINE_MAX,
  SLIDE1_PHOTO_CAPTION_MAX,
  type DeckPayloadV2,
  type Slide1Payload,
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

// ── Hydration helpers ──────────────────────────────────────────────────────

interface Form {
  propertySubtitle: FormSlot;
  headerSubtitle: FormSlot;
  visionBullets: FormSlot[]; // length === SLIDE1_VISION_BULLETS_COUNT
  closingTagline: FormSlot;
  photoCaptions: {
    hero: FormSlot;
    secondary: FormSlot;
    inset: FormSlot;
  };
}

function hydrateForm(payload: DeckPayloadV2): Form {
  const s1: Slide1Payload = payload.slide1 ?? {};
  const bullets = s1.visionBullets ?? [];
  return {
    propertySubtitle: hydrateSlot(s1.propertySubtitle),
    headerSubtitle: hydrateSlot(s1.headerSubtitle),
    visionBullets: Array.from({ length: SLIDE1_VISION_BULLETS_COUNT }, (_, i) =>
      hydrateSlot(bullets[i]),
    ),
    closingTagline: hydrateSlot(s1.closingTagline),
    photoCaptions: {
      hero: hydrateSlot(s1.photoCaptions?.hero),
      secondary: hydrateSlot(s1.photoCaptions?.secondary),
      inset: hydrateSlot(s1.photoCaptions?.inset),
    },
  };
}

/**
 * Build the PATCH body, including only fields the user actually changed.
 * Each persisted slot carries fresh provenance.
 */
function buildPatchBody(form: Form): { slide1?: Partial<Slide1Payload> } | null {
  const now = new Date().toISOString();
  const slide1: Partial<Slide1Payload> = {};

  const stamp = (slot: FormSlot): AuthoredString => stampSlot(slot, now);

  if (form.propertySubtitle.dirty) slide1.propertySubtitle = stamp(form.propertySubtitle);
  if (form.headerSubtitle.dirty) slide1.headerSubtitle = stamp(form.headerSubtitle);
  if (form.closingTagline.dirty) slide1.closingTagline = stamp(form.closingTagline);

  if (form.visionBullets.some(b => b.dirty)) {
    slide1.visionBullets = form.visionBullets
      .filter(b => b.text.trim().length > 0)
      .map(stamp);
  }

  const captionPatch: NonNullable<Slide1Payload["photoCaptions"]> = {};
  if (form.photoCaptions.hero.dirty) captionPatch.hero = stamp(form.photoCaptions.hero);
  if (form.photoCaptions.secondary.dirty) captionPatch.secondary = stamp(form.photoCaptions.secondary);
  if (form.photoCaptions.inset.dirty) captionPatch.inset = stamp(form.photoCaptions.inset);
  if (Object.keys(captionPatch).length > 0) slide1.photoCaptions = captionPatch;

  if (Object.keys(slide1).length === 0) return null;
  return { slide1 };
}

// ── Small UI atoms ─────────────────────────────────────────────────────────

function CharCounterLocal({ length, max }: { length: number; max: number }) {
  const over = length > max;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>
      {length}/{max}
    </span>
  );
}

// ── Single editable slot row ───────────────────────────────────────────────

interface SlotRowProps {
  label: string;
  description: string;
  bucket: "human-only" | "llm-draft+approved";
  slot: FormSlot;
  max: number;
  multiline?: boolean;
  onChange: (text: string, source: SlotProvenance["source"]) => void;
  onDraft?: () => void;
  isDrafting?: boolean;
  readinessStatus?: "complete" | "stale" | "missing" | "deterministic";
  propertyUpdatedAt?: string;
  pendingSuggestion?: string | null;
  onAcceptDraft?: () => void;
  onDismissDraft?: () => void;
}

function SlotRow({
  label,
  description,
  bucket,
  slot,
  max,
  multiline,
  onChange,
  onDraft,
  isDrafting,
  readinessStatus,
  propertyUpdatedAt,
  pendingSuggestion,
  onAcceptDraft,
  onDismissDraft,
}: SlotRowProps) {
  const id = `slot-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const InputComp = multiline ? Textarea : Input;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
          <Badge
            variant="outline"
            className={
              bucket === "llm-draft+approved"
                ? "text-sky-700 border-sky-300 bg-sky-50 text-[10px] uppercase tracking-wide"
                : "text-muted-foreground text-[10px] uppercase tracking-wide"
            }
          >
            {bucket}
          </Badge>
          {readinessStatus && <ReadinessBadge status={readinessStatus} />}
        </div>
        <div className="flex items-center gap-2">
          <ProvenancePill source={slot.serverProvenance?.source ?? null} dirty={slot.dirty} />
          <CharCounterLocal length={slot.text.length} max={max} />
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
      ) : onDraft && (
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

// ── Main panel ─────────────────────────────────────────────────────────────

export function Slide1EditorPanel({ propertyId }: { propertyId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = useMemo(
    () => ["/api/admin/properties", propertyId, "deck-payload"] as const,
    [propertyId],
  );

  const { data, isLoading, error } = useQuery<DeckPayloadResponse>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`/api/admin/properties/${propertyId}/deck-payload`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text().catch(() => r.statusText)}`);
      return r.json();
    },
    enabled: Number.isFinite(propertyId),
    staleTime: 10_000,
  });

  const { data: readinessData } = useReadinessQuery(propertyId);

  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    if (data) setForm(hydrateForm(data.payload));
  }, [data]);

  const patchMutation = useMutation({
    mutationFn: async (body: { slide1?: Partial<Slide1Payload> }) => {
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
      toast({ title: "Slide 1 saved", description: "Editor copy persisted to the deck payload sidecar." });
    },
    onError: (err: unknown) => {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  const [draftingSlot, setDraftingSlot] = useState<string | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, {
    text?: string;
    bullets?: { text: string }[];
    generatedAt: string;
  }>>({});

  const draftMutation = useMutation({
    mutationFn: async (slot: "slide1.headerSubtitle" | "slide1.visionBullets") => {
      const r = await apiRequest(
        "POST",
        `/api/admin/properties/${propertyId}/deck-payload/draft-slot`,
        { slot },
      );
      return r.json() as Promise<{
        slot: string;
        suggestion: { text?: string; bullets?: { text: string }[] };
        model: string;
        generatedAt: string;
      }>;
    },
    onSuccess: (result) => {
      if (result.slot === "slide1.headerSubtitle" && result.suggestion.text != null) {
        setPendingDrafts(prev => ({
          ...prev,
          "slide1.headerSubtitle": { text: result.suggestion.text!, generatedAt: result.generatedAt },
        }));
      }
      if (result.slot === "slide1.visionBullets" && result.suggestion.bullets) {
        setPendingDrafts(prev => ({
          ...prev,
          "slide1.visionBullets": { bullets: result.suggestion.bullets!, generatedAt: result.generatedAt },
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

  function setSlot<K extends "propertySubtitle" | "headerSubtitle" | "closingTagline">(
    key: K,
    text: string,
    source: SlotProvenance["source"],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: { ...prev[key], text, source, dirty: true } } : prev));
  }
  function setBullet(idx: number, text: string, source: SlotProvenance["source"]) {
    setForm((prev) => {
      if (!prev) return prev;
      const next = [...prev.visionBullets];
      next[idx] = { ...next[idx], text, source, dirty: true };
      return { ...prev, visionBullets: next };
    });
  }
  function setCaption(slot: "hero" | "secondary" | "inset", text: string, source: SlotProvenance["source"]) {
    setForm((prev) =>
      prev
        ? { ...prev, photoCaptions: { ...prev.photoCaptions, [slot]: { ...prev.photoCaptions[slot], text, source, dirty: true } } }
        : prev,
    );
  }

  function acceptDraft(slotKey: string) {
    const pending = pendingDrafts[slotKey];
    if (!pending) return;
    if (slotKey === "slide1.headerSubtitle" && pending.text != null) {
      setForm(prev => prev ? {
        ...prev,
        headerSubtitle: { ...prev.headerSubtitle, text: pending.text!, source: "llm", dirty: true, llmGeneratedAt: pending.generatedAt },
      } : prev);
    }
    if (slotKey === "slide1.visionBullets" && pending.bullets) {
      setForm(prev => {
        if (!prev) return prev;
        const next = [...prev.visionBullets];
        for (let i = 0; i < SLIDE1_VISION_BULLETS_COUNT; i++) {
          const t = pending.bullets![i]?.text ?? "";
          next[i] = { ...next[i], text: t, source: "llm", dirty: true, llmGeneratedAt: pending.generatedAt };
        }
        return { ...prev, visionBullets: next };
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

  if (!Number.isFinite(propertyId)) {
    return <p className="text-destructive">Invalid property ID.</p>;
  }
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
  const dirtyCount = patchBody?.slide1 ? Object.keys(patchBody.slide1).length : 0;
  const report = readinessData?.report;
  const propertyUpdatedAt = readinessData?.propertyUpdatedAt;

  const headerSubtitleStatus = report?.["slide1.headerSubtitle"] as "complete" | "stale" | "missing" | undefined;
  const visionBulletsStatus = report?.["slide1.visionBullets"] as "complete" | "stale" | "missing" | undefined;

  const allSlots: FormSlot[] = [
    form.propertySubtitle,
    form.headerSubtitle,
    ...form.visionBullets,
    form.closingTagline,
    form.photoCaptions.hero,
    form.photoCaptions.secondary,
    form.photoCaptions.inset,
  ];
  const staleCount = allSlots.filter(s => isDraftStale(s, propertyUpdatedAt)).length;

  return (
    <Card data-stale-panel="" className="border border-border/60">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Slide 1 — Editor copy</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Author the human-only and Analyst-approved slots for the property spotlight.
              Deterministic fields (property name, asking price, building specs) come from the
              property record itself and are not edited here.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.updatedAt
              ? `Last saved ${new Date(data.updatedAt).toLocaleString()}`
              : "Never saved"}
          </div>
        </div>

        <StaleDraftBanner staleCount={staleCount} />

        <Separator />

        {/* Header block */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Header</h3>
          <SlotRow
            label="Property subtitle"
            description="Short italic descriptor under the property name. Human-only — only you know how the building should be framed."
            bucket="human-only"
            slot={form.propertySubtitle}
            max={SLIDE1_PROPERTY_SUBTITLE_MAX}
            onChange={(t, s) => setSlot("propertySubtitle", t, s)}
            propertyUpdatedAt={propertyUpdatedAt}
          />
          <SlotRow
            label="Header subtitle"
            description="Editorial subtitle in the page header. Analyst can draft a proposal; you approve before save."
            bucket="llm-draft+approved"
            slot={form.headerSubtitle}
            max={SLIDE1_HEADER_SUBTITLE_MAX}
            multiline
            onChange={(t, s) => setSlot("headerSubtitle", t, s)}
            onDraft={() => {
              setDraftingSlot("slide1.headerSubtitle");
              draftMutation.mutate("slide1.headerSubtitle");
            }}
            isDrafting={draftingSlot === "slide1.headerSubtitle" && draftMutation.isPending}
            readinessStatus={headerSubtitleStatus}
            propertyUpdatedAt={propertyUpdatedAt}
            pendingSuggestion={pendingDrafts["slide1.headerSubtitle"]?.text ?? null}
            onAcceptDraft={() => acceptDraft("slide1.headerSubtitle")}
            onDismissDraft={() => dismissDraft("slide1.headerSubtitle")}
          />
        </div>

        <Separator />

        {/* Vision bullets */}
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Vision bullets ({SLIDE1_VISION_BULLETS_COUNT} required)
              </h3>
              <ReadinessBadge status={visionBulletsStatus} />
            </div>
            {!pendingDrafts["slide1.visionBullets"] && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraftingSlot("slide1.visionBullets");
                  draftMutation.mutate("slide1.visionBullets");
                }}
                disabled={draftingSlot === "slide1.visionBullets" && draftMutation.isPending}
                className="gap-1.5"
              >
                {draftingSlot === "slide1.visionBullets" && draftMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <IconRefreshCw className="h-3.5 w-3.5" />}
                Re-draft all 3
              </Button>
            )}
          </div>
          {form.visionBullets.map((b, i) => (
            <SlotRow
              key={i}
              label={`Bullet ${i + 1}`}
              description={
                i === 0
                  ? "Strategic thesis — what makes this acquisition the right move."
                  : i === 1
                    ? "Repositioning angle — what we will change about how the asset operates."
                    : "Programming — concrete things guests will experience."
              }
              bucket="llm-draft+approved"
              slot={b}
              max={SLIDE1_VISION_BULLET_MAX}
              multiline
              onChange={(t, s) => setBullet(i, t, s)}
              propertyUpdatedAt={propertyUpdatedAt}
            />
          ))}
          {pendingDrafts["slide1.visionBullets"] && (
            <div className="rounded-md border border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-800 dark:text-sky-300 uppercase tracking-wide">
                  Analyst suggestion — {SLIDE1_VISION_BULLETS_COUNT} bullets
                </span>
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="sm" variant="ghost" onClick={() => dismissDraft("slide1.visionBullets")} className="h-7 text-xs gap-1">
                    <IconX className="h-3 w-3" />
                    Dismiss
                  </Button>
                  <Button type="button" size="sm" onClick={() => acceptDraft("slide1.visionBullets")} className="h-7 text-xs gap-1">
                    <IconCheck className="h-3 w-3" />
                    Accept all
                  </Button>
                </div>
              </div>
              {pendingDrafts["slide1.visionBullets"].bullets!.map((b, i) => {
                const current = form.visionBullets[i]?.text ?? "";
                const isIdentical = current.trim() === b.text.trim();
                return (
                  <div key={i} className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Bullet {i + 1}</span>
                    {current.trim().length > 0 && !isIdentical && (
                      <div className="text-xs text-muted-foreground line-through rounded px-2 py-1.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 whitespace-pre-wrap">
                        {current}
                      </div>
                    )}
                    <div className={`text-sm rounded px-2 py-1.5 whitespace-pre-wrap ${
                      isIdentical
                        ? "bg-muted border border-border"
                        : "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50"
                    }`}>
                      {b.text}
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
          <SlotRow
            label="Closing tagline"
            description="Two-color italic tagline at the bottom of the slide. Human-only — sets the tonal close."
            bucket="human-only"
            slot={form.closingTagline}
            max={SLIDE1_CLOSING_TAGLINE_MAX}
            multiline
            onChange={(t, s) => setSlot("closingTagline", t, s)}
            propertyUpdatedAt={propertyUpdatedAt}
          />
        </div>

        <Separator />

        {/* Photo captions */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Photo captions</h3>
          <p className="text-xs text-muted-foreground -mt-3">
            Human-only — only a person knows what each photo actually shows. Captions appear under
            the corresponding image slot in the slide layout.
          </p>
          <SlotRow
            label="Hero photo"
            description="Main full-width photo at the top of the slide."
            bucket="human-only"
            slot={form.photoCaptions.hero}
            max={SLIDE1_PHOTO_CAPTION_MAX}
            onChange={(t, s) => setCaption("hero", t, s)}
            propertyUpdatedAt={propertyUpdatedAt}
          />
          <SlotRow
            label="Secondary photo"
            description="Right-column photo."
            bucket="human-only"
            slot={form.photoCaptions.secondary}
            max={SLIDE1_PHOTO_CAPTION_MAX}
            onChange={(t, s) => setCaption("secondary", t, s)}
            propertyUpdatedAt={propertyUpdatedAt}
          />
          <SlotRow
            label="Inset photo"
            description="Smaller inset photo overlay."
            bucket="human-only"
            slot={form.photoCaptions.inset}
            max={SLIDE1_PHOTO_CAPTION_MAX}
            onChange={(t, s) => setCaption("inset", t, s)}
            propertyUpdatedAt={propertyUpdatedAt}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {dirtyCount === 0
              ? "No unsaved changes."
              : `${dirtyCount} unsaved field${dirtyCount === 1 ? "" : "s"}.`}
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
              onClick={() => {
                if (patchBody) patchMutation.mutate(patchBody);
              }}
              disabled={dirtyCount === 0 || patchMutation.isPending}
              className="gap-1.5"
            >
              {patchMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Slide 1
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
