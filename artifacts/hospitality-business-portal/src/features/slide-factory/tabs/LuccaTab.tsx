import { useCallback, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CancelButton } from "@/components/ui/cancel-button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { slotLabel } from "../SlideFactoryUtils";
import type { SlideFactoryRun, SlotRowProps } from "../SlideFactoryTypes";
import { FactoryProgressPill } from "./FactoryProgressPill";

// ── Tab 4 — Lucca draft review ──────────────────────────────────────────────

/** Default visible row count for the slot draft textarea — keeps the edit
 *  affordance compact while still showing enough context to scan. */
const SLOT_EDIT_TEXTAREA_ROWS = 3;

function SlotRow({ slotKey, draft, onApprove, onSaveValue, disabled }: SlotRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(draft.value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (editValue === draft.value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSaveValue(slotKey, editValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(draft.value);
    setEditing(false);
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            {slotLabel(slotKey)}
            {draft.source === "admin" && (
              <span className="ml-1.5 text-xs text-info">(edited)</span>
            )}
          </p>
          {editing ? (
            <div className="mt-1.5 space-y-2">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={SLOT_EDIT_TEXTAREA_ROWS}
                className="text-sm"
                disabled={saving}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                  {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  Save
                </Button>
                <CancelButton size="sm" onClick={handleCancel} disabled={saving} />
              </div>
            </div>
          ) : (
            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{draft.value}</p>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setEditValue(draft.value);
                setEditing(true);
              }}
              disabled={disabled}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant={draft.approved ? "default" : "outline"}
              className="text-xs h-7 min-w-[84px]"
              onClick={() => void onApprove(slotKey, !draft.approved)}
              disabled={disabled}
            >
              {draft.approved ? "✓ Approved" : "Approve"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function FactoryLuccaTab({
  run,
  onRunUpdate,
}: {
  run: SlideFactoryRun;
  onRunUpdate: (r: SlideFactoryRun) => void;
}) {
  const { toast } = useToast();
  const [approvingAll, setApprovingAll] = useState(false);
  const [triggeringBuild, setTriggeringBuild] = useState(false);

  const handleApproveSlot = useCallback(
    async (key: string, approved: boolean) => {
      try {
        const r = await apiRequest(
          "PATCH",
          `/api/lb-slides/factory/runs/${run.id}/slots/${encodeURIComponent(key)}`,
          { approved },
        );
        onRunUpdate((await r.json()) as SlideFactoryRun);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Update failed";
        toast({ title: "Failed to update slot", description: msg, variant: "destructive" });
      }
    },
    [run.id, onRunUpdate, toast],
  );

  const handleSaveValue = useCallback(
    async (key: string, value: string) => {
      try {
        const r = await apiRequest(
          "PATCH",
          `/api/lb-slides/factory/runs/${run.id}/slots/${encodeURIComponent(key)}`,
          { value },
        );
        onRunUpdate((await r.json()) as SlideFactoryRun);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Save failed";
        toast({ title: "Failed to save slot", description: msg, variant: "destructive" });
      }
    },
    [run.id, onRunUpdate, toast],
  );

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      const r = await apiRequest("POST", `/api/lb-slides/factory/runs/${run.id}/approve-all-slots`);
      onRunUpdate((await r.json()) as SlideFactoryRun);
      toast({ title: "All slots approved" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approve failed";
      toast({ title: "Failed to approve all", description: msg, variant: "destructive" });
    } finally {
      setApprovingAll(false);
    }
  };

  const handleTriggerBuild = async () => {
    setTriggeringBuild(true);
    try {
      const r = await apiRequest("POST", `/api/lb-slides/factory/runs/${run.id}/trigger-build`);
      onRunUpdate((await r.json()) as SlideFactoryRun);
      toast({ title: "Build triggered", description: "Slide agents are building the deck." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Trigger failed";
      toast({ title: "Failed to trigger build", description: msg, variant: "destructive" });
    } finally {
      setTriggeringBuild(false);
    }
  };

  // Lucca is still running
  if (run.status === "drafting") {
    return (
      <>
        {/* Skeleton shimmer — slot rows will appear here when done */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <FactoryProgressPill
          label="Lucca · Drafting slide content"
          caption="The pipeline advances automatically once all slots are ready."
        />
      </>
    );
  }

  // draft_review
  const draft = run.luccaDraft ?? {};
  const slots = Object.entries(draft);
  const allApproved = slots.length > 0 && slots.every(([, d]) => d.approved);
  const approvedCount = slots.filter(([, d]) => d.approved).length;
  const busy = approvingAll || triggeringBuild;

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3 mb-3">
        <p className="text-base font-semibold">Lucca Draft Review</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {approvedCount} / {slots.length} approved
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleApproveAll()}
            disabled={busy || allApproved}
          >
            {approvingAll && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            Approve all
          </Button>
        </div>
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No draft slots found.
        </p>
      ) : (
        slots.map(([key, slotDraft]) => (
          <SlotRow
            key={key}
            slotKey={key}
            draft={slotDraft}
            onApprove={handleApproveSlot}
            onSaveValue={handleSaveValue}
            disabled={busy}
          />
        ))
      )}

      <div className="pt-2 flex items-center gap-3">
        <Button
          onClick={() => void handleTriggerBuild()}
          disabled={!allApproved || busy}
        >
          {triggeringBuild && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Proceed to build
        </Button>
        {!allApproved && slots.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Approve all slots before proceeding.
          </p>
        )}
      </div>
    </div>
  );
}
