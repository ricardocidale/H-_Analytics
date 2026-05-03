/**
 * LlmWorkflowsPage — the ONLY place in AI Intelligence to manage LLM configuration.
 *
 * Doctrine (binding):
 *   hplus-admin-nav-ia Rule 12 — LLM model names, endpoints, API key references,
 *     rate limits, and fallback chains are managed exclusively here.
 *   hplus-admin-nav-ia Rule 13 — Uses workflow cards (accordion), NOT a flat LLM registry.
 *
 * Each card represents a specific job/use-case (research workflow) that uses one or
 * more LLMs. Full spec: docs/solutions/architecture-patterns/llms-page-workflow-cards-spec-2026-05-02.md
 *
 * Status: The workflow card backend (llm_workflows DB table, API routes, seed data) is
 * planned for a follow-up task. This page renders the correct structure with a
 * "configuration pending" state until the backend ships.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconCpu, IconSparkles } from "@/components/icons";

export default function LlmWorkflowsPage() {
  return (
    <div className="space-y-6" data-testid="page-llm-workflows">
      {/* Doctrine note */}
      <Card className="border-border/40 bg-muted/10">
        <CardContent className="py-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <IconCpu className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium text-foreground/80">
                LLMs — the only place to configure language models
              </p>
              <p>
                Each card below represents a research workflow that uses one or more language
                models. Configure the vendor, model, and fallback chain per workflow.
                The Analyst recommends optimal model selection based on task complexity and cost.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow cards — placeholder structure */}
      <div className="space-y-3">
        {PLACEHOLDER_WORKFLOWS.map((wf) => (
          <WorkflowCardShell key={wf.id} {...wf} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground px-1">
        Full workflow card configuration (vendor/model dropdowns, Analyst recommendations,
        prompt display, dirty-state guard) ships when the LLM workflows backend is ready.
      </p>
    </div>
  );
}

interface WorkflowCardShellProps {
  id: string;
  label: string;
  description: string;
  specialists: string[];
  badge: string;
}

function WorkflowCardShell({ id, label, description, specialists, badge }: WorkflowCardShellProps) {
  return (
    <Card data-testid={`llm-workflow-card-${id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5 min-w-0">
            <CardTitle className="font-display text-base">{label}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">{badge}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Specialists involved
          </p>
          <div className="flex flex-wrap gap-1.5">
            {specialists.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs font-normal">
                {s}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <IconSparkles className="w-3 h-3 text-accent-pop" aria-hidden="true" />
            <span>Analyst recommendation available after backend configuration</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PLACEHOLDER_WORKFLOWS: WorkflowCardShellProps[] = [
  {
    id: "financial-modeling",
    label: "Financial Modeling",
    description: "Pro forma generation, assumption calibration, and sensitivity analysis",
    specialists: ["Ana", "Bia", "Mariana", "Natália", "Olívia", "Paula"],
    badge: "Management Company",
  },
  {
    id: "property-intelligence",
    label: "Property Intelligence",
    description: "Risk assessment, executive summaries, and property-level analysis",
    specialists: ["Daniela", "Eloá"],
    badge: "Property",
  },
  {
    id: "market-research",
    label: "Market Research",
    description: "ICP identification, market positioning, and competitive analysis",
    specialists: ["Cecília", "Giovanna"],
    badge: "Market",
  },
  {
    id: "constants-research",
    label: "Constants & Authority Sources",
    description: "Tax rates, macro indicators, depreciation schedules, and GAAP reporting conventions",
    specialists: ["Helena", "Isadora", "Júlia", "Kamila"],
    badge: "Authority Sources",
  },
  {
    id: "photo-enhancement",
    label: "Photo Enhancement & Renders",
    description: "AI-powered photo enhancement and architectural rendering",
    specialists: ["Fernanda"],
    badge: "Photos",
  },
  {
    id: "resources-build",
    label: "Resources Builder",
    description: "Curating and maintaining the resources catalog for Specialist consumption",
    specialists: ["Letícia"],
    badge: "Resources",
  },
];
