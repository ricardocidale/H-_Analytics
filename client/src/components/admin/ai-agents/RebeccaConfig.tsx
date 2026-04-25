import { useState, useEffect, type ComponentType } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  IconMessageCircle,
  IconBrain,
  IconPlay,
  IconUser,
  IconZap,
  IconShield,
  IconRefreshCw,
  IconSparkles,
} from "@/components/icons";
import { motion } from "framer-motion";
import {
  DEFAULT_REBECCA_SETTINGS,
  REBECCA_LLM_PROVIDERS,
  REBECCA_PROVIDER_MODELS,
  REBECCA_DEFAULT_MODEL,
  REBECCA_TONE_PRESETS,
  REBECCA_LENGTH_PREFERENCES,
  REBECCA_READING_LEVELS,
  REBECCA_CITATION_STYLES,
  REBECCA_UNCERTAINTY,
  REBECCA_SOURCE_KEYS,
  type RebeccaSettings,
  type RebeccaLlmProvider,
  type RebeccaSourceKey,
} from "@shared/rebecca-settings";

export const DEFAULT_PROMPT = `You are Rebecca, the sharpest analyst at H+ Analytics. You know the portfolio inside out — every property's ADR, every cap rate assumption, every USALI line item. You have opinions about this work, backed by quiet confidence from watching the data compound.`;

export interface RebeccaConfigProps {
  enabled: boolean;
  displayName: string;
  systemPrompt: string;
  chatEngine: "gemini" | "perplexity";
  settings: RebeccaSettings;
  onEnabledChange: (v: boolean) => void;
  onDisplayNameChange: (v: string) => void;
  onSystemPromptChange: (v: string) => void;
  onChatEngineChange: (v: "gemini" | "perplexity") => void;
  onSettingsChange: (next: RebeccaSettings) => void;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  guardrailCount?: number;
}

const SOURCE_LABELS: Record<RebeccaSourceKey, { label: string; description: string }> = {
  knowledgeBase: { label: "Knowledge Base", description: "Admin-curated KB entries (RAG over the Knowledge Base tab)." },
  portfolio: { label: "Portfolio Data", description: "Live property metrics, scenarios, and company assumptions." },
  research: { label: "Research History", description: "Past research jobs and assumption guidance." },
  documents: { label: "Documents", description: "Uploaded property documents indexed in the vector store." },
  webSearch: { label: "Web Search", description: "Live web grounding via Perplexity (only used when provider is Perplexity)." },
  uploadedFiles: { label: "Asset Library", description: "Uploaded photos, logos, and visual assets." },
};

function SectionCard({ icon: Icon, accent, title, description, onReset, children }: {
  icon: ComponentType<{ className?: string }>; accent: string; title: string; description: string; onReset?: () => void; children: React.ReactNode;
}) {
  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${accent} flex items-center justify-center`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
              <CardDescription className="label-text mt-0.5">{description}</CardDescription>
            </div>
          </div>
          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onReset}
              data-testid={`button-reset-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              <IconRefreshCw className="w-3.5 h-3.5" /> Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function DialRow({ label, hint, value, onChange, testId }: {
  label: string; hint: string; value: number; onChange: (v: number) => void; testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="label-text font-medium text-xs">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground" data-testid={`value-${testId}`}>{value}/100</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={5}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        data-testid={`slider-${testId}`}
      />
      <p className="text-[11px] text-muted-foreground/70">{hint}</p>
    </div>
  );
}

export function RebeccaConfig({
  enabled,
  displayName,
  systemPrompt,
  chatEngine,
  settings,
  onEnabledChange,
  onDisplayNameChange,
  onSystemPromptChange,
  onChatEngineChange,
  onSettingsChange,
  onSave,
  isSaving,
  isDirty,
  guardrailCount,
}: RebeccaConfigProps) {
  const { toast } = useToast();
  const update = <K extends keyof RebeccaSettings>(section: K, patch: Partial<RebeccaSettings[K]>) => {
    onSettingsChange({ ...settings, [section]: { ...(settings[section] as object), ...patch } as RebeccaSettings[K] });
  };
  const updateSource = (key: RebeccaSourceKey, patch: Partial<RebeccaSettings["sources"][RebeccaSourceKey]>) => {
    onSettingsChange({
      ...settings,
      sources: { ...settings.sources, [key]: { ...settings.sources[key], ...patch } },
    });
  };
  const resetSection = <K extends keyof RebeccaSettings>(section: K) => {
    onSettingsChange({ ...settings, [section]: DEFAULT_REBECCA_SETTINGS[section] });
  };

  const providerModels = REBECCA_PROVIDER_MODELS[settings.llm.provider];
  const fallbackModels = settings.llm.fallbackProvider ? REBECCA_PROVIDER_MODELS[settings.llm.fallbackProvider] : [];

  // Test chat preview state
  type PreviewTurn = { role: "user" | "assistant"; content: string; ts: number };
  const [testInput, setTestInput] = useState("");
  const [previewHistory, setPreviewHistory] = useState<PreviewTurn[]>([]);
  const [keepHistory, setKeepHistory] = useState(true);
  const [testRunning, setTestRunning] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Reset the rolling preview transcript whenever any setting changes — the
  // sandbox is bound to the *current* unsaved configuration, so old turns
  // produced under different settings would be misleading.
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    setPreviewHistory([]);
    setTestError(null);
  }, [settingsKey]);

  const clearPreviewHistory = () => {
    setPreviewHistory([]);
    setTestError(null);
  };

  const runTest = async () => {
    const trimmed = testInput.trim();
    if (!trimmed) return;
    setTestRunning(true);
    setTestError(null);
    const userTurn: PreviewTurn = { role: "user", content: trimmed, ts: Date.now() };
    const historyForRequest = keepHistory
      ? previewHistory.map((t) => ({ role: t.role, content: t.content }))
      : [];
    // Optimistically render the user's turn so the transcript feels live.
    setPreviewHistory((prev) => (keepHistory ? [...prev, userTurn] : [userTurn]));
    setTestInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: historyForRequest,
          newConversation: true,
          responseMode: "standard",
          previewSettings: settings,
          preview: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const reply: PreviewTurn = {
        role: "assistant",
        content: data.response ?? "(empty response)",
        ts: Date.now(),
      };
      setPreviewHistory((prev) => [...prev, reply]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Test failed";
      setTestError(msg);
      toast({ title: "Test chat failed", description: msg, variant: "destructive" });
    } finally {
      setTestRunning(false);
    }
  };

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
            Persona, voice, model, and knowledge sources for the chat agent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Badge variant="outline" className="text-xs" data-testid="badge-rebecca-dirty">Unsaved changes</Badge>
          )}
          <Button
            onClick={onSave}
            disabled={!isDirty || isSaving}
            size="sm"
            data-testid="button-rebecca-save"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Identity & Persona */}
      <SectionCard
        icon={IconUser}
        accent="bg-primary/10 text-primary"
        title="Identity & Persona"
        description="How the agent introduces itself and signs off."
        onReset={() => resetSection("identity")}
      >
        <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
          <div>
            <Label className="label-text font-medium">Enable {displayName || "Rebecca"}</Label>
            <p className="text-xs text-muted-foreground/70 mt-0.5">Show in sidebar and header for all users</p>
          </div>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} data-testid="switch-rebecca-enabled" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Display Name</Label>
            <Input value={displayName} onChange={(e) => onDisplayNameChange(e.target.value)} placeholder="Rebecca" data-testid="input-rebecca-name" />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Avatar Initials</Label>
            <Input maxLength={4} value={settings.identity.avatarInitials} onChange={(e) => update("identity", { avatarInitials: e.target.value.toUpperCase() })} placeholder="RB" data-testid="input-rebecca-initials" />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Subtitle / Tagline</Label>
            <Input value={settings.identity.subtitle} onChange={(e) => update("identity", { subtitle: e.target.value })} placeholder="Your portfolio analyst" data-testid="input-rebecca-subtitle" />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Role / Title</Label>
            <Input value={settings.identity.roleTitle} onChange={(e) => update("identity", { roleTitle: e.target.value })} placeholder="Senior Portfolio Analyst" data-testid="input-rebecca-role" />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Pronouns</Label>
            <Input value={settings.identity.pronouns} onChange={(e) => update("identity", { pronouns: e.target.value })} placeholder="she/her" data-testid="input-rebecca-pronouns" />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Sign-off</Label>
            <Input value={settings.identity.signoff} onChange={(e) => update("identity", { signoff: e.target.value })} placeholder="— Rebecca" data-testid="input-rebecca-signoff" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="label-text font-medium text-xs">Opening Greeting</Label>
          <Textarea rows={2} value={settings.identity.greeting} onChange={(e) => update("identity", { greeting: e.target.value })} placeholder="Hi! I'm Rebecca. What would you like to dig into today?" data-testid="input-rebecca-greeting" />
        </div>
        <div className="space-y-1.5">
          <Label className="label-text font-medium text-xs">Fallback "I don't know" Message</Label>
          <Textarea rows={2} value={settings.identity.fallbackMessage} onChange={(e) => update("identity", { fallbackMessage: e.target.value })} placeholder="I don't have enough data to answer that confidently — want me to flag it for research?" data-testid="input-rebecca-fallback" />
        </div>
      </SectionCard>

      {/* Personality */}
      <SectionCard
        icon={IconSparkles}
        accent="bg-chart-3/10 text-chart-3"
        title="Personality"
        description="Adjust the dials that shape how the agent feels in conversation."
        onReset={() => resetSection("personality")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <DialRow label="Warmth" hint="Cool & detached → warm & supportive" value={settings.personality.warmth} onChange={(v) => update("personality", { warmth: v })} testId="warmth" />
          <DialRow label="Formality" hint="Casual → formal" value={settings.personality.formality} onChange={(v) => update("personality", { formality: v })} testId="formality" />
          <DialRow label="Humor / Dry Wit" hint="None → dry wit welcome" value={settings.personality.humor} onChange={(v) => update("personality", { humor: v })} testId="humor" />
          <DialRow label="Verbosity" hint="Brief → thorough" value={settings.personality.verbosity} onChange={(v) => update("personality", { verbosity: v })} testId="verbosity" />
          <DialRow label="Confidence" hint="Tentative → decisive" value={settings.personality.confidence} onChange={(v) => update("personality", { confidence: v })} testId="confidence" />
          <DialRow label="Proactiveness" hint="Answer-only → anticipates next questions" value={settings.personality.proactiveness} onChange={(v) => update("personality", { proactiveness: v })} testId="proactiveness" />
        </div>
        <div className="space-y-1.5">
          <Label className="label-text font-medium text-xs">Personality Notes</Label>
          <Textarea rows={3} value={settings.personality.notes} onChange={(e) => update("personality", { notes: e.target.value })} placeholder="Free-form nuance, e.g. 'be skeptical about owner-supplied ADRs'…" data-testid="input-personality-notes" />
        </div>
      </SectionCard>

      {/* Voice & Tone */}
      <SectionCard
        icon={IconMessageCircle}
        accent="bg-accent-pop/10 text-accent-pop"
        title="Voice & Tone"
        description="Tone preset, length, reading level, and locale."
        onReset={() => resetSection("voice")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Tone Preset</Label>
            <Select value={settings.voice.tonePreset} onValueChange={(v) => update("voice", { tonePreset: v as (typeof REBECCA_TONE_PRESETS)[number] })}>
              <SelectTrigger data-testid="select-tone-preset"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REBECCA_TONE_PRESETS.map(p => <SelectItem key={p} value={p} data-testid={`option-tone-${p}`}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Length Preference</Label>
            <Select value={settings.voice.lengthPreference} onValueChange={(v) => update("voice", { lengthPreference: v as (typeof REBECCA_LENGTH_PREFERENCES)[number] })}>
              <SelectTrigger data-testid="select-length-preference"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REBECCA_LENGTH_PREFERENCES.map(p => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Reading Level</Label>
            <Select value={settings.voice.readingLevel} onValueChange={(v) => update("voice", { readingLevel: v as (typeof REBECCA_READING_LEVELS)[number] })}>
              <SelectTrigger data-testid="select-reading-level"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REBECCA_READING_LEVELS.map(p => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Locale</Label>
            <Input value={settings.voice.locale} onChange={(e) => update("voice", { locale: e.target.value })} placeholder="en-US" data-testid="input-locale" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <Label className="label-text text-xs">Use emoji</Label>
            <Switch checked={settings.voice.useEmoji} onCheckedChange={(v) => update("voice", { useEmoji: v })} data-testid="switch-use-emoji" />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <Label className="label-text text-xs">First-person voice</Label>
            <Switch checked={settings.voice.useFirstPerson} onCheckedChange={(v) => update("voice", { useFirstPerson: v })} data-testid="switch-first-person" />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <Label className="label-text text-xs">Ask clarifying Qs</Label>
            <Switch checked={settings.voice.askClarifying} onCheckedChange={(v) => update("voice", { askClarifying: v })} data-testid="switch-ask-clarifying" />
          </div>
        </div>
      </SectionCard>

      {/* Conversation Behavior */}
      <SectionCard
        icon={IconBrain}
        accent="bg-chart-2/10 text-chart-2"
        title="Conversation Behavior"
        description="How Rebecca opens, cites, hedges, and pushes back."
        onReset={() => resetSection("behavior")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Citation Style</Label>
            <Select value={settings.behavior.citationStyle} onValueChange={(v) => update("behavior", { citationStyle: v as (typeof REBECCA_CITATION_STYLES)[number] })}>
              <SelectTrigger data-testid="select-citation-style"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REBECCA_CITATION_STYLES.map(p => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Uncertainty Handling</Label>
            <Select value={settings.behavior.uncertaintyHandling} onValueChange={(v) => update("behavior", { uncertaintyHandling: v as (typeof REBECCA_UNCERTAINTY)[number] })}>
              <SelectTrigger data-testid="select-uncertainty"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REBECCA_UNCERTAINTY.map(p => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <Label className="label-text text-xs">Proactive follow-ups</Label>
            <Switch checked={settings.behavior.proactiveFollowups} onCheckedChange={(v) => update("behavior", { proactiveFollowups: v })} data-testid="switch-proactive-followups" />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <Label className="label-text text-xs">Summarize long answers</Label>
            <Switch checked={settings.behavior.summarizeLong} onCheckedChange={(v) => update("behavior", { summarizeLong: v })} data-testid="switch-summarize-long" />
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <Label className="label-text text-xs">Push back on assumptions</Label>
            <Switch checked={settings.behavior.pushBackOnAssumptions} onCheckedChange={(v) => update("behavior", { pushBackOnAssumptions: v })} data-testid="switch-pushback" />
          </div>
        </div>
      </SectionCard>

      {/* LLM & Engine */}
      <SectionCard
        icon={IconZap}
        accent="bg-accent-pop/10 text-accent-pop"
        title="LLM & Engine"
        description="Provider, model, sampling parameters, and fallback engine."
        onReset={() => resetSection("llm")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Primary Provider</Label>
            <Select
              value={settings.llm.provider}
              onValueChange={(v) => {
                const provider = v as RebeccaLlmProvider;
                const patch: Partial<typeof settings.llm> = {
                  provider,
                  model: REBECCA_DEFAULT_MODEL[provider],
                };
                // If the new primary equals the current fallback, clear the
                // fallback so failover never silently retries the same engine.
                if (settings.llm.fallbackProvider === provider) {
                  patch.fallbackProvider = null;
                  patch.fallbackModel = null;
                }
                update("llm", patch);
                if (provider === "gemini" || provider === "perplexity") {
                  onChatEngineChange(provider);
                }
              }}
            >
              <SelectTrigger data-testid="select-llm-provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REBECCA_LLM_PROVIDERS.map(p => <SelectItem key={p} value={p} data-testid={`option-provider-${p}`}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Model</Label>
            <Select value={settings.llm.model} onValueChange={(v) => update("llm", { model: v })}>
              <SelectTrigger data-testid="select-llm-model"><SelectValue /></SelectTrigger>
              <SelectContent>
                {providerModels.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="label-text font-medium text-xs">Temperature</Label>
              <span className="text-xs font-mono text-muted-foreground" data-testid="value-temperature">{settings.llm.temperature.toFixed(2)}</span>
            </div>
            <Slider value={[settings.llm.temperature]} min={0} max={2} step={0.05} onValueChange={(v) => update("llm", { temperature: v[0] ?? 0.7 })} data-testid="slider-temperature" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="label-text font-medium text-xs">Top-p</Label>
              <span className="text-xs font-mono text-muted-foreground" data-testid="value-topp">{settings.llm.topP.toFixed(2)}</span>
            </div>
            <Slider value={[settings.llm.topP]} min={0} max={1} step={0.05} onValueChange={(v) => update("llm", { topP: v[0] ?? 0.95 })} data-testid="slider-topp" />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text font-medium text-xs">Max output tokens</Label>
            <Input
              type="number"
              min={64}
              max={16000}
              value={settings.llm.maxOutputTokens}
              onChange={(e) => update("llm", { maxOutputTokens: Math.max(64, Math.min(16000, Number(e.target.value) || 2048)) })}
              data-testid="input-max-tokens"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-border/40">
          <div className="space-y-1.5 pt-3">
            <Label className="label-text font-medium text-xs">Fallback Provider</Label>
            <Select
              value={settings.llm.fallbackProvider ?? "__none"}
              onValueChange={(v) => update("llm", v === "__none" ? { fallbackProvider: null, fallbackModel: null } : { fallbackProvider: v as RebeccaLlmProvider, fallbackModel: REBECCA_DEFAULT_MODEL[v as RebeccaLlmProvider] })}
            >
              <SelectTrigger data-testid="select-fallback-provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {REBECCA_LLM_PROVIDERS.filter(p => p !== settings.llm.provider).map(p => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 pt-3">
            <Label className="label-text font-medium text-xs">Fallback Model</Label>
            <Select
              value={settings.llm.fallbackModel ?? ""}
              onValueChange={(v) => update("llm", { fallbackModel: v })}
              disabled={!settings.llm.fallbackProvider}
            >
              <SelectTrigger data-testid="select-fallback-model"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {fallbackModels.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          Legacy chat engine: <span className="font-mono">{chatEngine}</span> (kept for back-compat; the primary provider above wins when set).
        </p>
      </SectionCard>

      {/* Knowledge & Sources */}
      <SectionCard
        icon={IconBrain}
        accent="bg-primary/10 text-primary"
        title="Knowledge & Sources"
        description="Toggle which context sources Rebecca is allowed to draw from, with relative weight."
        onReset={() => resetSection("sources")}
      >
        <div className="space-y-3">
          {REBECCA_SOURCE_KEYS.map((key) => {
            const src = settings.sources[key];
            const meta = SOURCE_LABELS[key];
            return (
              <div key={key} className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Label className="label-text font-medium text-sm">{meta.label}</Label>
                      <Badge variant="outline" className="text-[10px] font-mono" data-testid={`weight-${key}`}>w {src.weight}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{meta.description}</p>
                  </div>
                  <Switch
                    checked={src.enabled}
                    onCheckedChange={(v) => updateSource(key, { enabled: v })}
                    data-testid={`switch-source-${key}`}
                  />
                </div>
                <Slider
                  value={[src.weight]}
                  min={0}
                  max={100}
                  step={5}
                  disabled={!src.enabled}
                  onValueChange={(v) => updateSource(key, { weight: v[0] ?? 0 })}
                  data-testid={`slider-source-${key}`}
                />
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Guardrails Summary */}
      <SectionCard
        icon={IconShield}
        accent="bg-chart-4/10 text-chart-4"
        title="Guardrails"
        description="Read-only summary of admin-configured guardrails."
      >
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/40">
          <div>
            <p className="text-sm font-medium" data-testid="text-guardrail-count">
              {guardrailCount ?? 0} active guardrail{(guardrailCount ?? 0) === 1 ? "" : "s"}
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Guardrails are managed on the Guardrails tab and applied to every response.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* System Prompt */}
      <SectionCard
        icon={IconBrain}
        accent="bg-chart-3/10 text-chart-3"
        title="System Prompt"
        description="Base instructions that anchor every conversation. Persona, tone, and behavior are layered on top."
      >
        <Textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          placeholder={DEFAULT_PROMPT}
          rows={8}
          className="font-mono text-xs"
          data-testid="input-rebecca-prompt"
        />
        <p className="text-[11px] text-muted-foreground/50">
          Leave empty to use the default prompt. Portfolio data, persona overlay, and guardrails are appended automatically.
        </p>
      </SectionCard>

      {/* Test Chat Preview */}
      <SectionCard
        icon={IconPlay}
        accent="bg-primary/10 text-primary"
        title="Test Chat Preview"
        description="Send a real message through the current (unsaved) configuration."
      >
        <div className="space-y-3">
          {/* Sandbox banner — makes it unmistakable that this is not a saved
              conversation and is bound to the unsaved settings above. */}
          <div
            className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            data-testid="banner-preview-sandbox"
          >
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide font-semibold border-amber-500/60 bg-amber-500/20 text-amber-900 dark:text-amber-100 shrink-0"
              data-testid="badge-preview-sandbox"
            >
              Preview · Sandbox
            </Badge>
            <p className="text-[11px] leading-relaxed">
              You are talking to an unsaved preview of {displayName || "Rebecca"}. Replies use the
              configuration above and are <span className="font-semibold">not stored</span> in the
              user-facing chat history. The transcript clears automatically whenever you change a setting.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 p-2 px-3 rounded-md bg-muted/30 border border-border/40">
              <Switch
                checked={keepHistory}
                onCheckedChange={setKeepHistory}
                data-testid="switch-preview-history"
              />
              <Label className="label-text text-xs cursor-pointer" onClick={() => setKeepHistory(!keepHistory)}>
                Keep multi-turn history in this panel
              </Label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={clearPreviewHistory}
              disabled={previewHistory.length === 0 && !testError}
              data-testid="button-clear-preview-history"
            >
              <IconRefreshCw className="w-3.5 h-3.5" /> Clear transcript
            </Button>
          </div>

          {previewHistory.length > 0 && (
            <div
              className="space-y-2 p-3 rounded-xl bg-muted/20 border border-border/40 max-h-[420px] overflow-y-auto"
              data-testid="list-preview-transcript"
            >
              {previewHistory.map((turn, i) => {
                const isUser = turn.role === "user";
                return (
                  <div
                    key={`${turn.ts}-${i}`}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    data-testid={`preview-turn-${turn.role}-${i}`}
                  >
                    <div
                      className={
                        isUser
                          ? "max-w-[85%] p-3 rounded-2xl rounded-br-sm bg-primary/10 border border-primary/20 text-sm whitespace-pre-wrap"
                          : "max-w-[85%] p-3 rounded-2xl rounded-bl-sm bg-card border border-amber-500/30 text-sm whitespace-pre-wrap"
                      }
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                          {isUser ? "You" : displayName || "Rebecca"}
                        </span>
                        {!isUser && (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1.5 h-4 border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200 font-semibold"
                            data-testid={`badge-preview-reply-${i}`}
                          >
                            Preview
                          </Badge>
                        )}
                      </div>
                      {turn.content}
                    </div>
                  </div>
                );
              })}
              {testRunning && (
                <div className="flex justify-start" data-testid="preview-turn-loading">
                  <div className="max-w-[85%] p-3 rounded-2xl rounded-bl-sm bg-card border border-border/40 text-sm text-muted-foreground italic">
                    {displayName || "Rebecca"} is thinking…
                  </div>
                </div>
              )}
            </div>
          )}

          <Textarea
            rows={2}
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder={
              previewHistory.length === 0
                ? "Type a test message — e.g. 'Give me a one-line summary of the portfolio.'"
                : "Continue the preview conversation…"
            }
            data-testid="input-test-message"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={runTest} disabled={testRunning || !testInput.trim()} size="sm" data-testid="button-run-test">
              {testRunning ? "Sending…" : previewHistory.length === 0 ? "Send test message" : "Send next turn"}
            </Button>
            <span className="text-[11px] text-muted-foreground/70">
              {keepHistory
                ? "Multi-turn — prior preview turns are sent as context."
                : "Single-turn — each message is sent without prior context."}
            </span>
          </div>
          {testError && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive" data-testid="text-test-error">
              {testError}
            </div>
          )}
        </div>
      </SectionCard>
    </motion.div>
  );
}
