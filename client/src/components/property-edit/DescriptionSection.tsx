import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Loader2, X } from "@/components/icons/themed-icons";
import { IconWand2, IconCheck, IconPencil } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { PropertyEditSectionProps } from "./types";

export default function DescriptionSection({ draft, onChange }: PropertyEditSectionProps) {
  const [isRewriting, setIsRewriting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(!draft.description);
  const { toast } = useToast();

  const handleAIRewrite = async () => {
    const text = (draft.description || "").trim();
    if (!text) {
      toast({ title: "Nothing to improve", description: "Please write a description first.", variant: "destructive" });
      return;
    }
    setIsRewriting(true);
    try {
      const res = await fetch(`/api/properties/${draft.id}/rewrite-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Rewrite failed");
      const data = await res.json();
      if (data.rewritten) {
        setPreview(data.rewritten);
      }
    } catch {
      toast({ title: "Error", description: "Failed to rewrite description. Please try again.", variant: "destructive" });
    } finally {
      setIsRewriting(false);
    }
  };

  const acceptRewrite = () => {
    if (preview) {
      onChange("description", preview);
      toast({ title: "Description improved", description: "AI rewrite has been applied." });
    }
    setPreview(null);
  };

  const dismissRewrite = () => {
    setPreview(null);
  };

  const hasSavedDescription = !!(draft.description || "").trim();

  return (
    <>
      <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="relative p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-display text-foreground">Property Description</h3>
              <p className="text-muted-foreground text-sm label-text">Describe the property, its features, and investment thesis</p>
            </div>
            {hasSavedDescription && !isEditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                data-testid="button-edit-description"
              >
                <IconPencil className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </div>

          {hasSavedDescription && !isEditing ? (
            <div className="rounded-md border border-border bg-muted/30 p-4" data-testid="card-saved-description">
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="text-saved-description">
                {draft.description}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="label-text text-foreground flex items-center gap-1.5">
                Description
                <InfoTooltip text="A narrative description of the property. This is used in reports, exports, and as context for AI research. Describe the property's unique features, target market, and investment appeal." />
              </Label>
              <Textarea
                value={draft.description || ""}
                onChange={(e) => onChange("description", e.target.value || null)}
                placeholder="Describe this property — its setting, unique features, target guests, and what makes it an attractive investment..."
                className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground min-h-[120px] resize-y"
                data-testid="input-property-description"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAIRewrite}
                  disabled={isRewriting || !(draft.description || "").trim()}
                  data-testid="button-ai-rewrite-description"
                >
                  {isRewriting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <IconWand2 className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {isRewriting ? "Rewriting..." : "Improve with AI"}
                </Button>
                {(draft.description || "").trim() && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange("description", null)}
                      className="text-muted-foreground"
                      data-testid="button-clear-description"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Clear
                    </Button>
                    {isEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(false)}
                        className="text-muted-foreground"
                        data-testid="button-done-editing-description"
                      >
                        Done
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) dismissRewrite(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI Rewrite Preview</DialogTitle>
            <DialogDescription>
              Review the improved description below. Accept to apply it, or dismiss to keep your original.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 my-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 label-text">Original</p>
              <div className="text-sm text-foreground/70 bg-muted/50 rounded-md p-3 max-h-[120px] overflow-y-auto whitespace-pre-wrap" data-testid="text-original-description">
                {(draft.description || "").trim()}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-primary mb-1.5 label-text">Improved</p>
              <div className="text-sm text-foreground bg-primary/5 border border-primary/15 rounded-md p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap" data-testid="text-rewritten-description">
                {preview}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={dismissRewrite} data-testid="button-dismiss-rewrite">
              Dismiss
            </Button>
            <Button size="sm" onClick={acceptRewrite} data-testid="button-accept-rewrite">
              <IconCheck className="w-3.5 h-3.5 mr-1.5" />
              Accept Rewrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
