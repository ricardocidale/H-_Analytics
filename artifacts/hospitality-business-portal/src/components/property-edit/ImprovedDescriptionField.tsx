/**
 * ImprovedDescriptionField.tsx — Inline "Description (Improved)" field with
 * AI rewrite support for the Property Assumptions page.
 *
 * Extracted from BasicInfoSection.tsx following the same pattern as
 * AsPurchasedDescriptionField.tsx (Plan 2026-05-16 T2-3). Bound to the
 * `descriptionImproved` column only (no dual-write needed).
 *
 * The surrounding <Label> and <InfoTooltip> stay in the parent component.
 */
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, X } from "@/components/icons/themed-icons";
import { IconWand2, IconCheck, IconPencil } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import type { PropertyEditSectionProps } from "./types";

interface ImprovedDescriptionFieldProps {
  draft: PropertyEditSectionProps["draft"];
  onChange: PropertyEditSectionProps["onChange"];
}

export default function ImprovedDescriptionField({ draft, onChange }: ImprovedDescriptionFieldProps) {
  const [isRewriting, setIsRewriting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const currentValue = draft.descriptionImproved ?? "";
  const [isEditing, setIsEditing] = useState(!currentValue);
  const { toast } = useToast();

  const purchasedDescriptionForPlaceholder = (draft.descriptionPurchased ?? draft.description ?? "").slice(0, 120);
  const hasSavedDescription = !!currentValue.trim();

  const handleAIRewrite = async () => {
    const text = currentValue.trim();
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
      const data = (await res.json()) as { rewritten?: string };
      if (data.rewritten) setPreview(data.rewritten);
    } catch {
      toast({ title: "Error", description: "Failed to rewrite description. Please try again.", variant: "destructive" });
    } finally {
      setIsRewriting(false);
    }
  };

  const acceptRewrite = () => {
    if (preview) {
      onChange("descriptionImproved", preview);
      toast({ title: "Description improved", description: "AI rewrite has been applied." });
    }
    setPreview(null);
  };

  return (
    <>
      <div>
        {hasSavedDescription && !isEditing ? (
          <div className="space-y-2">
            <div
              className="rounded-md border border-border bg-muted/30 p-3"
              data-testid="card-saved-description-improved"
            >
              <p
                className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap"
                data-testid="text-saved-description-improved"
              >
                {currentValue}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              data-testid="button-edit-description-improved"
            >
              <IconPencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={currentValue}
              onChange={(e) => onChange("descriptionImproved", e.target.value || null)}
              placeholder={
                purchasedDescriptionForPlaceholder
                  ? purchasedDescriptionForPlaceholder + (purchasedDescriptionForPlaceholder.length >= 120 ? "…" : "")
                  : "Describe the property after improvements..."
              }
              className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground/60 focus:placeholder:text-muted-foreground min-h-[100px] resize-y"
              data-testid="input-description-improved"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAIRewrite}
                disabled={isRewriting || !currentValue.trim()}
                data-testid="button-ai-rewrite-description-improved"
              >
                {isRewriting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop mr-1.5" />
                ) : (
                  <IconWand2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                {isRewriting ? "Rewriting…" : "Improve with AI"}
              </Button>
              {currentValue.trim() && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange("descriptionImproved", null)}
                    className="text-muted-foreground"
                    data-testid="button-clear-description-improved"
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
                      data-testid="button-done-editing-description-improved"
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

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
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
              <div className="text-sm text-foreground/70 bg-muted/50 rounded-md p-3 max-h-[120px] overflow-y-auto whitespace-pre-wrap">
                {currentValue.trim()}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-primary mb-1.5 label-text">Improved</p>
              <div className="text-sm text-foreground bg-primary/5 border border-primary/15 rounded-md p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreview(null)}
              data-testid="button-dismiss-rewrite-improved"
            >
              Dismiss
            </Button>
            <Button size="sm" onClick={acceptRewrite} data-testid="button-accept-rewrite-improved">
              <IconCheck className="w-3.5 h-3.5 mr-1.5" />
              Accept Rewrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
