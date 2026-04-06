import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IconMessageCircle, IconClock } from "@/components/icons";
import { Search, ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Conversation {
  id: number;
  userId: number;
  propertyId: number | null;
  contextType: string;
  contextKey: string | null;
  model: string | null;
  startedAt: string;
  lastMessageAt: string;
}

interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ConversationRow({ conv }: { conv: Conversation }) {
  const [expanded, setExpanded] = useState(false);

  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["rebecca-messages", conv.id],
    queryFn: async () => {
      const res = await fetch(`/api/rebecca/conversations/${conv.id}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: expanded,
  });

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden" data-testid={`conversation-row-${conv.id}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        data-testid={`button-expand-conversation-${conv.id}`}
      >
        <div className="shrink-0 text-muted-foreground/60">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <IconMessageCircle className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {conv.contextType === "general" ? "General" : conv.contextType}
            </span>
            {conv.contextKey && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                {conv.contextKey}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">User #{conv.userId}</span>
            {conv.propertyId && (
              <span className="text-xs text-muted-foreground">Property #{conv.propertyId}</span>
            )}
            {conv.model && (
              <span className="text-xs text-muted-foreground/60">{conv.model}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{formatDate(conv.lastMessageAt)}</p>
          <p className="text-[10px] text-muted-foreground/60">{timeAgo(conv.lastMessageAt)}</p>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/30">
              {messagesLoading ? (
                <div className="space-y-2 pt-3">
                  <Skeleton className="h-12 w-3/4" />
                  <Skeleton className="h-12 w-2/3 ml-auto" />
                  <Skeleton className="h-12 w-3/4" />
                </div>
              ) : messages && messages.length > 0 ? (
                <div className="space-y-2 pt-3 max-h-[400px] overflow-y-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-lg px-3 py-2 max-w-[85%] text-xs",
                          msg.role === "user"
                            ? "bg-primary/10 text-foreground"
                            : "bg-muted/50 text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
                            {msg.role === "user" ? "User" : "Rebecca"}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 pt-3">No messages found.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function RebeccaConversationsTab() {
  const [search, setSearch] = useState("");

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["rebecca-conversations"],
    queryFn: async () => {
      const res = await fetch("/api/rebecca/conversations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const filtered = (conversations ?? []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.contextType.toLowerCase().includes(q) ||
      (c.contextKey ?? "").toLowerCase().includes(q) ||
      String(c.userId).includes(q) ||
      String(c.propertyId ?? "").includes(q)
    );
  });

  return (
    <Card className="bg-card border border-border/80 shadow-sm" data-testid="rebecca-conversations-tab">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <IconMessageCircle className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold text-foreground">Conversation Logs</CardTitle>
            <CardDescription className="label-text mt-0.5">
              Browse and inspect all Rebecca conversations across users.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs" data-testid="text-conversation-count">
            {conversations?.length ?? 0} total
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            placeholder="Search by context, user ID, or property..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/20 border-border/60"
            data-testid="input-search-conversations"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <IconClock className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {search ? "No conversations match your search." : "No conversations yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((conv) => (
              <ConversationRow key={conv.id} conv={conv} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
