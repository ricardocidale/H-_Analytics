/**
 * editor-shared.tsx
 *
 * Shared atoms and utilities for all SlideNEditorPanel components.
 * Exported as named exports; each panel imports what it needs.
 */

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

// ── Per-slot form state ────────────────────────────────────────────────────

export interface FormSlot {
  text: string;
  source: SlotProvenance["source"];
  /** True when changed since hydration (drives PATCH body). */
  dirty: boolean;
  /** Server-side provenance at hydration time, for the badge. */
  serverProvenance: SlotProvenance | null;
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
    provenance: { source: slot.source, updatedAt: now },
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
}

export function SlotRow({
  label,
  description,
  bucket,
  slot,
  max,
  multiline,
  onChange,
}: SlotRowProps) {
  const id = `slot-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const InputComp = multiline ? Textarea : Input;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
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
    </div>
  );
}
