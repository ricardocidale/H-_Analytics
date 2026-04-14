import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconBrain, IconTarget, IconProperties, IconTrendingUp,
  IconMessageCircle, IconFlaskConical, IconSparkles,
} from "@/components/icons";
import { useResearchConfig } from "@/lib/api/admin";
import { cn } from "@/lib/utils";
import type { AdminSection } from "@/components/admin/AdminSidebar";
import type { ResearchConfig, ContextLlmConfig } from "@shared/schema";

interface ModelRoutingPanelProps {
  onNavigate?: (section: AdminSection) => void;
}

interface TierCard {
  tier: number;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  domains: DomainEntry[];
}

interface DomainEntry {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  configField: string;
}

const RESEARCH_DOMAINS: DomainEntry[] = [
  { key: "company", label: "Management Company", icon: IconTarget, configField: "companyLlm" },
  { key: "property", label: "Property", icon: IconProperties, configField: "propertyLlm" },
  { key: "market", label: "Market & Industry", icon: IconTrendingUp, configField: "marketLlm" },
];

const _REBECCA_DOMAIN: DomainEntry = { key: "chatbot", label: "Rebecca", icon: IconMessageCircle, configField: "chatbotLlm" };

function getModelDisplay(config: ResearchConfig | undefined, configField: string): { vendor: string; model: string } | null {
  if (!config) return null;
  const llmConfig = (config as Record<string, unknown>)[configField] as ContextLlmConfig | undefined;
  if (!llmConfig?.llmVendor || !llmConfig?.primaryLlm) return null;
  return { vendor: llmConfig.llmVendor, model: llmConfig.primaryLlm };
}

function getSecondaryModel(config: ResearchConfig | undefined, configField: string): { vendor: string; model: string } | null {
  if (!config) return null;
  const llmConfig = (config as Record<string, unknown>)[configField] as ContextLlmConfig | undefined;
  if (!llmConfig?.secondaryLlm) return null;
  const vendor = llmConfig.secondaryLlmVendor ?? llmConfig.llmVendor;
  if (!vendor) return null;
  return { vendor, model: llmConfig.secondaryLlm };
}

function VendorBadge({ vendor }: { vendor: string }) {
  const colors: Record<string, string> = {
    openai: "bg-emerald-500/10 text-emerald-700",
    anthropic: "bg-orange-500/10 text-orange-700",
    google: "bg-blue-500/10 text-blue-700",
    xai: "bg-purple-500/10 text-purple-700",
    deepseek: "bg-cyan-500/10 text-cyan-700",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium capitalize", colors[vendor] ?? "bg-muted text-muted-foreground")}>
      {vendor}
    </span>
  );
}

export default function ModelRoutingPanel({ onNavigate }: ModelRoutingPanelProps) {
  const { data: config, isLoading } = useResearchConfig();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="model-routing-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rc = config as ResearchConfig | undefined;
  const isDual = rc?.llmMode === "dual";

  const tiers: TierCard[] = [
    {
      tier: 0,
      label: "Tier 0 — Deterministic",
      description: "Cached data and formulas. No LLM calls — zero cost, instant results.",
      color: "text-muted-foreground",
      bgColor: "bg-muted/30",
      domains: [],
    },
    {
      tier: 1,
      label: "Tier 1 — Deep Research",
      description: isDual ? "Multi-model synthesis: Stage 1 (reasoning) + Stage 2 (workhorse)." : "Single-model deep research with full context pack.",
      color: "text-blue-700",
      bgColor: "bg-blue-500/5",
      domains: RESEARCH_DOMAINS,
    },
    {
      tier: 2,
      label: "Tier 2 — Fast Refresh",
      description: "Quick single-model refresh using the workhorse model for speed.",
      color: "text-amber-700",
      bgColor: "bg-amber-500/5",
      domains: RESEARCH_DOMAINS,
    },
  ];

  const rebeccaModel = getModelDisplay(rc, "chatbotLlm");

  return (
    <div className="space-y-5" data-testid="model-routing-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={isDual ? "default" : "secondary"} className="text-xs">
            {isDual ? "Dual Mode" : "Single Mode"}
          </Badge>
        </div>
        {onNavigate && (
          <Button variant="outline" size="sm" onClick={() => onNavigate("llms")} data-testid="button-goto-llms">
            <IconBrain className="w-4 h-4 mr-1" />
            Configure in LLMs
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {tiers.map(tier => (
          <Card key={tier.tier} className={cn("transition-all", tier.bgColor)} data-testid={`card-tier-${tier.tier}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className={cn("text-sm font-semibold", tier.color)}>{tier.label}</h4>
                <Badge variant="outline" className="text-[10px]">T{tier.tier}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{tier.description}</p>

              {tier.tier === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <IconFlaskConical className="w-3.5 h-3.5" />
                  <span>No model required</span>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {tier.domains.map(domain => {
                    const primary = getModelDisplay(rc, domain.configField);
                    const secondary = tier.tier === 1 && isDual ? getSecondaryModel(rc, domain.configField) : null;
                    return (
                      <div key={domain.key} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <domain.icon className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-[11px] font-medium truncate">{domain.label}</span>
                        </div>
                        {primary ? (
                          <div className="ml-4.5 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <VendorBadge vendor={primary.vendor} />
                              <span className="text-[10px] font-mono text-muted-foreground truncate" data-testid={`text-model-${tier.tier}-${domain.key}-primary`}>{primary.model}</span>
                            </div>
                            {secondary && (
                              <div className="flex items-center gap-1.5">
                                <VendorBadge vendor={secondary.vendor} />
                                <span className="text-[10px] font-mono text-muted-foreground truncate" data-testid={`text-model-${tier.tier}-${domain.key}-secondary`}>{secondary.model}</span>
                                <span className="text-[9px] text-muted-foreground/60">fallback</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="ml-4.5">
                            <span className="text-[10px] text-muted-foreground/50 italic">using defaults</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <Card className="bg-violet-500/5" data-testid="card-tier-rebecca">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-violet-700">Rebecca</h4>
              <Badge variant="outline" className="text-[10px]">Assistant</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Conversational AI for portfolio intelligence, property insights, and research exploration.
            </p>
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-1.5">
                <IconMessageCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-[11px] font-medium">Chat Model</span>
              </div>
              {rebeccaModel ? (
                <div className="ml-4.5 flex items-center gap-1.5">
                  <VendorBadge vendor={rebeccaModel.vendor} />
                  <span className="text-[10px] font-mono text-muted-foreground truncate" data-testid="text-model-rebecca">{rebeccaModel.model}</span>
                </div>
              ) : (
                <div className="ml-4.5">
                  <span className="text-[10px] text-muted-foreground/50 italic">using defaults</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <IconSparkles className="w-3 h-3 text-violet-500" />
              <span className="text-[10px] text-muted-foreground">Context-aware with research injection</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
