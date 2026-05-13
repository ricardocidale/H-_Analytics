import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconDownload, IconWand2 } from "@/components/icons";
import { OVERRIDE_SLOT_GROUPS } from "../SlideFactoryConstants";
import { safeImageSrc } from "../SlideFactoryUtils";
import type { LuccaSlotDraft, SlideFactoryRun } from "../SlideFactoryTypes";

// ── Tab 6 — Override panel (edit slots after completion) ─────────────────────

function SlotEditor({
  slotKey,
  draft,
  runId,
  onRunUpdate,
  disabled,
}: {
  slotKey: string;
  draft: LuccaSlotDraft | undefined;
  runId: number;
  onRunUpdate: (r: SlideFactoryRun) => void;
  disabled: boolean;
}) {
  const { toast } = useToast();
  const config = OVERRIDE_SLOT_GROUPS.flatMap((g) => g.slots).find((s) => s.key === slotKey);
  const [localValue, setLocalValue] = useState(draft?.value ?? "");
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const isDirty = localValue !== (draft?.value ?? "");

  // Sync if draft value changes externally (e.g. after another slot save)
  useEffect(() => {
    setLocalValue(draft?.value ?? "");
  }, [draft?.value]);

  const handleSave = async (valueOverride?: string) => {
    // Accept an explicit value to bypass React state-batching staleness when
    // a caller (e.g. the photo "clear" button) needs to save a value it just set.
    const valueToSave = valueOverride !== undefined ? valueOverride : localValue;
    setSaving(true);
    try {
      const r = await apiRequest(
        "PATCH",
        `/api/lb-slides/factory/runs/${runId}/slots/${encodeURIComponent(slotKey)}`,
        { value: valueToSave },
      );
      onRunUpdate((await r.json()) as SlideFactoryRun);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Failed to save slot", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const r = await apiRequest(
        "POST",
        `/api/lb-slides/factory/runs/${runId}/slots/${encodeURIComponent(slotKey)}/suggest`,
      );
      const data = (await r.json()) as { suggestion: string };
      setSuggestion(data.suggestion);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Suggestion failed";
      toast({ title: "Could not generate suggestion", description: msg, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };

  const isOverride = draft?.source === "admin-override";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-1.5">
        <label className="text-xs font-medium text-foreground">
          {config?.label ?? slotKey}
          {isOverride && (
            <span className="ml-1.5 text-[10px] font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-px">
              overridden
            </span>
          )}
        </label>
        <div className="flex items-center gap-1">
          {config?.type !== "photo" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-primary"
              onClick={() => void handleSuggest()}
              disabled={disabled || suggesting}
              title="Suggest improved copy"
              data-testid={`suggest-slot-${slotKey}`}
            >
              {suggesting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <IconWand2 className="w-3 h-3" />
              )}
              <span className="ml-1">{suggesting ? "Suggesting…" : "Suggest"}</span>
            </Button>
          )}
          {isDirty && config?.type !== "photo" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2"
              onClick={() => void handleSave()}
              disabled={saving || disabled}
              data-testid={`save-slot-${slotKey}`}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
          )}
        </div>
      </div>
      {config?.hint && (
        <p className="text-[10px] text-muted-foreground">{config.hint}</p>
      )}
      {config?.type === "photo" ? (
        <div className="space-y-2">
          {localValue && safeImageSrc(localValue) && (
            <div className="relative inline-block">
              <img
                src={safeImageSrc(localValue)}
                alt="Interior photo override"
                className="h-24 w-auto rounded border object-cover"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (saving) return;
                  setLocalValue("");
                  // Pass "" explicitly — React state batching means localValue
                  // would still hold the old URL inside handleSave's closure.
                  void handleSave("");
                }}
                disabled={disabled || saving}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center p-0"
                title="Clear photo override"
                aria-label="Clear photo override"
              >
                ×
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              disabled={disabled}
              placeholder="Paste R2 photo URL…"
              className="text-xs h-8 flex-1"
              data-testid={`slot-photo-input-${slotKey}`}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px] px-2 shrink-0"
              onClick={() => void handleSave()}
              disabled={saving || disabled || localValue === (draft?.value ?? "")}
              data-testid={`save-slot-${slotKey}`}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Set"}
            </Button>
          </div>
        </div>
      ) : config?.multiline ? (
        <Textarea
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          disabled={disabled}
          rows={localValue.split("\n").length + 1}
          className="text-xs font-mono resize-none min-h-[3rem]"
          data-testid={`slot-textarea-${slotKey}`}
        />
      ) : (
        <Input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          disabled={disabled}
          className="text-xs h-8"
          data-testid={`slot-input-${slotKey}`}
        />
      )}
      {suggestion !== null && (
        <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs">
          <span className="flex-1 text-foreground leading-relaxed">{suggestion}</span>
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              size="sm"
              variant="default"
              className="h-5 text-[11px] px-2"
              onClick={() => {
                setLocalValue(suggestion);
                setSuggestion(null);
              }}
              data-testid={`accept-suggestion-${slotKey}`}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[11px] px-2 text-muted-foreground"
              onClick={() => setSuggestion(null)}
              data-testid={`dismiss-suggestion-${slotKey}`}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FactoryOverridePanel({
  run,
  onRunUpdate,
}: {
  run: SlideFactoryRun;
  onRunUpdate: (r: SlideFactoryRun) => void;
}) {
  const { toast } = useToast();
  const [rebuilding, setRebuilding] = useState(false);

  const isRebuilding = run.status === "rebuilding";
  const draft = run.luccaDraft ?? {};

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const r = await apiRequest("POST", `/api/lb-slides/factory/runs/${run.id}/rebuild`);
      onRunUpdate((await r.json()) as SlideFactoryRun);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rebuild failed";
      toast({ title: "Rebuild failed", description: msg, variant: "destructive" });
    } finally {
      setRebuilding(false);
    }
  };

  const editorDisabled = isRebuilding || rebuilding;

  return (
    <Card data-testid={`override-panel-${run.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Override Slots</CardTitle>
          <p className="text-xs text-muted-foreground">
            Edit and save individual slots, then rebuild the PDF.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isRebuilding ? (
          <div className="flex items-center gap-3 py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
            <p className="text-sm text-muted-foreground">Rebuilding PDF…</p>
          </div>
        ) : (
          <>
            {OVERRIDE_SLOT_GROUPS.map(({ slideLabel, slots }) => (
              <Collapsible key={slideLabel} defaultOpen={false}>
                <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left group">
                  <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                    {slideLabel}
                  </span>
                  {slots.some((s) => draft[s.key]?.source === "admin-override") && (
                    <span className="text-[10px] text-amber-600 font-medium">• edited</span>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3 pl-2 border-l border-border">
                  {slots.map((s) => (
                    <SlotEditor
                      key={s.key}
                      slotKey={s.key}
                      draft={draft[s.key]}
                      runId={run.id}
                      onRunUpdate={onRunUpdate}
                      disabled={editorDisabled}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
            <div className="pt-2 border-t border-border">
              <Button
                onClick={() => void handleRebuild()}
                disabled={editorDisabled}
                size="sm"
                data-testid="rebuild-pdf-button"
              >
                {rebuilding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <IconDownload className="w-3.5 h-3.5 mr-1.5" />
                )}
                Rebuild PDF
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
