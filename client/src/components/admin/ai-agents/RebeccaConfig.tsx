import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  IconMessageCircle,
  IconBrain,
  IconPlay,
  IconUser,
  IconSparkles,
  IconZap,
} from "@/components/icons";
import { motion } from "framer-motion";

export const DEFAULT_PROMPT = `You are Rebecca, the sharpest analyst at H+ Analytics. You know the portfolio inside out — every property's ADR, every cap rate assumption, every USALI line item. You have opinions about this work, backed by quiet confidence from watching the data compound.`;

export interface RebeccaConfigProps {
  enabled: boolean;
  displayName: string;
  systemPrompt: string;
  chatEngine: "gemini" | "perplexity";
  onEnabledChange: (v: boolean) => void;
  onDisplayNameChange: (v: string) => void;
  onSystemPromptChange: (v: string) => void;
  onChatEngineChange: (v: "gemini" | "perplexity") => void;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
}

export function RebeccaConfig({
  enabled,
  displayName,
  systemPrompt,
  chatEngine,
  onEnabledChange,
  onDisplayNameChange,
  onSystemPromptChange,
  onChatEngineChange,
  
  
  
}: RebeccaConfigProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-display font-bold text-foreground">
            {displayName || "Rebecca"} Configuration
          </h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            Text chat agent — answers portfolio questions using pre-computed
            metrics.
          </p>
        </div>
      </div>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconMessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Agent Identity
              </CardTitle>
              <CardDescription className="label-text mt-0.5">
                Display settings and behavior for the text chat agent.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-muted/40 to-muted/20 rounded-xl border border-muted/60">
            <div>
              <Label className="label-text font-medium">
                Enable {displayName || "Rebecca"}
              </Label>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Show in sidebar and header for all users
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={onEnabledChange}
              data-testid="switch-rebecca-enabled"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <IconUser className="w-4 h-4 text-muted-foreground/60" />
              <Label className="label-text font-medium text-xs uppercase tracking-wider text-muted-foreground/70">
                Display Name
              </Label>
            </div>
            <Input
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="Rebecca"
              className="bg-card border-border focus:border-border transition-colors max-w-sm"
              data-testid="input-rebecca-name"
            />
            <p className="text-xs text-muted-foreground/70 pl-6">
              Name shown in the sidebar and chat panel header.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-pop/10 flex items-center justify-center">
              <IconZap className="w-5 h-5 text-accent-pop" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                AI Engine
              </CardTitle>
              <CardDescription className="label-text mt-0.5">
                Choose the AI model that powers {displayName || "Rebecca"}'s responses.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="label-text font-medium text-xs uppercase tracking-wider text-muted-foreground/70">
              Chat Engine
            </Label>
            <Select
              value={chatEngine}
              onValueChange={(v) => onChatEngineChange(v as "gemini" | "perplexity")}
            >
              <SelectTrigger className="max-w-sm bg-card border-border" data-testid="select-rebecca-engine">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini" data-testid="option-engine-gemini">Gemini</SelectItem>
                <SelectItem value="perplexity" data-testid="option-engine-perplexity">Perplexity</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground/70">
              {chatEngine === "perplexity"
                ? "Perplexity uses grounded web search — responses include citations from live sources."
                : "Gemini answers from portfolio data and training knowledge."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-chart-3/10 flex items-center justify-center">
              <IconBrain className="w-5 h-5 text-chart-3" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                System Prompt
              </CardTitle>
              <CardDescription className="label-text mt-0.5">
                Customize how {displayName || "Rebecca"} responds. Portfolio
                data is always appended automatically.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            placeholder={DEFAULT_PROMPT}
            rows={10}
            className="font-mono text-xs bg-card border-border"
            data-testid="input-rebecca-prompt"
          />
          <p className="text-[11px] text-muted-foreground/50">
            Leave empty to use the default prompt. Portfolio data is always
            appended automatically.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconPlay className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Test Chat Preview
              </CardTitle>
              <CardDescription className="label-text mt-0.5">
                Preview how {displayName || "Rebecca"} will appear to users.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/20 to-muted/5 p-4 space-y-3">
            <div className="flex items-center gap-2.5 pb-3 border-b border-border/40">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <IconMessageCircle className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {displayName || "Rebecca"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {enabled ? "Online" : "Offline"}
                </p>
              </div>
              <div className="ml-auto">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    enabled ? "bg-primary" : "bg-muted-foreground/30",
                  )}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <IconMessageCircle className="w-3 h-3 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                  <p className="text-xs text-foreground">
                    Hello! I am {displayName || "Rebecca"}, your portfolio
                    analyst. How can I help you today?
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <div className="bg-primary/10 rounded-xl rounded-tr-sm px-3 py-2 max-w-[80%]">
                  <p className="text-xs text-foreground/80">
                    What is our portfolio's average occupancy rate?
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <IconMessageCircle className="w-3 h-3 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                  <p className="text-xs text-muted-foreground/60 italic">
                    {enabled
                      ? "Ready to answer from live portfolio data..."
                      : "Enable the agent to start responding."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border/40">
              <div className="flex-1 bg-muted/30 rounded-lg px-3 py-2">
                <p className="text-xs text-muted-foreground/40">
                  Type a message...
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <IconSparkles className="w-4 h-4 text-primary/40" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
