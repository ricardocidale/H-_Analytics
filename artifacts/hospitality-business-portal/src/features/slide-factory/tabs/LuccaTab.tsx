import { useCallback, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CancelButton } from "@/components/ui/cancel-button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { slotLabel } from "../SlideFactoryUtils";
import type { SlideFactoryRun, SlotRowProps } from "../SlideFactoryTypes";

// ── Tab 4 — Lucca draft review ──────────────────────────────────────────────

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
                rows={3}
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
      <Card>
        <CardContent className="py-10 flex flex-col items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
          <p className="text-sm font-medium">Lucca is drafting slide content…</p>
          <p className="text-xs text-muted-foreground">
            The pipeline advances automatically once all slots are ready.
          </p>
        </CardContent>
      </Card>
    );
  }

  // draft_review
  const draft = run.luccaDraft ?? {};
  const slots = Object.entries(draft);
  const allApproved = slots.length > 0 && slots.every(([, d]) => d.approved);
  const approvedCount = slots.filter(([, d]) => d.approved).length;
  const busy = approvingAll || triggeringBuild;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Lucca Draft Review</CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-2">
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
      </CardContent>
    </Card>
  );
}
