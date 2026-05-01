/**
 * ExecutiveSummaryTab.tsx — property-level Executive Summary tab.
 *
 * Surfaces the Executive Summary specialist's verdict on a property: the
 * investment thesis, key metrics, market position, revenue strategy, risk
 * profile, mitigants, and exit plan.
 *
 * Renders the PropertyExecutiveSummary returned by
 * `POST /api/executive-summary/property/:id/regenerate`. The tab does NOT
 * auto-fetch on mount (per `.claude/rules/analyst-trigger-discipline.md`):
 * pressing the AnalystButton is the only trigger. Data lives in the
 * TanStack Query cache for the session; reloading the page returns to the
 * empty state by design.
 *
 * Doctrine:
 *   - Trigger discipline (analyst-trigger-discipline.md): no `enabled: true`
 *     query on mount; the AnalystButton press is the sole entry point.
 *   - Design standards (design-standards.md): glass cards, gradient fills,
 *     skeleton on load, animated number reveal via Framer Motion, accordion
 *     for qualitative prose. Theme tokens only — no raw hex.
 *   - Vocabulary: every user-facing string conforms to vocabulary-compliance
 *     (singular "The Analyst"; no plural analyst phrasing; no banned button
 *     labels — see tests/audit/vocabulary-compliance.test.ts).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  IconSparkles,
  IconTrendingUp,
  IconMapPin,
  IconShieldAlert,
  IconTarget,
  IconArrowUpRight,
} from "@/components/icons";
import { formatMoney } from "@/lib/map-utils";

// Mirrors `server/ai/executive-summary/types.ts#PropertyExecutiveSummary`.
// Defined locally to avoid a client → server import; the shape is stable
// (governed by the Executive Summary route contract).
interface KeyMetrics {
  totalInvestment: number;
  projectedIRR: number;
  equityMultiple: number;
  stabilizedNOI: number;
  exitValue: number;
  dscr: number | null;
  cashOnCash: number;
  paybackYears: number;
}

interface PropertyExecutiveSummary {
  propertyName: string;
  propertyId: number;
  generatedAt: string;
  investmentThesis: string;
  keyMetrics: KeyMetrics;
  marketPosition: string;
  revenueStrategy: string;
  riskFactors: string;
  mitigants: string;
  exitStrategy: string;
  comparableData: string;
  confidenceLevel: string;
  sources: string[];
}

const QUERY_KEY = (id: number) =>
  ["executive-summary", "property", id] as const;

type SectionKey =
  | "investmentThesis"
  | "marketPosition"
  | "revenueStrategy"
  | "riskFactors"
  | "mitigants"
  | "exitStrategy";

const SECTIONS: ReadonlyArray<{
  key: SectionKey;
  label: string;
  icon: typeof IconTarget;
}> = [
  { key: "investmentThesis", label: "Investment Thesis", icon: IconTarget },
  { key: "marketPosition", label: "Market Position", icon: IconMapPin },
  { key: "revenueStrategy", label: "Revenue Strategy", icon: IconTrendingUp },
  { key: "riskFactors", label: "Risk Factors", icon: IconShieldAlert },
  { key: "mitigants", label: "Risk Mitigants", icon: IconShieldAlert },
  { key: "exitStrategy", label: "Exit Strategy", icon: IconArrowUpRight },
];

export default function ExecutiveSummaryTab({
  propertyId,
}: {
  propertyId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Read from cache only — never auto-fetch (trigger discipline).
  const cached = queryClient.getQueryData<PropertyExecutiveSummary>(
    QUERY_KEY(propertyId),
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/executive-summary/property/${propertyId}/regenerate`,
      );
      return (await res.json()) as PropertyExecutiveSummary;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY(propertyId), data);
    },
    onError: () => {
      toast({
        title: "Executive summary unavailable",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handleAsk = () => mutation.mutate();

  if (mutation.isPending) return <ExecutiveSummarySkeleton />;
  if (!cached) return <ExecutiveSummaryEmpty onAsk={handleAsk} />;
  return (
    <ExecutiveSummaryContent
      summary={cached}
      onRefresh={handleAsk}
      isRefreshing={mutation.isPending}
    />
  );
}

function ExecutiveSummarySkeleton() {
  return (
    <div className="space-y-6" data-testid="loading-executive-summary">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ExecutiveSummaryEmpty({ onAsk }: { onAsk: () => void }) {
  return (
    <div className="flex justify-center py-10">
      <div
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-xl p-8 text-center"
        data-testid="empty-executive-summary"
      >
        <div className="mb-4 flex justify-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <IconSparkles className="h-7 w-7 text-accent-pop" />
          </span>
        </div>
        <h2
          className="font-display mb-2 text-2xl"
          data-testid="text-empty-title"
        >
          Executive Summary
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          The Analyst reviews your property&apos;s investment thesis, market
          position, revenue strategy, risk profile, and exit plan.
        </p>
        <div className="mx-auto max-w-xs">
          {/* analyst-click-saves-tab: this tab has no editable form fields,
              so the AnalystButton press is the sole user trigger and the
              "save step" is a no-op. */}
          <AnalystButton
            suffix="Executive Summary"
            pulse
            size="lg"
            onClick={onAsk}
            dataTestId="button-analyst-executive-summary"
          />
        </div>
      </div>
    </div>
  );
}

function ExecutiveSummaryContent({
  summary,
  onRefresh,
  isRefreshing,
}: {
  summary: PropertyExecutiveSummary;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const m = summary.keyMetrics;
  const metricCards: ReadonlyArray<{ label: string; value: string }> = [
    { label: "Total Investment", value: formatMoney(m.totalInvestment) },
    { label: "Projected IRR", value: `${(m.projectedIRR * 100).toFixed(1)}%` },
    { label: "Equity Multiple", value: `${m.equityMultiple.toFixed(2)}x` },
    { label: "Stabilized NOI", value: formatMoney(m.stabilizedNOI) },
    { label: "Exit Value", value: formatMoney(m.exitValue) },
    {
      label: "DSCR",
      value: m.dscr === null ? "—" : m.dscr.toFixed(2),
    },
    { label: "Cash-on-Cash", value: `${(m.cashOnCash * 100).toFixed(1)}%` },
    { label: "Payback", value: `${m.paybackYears.toFixed(1)} yrs` },
  ];

  return (
    <div className="space-y-6" data-testid="content-executive-summary">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            className="font-display text-2xl"
            data-testid="text-summary-property-name"
          >
            {summary.propertyName}
          </h2>
          <p
            className="mt-1 text-xs text-muted-foreground"
            data-testid="text-summary-generated-at"
          >
            Updated {relativeTime(summary.generatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" data-testid="badge-confidence-level">
            Confidence: {summary.confidenceLevel}
          </Badge>
          {/* analyst-click-saves-tab: this tab has no editable form fields,
              so the AnalystButton press is the sole user trigger and the
              "save step" is a no-op. */}
          <AnalystButton
            suffix="Executive Summary"
            size="sm"
            onClick={onRefresh}
            isRunning={isRefreshing}
            dataTestId="button-analyst-executive-summary"
          />
        </div>
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {metricCards.map((card, i) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            delay={i * 0.05}
          />
        ))}
      </div>

      {/* Qualitative sections */}
      <Accordion
        type="multiple"
        defaultValue={["investmentThesis"]}
        className="space-y-2"
      >
        {SECTIONS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <AccordionItem
                value={s.key}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-card/40 to-card/20 px-4 backdrop-blur-xl"
                data-testid={`accordion-${s.key}`}
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-accent-pop" />
                    <span className="font-medium">{s.label}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent
                  className="whitespace-pre-wrap text-sm text-muted-foreground"
                  data-testid={`text-${s.key}`}
                >
                  {summary[s.key]}
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          );
        })}
      </Accordion>

      {/* Sources footer */}
      {summary.sources.length > 0 && (
        <Collapsible className="pt-2">
          <CollapsibleTrigger
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            data-testid="trigger-sources"
          >
            Show sources ({summary.sources.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul
              className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground"
              data-testid="list-sources"
            >
              {summary.sources.map((src, i) => (
                <li key={i}>{src}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  delay,
}: {
  label: string;
  value: string;
  delay: number;
}) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-card/40 to-card/20 p-4 backdrop-blur-xl"
      data-testid={`card-metric-${slug}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="mt-1 text-xl font-semibold"
        data-testid={`value-metric-${slug}`}
      >
        {value}
      </div>
    </motion.div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
