/**
 * BracketMixSummaryCard.tsx — Compact, read-only ICP bracket-mix summary surfaced
 * on the Company overview page.
 *
 * Renders a horizontal stacked bar of the saved bracket weights with bracket
 * labels and percentages. Clicking the card navigates to the full ICP Bracket
 * Mix page. When no mix has been saved, the card shows a prompt to assign
 * brackets instead.
 *
 * Reads from GET /api/icp/brackets and GET /api/icp/brackets/mix via the
 * existing useIcpBrackets / useIcpBracketMix hooks.
 */
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconTarget, IconChevronRight } from "@/components/icons";
import { useIcpBrackets, useIcpBracketMix, type IcpBracket } from "@/lib/api";
import { cn } from "@/lib/utils";

const BRACKET_MIX_ROUTE = "/company/icp-definition";

const BRACKET_SLOT_COLORS = [
  { bg: "bg-chart-1", text: "text-chart-1", border: "border-chart-1/40" },
  { bg: "bg-primary", text: "text-primary", border: "border-primary/40" },
  { bg: "bg-chart-3", text: "text-chart-3", border: "border-chart-3/40" },
  { bg: "bg-chart-4", text: "text-chart-4", border: "border-chart-4/40" },
] as const;

function formatPct(weight: number): string {
  const pct = weight * 100;
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export default function BracketMixSummaryCard() {
  const { data: brackets, isLoading: bracketsLoading } = useIcpBrackets();
  const { data: savedMix, isLoading: mixLoading } = useIcpBracketMix();

  const isLoading = bracketsLoading || mixLoading;

  if (isLoading) {
    return (
      <Card
        className="border border-border p-4 flex items-center gap-3"
        data-testid="bracket-mix-summary-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading ICP bracket mix…</p>
      </Card>
    );
  }

  const hasMix = !!savedMix && savedMix.length > 0;

  if (!hasMix) {
    return (
      <Link href={BRACKET_MIX_ROUTE} className="block no-underline text-inherit">
        <Card
          className="border border-dashed border-border bg-muted/20 p-4 hover:bg-muted/30 transition-colors cursor-pointer"
          data-testid="bracket-mix-summary-empty"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center shrink-0">
              <IconTarget className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                ICP Bracket Mix not assigned
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Assign customer-property brackets to position this management
                company's ICP.
              </p>
            </div>
            <span className="text-xs font-medium text-primary shrink-0 inline-flex items-center gap-1">
              Assign brackets
              <IconChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Card>
      </Link>
    );
  }

  const bracketBySlug = new Map<string, IcpBracket>(
    (brackets ?? []).map((b) => [b.slug, b]),
  );

  const segments = savedMix.map((entry, i) => {
    const bracket = bracketBySlug.get(entry.bracketSlug);
    const slot = BRACKET_SLOT_COLORS[i % BRACKET_SLOT_COLORS.length];
    return {
      slug: entry.bracketSlug,
      weight: entry.weight,
      label: bracket?.name ?? entry.bracketSlug,
      archetype: bracket?.archetype_label ?? null,
      customerType: bracket?.customer_type ?? null,
      slot,
    };
  });

  const totalWeight = segments.reduce((s, x) => s + x.weight, 0) || 1;

  return (
    <Link href={BRACKET_MIX_ROUTE} className="block no-underline text-inherit">
      <Card
        className="border border-border p-4 hover:border-primary/40 transition-colors cursor-pointer space-y-3"
        data-testid="bracket-mix-summary"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <IconTarget className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm font-semibold text-foreground truncate">
              ICP Bracket Mix
            </p>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {segments.length} bracket{segments.length === 1 ? "" : "s"}
            </span>
          </div>
          <span className="text-xs font-medium text-primary shrink-0 inline-flex items-center gap-1">
            View details
            <IconChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>

        <div
          className="flex h-3 w-full overflow-hidden rounded-full border border-border bg-muted/40"
          role="img"
          aria-label="ICP bracket mix weights"
          data-testid="bracket-mix-summary-bar"
        >
          {segments.map((seg) => {
            const widthPct = (seg.weight / totalWeight) * 100;
            return (
              <div
                key={seg.slug}
                className={cn("h-full", seg.slot.bg)}
                style={{ width: `${widthPct}%` }}
                title={`${seg.label} — ${formatPct(seg.weight)}`}
                data-testid={`bracket-mix-summary-segment-${seg.slug}`}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((seg) => (
            <div
              key={seg.slug}
              className="flex items-center gap-1.5 min-w-0"
              data-testid={`bracket-mix-summary-legend-${seg.slug}`}
            >
              <span
                className={cn("w-2.5 h-2.5 rounded-sm shrink-0", seg.slot.bg)}
                aria-hidden
              />
              <span className="text-xs text-foreground truncate max-w-[180px]">
                {seg.label}
              </span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {formatPct(seg.weight)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </Link>
  );
}
