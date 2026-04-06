import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePanelManager } from "@/lib/panel-manager";
import { RebeccaContextCard } from "./RebeccaContextCard";
import { cn } from "@/lib/utils";
import {
  Send,
  X,
  Loader2,
  Sparkles,
  RotateCcw,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let msgCounter = 0;
function nextMsgId(role: string) {
  return `${role}-${Date.now()}-${++msgCounter}`;
}

const DEFAULT_CHIPS = [
  "What does research suggest?",
  "Compare to similar properties",
  "Explain the methodology",
];

interface RebeccaPanelProps {
  displayName?: string;
}

export function RebeccaPanel({ displayName = "Rebecca" }: RebeccaPanelProps) {
  const { activePanel, rebeccaContext, closeAll } = usePanelManager();
  const isOpen = activePanel === "rebecca";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const prevContextRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const contextKey = rebeccaContext
      ? `${rebeccaContext.entityType}-${rebeccaContext.entityId}-${rebeccaContext.fieldKey ?? ""}`
      : undefined;
    if (isOpen && contextKey && contextKey !== prevContextRef.current && messages.length === 0) {
      prevContextRef.current = contextKey;
      sendAutoGreeting();
    }
    if (!isOpen) {
      prevContextRef.current = undefined;
    }
  }, [isOpen, rebeccaContext]);

  const sendAutoGreeting = useCallback(async () => {
    if (!rebeccaContext?.entityType || !rebeccaContext?.entityId) return;
    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body: Record<string, unknown> = {
        message: rebeccaContext.fieldKey
          ? `What does research suggest for ${rebeccaContext.fieldName ?? rebeccaContext.fieldKey}?`
          : `Tell me about this ${rebeccaContext.entityType}.`,
        history: [],
        fieldContext: {
          entityType: rebeccaContext.entityType,
          entityId: rebeccaContext.entityId,
          fieldKey: rebeccaContext.fieldKey,
          scenarioId: rebeccaContext.scenarioId ?? null,
        },
      };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      const greeting = data.autoGreeting ?? data.response;
      setMessages([{
        id: nextMsgId("assistant"),
        role: "assistant",
        content: greeting,
      }]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, [rebeccaContext]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const trimmed = (text ?? input).trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = {
        id: nextMsgId("user"),
        role: "user",
        content: trimmed,
      };

      const currentMessages = [...messages, userMsg];
      const historyForApi = currentMessages
        .slice(-10)
        .map(({ role, content }) => ({ role, content }));

      setMessages(currentMessages);
      setInput("");
      setLoading(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          message: trimmed,
          history: historyForApi.slice(0, -1),
        };

        if (rebeccaContext?.entityType && rebeccaContext?.entityId) {
          body.fieldContext = {
            entityType: rebeccaContext.entityType,
            entityId: rebeccaContext.entityId,
            fieldKey: rebeccaContext.fieldKey,
            scenarioId: rebeccaContext.scenarioId ?? null,
          };
        }

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Failed to get response");
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId("assistant"),
            role: "assistant",
            content: data.response,
          },
        ]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId("assistant"),
            role: "assistant",
            content:
              "Sorry, I couldn't process your request. Please try again.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, rebeccaContext]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setInput("");
  };

  const chips =
    rebeccaContext?.fieldName
      ? [
          `What does research suggest for ${rebeccaContext.fieldName}?`,
          "How was this value determined?",
          "Compare to peer properties",
        ]
      : DEFAULT_CHIPS;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) closeAll(); }}>
      <SheetContent
        side="right"
        className="w-full sm:w-[520px] sm:max-w-[520px] p-0 flex flex-col overflow-hidden"
        data-testid="rebecca-panel"
      >
        <SheetHeader className="px-5 pt-4 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-semibold" data-testid="rebecca-panel-title">
                  {displayName}
                </SheetTitle>
                <SheetDescription className="text-[11px] mt-0">
                  Norfolk AI Analytics
                </SheetDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleClearChat}
                  title="Clear conversation"
                  data-testid="button-rebecca-clear"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => closeAll()}
                data-testid="button-rebecca-close"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {rebeccaContext && <RebeccaContextCard context={rebeccaContext} />}

        <div
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          data-testid="rebecca-chat-area"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3 py-8">
              <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center">
                <Sparkles className="w-6 h-6 opacity-30" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground/70">
                  {rebeccaContext?.fieldName
                    ? `Let's discuss ${rebeccaContext.fieldName}`
                    : "How can I help?"}
                </p>
                <p className="text-xs text-muted-foreground max-w-[280px]">
                  Ask about properties, financials, research methodology, or investment metrics.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center mt-1 max-w-[360px]">
                {chips.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(q)}
                    className="text-xs px-2.5 py-1 rounded-full h-auto"
                    data-testid={`button-rebecca-chip-${q.slice(0, 20).replace(/\s+/g, "-")}`}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
                data-testid={`rebecca-message-${msg.role}-${msg.id}`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border px-4 py-3 shrink-0">
          {messages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {chips.slice(0, 2).map((q) => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  onClick={() => sendMessage(q)}
                  className="text-[11px] px-2 py-0.5 rounded-full h-auto opacity-70 hover:opacity-100"
                  disabled={loading}
                  data-testid={`button-rebecca-followup-${q.slice(0, 15).replace(/\s+/g, "-")}`}
                >
                  {q}
                </Button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                rebeccaContext?.fieldName
                  ? `Ask about ${rebeccaContext.fieldName}...`
                  : "Ask about properties..."
              }
              rows={1}
              className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground resize-none min-h-[36px] max-h-[120px]"
              disabled={loading}
              data-testid="input-rebecca-message"
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              data-testid="button-rebecca-send"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
