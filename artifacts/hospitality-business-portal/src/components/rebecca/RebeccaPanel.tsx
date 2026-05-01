import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { usePanelManager } from "@/lib/panel-manager";
import { RebeccaContextCard } from "./RebeccaContextCard";
import { RebeccaAvatar } from "./RebeccaAvatar";
import { RebeccaTypingIndicator } from "./RebeccaTypingIndicator";
import { RebeccaMarkdown } from "./RebeccaMarkdown";
import { RebeccaInsightBanner, useRebeccaInsightStore } from "./RebeccaInsightBanner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  X,
  RotateCcw,
  Mail,
  Flag,
  History,
  Zap,
  AlignLeft,
  BookOpen,
  ChevronRight,
  ChevronsLeft,
} from "lucide-react";
import { RebeccaEmailPreview } from "./RebeccaEmailPreview";
import { RebeccaFeedbackForm } from "./RebeccaFeedbackForm";
import { RebeccaConversationHistory } from "./RebeccaConversationHistory";
import { SourcesUsedPanel, type ChatSourceUsed } from "./SourcesUsedPanel";

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
  sources?: ChatSourceUsed[];
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
  } catch (e: unknown) { console.warn("Failed to read response mode from localStorage", e); }
  return "standard";
}

const DEFAULT_CHIPS = [
  "How are my properties performing?",
  "Tell me about the management company",
  "What scenarios should I consider?",
  "Explain a key metric",
];

interface RebeccaPanelProps {
  displayName?: string;
}

function derivePageLabel(pathname: string): string {
  if (pathname.startsWith("/property/") && pathname.endsWith("/edit")) return "property-edit";
  if (pathname.startsWith("/property/") && pathname.endsWith("/research")) return "property-research";
  if (pathname.startsWith("/property/") && pathname.endsWith("/photos")) return "property-photos";
  if (pathname.startsWith("/property/")) return "property-detail";
  if (pathname.startsWith("/scenarios")) return "scenario-comparison";
  if (pathname.startsWith("/company")) return "company-settings";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/icp")) return "icp-studio";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname === "/" || pathname === "/dashboard") return "dashboard";
  return "dashboard";
}

function parseObservationField(obs: string): { message: string; fieldKey?: string } | null {
  if (!obs || obs.length < 10) return null;

  let fieldKey: string | undefined;
  if (obs.toLowerCase().includes("f&b revenue share") || obs.toLowerCase().includes("f&b share")) {
    fieldKey = "revShareFB";
  } else if (obs.toLowerCase().includes("events share") || obs.toLowerCase().includes("event space")) {
    fieldKey = "revShareEvents";
  }

  return { message: obs, fieldKey };
}

export function RebeccaPanel({ displayName = "Rebecca" }: RebeccaPanelProps) {
  const { activePanel, rebeccaContext, closeAll, openRebecca } = usePanelManager();
  const isOpen = activePanel === "rebecca";
  const [location] = useLocation();
  const currentPage = rebeccaContext?.currentPage ?? derivePageLabel(location);
  const addInsight = useRebeccaInsightStore(s => s.addInsight);

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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // If any nested overlay (sub-sheet/dialog/popover) is open, let it handle Escape first
      const nested = document.querySelector(
        '[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"]'
      );
      if (nested) return;
      closeAll();
    };
    const onPointerDown = (e: PointerEvent) => {
      // On desktop (md+) the panel is a docked rail — don't close on outside click
      if (window.innerWidth >= 768) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current && panelRef.current.contains(target)) return;
      // Ignore clicks inside any portalled overlay (sub-sheets/dialogs/popovers)
      const el = target as HTMLElement;
      if (el.closest?.('[role="dialog"], [data-radix-popper-content-wrapper], [data-state="open"][data-side]')) return;
      closeAll();
    };
    document.addEventListener("keydown", onKey);
    // Outside-click to close only on mobile (desktop uses header button / collapse tab / Escape)
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen, closeAll]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
    return undefined;
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
          data.messages.map((m: { id: number; role: string; content: string; sources?: ChatSourceUsed[] }) => ({
            id: `db-${m.id}`,
            role: m.role as "user" | "assistant",
            content: m.content,
            ...(m.role === "assistant" ? { sources: Array.isArray(m.sources) ? m.sources : [] } : {}),
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

  const loadConversationRef = useRef(loadConversation);
  loadConversationRef.current = loadConversation;

  const prevContextRef = useRef<string | undefined>(undefined);
  const sendAutoGreetingRef = useRef<((id?: number | null) => Promise<void>) | null>(null);
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
        loadConversationRef.current(rebeccaContext.conversationId).then((loaded) => {
          if (!loaded) {
            sendAutoGreetingRef.current?.(null);
          }
        });
      } else {
        sendAutoGreetingRef.current?.(null);
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
        currentPage,
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
        sources: Array.isArray(data.sourcesUsed) ? data.sourcesUsed : [],
      }]);
      if (data.observations?.length) {
        for (const obs of data.observations as string[]) {
          const parsed = parseObservationField(obs);
          if (parsed) {
            const hash = `obs-${rebeccaContext?.entityId}-${parsed.fieldKey ?? obs.slice(0, 30)}`;
            addInsight({
              message: parsed.message,
              type: "observation",
              context: parsed.fieldKey
                ? `Tell me more about ${parsed.fieldKey === "revShareFB" ? "F&B revenue share" : "events revenue share"} for this property`
                : undefined,
            }, hash);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, [rebeccaContext, conversationId, responseMode, currentPage, addInsight]);
  sendAutoGreetingRef.current = sendAutoGreeting;

  const sendMessage = useCallback(
    async (text?: string) => {
      const trimmed = (text ?? input).trim();
      if (!trimmed || loading) return;
      setLoading(true);

      const userMsg: ChatMessage = {
        id: nextMsgId("user"),
        role: "user",
        content: trimmed,
      };

      const currentMessages = [...messages, userMsg];
      setMessages(currentMessages);
      setInput("");

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          message: trimmed,
          history: [],
          responseMode,
          currentPage,
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
            sources: Array.isArray(data.sourcesUsed) ? data.sourcesUsed : [],
          },
        ]);

        if (data.observations?.length) {
          for (const obs of data.observations as string[]) {
            const parsed = parseObservationField(obs);
            if (parsed) {
              const hash = `obs-${rebeccaContext?.entityId}-${parsed.fieldKey ?? obs.slice(0, 30)}`;
              addInsight({
                message: parsed.message,
                type: "observation",
                context: parsed.fieldKey
                  ? `Tell me more about ${parsed.fieldKey === "revShareFB" ? "F&B revenue share" : "events revenue share"} for this property`
                  : undefined,
              }, hash);
            }
          }
        }
      } catch (err: unknown) {
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
    [input, loading, messages, rebeccaContext, conversationId, responseMode, currentPage, addInsight]
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
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              className="fixed inset-0 z-[49] bg-black/40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden="true"
              onClick={() => closeAll()}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label={displayName}
              aria-modal="false"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={cn(
                "fixed z-[50] bg-background flex flex-col overflow-hidden",
                // Mobile: full-screen sheet from right
                "inset-0",
                // Desktop: docked right copilot rail — full height, flush to edge
                "md:left-auto md:top-0 md:right-0 md:bottom-0 md:w-[360px] md:h-svh md:border-l md:border-border",
              )}
              data-testid="rebecca-panel"
            >
              {/* Desktop collapse tab on the left edge */}
              <button
                onClick={() => closeAll()}
                className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-14 w-3 items-center justify-center rounded-l-md bg-border/70 hover:bg-muted-foreground/30 transition-colors cursor-pointer"
                aria-label="Close Rebecca panel"
              >
                <ChevronRight className="w-2.5 h-2.5 text-foreground/60" />
              </button>
        <div className="px-5 pt-4 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <RebeccaAvatar size="md" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold" data-testid="rebecca-panel-title">
                  {displayName}
                </h2>
                <p className="text-[11px] mt-0 text-muted-foreground">
                  Norfolk AI Analytics
                </p>
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
        </div>

        <div className="px-4 py-2 border-b border-border/30 shrink-0 flex items-center gap-1.5" data-testid="rebecca-mode-selector">
          <span className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wider mr-1">Mode</span>
          {RESPONSE_MODES.map((m) => {
            const Icon = m.icon;
            const active = responseMode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => {
                  setResponseMode(m.value);
                  try { localStorage.setItem("rebecca-response-mode", m.value); } catch (e: unknown) { console.warn("Failed to save response mode to localStorage", e); }
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted/60"
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
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground gap-3 pt-4 pb-2">
              <RebeccaAvatar size="lg" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground/80">
                  {rebeccaContext?.fieldName
                    ? `Let's discuss ${rebeccaContext.fieldName}`
                    : "How can I help?"}
                </p>
                <p className="text-xs text-muted-foreground max-w-[320px]">
                  Ask about properties, financials, research methodology, or investment metrics.
                </p>
              </div>
              <div className="flex flex-row flex-wrap gap-1.5 justify-center mt-1 max-w-full">
                {activeChips.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(q)}
                    className="text-xs px-2.5 py-1 rounded-full h-auto whitespace-nowrap"
                    data-testid={`button-rebecca-chip-${q.slice(0, 20).replace(/\s+/g, "-")}`}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
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
                <div className="flex flex-col items-start min-w-0">
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
                  {msg.role === "assistant" && msg.sources !== undefined && (
                    <SourcesUsedPanel sources={msg.sources} turnIndex={idx} />
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
                  className="text-[11px] px-2 py-0.5 rounded-full h-auto opacity-70 hover:opacity-100 whitespace-nowrap"
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
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pull-tab: visible only when the panel is closed */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="rebecca-pull-tab"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={() => openRebecca()}
            aria-label={`Open ${displayName}`}
            data-testid="button-rebecca-pull-tab"
            className="fixed right-0 top-[62%] -translate-y-1/2 z-[48] flex flex-col items-center justify-center gap-1.5 h-14 w-8 rounded-l-md border border-r-0 border-border bg-card text-muted-foreground shadow-md hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
            <span className="text-[9px] font-medium tracking-wide leading-none [writing-mode:vertical-rl] rotate-180 select-none">
              {displayName}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

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
    </>
  );
}
