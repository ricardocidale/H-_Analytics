/**
 * IcpMixSummary.tsx — Read-only ICP bracket-mix chip row for Company Assumptions.
 *
 * Task #1455 — The bracket catalog is visible in Admin → Knowledge & Resources,
 * but the per-company bracket mix (stored in global_assumptions.bracket_mix)
 * had no read-only summary on the Company Assumptions page. This component
 * renders a compact "ICP Mix" section listing each active bracket's name and
 * weight (e.g. "Boutique Upscale 60% · STR Cluster 40%") so users can see at
 * a glance which customer archetypes drive the ManCo model. Tapping the
 * section navigates to the ICP Studio (/company/icp-definition) for editing.
 *
 * Display-only: editing still happens in ICP Studio.
 */
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTarget, IconChevronRight } from "@/components/icons";
import { useIcpBrackets, useIcpBracketMix } from "@/lib/api";

const ICP_STUDIO_PATH = "/company/icp-definition";

function formatWeightPct(weight: number): string {
  const pct = weight * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export default function IcpMixSummary() {
  const { data: mix, isLoading: mixLoading } = useIcpBracketMix();
  const { data: brackets, isLoading: bracketsLoading } = useIcpBrackets();

  const isLoading = mixLoading || bracketsLoading;
  const hasMix = !!mix && mix.length > 0;

  const nameBySlug = new Map<string, string>();
  for (const b of brackets ?? []) nameBySlug.set(b.slug, b.name);

  const sorted = hasMix
    ? [...mix!].sort((a, b) => b.weight - a.weight)
    : [];

  return (
    <Link
      href={ICP_STUDIO_PATH}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
      data-testid="link-icp-mix-summary"
      aria-label="Edit ICP bracket mix in ICP Studio"
    >
      <Card className="border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-colors p-4">
          <div className="flex items-start gap-3">
            <IconTarget className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground min-w-0">ICP Mix</p>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  Edit in ICP Studio
                  <IconChevronRight className="w-3 h-3" />
                </span>
              </div>

              {isLoading ? (
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-icp-mix-loading">
                  Loading bracket mix…
                </p>
              ) : hasMix ? (
                <div
                  className="flex flex-wrap items-center gap-1.5 mt-2"
                  data-testid="list-icp-mix-chips"
                >
                  {sorted.map((entry) => (
                    <Badge
                      key={entry.bracketSlug}
                      variant="secondary"
                      className="text-[11px] font-normal tabular-nums"
                      data-testid={`chip-icp-mix-${entry.bracketSlug}`}
                    >
                      <span className="font-medium text-foreground">
                        {nameBySlug.get(entry.bracketSlug) ?? entry.bracketSlug}
                      </span>
                      <span className="ml-1.5 text-muted-foreground">
                        {formatWeightPct(entry.weight)}
                      </span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-icp-mix-empty">
                  No bracket mix assigned yet — open ICP Studio to pick the customer
                  archetypes that drive this ManCo's revenue model.
                </p>
              )}
            </div>
          </div>
      </Card>
    </Link>
  );
}
