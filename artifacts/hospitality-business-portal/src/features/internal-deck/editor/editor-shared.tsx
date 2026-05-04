/**
 * editor-shared.tsx
 *
 * Shared atoms and utilities for all SlideNEditorPanel components.
 * Exported as named exports; each panel imports what it needs.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import type {
  DeckPayloadV2,
  AuthoredString,
  SlotProvenance,
} from "@shared/deck-payload-v2";
import { DECK_PAYLOAD_SCHEMA_VERSION } from "@shared/deck-payload-v2";

// ── Shared response type ───────────────────────────────────────────────────

export interface DeckPayloadResponse {
  propertyId: number;
  payload: DeckPayloadV2;
  updatedBy: number | null;
  updatedAt: string | null;
}

// ── Readiness ──────────────────────────────────────────────────────────────

export type SlotStatus = "complete" | "stale" | "missing" | "deterministic";

export interface ReadinessResponse {
  propertyId: number;
  report: Record<string, SlotStatus>;
  staleMissingSlots: string[];
  staleMissingCount: number;
  payloadUpdatedAt: string | null;
  propertyUpdatedAt: string;
}

export function useReadinessQuery(propertyId: number) {
  const queryKey = ["/api/admin/properties", propertyId, "deck-payload", "readiness"] as const;
  const result = useQuery<ReadinessResponse>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(
        `/api/admin/properties/${propertyId}/deck-payload/readiness`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text().catch(() => r.statusText)}`);
      return r.json();
    },
    enabled: Number.isFinite(propertyId),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  return { ...result, queryKey };
}

export function ReadinessBadge({ status }: { status: SlotStatus | undefined }) {
  if (!status || status === "deterministic") return null;
  if (status === "complete") {
    return (
      <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 text-[10px] uppercase tracking-wide">
        Ready
      </Badge>
    );
  }
  if (status === "stale") {
    return (
      <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] uppercase tracking-wide">
        Stale
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground text-[10px] uppercase tracking-wide">
      Missing
    </Badge>
  );
}

// ── Per-slot form state ────────────────────────────────────────────────────

export interface FormSlot {
  text: string;
  source: SlotProvenance["source"];
  /** True when changed since hydration (drives PATCH body). */
  dirty: boolean;
  /** Server-side provenance at hydration time, for the badge. */
  serverProvenance: SlotProvenance | null;
  /**
   * ISO timestamp from the LLM draft response (draft-slot generatedAt).
   * When present and source === "llm", stampSlot uses this instead of the
   * wall-clock save time so that staleness is evaluated against the moment
   * the LLM actually saw the property data — not when the admin clicked Save.
   * Without this, a property edit between draft-generation and save would be
   * silently hidden: save-time > property-updatedAt → wrongly "complete".
   */
  llmGeneratedAt?: string;
}

export function emptySlot(): FormSlot {
  return { text: "", source: "user", dirty: false, serverProvenance: null };
}

export function hydrateSlot(authored: AuthoredString | undefined): FormSlot {
  if (!authored) return emptySlot();
  return {
    text: authored.text,
    source: authored.provenance.source,
    dirty: false,
    serverProvenance: authored.provenance,
  };
}

export function stampSlot(slot: FormSlot, now: string): AuthoredString {
  return {
    text: slot.text,
    provenance: {
      source: slot.source,
      updatedAt: slot.source === "llm" && slot.llmGeneratedAt ? slot.llmGeneratedAt : now,
    },
  };
}

// ── Shared query + mutation hooks ──────────────────────────────────────────

export function useDeckPayloadQuery(propertyId: number) {
  const queryKey = ["/api/admin/properties", propertyId, "deck-payload"] as const;
  const result = useQuery<DeckPayloadResponse>({
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
  return { ...result, queryKey };
}

export function useDeckPayloadPatch(
  propertyId: number,
  queryKey: readonly [string, number, string],
  onSuccess: (next: DeckPayloadResponse) => void,
  onError: (err: unknown) => void,
) {
  return useMutation({
    mutationFn: async (body: Partial<DeckPayloadV2>) => {
      const r = await apiRequest(
        "PATCH",
        `/api/admin/properties/${propertyId}/deck-payload`,
        { schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION, ...body },
      );
      return r.json() as Promise<DeckPayloadResponse>;
    },
    onSuccess,
    onError,
  });
}

// ── Small UI atoms ─────────────────────────────────────────────────────────

export function ProvenancePill({
  source,
  dirty,
}: {
  source: SlotProvenance["source"] | null;
  dirty: boolean;
}) {
  if (dirty) {
    return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Unsaved</Badge>;
  }
  if (!source) {
    return <Badge variant="outline" className="text-muted-foreground">Empty — falls back to template</Badge>;
  }
  if (source === "user") {
    return <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">User</Badge>;
  }
  return <Badge variant="outline" className="text-sky-700 border-sky-300 bg-sky-50">Analyst draft (approved)</Badge>;
}

export function CharCounter({ length, max }: { length: number; max: number }) {
  const over = length > max;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>
      {length}/{max}
    </span>
  );
}

// ── Single editable slot row ───────────────────────────────────────────────

export interface SlotRowProps {
  label: string;
  description: string;
  bucket: "human-only" | "llm-draft+approved";
  slot: FormSlot;
  max: number;
  multiline?: boolean;
  onChange: (text: string, source: SlotProvenance["source"]) => void;
  onDraft?: () => void;
  isDrafting?: boolean;
  /**
   * When provided, overrides the draft button's disabled state independently of
   * isDrafting. Useful when multiple sibling rows share one draft-in-flight gate
   * but only one row shows the spinner.
   */
  draftDisabled?: boolean;
  /** Override the draft button label. Defaults to "Re-draft". */
  draftLabel?: string;
  readinessStatus?: SlotStatus;
  propertyUpdatedAt?: string;
  pendingSuggestion?: string | null;
  onAcceptDraft?: (editedText: string) => void;
  onDismissDraft?: () => void;
}

export function SlotRow({
  label,
  description,
  bucket,
  slot,
  max,
  multiline,
  onChange,
  onDraft,
  isDrafting,
  draftDisabled,
  draftLabel,
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
          <CharCounter length={slot.text.length} max={max} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <InputComp
        id={id}
        value={slot.text}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange(e.target.value, "user")
        }
        rows={multiline ? 3 : undefined}
        maxLength={max}
        className={slot.text.length > max ? "border-destructive" : undefined}
      />
      {isDraftStale(slot, propertyUpdatedAt) && <StaleDraftNotice />}
      {pendingSuggestion != null && onAcceptDraft && onDismissDraft ? (
        <InlineDraftDiff
          currentText={slot.text}
          suggestedText={pendingSuggestion}
          onAccept={(t) => onAcceptDraft(t)}
          onDismiss={onDismissDraft}
        />
      ) : (
        onDraft && bucket === "llm-draft+approved" && (
          <DraftButton onClick={onDraft} isPending={isDrafting ?? false} disabled={draftDisabled} label={draftLabel} />
        )
      )}
    </div>
  );
}

// ── Stale-draft detection ──────────────────────────────────────────────────

/**
 * Returns true when an LLM draft in the editor is unsaved and the property
 * has been updated since the draft was generated — meaning the draft reflects
 * outdated data.
 */
export function isDraftStale(
  slot: FormSlot,
  propertyUpdatedAt: string | undefined,
): boolean {
  if (!slot.dirty) return false;
  if (slot.source !== "llm") return false;
  if (!slot.llmGeneratedAt || !propertyUpdatedAt) return false;
  return new Date(slot.llmGeneratedAt) < new Date(propertyUpdatedAt);
}

export function StaleDraftNotice() {
  return (
    <div data-stale-slot="" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span className="mt-0.5 shrink-0">⚠</span>
      <span>
        Property data has changed since this draft was generated — consider re-drafting.
      </span>
    </div>
  );
}

/**
 * Summary banner rendered at the top of a CardContent when one or more slots
 * in that panel have stale LLM drafts.  Clicking it scrolls the page to the
 * first stale-slot notice so the admin does not have to hunt for it.
 */
export function StaleDraftBanner({ staleCount }: { staleCount: number }) {
  if (staleCount === 0) return null;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const panel =
      (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-stale-panel]") ??
      document.documentElement;
    const el = panel.querySelector<HTMLElement>("[data-stale-slot]");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400");
      setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1500);
    }
  }

  const label =
    staleCount === 1
      ? "1 draft in this panel is based on outdated property data"
      : `${staleCount} drafts in this panel are based on outdated property data`;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 text-left hover:bg-amber-100 transition-colors"
    >
      <span className="shrink-0 text-sm">⚠</span>
      <span className="flex-1">{label} — click to jump to the first affected field.</span>
    </button>
  );
}

// ── Draft button atom ──────────────────────────────────────────────────────

import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconRefreshCw, IconCheck, IconX } from "@/components/icons";

export function DraftButton({
  onClick,
  isPending,
  label = "Re-draft",
  disabled,
}: {
  onClick: () => void;
  isPending: boolean;
  label?: string;
  /** Optional override — when provided, takes precedence over isPending for the disabled state. */
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      disabled={disabled ?? isPending}
      className="gap-1.5"
    >
      {isPending
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <IconRefreshCw className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

export function InlineDraftDiff({
  currentText,
  suggestedText,
  onAccept,
  onDismiss,
}: {
  currentText: string;
  suggestedText: string;
  onAccept: (editedText: string) => void;
  onDismiss: () => void;
}) {
  const [editedText, setEditedText] = useState(suggestedText);

  useEffect(() => {
    setEditedText(suggestedText);
  }, [suggestedText]);

  const hasExisting = currentText.trim().length > 0;
  const isIdentical = currentText.trim() === editedText.trim();
  const isEdited = editedText !== suggestedText;

  return (
    <div className="rounded-md border border-sky-300 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-sky-800 dark:text-sky-300 uppercase tracking-wide">
            Analyst suggestion
          </span>
          {isEdited && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] uppercase tracking-wide">
              Edited
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss} className="h-7 text-xs gap-1">
            <IconX className="h-3 w-3" />
            Dismiss
          </Button>
          <Button type="button" size="sm" onClick={() => onAccept(editedText)} className="h-7 text-xs gap-1">
            <IconCheck className="h-3 w-3" />
            Accept
          </Button>
        </div>
      </div>
      {hasExisting && !isIdentical && (
        <div className="text-xs text-muted-foreground line-through rounded px-2 py-1.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 whitespace-pre-wrap">
          {currentText}
        </div>
      )}
      <Textarea
        value={editedText}
        onChange={(e) => setEditedText(e.target.value)}
        rows={3}
        className={`text-sm resize-y ${
          isIdentical
            ? "bg-muted border-border"
            : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50"
        }`}
        aria-label="Edit Analyst suggestion before accepting"
      />
      {isIdentical && (
        <p className="text-xs text-muted-foreground italic">The suggestion is identical to the current text.</p>
      )}
    </div>
  );
}
