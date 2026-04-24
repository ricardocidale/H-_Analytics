/**
 * CompanyAssumptionsHeaderBar — Page header + intelligence status + acked
 * range pills + first-visit banner. Pure presentational composition extracted
 * from `client/src/pages/CompanyAssumptions.tsx` (task #471).
 */
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FirstVisitBanner } from "@/components/intelligence/FirstVisitBanner";
import {
  IntelligenceStatusBar,
  computeFreshnessStatus,
  type BannerState,
} from "@/components/intelligence/IntelligenceStatusBar";
import { RangePillsLayer, type RangePillSpec } from "@/components/company-assumptions";
import type { TabValidationWarning } from "@/components/company-assumptions";
import type { TabKey } from "@/hooks/useCompanyAssumptionsForm";

interface AckRow {
  fieldName: string;
  rangeLowAtAck: number;
  rangeHighAtAck: number;
}

interface Props {
  companyName: string | null | undefined;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  companyResearchUpdatedAt: string | null;
  lastAssumptionChangeAt: string | null;
  isGenerating: boolean;
  isUpdatePending: boolean;
  generateResearch: () => void | Promise<void>;
  savedTabsCount: number;
  tabWarnings: Record<TabKey, TabValidationWarning[]>;
  tabKeys: readonly TabKey[];
  acks: AckRow[];
  isFirstVisit: boolean;
  activeTab: TabKey;
}

export function CompanyAssumptionsHeaderBar(props: Props) {
  const {
    companyName,
    autoRefresh,
    setAutoRefresh,
    companyResearchUpdatedAt,
    lastAssumptionChangeAt,
    isGenerating,
    isUpdatePending,
    generateResearch,
    savedTabsCount,
    tabWarnings,
    tabKeys,
    acks,
    isFirstVisit,
    activeTab,
  } = props;

  const totalWarnings = (Object.values(tabWarnings) as TabValidationWarning[][])
    .reduce((acc, arr) => acc + arr.length, 0);

  let bannerState: BannerState | undefined;
  if (isUpdatePending) bannerState = "saving";
  else if (isGenerating) bannerState = "reviewing";
  else if (savedTabsCount > 0 && totalWarnings > 0) bannerState = "flagged";
  else if (savedTabsCount > 0 && totalWarnings === 0 && !!companyResearchUpdatedAt) bannerState = "clean";

  const { status } = computeFreshnessStatus({
    researchUpdatedAt: companyResearchUpdatedAt,
    lastAssumptionChangeAt,
    isGenerating,
  });
  const showFirstVisit = isFirstVisit && !isGenerating && status !== "current";

  // Build pill specs once. Flagged pills come from current warnings; acked
  // pills surface kept-override ranges. Targets not in DOM render nothing.
  const pills: RangePillSpec[] = [];
  const seen = new Set<string>();
  for (const tab of tabKeys) {
    for (const w of tabWarnings[tab] ?? []) {
      if (seen.has(w.fieldName)) continue;
      seen.add(w.fieldName);
      pills.push({ fieldName: w.fieldName, display: w.display, variant: "flagged" });
    }
  }
  for (const a of acks) {
    if (seen.has(a.fieldName)) continue;
    seen.add(a.fieldName);
    pills.push({
      fieldName: a.fieldName,
      display: `${a.rangeLowAtAck}–${a.rangeHighAtAck}`,
      variant: "acked",
    });
  }

  return (
    <>
      <PageHeader
        title="Company Assumptions"
        subtitle={`Configure ${companyName ?? "Hospitality Business"} operating parameters`}
        variant="dark"
        backLink="/company"
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5" data-testid="toggle-auto-refresh-company">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  className="scale-75"
                />
                <span className="text-[10px] font-medium text-muted-foreground leading-tight whitespace-nowrap">
                  Auto
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[260px] text-center">
              Auto-refresh intelligence when assumptions change
            </TooltipContent>
          </Tooltip>
        }
      />

      <IntelligenceStatusBar
        researchUpdatedAt={companyResearchUpdatedAt}
        lastAssumptionChangeAt={lastAssumptionChangeAt}
        isGenerating={isGenerating}
        onRunResearch={generateResearch}
        bannerState={bannerState}
        flaggedCount={totalWarnings}
      />

      <RangePillsLayer pills={pills} reKey={activeTab} />

      {showFirstVisit ? <FirstVisitBanner /> : null}
    </>
  );
}
