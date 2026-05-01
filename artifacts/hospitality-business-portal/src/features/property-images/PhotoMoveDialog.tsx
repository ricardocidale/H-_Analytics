import { useState, useMemo } from "react";
import { Loader2 } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useProperties } from "@/lib/api";
import { useMovePhotos } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PhotoMoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePropertyId: number;
  sourcePropertyName?: string;
  selectedPhotoIds: number[];
  onComplete?: () => void;
}

export function PhotoMoveDialog({
  open,
  onOpenChange,
  sourcePropertyId,
  sourcePropertyName,
  selectedPhotoIds,
  onComplete,
}: PhotoMoveDialogProps) {
  const { data: properties = [], isLoading } = useProperties();
  const move = useMovePhotos();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [mode, setMode] = useState<"move" | "copy">("move");

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties
      .filter((p) => p.id !== sourcePropertyId)
      .filter((p) => !q || p.name?.toLowerCase().includes(q) || p.location?.toLowerCase().includes(q));
  }, [properties, sourcePropertyId, search]);

  const handleSubmit = async () => {
    if (!destinationId) return;
    try {
      const result = await move.mutateAsync({
        sourcePropertyId,
        destinationPropertyId: destinationId,
        photoIds: selectedPhotoIds,
        mode,
      });
      const dest = properties.find((p) => p.id === destinationId);
      toast({
        title: mode === "move" ? "Photos moved" : "Photos copied",
        description: `${result.count} photo${result.count !== 1 ? "s" : ""} ${mode === "move" ? "moved to" : "copied to"} ${dest?.name ?? `property #${destinationId}`}.`,
      });
      setDestinationId(null);
      setSearch("");
      onComplete?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast({
        title: mode === "move" ? "Move failed" : "Copy failed",
        description: e instanceof Error ? e.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-move-photos">
        <DialogHeader>
          <DialogTitle>Move photos to property</DialogTitle>
          <DialogDescription>
            {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? "s" : ""} selected from {sourcePropertyName ?? "this property"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "move" | "copy")} className="flex gap-4" data-testid="radio-move-mode">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="move" data-testid="radio-mode-move" /> Move
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="copy" data-testid="radio-mode-copy" /> Copy
            </label>
          </RadioGroup>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search properties..."
            data-testid="input-property-search"
          />

          <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent-pop" /> Loading properties...
              </div>
            ) : candidates.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No matching properties.</div>
            ) : (
              candidates.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDestinationId(p.id)}
                  className={`w-full text-left p-2.5 text-sm hover:bg-muted transition-colors ${
                    destinationId === p.id ? "bg-primary/10" : ""
                  }`}
                  data-testid={`option-property-${p.id}`}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.location}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={move.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!destinationId || move.isPending || selectedPhotoIds.length === 0}
            data-testid="button-confirm-move"
          >
            {move.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin text-accent-pop" />{mode === "move" ? "Moving..." : "Copying..."}</>
            ) : (
              mode === "move" ? "Move photos" : "Copy photos"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
