import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePanelManager } from "@/lib/panel-manager";
import { RebeccaContextCard } from "./RebeccaContextCard";
import { RebeccaAvatar } from "./RebeccaAvatar";
import { RebeccaTypingIndicator } from "./RebeccaTypingIndicator";
import { RebeccaMarkdown } from "./RebeccaMarkdown";
import { RebeccaInsightBanner } from "./RebeccaInsightBanner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  X,
  Sparkles,
  RotateCcw,
  Mail,
  Flag,
  History,
  Zap,
  AlignLeft,
  BookOpen,
} from "lucide-react";
import { RebeccaEmailPreview } from "./RebeccaEmailPreview";
import { RebeccaFeedbackForm } from "./RebeccaFeedbackForm";
import { RebeccaConversationHistory } from "./RebeccaConversationHistory";

interface AssetMatch {
  type: "photo" | "logo";
  id: number;
  url: string;
  caption: string;
  propertyName?: string;
  propertyId?: number;
  isHero?: boolean;
  score: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  assets?: AssetMatch[];
  detectedLanguage?: string;
}


let msgCounter = 0;
function nextMsgId(role: string) {
  return `${role}-${Date.now()}-${++msgCounter}`;
}

type ResponseMode = "concise" | "standard" | "detailed";

const RESPONSE_MODES: { value: ResponseMode; label: string; icon: typeof Zap; tip: string }[] = [
  { value: "concise", label: "Concise", icon: Zap, tip: "Quick, to-the-point answers" },
  { value: "standard", label: "Standard", icon: AlignLeft, tip: "Balanced analysis" },
  { value: "detailed", label: "Detailed", icon: BookOpen, tip: "Deep-dive analysis" },
];

function getStoredMode(): ResponseMode {
  try {
    const v = localStorage.getItem("rebecca-response-mode");
    if (v === "concise" || v === "standard" || v === "detailed") return v;
  } catch (e) { console.warn("Failed to read response mode from localStorage", e); }
  return "standard";
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
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [suggestedChips, setSuggestedChips] = useState<string[]>([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>(getStoredMode);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadConversation = useCallback(async (convId: number) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages(
          data.messages.map((m: { id: number; role: string; content: string }) => ({
            id: `db-${m.id}`,
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        );
        setConversationId(convId);
        return true;
      }
    } catch {
      // ignore — will start fresh
    }
    return false;
  }, []);

  const prevContextRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const ctxKey = rebeccaContext
      ? `${rebeccaContext.entityType}-${rebeccaContext.entityId}-${rebeccaContext.fieldKey ?? ""}`
      : undefined;

    if (isOpen && ctxKey && ctxKey !== prevContextRef.current) {
      prevContextRef.current = ctxKey;
      setMessages([]);
      setConversationId(null);
      setSuggestedChips([]);

      if (rebeccaContext?.conversationId) {
        loadConversation(rebeccaContext.conversationId).then((loaded) => {
          if (!loaded) {
            sendAutoGreeting(null);
          }
        });
      } else {
        sendAutoGreeting(null);
      }
    }
    if (!isOpen) {
      prevContextRef.current = undefined;
    }
  }, [isOpen, rebeccaContext]);

  const sendAutoGreeting = useCallback(async (explicitConvId?: number | null) => {
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
        responseMode,
        fieldContext: {
          entityType: rebeccaContext.entityType,
          entityId: rebeccaContext.entityId,
          fieldKey: rebeccaContext.fieldKey,
          scenarioId: rebeccaContext.scenarioId ?? null,
        },
      };
      const convId = explicitConvId !== undefined ? explicitConvId : conversationId;
      if (convId) {
        body.conversationId = convId;
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);
      if (data.suggestedChips?.length) setSuggestedChips(data.suggestedChips);
      const greeting = data.autoGreeting ?? data.response;
      setMessages([{
        id: nextMsgId("assistant"),
        role: "assistant",
        content: greeting,
        assets: data.assets,
      }]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, [rebeccaContext, conversationId, responseMode]);

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
      setMessages(currentMessages);
      setInput("");
      setLoading(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          message: trimmed,
          history: [],
          responseMode,
        };

        if (forceNewRef.current) {
          body.newConversation = true;
          forceNewRef.current = false;
        } else if (conversationId) {
          body.conversationId = conversationId;
        }

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

        if (data.conversationId) setConversationId(data.conversationId);
        if (data.suggestedChips?.length) setSuggestedChips(data.suggestedChips);

        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId("assistant"),
            role: "assistant",
            content: data.response,
            assets: data.assets,
            detectedLanguage: data.detectedLanguage,
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
    [input, loading, messages, rebeccaContext, conversationId, responseMode]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSelectConversation = useCallback(async (convId: number) => {
    setMessages([]);
    setSuggestedChips([]);
    setHistoryOpen(false);
    prevContextRef.current = undefined;
    const loaded = await loadConversation(convId);
    if (!loaded) {
      setConversationId(convId);
    }
  }, [loadConversation]);

  const forceNewRef = useRef(false);
  const handleClearChat = () => {
    setMessages([]);
    setInput("");
    setConversationId(null);
    setSuggestedChips([]);
    forceNewRef.current = true;
  };

  const activeChips = suggestedChips.length > 0
    ? suggestedChips
    : rebeccaContext?.fieldName
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
        className="w-full sm:w-[520px] sm:max-w-[520px] p-0 flex flex-col overflow-hidden relative"
        data-testid="rebecca-panel"
      >
        <SheetHeader className="px-5 pt-4 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <RebeccaAvatar size="md" />
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setHistoryOpen(true)}
                title="Past conversations"
                aria-label="Past conversations"
                data-testid="button-rebecca-history"
              >
                <History className="w-3.5 h-3.5" />
              </Button>
              {messages.length > 0 && conversationId && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEmailOpen(true)}
                    title="Email summary"
                    aria-label="Email summary"
                    data-testid="button-rebecca-email"
                  >
                    <Mail className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setFeedbackOpen(true)}
                    title="Report issue"
                    aria-label="Report issue"
                    data-testid="button-rebecca-feedback"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleClearChat}
                  title="New conversation"
                  aria-label="New conversation"
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
                aria-label="Close Rebecca"
                data-testid="button-rebecca-close"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 py-2 border-b border-border/30 shrink-0 flex items-center gap-1.5" data-testid="rebecca-mode-selector">
          <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mr-1">Mode</span>
          {RESPONSE_MODES.map((m) => {
            const Icon = m.icon;
            const active = responseMode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => {
                  setResponseMode(m.value);
                  try { localStorage.setItem("rebecca-response-mode", m.value); } catch (e) { console.warn("Failed to save response mode to localStorage", e); }
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40"
                )}
                title={m.tip}
                data-testid={`button-mode-${m.value}`}
              >
                <Icon className="w-3 h-3" />
                {m.label}
              </button>
            );
          })}
        </div>

        {rebeccaContext && <RebeccaContextCard context={rebeccaContext} />}

        <div
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          data-testid="rebecca-chat-area"
        >
          <RebeccaInsightBanner
            onAskRebecca={(q) => sendMessage(q)}
            className="mb-1"
          />
          {messages.length === 0 && !loading && (
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
                {activeChips.map((q) => (
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

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className={cn(
                  "flex gap-2",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && <RebeccaAvatar size="sm" className="mt-1" />}
                <div
                  className={cn(
                    "max-w-[82%] rounded-lg px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap"
                      : "bg-muted text-foreground rounded-tl-sm"
                  )}
                  data-testid={`rebecca-message-${msg.role}-${msg.id}`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      {msg.detectedLanguage === "es" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400 px-1.5 py-0.5 rounded mb-1 w-fit" data-testid="language-badge-es">
                          ES
                        </span>
                      )}
                      <RebeccaMarkdown content={msg.content} assets={msg.assets} locale={msg.detectedLanguage === "es" ? "es" : "en"} />
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && <RebeccaTypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border px-4 py-3 shrink-0">
          {messages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {activeChips.slice(0, 3).map((q) => (
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
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <RebeccaConversationHistory
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onSelect={handleSelectConversation}
          currentConversationId={conversationId}
        />
      </SheetContent>

      <RebeccaEmailPreview
        open={emailOpen}
        onOpenChange={setEmailOpen}
        conversationId={conversationId}
        messages={messages}
        entityName={rebeccaContext?.entityName}
        fieldName={rebeccaContext?.fieldName}
      />

      <RebeccaFeedbackForm
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        conversationId={conversationId}
        entityType={rebeccaContext?.entityType}
        entityId={rebeccaContext?.entityId}
        fieldKey={rebeccaContext?.fieldKey}
      />
    </Sheet>
  );
}
