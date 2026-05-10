import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { usePanelManager, isRebeccaRailVisible } from "@/lib/panel-manager";
import { RebeccaContextCard } from "./RebeccaContextCard";
import { RebeccaAvatar } from "./RebeccaAvatar";
import { RebeccaTypingIndicator } from "./RebeccaTypingIndicator";
import { RebeccaMarkdown } from "./RebeccaMarkdown";
import { RebeccaInsightBanner, useRebeccaInsightStore } from "./RebeccaInsightBanner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { IconHistory, IconZap, IconBookOpen } from "@/components/icons";
import {
  ArrowUp,
  PanelRightClose,
  SquarePen,
  Mail,
  Flag,
  Gear,
  MoreVertical,
  Check,

  AlignLeft,
  ChevronRight,
  ChevronLeft,
} from "@/components/icons/themed-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RebeccaEmailPreview } from "./RebeccaEmailPreview";
import { RebeccaFeedbackForm } from "./RebeccaFeedbackForm";
import { RebeccaConversationHistory } from "./RebeccaConversationHistory";
import { SourcesUsedPanel, type ChatSourceUsed } from "./SourcesUsedPanel";
import { ToolCallStepIndicator, type ToolStep } from "./ToolCallStepIndicator";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

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
  toolSteps?: ToolStep[];
}


let msgCounter = 0;
function nextMsgId(role: string) {
  return `${role}-${Date.now()}-${++msgCounter}`;
}

type ResponseMode = "concise" | "standard" | "detailed";

const RESPONSE_MODES: { value: ResponseMode; label: string; icon: React.ElementType; tip: string }[] = [
  { value: "concise", label: "Concise", icon: IconZap, tip: "Quick, to-the-point answers" },
  { value: "standard", label: "Standard", icon: AlignLeft, tip: "Balanced analysis" },
  { value: "detailed", label: "Detailed", icon: IconBookOpen, tip: "Deep-dive analysis" },
];

function getStoredMode(): ResponseMode {
  try {
    const v = localStorage.getItem("rebecca-response-mode");
    if (v === "concise" || v === "standard" || v === "detailed") return v;
  } catch (e: unknown) { console.warn("Failed to read response mode from localStorage", e); }
  return "standard";
}

function getStoredShowTiming(): boolean {
  try {
    return localStorage.getItem("rebecca-show-tool-timing") !== "false";
  } catch (e: unknown) {
    console.warn("Failed to read show-timing pref from localStorage", e);
    return true;
  }
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

function syncChatPrefsToServer(prefs: { rebeccaResponseMode?: string; rebeccaShowToolTiming?: boolean; rebeccaHistoryOpen?: boolean; rebeccaSuggestedChips?: string[] }) {
  fetch("/api/profile/chat-preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(prefs),
  }).then((res) => {
    if (!res.ok) {
      console.warn("[Rebecca] Chat preferences PATCH rejected by server:", res.status, Object.keys(prefs).join(", "));
    }
  }).catch((err: unknown) => {
    console.warn("[Rebecca] Failed to sync chat preferences to server:", err);
  });
}

const BACKGROUND_TOOL_LABELS: Record<string, string> = {
  trigger_iris_health_check: "Iris health check",
  trigger_iris_reindex: "Iris reindex",
  clear_iris_gaps: "Iris gap queue clear",
  regenerate_data_source: "Data source regeneration",
};

export function RebeccaPanel({ displayName = "Rebecca" }: RebeccaPanelProps) {
  const { rebeccaContext, closeRebecca, openRebecca } = usePanelManager();
  const isOpen = usePanelManager(isRebeccaRailVisible);
  const [location] = useLocation();
  const currentPage = rebeccaContext?.currentPage ?? derivePageLabel(location);
  const addInsight = useRebeccaInsightStore(s => s.addInsight);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [suggestedChips, setSuggestedChips] = useState<string[]>([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>(getStoredMode);
  const [showTiming, setShowTiming] = useState<boolean>(getStoredShowTiming);
  const serverPrefsAppliedForUserId = useRef<number | null>(null);
  const historyOpenInitializedRef = useRef(false);
  const suggestedChipsInitializedRef = useRef(false);

  useEffect(() => {
    if (!user || serverPrefsAppliedForUserId.current === user.id) return;
    // Reset per-user guards so stale state from a previous user never leaks
    historyOpenInitializedRef.current = false;
    suggestedChipsInitializedRef.current = false;
    serverPrefsAppliedForUserId.current = user.id;

    const backfill: { rebeccaResponseMode?: string; rebeccaShowToolTiming?: boolean; rebeccaHistoryOpen?: boolean } = {};

    const serverMode = user.rebeccaResponseMode;
    if (serverMode === "concise" || serverMode === "standard" || serverMode === "detailed") {
      setResponseMode(serverMode);
      try { localStorage.setItem("rebecca-response-mode", serverMode); } catch (e: unknown) { console.warn("Failed to persist response-mode to localStorage", e); }
    } else {
      const localMode = getStoredMode();
      if (localMode !== "standard") backfill.rebeccaResponseMode = localMode;
    }

    if (user.rebeccaShowToolTiming !== null && user.rebeccaShowToolTiming !== undefined) {
      setShowTiming(user.rebeccaShowToolTiming);
      try { localStorage.setItem("rebecca-show-tool-timing", String(user.rebeccaShowToolTiming)); } catch (e: unknown) { console.warn("Failed to persist show-tool-timing to localStorage", e); }
    } else {
      const localTiming = getStoredShowTiming();
      if (!localTiming) backfill.rebeccaShowToolTiming = localTiming;
    }

    if (user.rebeccaHistoryOpen !== null && user.rebeccaHistoryOpen !== undefined) {
      setHistoryOpen(user.rebeccaHistoryOpen);
    }

    if (Array.isArray(user.rebeccaSuggestedChips) && user.rebeccaSuggestedChips.length > 0) {
      setSuggestedChips(user.rebeccaSuggestedChips);
    }

    if (Object.keys(backfill).length > 0) {
      syncChatPrefsToServer(backfill);
    }
  }, [user]);

  useEffect(() => {
    // Only sync after the initial server value has been applied — skip the
    // first render and the server-load pass to avoid a redundant write.
    if (!user || serverPrefsAppliedForUserId.current !== user.id) return;
    if (!historyOpenInitializedRef.current) {
      historyOpenInitializedRef.current = true;
      return;
    }
    syncChatPrefsToServer({ rebeccaHistoryOpen: historyOpen });
  }, [historyOpen, user]);

  useEffect(() => {
    // Sync the latest AI-generated chips to the server so they roam across
    // devices. Empty arrays are skipped — they indicate a cleared/reset state
    // and should not overwrite the last meaningful chip set.
    if (!user || serverPrefsAppliedForUserId.current !== user.id) return;
    if (!suggestedChipsInitializedRef.current) {
      suggestedChipsInitializedRef.current = true;
      return;
    }
    if (suggestedChips.length === 0) return;
    syncChatPrefsToServer({ rebeccaSuggestedChips: suggestedChips });
  }, [suggestedChips, user]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const postAbortSendRef = useRef<string | null>(null);
  /** Maps tool-call id → Date.now() recorded when tool_start fires. */
  const toolStartTimesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // If any nested overlay (sub-sheet/dialog/popover) is open, let it handle Escape first
      const nested = document.querySelector(
        '[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"]'
      );
      if (nested) return;
      closeRebecca();
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
      closeRebecca();
    };
    document.addEventListener("keydown", onKey);
    // Outside-click to close only on mobile (desktop uses header button / collapse tab / Escape)
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen, closeRebecca]);

  // Mobile focus trap + focus restoration. The mobile sheet behaves modally
  // (covers the page with a backdrop), so we trap Tab/Shift+Tab within the
  // panel and restore focus to the previously-focused element on close.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = (): HTMLElement[] => {
      const root = panelRef.current;
      if (!root) return [];
      const nodes = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      return Array.from(nodes).filter((el) => el.offsetParent !== null || el === document.activeElement);
    };

    const onTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = getFocusable();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onTrap);
    return () => {
      document.removeEventListener("keydown", onTrap);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    };
  }, [isOpen]);

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
    } catch (e: unknown) {
      console.warn("Failed to restore conversation — starting fresh", e);
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
      if (Array.isArray(data.dataChanged)) {
        for (const entry of data.dataChanged as Array<{ entityType: string; entityId: number }>) {
          if (entry.entityType === "property") {
            queryClient.invalidateQueries({ queryKey: ["properties"] });
            queryClient.invalidateQueries({ queryKey: ["properties", entry.entityId] });
          } else if (entry.entityType === "scenario") {
            queryClient.invalidateQueries({ queryKey: ["scenarios"] });
          } else if (entry.entityType === "analyst_table") {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/analyst-tables"] });
          } else if (entry.entityType === "lb_deck_config") {
            queryClient.invalidateQueries({ queryKey: ["lb-slides-config"] });
          } else if (entry.entityType === "kb_entry") {
            queryClient.invalidateQueries({ queryKey: ["/api/rebecca/kb"] });
            queryClient.invalidateQueries({ queryKey: ["kb-entry", entry.entityId] });
          } else if (entry.entityType === "global_assumptions") {
            queryClient.invalidateQueries({ queryKey: ["/api/global-assumptions"] });
          } else if (entry.entityType === "research_job") {
            queryClient.invalidateQueries({ queryKey: ["properties"] });
          } else if (entry.entityType === "iris_run") {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/iris/status"] });
          } else if (entry.entityType === "iris_gap") {
            // no specific list query to invalidate in current UI — no-op
          } else if (entry.entityType === "slide_factory_run") {
            queryClient.invalidateQueries({ queryKey: ["/api/lb-slides/factory/runs"] });
          } else if (entry.entityType === "data_source") {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources"] });
          } else if (entry.entityType === "compliance_run") {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/violations"] });
          } else if (entry.entityType === "company") {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
          } else if (entry.entityType === "market_rate") {
            queryClient.invalidateQueries({ queryKey: ["/api/market-rates"] });
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, [rebeccaContext, conversationId, responseMode, currentPage, addInsight, queryClient]);
  sendAutoGreetingRef.current = sendAutoGreeting;

  const sendMessage = useCallback(
    async (text?: string) => {
      const trimmed = (text ?? input).trim();
      if (!trimmed || loading) return;

      // /help and /tools: client-side capability summary — no server round-trip
      if (trimmed === "/help" || trimmed === "/tools") {
        const helpId = nextMsgId("assistant");
        const helpText = `**Rebecca's capabilities** — ask me anything from this list:

**Portfolio & Scenarios**
Read, create, update, delete properties and scenarios. Compare two scenarios side-by-side. Share a scenario with another user by email. Lock a scenario to prevent edits.

**Research & Analysis**
Trigger property research to generate market estimates. Read analyst tables (capital raise benchmarks, exit multiples, reference brands) and request a refresh.

**Photos & Deck**
Delete a property photo. Set a property's hero image. Configure and render the LB investor deck PDF.

**Knowledge Base** *(admin)*
List, read, create, update, and delete knowledge base entries.

**Market Rates** *(admin)*
Read current market rates. Override a rate with an admin value.

**Admin Tools** *(admin)*
Read and update global assumptions. Update company records. Run a Vito compliance audit. Trigger Iris health check or full reindex.

**Slide Factory** *(admin)*
Create runs, assign properties, review Lucca drafts, trigger Marco builds, and produce the final deck PDF.

Type your request naturally — you don't need to use tool names directly.`;
        setMessages((prev) => [
          ...prev,
          { id: nextMsgId("user"), role: "user" as const, content: trimmed },
          { id: helpId, role: "assistant" as const, content: helpText },
        ]);
        setInput("");
        return;
      }

      // If a stream is active, queue this message and show the interrupt banner
      if (isStreaming) {
        pendingMessageRef.current = trimmed;
        setPendingMessage(trimmed);
        setInput("");
        return;
      }

      setLoading(true);
      setIsStreaming(true);

      const userMsg: ChatMessage = { id: nextMsgId("user"), role: "user", content: trimmed };
      const streamId = nextMsgId("assistant");
      streamingIdRef.current = streamId;

      setMessages((prev) => [...prev, userMsg, { id: streamId, role: "assistant", content: "" }]);
      setInput("");

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const body: Record<string, unknown> = {
        message: trimmed,
        history: [],
        responseMode,
        currentPage,
        stream: true,
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

      async function runStream(retryCount = 0): Promise<void> {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) throw new Error("Failed to get response");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              let data: Record<string, unknown>;
              try { data = JSON.parse(line.slice(6)); } catch { continue; }

              if (currentEvent === "delta") {
                const token = typeof data.token === "string" ? data.token : "";
                if (token) {
                  setMessages((prev) => prev.map((m) =>
                    m.id === streamId ? { ...m, content: m.content + token } : m
                  ));
                }
              } else if (currentEvent === "done") {
                if (data.conversationId) setConversationId(data.conversationId as number);
                if (Array.isArray(data.suggestedChips) && data.suggestedChips.length) {
                  setSuggestedChips(data.suggestedChips as string[]);
                }
                setMessages((prev) => prev.map((m) =>
                  m.id === streamId ? {
                    ...m,
                    content: (data.response as string) ?? m.content,
                    assets: data.assets as AssetMatch[] | undefined,
                    detectedLanguage: data.detectedLanguage as string | undefined,
                    sources: Array.isArray(data.sourcesUsed) ? data.sourcesUsed as ChatSourceUsed[] : [],
                  } : m
                ));
                if (Array.isArray(data.observations)) {
                  for (const obs of data.observations as string[]) {
                    const parsed = parseObservationField(obs);
                    if (parsed) {
                      const hash = `obs-${rebeccaContext?.entityId}-${parsed.fieldKey ?? obs.slice(0, 30)}`;
                      addInsight({ message: parsed.message, type: "observation", context: parsed.fieldKey ? `Tell me more about ${parsed.fieldKey === "revShareFB" ? "F&B revenue share" : "events revenue share"} for this property` : undefined }, hash);
                    }
                  }
                }
                if (Array.isArray(data.dataChanged)) {
                  for (const entry of data.dataChanged as Array<{ entityType: string; entityId: number }>) {
                    if (entry.entityType === "property") {
                      queryClient.invalidateQueries({ queryKey: ["properties"] });
                      queryClient.invalidateQueries({ queryKey: ["properties", entry.entityId] });
                    } else if (entry.entityType === "scenario") {
                      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
                    } else if (entry.entityType === "analyst_table") {
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/analyst-tables"] });
                    } else if (entry.entityType === "lb_deck_config") {
                      queryClient.invalidateQueries({ queryKey: ["lb-slides-config"] });
                    } else if (entry.entityType === "kb_entry") {
                      queryClient.invalidateQueries({ queryKey: ["/api/rebecca/kb"] });
                      queryClient.invalidateQueries({ queryKey: ["kb-entry", entry.entityId] });
                    } else if (entry.entityType === "global_assumptions") {
                      queryClient.invalidateQueries({ queryKey: ["/api/global-assumptions"] });
                    } else if (entry.entityType === "research_job") {
                      queryClient.invalidateQueries({ queryKey: ["properties"] });
                    } else if (entry.entityType === "iris_run") {
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/iris/status"] });
                    } else if (entry.entityType === "iris_gap") {
                      // no specific list query to invalidate in current UI — no-op
                    } else if (entry.entityType === "slide_factory_run") {
                      queryClient.invalidateQueries({ queryKey: ["/api/lb-slides/factory/runs"] });
                    } else if (entry.entityType === "data_source") {
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources"] });
                    } else if (entry.entityType === "compliance_run") {
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/violations"] });
                    } else if (entry.entityType === "company") {
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
                    } else if (entry.entityType === "market_rate") {
                      queryClient.invalidateQueries({ queryKey: ["/api/market-rates"] });
                    }
                  }
                }
              } else if (currentEvent === "tool_start") {
                const stepId = typeof data.id === "string" ? data.id : String(data.id);
                const stepName = typeof data.name === "string" ? data.name : "";
                toolStartTimesRef.current.set(stepId, Date.now());
                const newStep: ToolStep = { id: stepId, name: stepName, phase: "dispatching" };
                setMessages((prev) => prev.map((m) =>
                  m.id === streamId
                    ? { ...m, toolSteps: [...(m.toolSteps ?? []), newStep] }
                    : m
                ));
              } else if (currentEvent === "tool_done") {
                const doneId = typeof data.id === "string" ? data.id : String(data.id);
                const success = data.success !== false;
                const toolName = typeof data.name === "string" ? data.name : "";
                const startedAt = toolStartTimesRef.current.get(doneId);
                const elapsedMs = startedAt != null ? Date.now() - startedAt : undefined;
                toolStartTimesRef.current.delete(doneId);
                setMessages((prev) => prev.map((m) =>
                  m.id === streamId
                    ? {
                        ...m,
                        toolSteps: (m.toolSteps ?? []).map((s) =>
                          s.id === doneId
                            ? { ...s, phase: success ? "complete" : "error", elapsedMs }
                            : s
                        ),
                      }
                    : m
                ));
                if (BACKGROUND_TOOL_LABELS[toolName]) {
                  const label = BACKGROUND_TOOL_LABELS[toolName];
                  const runId = typeof data.runId === "number" ? data.runId : undefined;
                  toast({
                    title: success ? `${label} started` : `${label} failed`,
                    description: runId ? `Run #${runId}` : undefined,
                    variant: success ? "default" : "destructive",
                    duration: 4000,
                  });
                }
              } else if (currentEvent === "error") {
                if (retryCount === 0) {
                  setMessages((prev) => prev.map((m) =>
                    m.id === streamId ? { ...m, content: "Let me try that again…" } : m
                  ));
                  await new Promise((r) => setTimeout(r, 600));
                  toolStartTimesRef.current.clear();
                  setMessages((prev) => prev.map((m) =>
                    m.id === streamId ? { ...m, content: "", toolSteps: [] } : m
                  ));
                  await runStream(1);
                } else {
                  setMessages((prev) => prev.map((m) =>
                    m.id === streamId ? { ...m, content: "I wasn't able to complete that response. You might want to try rephrasing your question." } : m
                  ));
                }
              }
              currentEvent = "";
            }
          }
        }
      }

      try {
        await runStream();
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Intentional abort — remove the empty streaming stub; transition any
          // in-flight tool steps to error so dispatching orbs don't spin forever.
          toolStartTimesRef.current.clear();
          setMessages((prev) => prev.filter((m) => m.id !== streamId || m.content.length > 0).map((m) =>
            m.id === streamId
              ? { ...m, toolSteps: (m.toolSteps ?? []).map((s) => s.phase === "dispatching" ? { ...s, phase: "error" as const } : s) }
              : m
          ));
        } else {
          setMessages((prev) => prev.map((m) =>
            m.id === streamId ? { ...m, content: "Sorry, I couldn't process your request. Please try again." } : m
          ));
        }
      } finally {
        toolStartTimesRef.current.clear();
        setIsStreaming(false);
        setLoading(false);
        streamingIdRef.current = null;

        // Auto-send queued message (either from "let her finish" or post-abort "move on")
        const postAbort = postAbortSendRef.current;
        postAbortSendRef.current = null;
        const pending = pendingMessageRef.current;
        pendingMessageRef.current = null;
        setPendingMessage(null);
        const toSend = postAbort ?? pending;
        if (toSend) setTimeout(() => sendMessage(toSend), 0);
      }
    },
    [input, loading, isStreaming, messages, rebeccaContext, conversationId, responseMode, currentPage, addInsight]
  );

  const handleMoveOn = useCallback(() => {
    const pending = pendingMessageRef.current;
    pendingMessageRef.current = null;
    setPendingMessage(null);
    postAbortSendRef.current = pending;
    abortRef.current?.abort();
  }, []);

  const handleLetFinish = useCallback(() => {
    // Message stays queued in pendingMessageRef — will auto-send when stream completes
    setPendingMessage(null);
  }, []);

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
              onClick={() => closeRebecca()}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label={displayName}
              aria-modal={typeof window !== "undefined" && window.innerWidth < 768 ? "true" : "false"}
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
              {/* Desktop collapse tab on the left edge of the open panel */}
              <button
                onClick={() => closeRebecca()}
                className="hidden md:flex absolute -left-7 top-1/2 -translate-y-1/2 z-10 h-16 w-7 items-center justify-center rounded-l-md bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Collapse Rebecca panel"
                data-testid="button-rebecca-collapse-tab"
                title="Collapse"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
        <div className="px-4 pt-3.5 pb-3 border-b border-border/40 shrink-0 bg-primary/[0.04]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <RebeccaAvatar size="lg" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold leading-tight" data-testid="rebecca-panel-title">
                  {displayName}
                </h2>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  AI Analytics Assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Overflow: history, email summary, report issue */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="More options"
                    data-testid="button-rebecca-overflow"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => setHistoryOpen(true)}
                    data-testid="button-rebecca-history"
                  >
                    <IconHistory className="w-4 h-4" />
                    Conversation history
                  </DropdownMenuItem>
                  {messages.length > 0 && conversationId && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setEmailOpen(true)}
                        data-testid="button-rebecca-email"
                      >
                        <Mail className="w-4 h-4" />
                        Email summary
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setFeedbackOpen(true)}
                        data-testid="button-rebecca-feedback"
                      >
                        <Flag className="w-4 h-4" />
                        Report an issue
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* New conversation */}
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleClearChat}
                  title="Start new conversation"
                  aria-label="Start new conversation"
                  data-testid="button-rebecca-clear"
                >
                  <SquarePen className="w-3.5 h-3.5" />
                </Button>
              )}

              {/* Collapse panel */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => closeRebecca()}
                title="Collapse panel"
                aria-label="Collapse panel"
                data-testid="button-rebecca-close"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
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
                    className="text-xs px-2.5 py-1 rounded-md h-auto whitespace-nowrap"
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
                      "rounded-lg px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "max-w-[82%] bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap"
                        : "max-w-[90%] bg-muted text-foreground rounded-tl-sm"
                    )}
                    data-testid={`rebecca-message-${msg.role}-${msg.id}`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        {msg.toolSteps && msg.toolSteps.length > 0 && (
                          <ToolCallStepIndicator steps={msg.toolSteps} showTiming={showTiming} />
                        )}
                        {msg.toolSteps && msg.toolSteps.length > 0 && msg.content && msg.content.trim().length > 0 && (
                          <div className="border-t border-border/50 my-2" aria-hidden="true" />
                        )}
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
                  className="text-[11px] px-2 py-0.5 rounded-md h-auto opacity-90 hover:opacity-100 whitespace-nowrap"
                  disabled={loading}
                  data-testid={`button-rebecca-followup-${q.slice(0, 15).replace(/\s+/g, "-")}`}
                >
                  {q}
                </Button>
              ))}
            </div>
          )}
          {pendingMessage && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <span className="flex-1 min-w-0 truncate">Still responding — finish first or move on?</span>
              <button type="button" onClick={handleLetFinish} className="shrink-0 font-medium underline underline-offset-2 hover:no-underline">Finish</button>
              <button type="button" onClick={handleMoveOn} className="shrink-0 font-medium underline underline-offset-2 hover:no-underline">Move on</button>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 relative"
                  aria-label="Response mode"
                  data-testid="button-rebecca-mode-gear"
                >
                  <Gear className="w-3.5 h-3.5" />
                  {responseMode !== "standard" && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44" data-testid="rebecca-mode-selector">
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Response mode
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {RESPONSE_MODES.map((m) => {
                  const Icon = m.icon;
                  const active = responseMode === m.value;
                  return (
                    <DropdownMenuItem
                      key={m.value}
                      onClick={() => {
                        setResponseMode(m.value);
                        try { localStorage.setItem("rebecca-response-mode", m.value); } catch (e: unknown) { console.warn("Failed to save response mode", e); }
                        if (user) syncChatPrefsToServer({ rebeccaResponseMode: m.value });
                      }}
                      className={cn(active && "text-primary")}
                      data-testid={`button-mode-${m.value}`}
                    >
                      <Icon className="w-4 h-4" />
                      {m.label}
                      {active && <Check className="w-3.5 h-3.5 ml-auto" />}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Display
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    const next = !showTiming;
                    setShowTiming(next);
                    try { localStorage.setItem("rebecca-show-tool-timing", String(next)); } catch (e: unknown) { console.warn("Failed to save tool timing setting", e); }
                    if (user) syncChatPrefsToServer({ rebeccaShowToolTiming: next });
                  }}
                  data-testid="button-toggle-tool-timing"
                >
                  Show tool timing
                  {showTiming && <Check className="w-3.5 h-3.5 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              data-testid="button-rebecca-send"
              aria-label="Send message"
            >
              <ArrowUp className="w-3.5 h-3.5" />
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
            className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-[48] flex-col items-center justify-center gap-1 h-16 w-10 rounded-l-md bg-primary text-primary-foreground shadow-lg ring-1 ring-primary/30 hover:bg-primary/90 hover:scale-[1.03] active:scale-95 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RebeccaAvatar size="sm" className="shadow-none ring-0 bg-primary-foreground text-primary" />
            <ChevronLeft className="w-3 h-3 opacity-80" aria-hidden="true" />
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
