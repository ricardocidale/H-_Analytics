import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  { value: "incorrect", label: "Incorrect information" },
  { value: "unhelpful", label: "Unhelpful response" },
  { value: "missing_data", label: "Missing data" },
  { value: "other", label: "Other" },
] as const;

interface RebeccaFeedbackFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: number | null;
  entityType?: string;
  entityId?: number;
  fieldKey?: string;
}

export function RebeccaFeedbackForm({
  open,
  onOpenChange,
  conversationId,
  entityType,
  entityId,
  fieldKey,
}: RebeccaFeedbackFormProps) {
  const { toast } = useToast();
  const [category, setCategory] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!category || !conversationId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/rebecca/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          category,
          notes: notes.trim() || undefined,
          conversationContext: {
            entityType,
            entityId,
            fieldKey,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit feedback");
      }
      setSubmitted(true);
      toast({ title: "Feedback submitted", description: "Thank you for helping us improve Rebecca." });
      setTimeout(() => {
        onOpenChange(false);
        setSubmitted(false);
        setCategory("");
        setNotes("");
      }, 1500);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]" data-testid="rebecca-feedback-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-feedback-title">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Report an Issue
          </DialogTitle>
          <DialogDescription>Help us improve Rebecca's responses.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="feedback-category">Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={submitting || submitted}>
              <SelectTrigger id="feedback-category" data-testid="select-feedback-category">
                <SelectValue placeholder="Select issue type..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value} data-testid={`option-feedback-${c.value}`}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-notes">Details (optional)</Label>
            <Textarea
              id="feedback-notes"
              placeholder="What was wrong or could be improved?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting || submitted}
              rows={3}
              className="resize-none"
              data-testid="input-feedback-notes"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              data-testid="button-feedback-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!category || !conversationId || submitting || submitted}
              data-testid="button-feedback-submit"
            >
              {submitted ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Submitted
                </>
              ) : submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Feedback"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
