import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  IconMessageCircle,
  IconAlertTriangle,
  IconRefreshCw,
  IconZap,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "@/components/icons/themed-icons";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

import { PageSkeleton } from "./ai-agents/agent-shared";
import RebeccaAdminTabs from "./ai/RebeccaAdminTabs";

interface AIAgentsTabProps {
  onSaveStateChange?: (state: import("@/components/admin/save-state").AdminSaveState | null) => void;
}

export default function AIAgentsTab({ onSaveStateChange }: AIAgentsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: globalData, isLoading: globalLoading, isError: globalError, refetch: refetchGlobal } = useQuery<
    Record<string, any>
  >({
    queryKey: ["globalAssumptions"],
    queryFn: async () => {
      const res = await fetch("/api/global-assumptions", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const [rebeccaEnabled, setRebeccaEnabled] = useState(false);
  const [rebeccaDisplayName, setRebeccaDisplayName] = useState("Rebecca");
  const [rebeccaSystemPrompt, setRebeccaSystemPrompt] = useState("");
  const [rebeccaChatEngine, setRebeccaChatEngine] = useState<"gemini" | "perplexity">("gemini");
  const [rebeccaInitialized, setRebeccaInitialized] = useState(false);
  const [rebeccaDirty, setRebeccaDirty] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (globalData && !rebeccaInitialized) {
      setRebeccaEnabled(globalData.rebeccaEnabled ?? false);
      setRebeccaDisplayName(globalData.rebeccaDisplayName ?? "Rebecca");
      setRebeccaSystemPrompt(globalData.rebeccaSystemPrompt ?? "");
      setRebeccaChatEngine((globalData.rebeccaChatEngine as "gemini" | "perplexity") ?? "gemini");
      setRebeccaInitialized(true);
    }
  }, [globalData, rebeccaInitialized]);

  const saveRebeccaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/global-assumptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rebeccaEnabled,
          rebeccaDisplayName: rebeccaDisplayName || "Rebecca",
          rebeccaSystemPrompt: rebeccaSystemPrompt || null,
          rebeccaChatEngine,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
      setRebeccaDirty(false);
      toast({ title: "Saved", description: "Rebecca configuration updated." });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleRebecca = useCallback(
    async (enabled: boolean) => {
      setIsToggling(true);
      try {
        await apiRequest("PATCH", "/api/global-assumptions", {
          rebeccaEnabled: enabled,
        });
        setRebeccaEnabled(enabled);
        setRebeccaDirty(false);
        toast({
          title: enabled ? "Rebecca activated" : "Rebecca deactivated",
          description: enabled ? "Text agent enabled." : "Text agent disabled.",
        });
        queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "Toggle failed",
          variant: "destructive",
        });
      } finally {
        setIsToggling(false);
      }
    },
    [queryClient, toast],
  );

  const rebeccaSaveRef = useRef<(() => void) | undefined>(undefined);
  rebeccaSaveRef.current = () => saveRebeccaMutation.mutate();

  useEffect(() => {
    onSaveStateChange?.({
      isDirty: rebeccaDirty,
      isPending: saveRebeccaMutation.isPending,
      onSave: () => rebeccaSaveRef.current?.(),
    });
    return () => onSaveStateChange?.(null);
  }, [rebeccaDirty, saveRebeccaMutation.isPending, onSaveStateChange]);

  if (globalLoading) {
    return <PageSkeleton />;
  }

  if (globalError || (!globalLoading && !globalData)) {
    return (
      <div className="mt-6 p-8 flex flex-col items-center gap-4 text-center rounded-xl border border-accent-pop/20 bg-accent-pop/10">
        <IconAlertTriangle className="w-10 h-10 text-accent-pop" />
        <div>
          <p className="font-semibold text-foreground">
            Failed to load AI Agent settings
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Check your connection or try again.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchGlobal()}
          className="gap-2"
          data-testid="button-retry-load"
        >
          <IconRefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
            <IconZap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">
              AI Agents
            </h2>
            <p className="text-muted-foreground text-sm">
              Configure and manage your AI text assistant
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
        className="rounded-xl border border-border/60 bg-card p-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300",
                rebeccaEnabled
                  ? "bg-primary/10 shadow-sm"
                  : "bg-muted/60",
              )}
            >
              <IconMessageCircle
                className={cn(
                  "w-6 h-6 transition-colors duration-300",
                  rebeccaEnabled ? "text-primary" : "text-muted-foreground/60",
                )}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-display font-bold text-foreground">
                  {rebeccaDisplayName || "Rebecca"}
                </h3>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0",
                    rebeccaEnabled
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  Text Agent
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI-powered property analysis chatbot. Answers portfolio questions using pre-computed metrics.
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <motion.div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    rebeccaEnabled ? "bg-primary" : "bg-muted-foreground/30",
                  )}
                  animate={
                    rebeccaEnabled
                      ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }
                      : {}
                  }
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    rebeccaEnabled ? "text-primary" : "text-muted-foreground/50",
                  )}
                >
                  {rebeccaEnabled ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            {isToggling ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={rebeccaEnabled}
                onCheckedChange={handleToggleRebecca}
                data-testid="switch-agent-rebecca"
              />
            )}
          </div>
        </div>
      </motion.div>

      <RebeccaAdminTabs
        configProps={{
          enabled: rebeccaEnabled,
          displayName: rebeccaDisplayName,
          systemPrompt: rebeccaSystemPrompt,
          chatEngine: rebeccaChatEngine,
          onEnabledChange: (v) => {
            setRebeccaEnabled(v);
            setRebeccaDirty(true);
          },
          onDisplayNameChange: (v) => {
            setRebeccaDisplayName(v);
            setRebeccaDirty(true);
          },
          onSystemPromptChange: (v) => {
            setRebeccaSystemPrompt(v);
            setRebeccaDirty(true);
          },
          onChatEngineChange: (v) => {
            setRebeccaChatEngine(v);
            setRebeccaDirty(true);
          },
          onSave: () => saveRebeccaMutation.mutate(),
          isSaving: saveRebeccaMutation.isPending,
          isDirty: rebeccaDirty,
        }}
      />
    </div>
  );
}
