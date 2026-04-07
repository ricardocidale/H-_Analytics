import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, X, Loader2 } from "@/components/icons/themed-icons";
import { IconMessageCircle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";

interface AssetMatch {
  type: "photo" | "logo";
  id: number;
  url: string;
  caption: string;
  propertyName?: string;
  isHero?: boolean;
  score: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  assets?: AssetMatch[];
}

function RichContent({ content, assets }: { content: string; assets?: AssetMatch[] }) {
  const parts = useMemo(() => {
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const segments: Array<{ type: "text"; value: string } | { type: "image"; alt: string; src: string }> = [];
    let lastIndex = 0;
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
      }
      segments.push({ type: "image", alt: match[1], src: match[2] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      segments.push({ type: "text", value: content.slice(lastIndex) });
    }
    return segments;
  }, [content]);

  const hasInline = parts.some(p => p.type === "image");
  const extra = assets?.filter(a => !hasInline || !parts.some(p => p.type === "image" && (p as any).src === a.url)) ?? [];

  return (
    <div className="space-y-1.5">
      {parts.map((part, i) =>
        part.type === "text" ? (
          part.value ? <span key={i}>{part.value}</span> : null
        ) : (
          <div key={i} className="mt-1.5 rounded-md overflow-hidden border border-border/50">
            <img src={part.src} alt={part.alt} className="w-full max-h-36 object-cover" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              data-testid={`img-chat-inline-${i}`} />
            {part.alt && <div className="px-1.5 py-0.5 text-[9px] text-muted-foreground flex items-center gap-1"><ImageIcon className="w-2.5 h-2.5" />{part.alt}</div>}
          </div>
        )
      )}
      {extra.length > 0 && (
        <div className="grid grid-cols-2 gap-1 mt-1.5">
          {extra.map(a => (
            <div key={`${a.type}-${a.id}`} className="rounded-md overflow-hidden border border-border/50">
              <img src={a.url} alt={a.caption} className="w-full h-20 object-cover" loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                data-testid={`img-chat-asset-${a.type}-${a.id}`} />
              <div className="px-1.5 py-0.5 text-[9px] text-muted-foreground truncate">{a.caption}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

let msgCounter = 0;
function nextMsgId(role: string) {
  return `${role}-${Date.now()}-${++msgCounter}`;
}

interface RebeccaChatbotProps {
  /** Optional override for the display name (from admin config) */
  displayName?: string;
}

export function RebeccaChatbot({ displayName = "Rebecca" }: RebeccaChatbotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: nextMsgId("user"), role: "user", content: trimmed };

    // Build history from current messages BEFORE updating state (avoids race condition)
    const currentMessages = [...messages, userMsg];
    const historyForApi = currentMessages.slice(-10).map(({ role, content }) => ({ role, content }));

    setMessages(currentMessages);
    setInput("");
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: historyForApi.slice(0, -1), // exclude the current message (sent separately)
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      setMessages((prev) => [...prev, { id: nextMsgId("assistant"), role: "assistant", content: data.response, assets: data.assets }]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        { id: nextMsgId("assistant"), role: "assistant", content: "Sorry, I couldn't process your request. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 relative"
        data-testid="button-chatbot-toggle"
        title={displayName}
      >
        <IconMessageCircle className="w-4 h-4" />
        {messages.length > 0 && !open && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
        )}
      </Button>

      {open && (
        <div
          className="fixed bottom-4 right-4 z-[9999] w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-6rem)] flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          data-testid="panel-chatbot"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2">
              <IconMessageCircle className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">{displayName}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Norfolk AI</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              data-testid="button-chatbot-close"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
                <IconMessageCircle className="w-8 h-8 opacity-40" />
                <p className="text-sm">Ask me about your properties, financials, or investment metrics.</p>
                <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                  {["What's the portfolio NOI?", "Compare properties by RevPAR", "Which property has the best margins?"].map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      onClick={() => { setInput(q); }}
                      className="text-xs px-2.5 py-1 rounded-full h-auto"
                      data-testid={`button-suggestion-${q.slice(0, 20).replace(/\s+/g, "-")}`}
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
                  data-testid={`message-${msg.role}-${msg.id}`}
                >
                  {msg.role === "assistant" ? (
                    <RichContent content={msg.content} assets={msg.assets} />
                  ) : (
                    msg.content
                  )}
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

          <div className="border-t border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask about properties..."
                className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                disabled={loading}
                data-testid="input-chat-message"
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                data-testid="button-send-message"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
