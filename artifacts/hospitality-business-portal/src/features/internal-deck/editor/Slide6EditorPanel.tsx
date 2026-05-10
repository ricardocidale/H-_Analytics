/**
 * Slide6EditorPanel.tsx
 *
 * Admin authoring surface for Slide 6 — Income Statement.
 *
 * Authored slots:
 *   - disclaimer : human-only — disclaimer text in the callout box at the
 *       bottom of the Key Investor Metrics panel. Falls back to the boilerplate
 *       projection notice.
 *
 * Deterministic slots (NOT here): the entire income statement table, all
 * investor metrics rows (IRR, equity multiple, NOI, exit value, total return)
 * — all come from the finance engine and are not edited here.
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertCircle } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import {
  SLIDE6_DISCLAIMER_MAX,
  type Slide6Payload,
} from "@shared/deck-payload-v2";
import {
  hydrateSlot,
  stampSlot,
  useDeckPayloadQuery,
  useDeckPayloadPatch,
  SlotRow,
  type FormSlot,
  type DeckPayloadResponse,
} from "./editor-shared";

// ── Form shape ─────────────────────────────────────────────────────────────

interface Form {
  disclaimer: FormSlot;
}

function hydrateForm(payload: DeckPayloadResponse["payload"]): Form {
  const s6 = payload.slide6 ?? {};
  return {
    disclaimer: hydrateSlot(s6.disclaimer),
  };
}

function buildPatchBody(form: Form): { slide6?: Partial<Slide6Payload> } | null {
  const now = new Date().toISOString();
  const slide6: Partial<Slide6Payload> = {};
  if (form.disclaimer.dirty) slide6.disclaimer = stampSlot(form.disclaimer, now);
  if (Object.keys(slide6).length === 0) return null;
  return { slide6 };
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function Slide6EditorPanel({ propertyId }: { propertyId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error, queryKey } = useDeckPayloadQuery(propertyId);

  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    if (data) setForm(hydrateForm(data.payload));
  }, [data]);

  const patchMutation = useDeckPayloadPatch(
    propertyId,
    queryKey,
    (next) => {
      qc.setQueryData(queryKey, next);
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-token"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/properties", propertyId, "deck-payload", "readiness"] });
      toast({ title: "Slide 6 saved", description: "Editor copy persisted to the deck payload sidecar." });
    },
    (err) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  );

  function setSlot(key: keyof Form, text: string) {
    setForm(prev => prev ? { ...prev, [key]: { ...prev[key], text, source: "user" as const, dirty: true } } : prev);
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
  const dirtyCount = patchBody?.slide6 ? Object.keys(patchBody.slide6).length : 0;

  return (
    <Card className="border border-border/60">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Slide 6 — Editor copy</h2>
            <p className="text-sm text-muted-foreground mt-1">
              The income statement table and all investor metrics are computed from the finance
              engine and are not edited here. The only authored slot is the disclaimer callout
              at the bottom of the Key Investor Metrics panel.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.updatedAt ? `Last saved ${new Date(data.updatedAt).toLocaleString()}` : "Never saved"}
          </div>
        </div>

        <Separator />

        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Disclaimer</h3>
          <SlotRow
            label="Disclaimer text"
            description="Italic disclaimer in the callout box at the bottom of the Key Investor Metrics panel. Falls back to the standard projection boilerplate if left empty."
            bucket="human-only"
            slot={form.disclaimer}
            max={SLIDE6_DISCLAIMER_MAX}
            multiline
            onChange={(t) => setSlot("disclaimer", t)}
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
              Save Slide 6
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
