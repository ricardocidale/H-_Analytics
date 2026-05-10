/**
 * Slide4EditorPanel.tsx
 *
 * Admin authoring surface for Slide 4 — Portfolio Overview.
 *
 * This slide is mostly deterministic: the portfolio grid is data-driven
 * from sibling property records. The one authored slot is an optional
 * section subtitle that can complement the auto-generated property count.
 *
 * Authored slots:
 *   - sectionSubtitle : human-only — optional subtitle below the header
 *
 * Deterministic slots (NOT here): portfolio grid cards, property count,
 * hero photos — all come from the property records.
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
  SLIDE4_SECTION_SUBTITLE_MAX,
  type Slide4Payload,
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
  sectionSubtitle: FormSlot;
}

function hydrateForm(payload: DeckPayloadResponse["payload"]): Form {
  const s4 = payload.slide4 ?? {};
  return {
    sectionSubtitle: hydrateSlot(s4.sectionSubtitle),
  };
}

function buildPatchBody(form: Form): { slide4?: Partial<Slide4Payload> } | null {
  const now = new Date().toISOString();
  const slide4: Partial<Slide4Payload> = {};
  if (form.sectionSubtitle.dirty) slide4.sectionSubtitle = stampSlot(form.sectionSubtitle, now);
  if (Object.keys(slide4).length === 0) return null;
  return { slide4 };
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function Slide4EditorPanel({ propertyId }: { propertyId: number }) {
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
      toast({ title: "Slide 4 saved", description: "Editor copy persisted to the deck payload sidecar." });
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
  const dirtyCount = patchBody?.slide4 ? Object.keys(patchBody.slide4).length : 0;

  return (
    <Card className="border border-border/60">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Slide 4 — Editor copy</h2>
            <p className="text-sm text-muted-foreground mt-1">
              The portfolio grid is data-driven from property records. The only authored slot is an
              optional subtitle shown below the "H+ Portfolio Overview" header. If left empty, the
              slide shows the auto-generated property count line.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.updatedAt ? `Last saved ${new Date(data.updatedAt).toLocaleString()}` : "Never saved"}
          </div>
        </div>

        <Separator />

        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Header</h3>
          <SlotRow
            label="Section subtitle"
            description="Optional subtitle below 'H+ Portfolio Overview'. Falls back to the auto-generated property count if empty."
            bucket="human-only"
            slot={form.sectionSubtitle}
            max={SLIDE4_SECTION_SUBTITLE_MAX}
            onChange={(t) => setSlot("sectionSubtitle", t)}
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
              Save Slide 4
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
