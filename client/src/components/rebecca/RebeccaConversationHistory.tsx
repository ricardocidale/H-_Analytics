import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock, MessageCircle, ChevronLeft, Building2, Briefcase, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ConversationSummary {
  id: number;
  contextType: string;
  contextKey: string | null;
  propertyId: number | null;
  startedAt: string;
  lastMessageAt: string;
}

interface RebeccaConversationHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (conversationId: number) => void;
  currentConversationId: number | null;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function contextLabel(c: ConversationSummary): string {
  if (c.contextType === "field" && c.contextKey) {
    const parts = c.contextKey.split(":");
    const field = parts[2] ?? parts[1] ?? c.contextKey;
    return field.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim();
  }
  if (c.contextType === "property") return "Property discussion";
  if (c.contextType === "company") return "Company discussion";
  return "General chat";
}

function ContextIcon({ type }: { type: string }) {
  if (type === "property") return <Building2 className="w-3.5 h-3.5" />;
  if (type === "company") return <Briefcase className="w-3.5 h-3.5" />;
  if (type === "field") return <HelpCircle className="w-3.5 h-3.5" />;
  return <MessageCircle className="w-3.5 h-3.5" />;
}

export function RebeccaConversationHistory({
  isOpen,
  onClose,
  onSelect,
  currentConversationId,
}: RebeccaConversationHistoryProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/chat/conversations")
      .then(r => r.ok ? r.json() : [])
      .then(data => setConversations(data ?? []))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -300, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-0 z-10 bg-background flex flex-col"
          data-testid="rebecca-conversation-history"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              data-testid="button-history-back"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">Past Conversations</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Loading...
              </div>
            )}
            {!loading && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2 px-6">
                <MessageCircle className="w-8 h-8 opacity-30" />
                <p className="text-sm">No past conversations yet.</p>
                <p className="text-xs">Your chats with Rebecca will appear here.</p>
              </div>
            )}
            {!loading && conversations.map(c => (
              <button
                key={c.id}
                onClick={() => { onSelect(c.id); onClose(); }}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border/20 hover:bg-muted/50 transition-colors",
                  c.id === currentConversationId && "bg-primary/5 border-l-2 border-l-primary",
                )}
                data-testid={`button-conversation-${c.id}`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 text-muted-foreground">
                    <ContextIcon type={c.contextType} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {contextLabel(c)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatRelativeTime(c.lastMessageAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
