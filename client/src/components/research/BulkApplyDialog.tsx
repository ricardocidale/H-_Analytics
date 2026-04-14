import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Check, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GuidanceItem {
  assumptionKey: string;
  label: string;
  section: string;
  currentValue: number | null;
  recommendedValue: number;
  confidence?: "high" | "medium" | "low";
  isStale?: boolean;
  format?: "percent" | "dollar" | "number";
}

interface BulkApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: GuidanceItem[];
  onApply: (keys: string[]) => void;
  onUndo?: () => void;
  entityLabel?: string;
  "data-testid"?: string;
}

function formatValue(value: number | null, format?: GuidanceItem["format"]): string {
  if (value == null) return "—";
  switch (format) {
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "dollar":
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    default:
      return value.toFixed(2);
  }
}

function BulkApplyDialog({
  open,
  onOpenChange,
  items,
  onApply,
  onUndo,
  entityLabel,
  ...props
}: BulkApplyDialogProps) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [staleOnly, setStaleOnly] = React.useState(false);
  const { toast } = useToast();

  const filteredItems = React.useMemo(() => {
    if (staleOnly) return items.filter((i) => i.isStale);
    return items;
  }, [items, staleOnly]);

  const groupedItems = React.useMemo(() => {
    const groups: Record<string, GuidanceItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push(item);
    }
    return groups;
  }, [filteredItems]);

  const allFilteredKeys = React.useMemo(() => new Set(filteredItems.map((i) => i.assumptionKey)), [filteredItems]);

  React.useEffect(() => {
    if (open) {
      setSelected(new Set(filteredItems.map((i) => i.assumptionKey)));
    }
  }, [open, filteredItems]);

  const toggleAll = React.useCallback(() => {
    if (selected.size === allFilteredKeys.size) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allFilteredKeys));
    }
  }, [selected.size, allFilteredKeys]);

  const toggleItem = React.useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleApply = React.useCallback(() => {
    const keys = Array.from(selected);
    if (keys.length === 0) return;
    onApply(keys);
    onOpenChange(false);
    toast({
      title: `Applied ${keys.length} research value${keys.length > 1 ? "s" : ""}`,
      description: onUndo ? "Click undo to revert" : undefined,
      action: onUndo ? (
        <Button variant="ghost" size="sm" onClick={onUndo} data-testid="button-undo-bulk-apply">
          <Undo2 className="h-3.5 w-3.5 mr-1" />
          Undo
        </Button>
      ) : undefined,
      duration: 5000,
    });
  }, [selected, onApply, onOpenChange, toast, onUndo]);

  const allSelected = selected.size === allFilteredKeys.size && allFilteredKeys.size > 0;
  const _someSelected = selected.size > 0 && selected.size < allFilteredKeys.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col" data-testid={props["data-testid"] ?? "dialog-bulk-apply"}>
        <DialogHeader>
          <DialogTitle className="text-lg">Apply Research Values{entityLabel ? ` — ${entityLabel}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between px-1 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              ref={undefined}
              onCheckedChange={toggleAll}
              data-testid="checkbox-select-all"
            />
            <span className="text-sm text-muted-foreground">
              {selected.size} of {allFilteredKeys.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="stale-toggle" className="text-xs text-muted-foreground">Stale only</Label>
            <Switch
              id="stale-toggle"
              checked={staleOnly}
              onCheckedChange={setStaleOnly}
              data-testid="toggle-stale-only"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {Object.entries(groupedItems).map(([section, sectionItems]) => (
            <div key={section}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{section}</h4>
              <div className="space-y-1">
                {sectionItems.map((item) => (
                  <label
                    key={item.assumptionKey}
                    className={cn(
                      "flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                      selected.has(item.assumptionKey) ? "bg-accent/30" : "hover:bg-accent/10"
                    )}
                    data-testid={`bulk-item-${item.assumptionKey}`}
                  >
                    <Checkbox
                      checked={selected.has(item.assumptionKey)}
                      onCheckedChange={() => toggleItem(item.assumptionKey)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{item.label}</span>
                        {item.isStale && (
                          <span className="text-[9px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-1 py-0.5 rounded">Stale</span>
                        )}
                        {item.confidence && (
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            item.confidence === "high" ? "bg-green-500" :
                            item.confidence === "medium" ? "bg-amber-500" : "bg-red-400"
                          )} />
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-muted-foreground/60 line-through">{formatValue(item.currentValue, item.format)}</div>
                      <div className="text-xs font-mono font-medium text-primary">{formatValue(item.recommendedValue, item.format)}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6" data-testid="empty-bulk-apply">
              {staleOnly ? "No stale research values found" : "No research values available"}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-bulk-apply">
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={selected.size === 0} data-testid="button-apply-bulk">
            <Check className="h-4 w-4 mr-1.5" />
            Apply {selected.size} Value{selected.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

BulkApplyDialog.displayName = "BulkApplyDialog";

export { BulkApplyDialog };
export type { BulkApplyDialogProps, GuidanceItem };
