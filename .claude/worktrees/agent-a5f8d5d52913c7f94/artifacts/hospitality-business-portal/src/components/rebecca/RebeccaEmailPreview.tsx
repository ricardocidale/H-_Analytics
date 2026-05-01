import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface RebeccaEmailPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: number | null;
  messages: ChatMessage[];
  entityName?: string;
  fieldName?: string;
}

export function RebeccaEmailPreview({
  open,
  onOpenChange,
  conversationId,
  messages,
  entityName,
  fieldName,
}: RebeccaEmailPreviewProps) {
  const { toast } = useToast();
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const subject = useMemo(() => {
    const parts = ["Rebecca AI Summary"];
    if (entityName) parts.push(`— ${entityName}`);
    if (fieldName) parts.push(`(${fieldName})`);
    return parts.join(" ");
  }, [entityName, fieldName]);

  const summary = useMemo(() => {
    return messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n\n");
  }, [messages]);

  const handleSend = async () => {
    if (!recipientEmail.trim() || !conversationId) return;
    setSending(true);
    try {
      const res = await fetch("/api/rebecca/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          recipientEmail: recipientEmail.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send email");
      }
      setSent(true);
      toast({ title: "Email sent", description: `Summary sent to ${recipientEmail}` });
      setTimeout(() => {
        onOpenChange(false);
        setSent(false);
        setRecipientEmail("");
      }, 1500);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-y-auto" data-testid="rebecca-email-dialog">
        <DialogHeader>
          <DialogTitle data-testid="text-email-preview-title">Email Conversation Summary</DialogTitle>
          <DialogDescription>Send a summary of this conversation via email.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="recipient-email">Recipient Email</Label>
            <Input
              id="recipient-email"
              type="email"
              placeholder="colleague@company.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={sending || sent}
              data-testid="input-email-recipient"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md" data-testid="text-email-subject">
              {subject}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Preview</Label>
            <div
              className="text-sm bg-muted/30 border border-border rounded-md px-4 py-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed"
              data-testid="text-email-preview-body"
            >
              {summary || "No assistant messages to summarize."}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={sending}
              data-testid="button-email-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={!recipientEmail.trim() || !conversationId || sending || sent || messages.length === 0}
              data-testid="button-email-send"
            >
              {sent ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Sent
                </>
              ) : sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1.5" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
