import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { X, ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import {
  IconPlus, IconLink, IconGlobe, IconExternalLink,
} from "@/components/icons";
import type { ResearchEventConfig, ResearchSourceEntry, ResearchConfig, AiModelEntry, ContextLlmConfig, LlmVendor } from "@shared/schema";

export const DETERMINISTIC_TOOLS = [
  { name: "compute_property_metrics",    description: "RevPAR, room revenue, GOP, NOI margin" },
  { name: "compute_depreciation_basis",  description: "IRS depreciation basis allocation" },
  { name: "compute_debt_capacity",       description: "Debt yield and loan sizing" },
  { name: "compute_occupancy_ramp",      description: "Occupancy ramp modeling" },
  { name: "compute_adr_projection",      description: "ADR growth projections" },
  { name: "compute_cap_rate_valuation",  description: "Exit cap rate valuation" },
  { name: "compute_cost_benchmarks",     description: "USALI cost rate benchmarks" },
  { name: "compute_service_fee",         description: "Service fee calculations" },
  { name: "compute_markup_waterfall",    description: "Markup waterfall" },
];

export const FALLBACK_MODELS: AiModelEntry[] = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "anthropic" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5", provider: "anthropic" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic" },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1", provider: "anthropic" },
  { id: "claude-opus-4", label: "Claude Opus 4", provider: "anthropic" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "anthropic" },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai" },
  { id: "gpt-5.4-pro", label: "GPT-5.4 Pro", provider: "openai" },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "openai" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  { id: "o3", label: "o3", provider: "openai" },
  { id: "o3-pro", label: "o3 Pro", provider: "openai" },
  { id: "o4-mini", label: "o4 Mini", provider: "openai" },

  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", provider: "google" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "google" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google" },

  { id: "grok-4", label: "Grok 4", provider: "xai" },
  { id: "grok-4-fast", label: "Grok 4 Fast", provider: "xai" },
  { id: "grok-3", label: "Grok 3", provider: "xai" },
  { id: "grok-3-mini", label: "Grok 3 Mini", provider: "xai" },

  { id: "deepseek-r1", label: "DeepSeek R1", provider: "deepseek" },
  { id: "deepseek-v3", label: "DeepSeek V3", provider: "deepseek" },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek" },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner", provider: "deepseek" },

  { id: "llama-4-maverick", label: "Llama 4 Maverick", provider: "meta" },
  { id: "llama-4-scout", label: "Llama 4 Scout", provider: "meta" },
  { id: "llama-3.3-70b", label: "Llama 3.3 70B", provider: "meta" },
  { id: "llama-3.1-405b", label: "Llama 3.1 405B", provider: "meta" },
  { id: "llama-3.1-70b", label: "Llama 3.1 70B", provider: "meta" },
];

export const TIME_HORIZONS = [
  { value: "1-year", label: "1 Year" },
  { value: "3-year", label: "3 Years" },
  { value: "5-year", label: "5 Years" },
  { value: "10-year", label: "10 Years" },
];

export const MACRO_INDICATORS = [
  "Interest Rates", "Inflation", "Labor Market", "Travel Demand", "Supply Pipeline",
];

export const DEFAULT_EVENT_CONFIG: ResearchEventConfig = {
  enabled: true,
  focusAreas: [],
  regions: [],
  timeHorizon: "10-year",
  customInstructions: "",
  customQuestions: "",
  enabledTools: [],
};

export const LLM_VENDORS: { value: LlmVendor; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "meta", label: "Meta" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "xai", label: "xAI" },
  { value: "tesla", label: "Tesla" },
  { value: "microsoft", label: "Microsoft" },
];

export const RESEARCH_LLM_VENDORS: { value: LlmVendor; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google (Gemini)" },
  { value: "meta", label: "Meta (Llama)" },
  { value: "deepseek", label: "DeepSeek" },
];

export const PROPERTY_DEFAULT_SOURCES: ResearchSourceEntry[] = [
  { id: "prop-str", url: "https://str.com", label: "STR (CoStar)", category: "Hospitality", addedAt: new Date().toISOString() },
  { id: "prop-cbre", url: "https://www.cbre.com/industries/hotels", label: "CBRE Hotels", category: "Hospitality", addedAt: new Date().toISOString() },
  { id: "prop-hvs", url: "https://hvs.com", label: "HVS", category: "Hospitality", addedAt: new Date().toISOString() },
  { id: "prop-pkf", url: "https://www.pkfhotels.com", label: "PKF Hospitality", category: "Hospitality", addedAt: new Date().toISOString() },
  { id: "prop-rca", url: "https://www.msci.com/real-capital-analytics", label: "Real Capital Analytics (MSCI)", category: "Investment", addedAt: new Date().toISOString() },
];

export const MARKET_DEFAULT_SOURCES: ResearchSourceEntry[] = [
  { id: "mkt-fred", url: "https://fred.stlouisfed.org", label: "FRED (Federal Reserve)", category: "Economics", addedAt: new Date().toISOString() },
  { id: "mkt-bls", url: "https://www.bls.gov", label: "BLS", category: "Economics", addedAt: new Date().toISOString() },
  { id: "mkt-preqin", url: "https://www.preqin.com", label: "Preqin", category: "Investment", addedAt: new Date().toISOString() },
  { id: "mkt-trepp", url: "https://www.trepp.com", label: "Trepp (CMBS)", category: "Investment", addedAt: new Date().toISOString() },
  { id: "mkt-ahla", url: "https://www.ahla.com", label: "AHLA", category: "Industry", addedAt: new Date().toISOString() },
  { id: "mkt-lodging", url: "https://lodgingeconometrics.com", label: "Lodging Econometrics", category: "Industry", addedAt: new Date().toISOString() },
];

export const COMPANY_DEFAULT_SOURCES: ResearchSourceEntry[] = [
  { id: "co-str", url: "https://str.com", label: "STR (CoStar)", category: "Hospitality", addedAt: new Date().toISOString() },
  { id: "co-cbre", url: "https://www.cbre.com/industries/hotels", label: "CBRE Hotels", category: "Hospitality", addedAt: new Date().toISOString() },
  { id: "co-hvs", url: "https://hvs.com", label: "HVS", category: "Hospitality", addedAt: new Date().toISOString() },
  { id: "co-pkf", url: "https://www.pkfhotels.com", label: "PKF Hospitality", category: "Hospitality", addedAt: new Date().toISOString() },
];

export function mergeConfig(saved: Partial<ResearchEventConfig> | undefined): ResearchEventConfig {
  return { ...DEFAULT_EVENT_CONFIG, ...saved };
}

export function normalizeResearchConfig(cfg: ResearchConfig): ResearchConfig {
  const out = { ...cfg };
  const globalCtx: ContextLlmConfig = {
    llmVendor: cfg.llmVendor,
    llmMode: cfg.llmMode,
    primaryLlm: cfg.primaryLlm || cfg.preferredLlm,
    secondaryLlm: cfg.secondaryLlm,
  };
  if (!out.companyLlm?.primaryLlm && globalCtx.primaryLlm) {
    out.companyLlm = { ...globalCtx, ...out.companyLlm };
  }
  if (!out.propertyLlm?.primaryLlm && globalCtx.primaryLlm) {
    out.propertyLlm = { ...globalCtx, ...out.propertyLlm };
  }
  if (!out.marketLlm?.primaryLlm && globalCtx.primaryLlm) {
    out.marketLlm = { ...globalCtx, ...out.marketLlm };
  }
  if (!out.llmMode && out.preferredLlm) {
    out.llmMode = "primary-only";
    out.primaryLlm = out.preferredLlm;
    const allModels = (out.cachedModels && out.cachedModels.length > 0) ? out.cachedModels : FALLBACK_MODELS;
    const match = allModels.find((m) => m.id === out.preferredLlm);
    if (match) out.llmVendor = match.provider as LlmVendor;
  }
  return out;
}

export function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TagInput({ tags, onChange, placeholder, testIdPrefix }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  testIdPrefix: string;
}) {
  const [input, setInput] = useState("");
  function add() {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          data-testid={`input-${testIdPrefix}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button data-testid={`button-add-${testIdPrefix}`} type="button" size="sm" variant="outline" onClick={add} className="h-8 px-2">
          <IconPlus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
              {tag}
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(tags.filter((t) => t !== tag))} className="h-4 w-4 hover:text-destructive transition-colors">
                <X className="w-3 h-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function DataInputsCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="bg-muted/30 border-border/50">
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge key={item} variant="outline" className="text-[11px] font-normal">{item}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function EnableToggle({ label, description, enabled, onChange }: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} />
    </div>
  );
}

export function CheckboxGroup({ items, selected, onChange }: {
  items: string[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  function toggle(item: string, checked: boolean) {
    onChange(checked ? [...selected, item] : selected.filter((s) => s !== item));
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item} className="flex items-center gap-2.5">
          <Checkbox
            id={`cb-${item}`}
            checked={selected.includes(item)}
            onCheckedChange={(v) => toggle(item, !!v)}
          />
          <label htmlFor={`cb-${item}`} className="text-sm cursor-pointer">{item}</label>
        </div>
      ))}
    </div>
  );
}

export function CollapsibleSection({ title, icon, description, defaultOpen, children }: {
  title: string;
  icon: React.ReactNode;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-t-lg"
        data-testid={`section-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-3">
          {icon}
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-5">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

export function SourceLibrary({ sources, onChange, testIdPrefix, defaultSources }: {
  sources: ResearchSourceEntry[];
  onChange: (sources: ResearchSourceEntry[]) => void;
  testIdPrefix: string;
  defaultSources: ResearchSourceEntry[];
}) {
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (sources.length === 0 && defaultSources.length > 0) {
      onChange([...defaultSources]);
    }
  }, []);

  function handleAdd() {
    const trimmedUrl = newUrl.trim();
    if (!trimmedUrl || !isValidUrl(trimmedUrl)) return;
    if (sources.some((s) => s.url === trimmedUrl)) return;
    onChange([
      ...sources,
      {
        id: `src-${Date.now()}`,
        url: trimmedUrl,
        label: newLabel.trim() || new URL(trimmedUrl).hostname,
        addedAt: new Date().toISOString(),
      },
    ]);
    setNewUrl("");
    setNewLabel("");
  }

  function handleRemove(id: string) {
    onChange(sources.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium flex items-center gap-1.5">
        <IconLink className="w-3.5 h-3.5 text-muted-foreground" />
        Source Library
      </Label>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">URL</Label>
          <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com/report" className="h-8 text-xs bg-card" onKeyDown={(e) => e.key === "Enter" && handleAdd()} data-testid={`input-${testIdPrefix}-url`} />
        </div>
        <div className="w-40 space-y-1">
          <Label className="text-xs">Label</Label>
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Optional" className="h-8 text-xs bg-card" onKeyDown={(e) => e.key === "Enter" && handleAdd()} data-testid={`input-${testIdPrefix}-label`} />
        </div>
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={!newUrl.trim()} className="h-8 text-xs gap-1" data-testid={`button-add-${testIdPrefix}`}>
          <IconPlus className="w-3 h-3" />
          Add
        </Button>
      </div>
      {sources.length > 0 ? (
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {sources.map((source) => (
            <div key={source.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20 group hover:bg-muted/40 transition-colors" data-testid={`${testIdPrefix}-source-${source.id}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <IconGlobe className="w-3 h-3 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{source.label}</p>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline truncate block">{source.url}</a>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                  <IconExternalLink className="w-3 h-3" />
                </a>
                <Button variant="ghost" onClick={() => handleRemove(source.id)} className="text-muted-foreground hover:text-destructive h-auto w-auto p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`remove-${testIdPrefix}-${source.id}`}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">No sources added yet</p>
      )}
    </div>
  );
}
