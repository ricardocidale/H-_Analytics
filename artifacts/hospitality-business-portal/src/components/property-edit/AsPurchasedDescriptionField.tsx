/**
 * AsPurchasedDescriptionField.tsx — Inline freeform description for the
 * "As Purchased" subsection of the Property Assumptions page.
 *
 * Bound primarily to `descriptionPurchased`; dual-writes the legacy
 * `description` column so existing consumers (ICP analysis, Rebecca,
 * slide factory, report export) continue to read current text.
 *
 * Extracted from BasicInfoSection.tsx (Plan 2026-05-13-002 U4) — the
 * 167-line helper exceeded the 60-line extract threshold and was
 * blocking readability of the parent file.
 */
import { useState, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
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

interface DescriptionFieldProps {
  draft: PropertyEditSectionProps["draft"];
  onChange: PropertyEditSectionProps["onChange"];
}

export default function AsPurchasedDescriptionField({ draft, onChange }: DescriptionFieldProps) {
  const [isRewriting, setIsRewriting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // Use descriptionPurchased as the primary field; fall back to legacy description for seeding
  const currentValue = draft.descriptionPurchased ?? draft.description ?? "";
  const [isEditing, setIsEditing] = useState(!currentValue);
  const { toast } = useToast();

  // Dual-write: keeps legacy `description` in sync so all existing consumers
  // (ICP analysis, Rebecca, slide factory, report export) continue to read current text.
  const onDescChange = useCallback((value: string | null) => {
    onChange("descriptionPurchased", value);
    onChange("description", value);
  }, [onChange]);

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
      const data = await res.json();
      if (data.rewritten) setPreview(data.rewritten);
    } catch {
      toast({ title: "Error", description: "Failed to rewrite description. Please try again.", variant: "destructive" });
    } finally {
      setIsRewriting(false);
    }
  };

  const acceptRewrite = () => {
    if (preview) {
      onDescChange(preview);
      toast({ title: "Description improved", description: "AI rewrite has been applied." });
    }
    setPreview(null);
  };

  return (
    <>
      <div className="sm:col-span-2 space-y-2">
        <Label className="label-text text-foreground flex items-center gap-1.5">
          Description
          <InfoTooltip text="A narrative description of the property as acquired. Used in reports, exports, and as context for AI research. Describe the property's unique features, target market, and investment appeal." />
        </Label>

        {hasSavedDescription && !isEditing ? (
          <div className="space-y-2">
            <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="card-saved-description">
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="text-saved-description">
                {currentValue}
              </p>
            </div>
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
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={currentValue}
              onChange={(e) => onDescChange(e.target.value || null)}
              placeholder="Describe this property — its setting, unique features, target guests, and what makes it an attractive investment..."
              className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground min-h-[100px] resize-y"
              data-testid="input-property-description"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAIRewrite}
                disabled={isRewriting || !currentValue.trim()}
                data-testid="button-ai-rewrite-description"
              >
                {isRewriting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop mr-1.5" />
                ) : (
                  <IconWand2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                {isRewriting ? "Rewriting..." : "Improve with AI"}
              </Button>
              {currentValue.trim() && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDescChange(null)}
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
              <div className="text-sm text-foreground/70 bg-muted/50 rounded-md p-3 max-h-[120px] overflow-y-auto whitespace-pre-wrap" data-testid="text-original-description">
                {currentValue.trim()}
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
            <Button variant="outline" size="sm" onClick={() => setPreview(null)} data-testid="button-dismiss-rewrite">
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
