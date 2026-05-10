/**
 * CompanyAssumptionsHeaderBar — Page header + intelligence status + acked
 * range pills + first-visit banner. Pure presentational composition extracted
 * from `client/src/pages/CompanyAssumptions.tsx` (task #471).
 */
import { PageHeader } from "@/components/ui/page-header";
import {
  IntelligenceStatusBar,
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
  companyResearchUpdatedAt: string | null;
  lastAssumptionChangeAt: string | null;
  isGenerating: boolean;
  isUpdatePending: boolean;
  generateResearch: () => void | Promise<void>;
  savedTabsCount: number;
  tabWarnings: Record<TabKey, TabValidationWarning[]>;
  tabKeys: readonly TabKey[];
  acks: AckRow[];
  activeTab: TabKey;
}

export function CompanyAssumptionsHeaderBar(props: Props) {
  const {
    companyName,
    companyResearchUpdatedAt,
    lastAssumptionChangeAt,
    isGenerating,
    isUpdatePending,
    generateResearch,
    savedTabsCount,
    tabWarnings,
    tabKeys,
    acks,
    activeTab,
  } = props;

  const totalWarnings = (Object.values(tabWarnings) as TabValidationWarning[][])
    .reduce((acc, arr) => acc + arr.length, 0);

  let bannerState: BannerState | undefined;
  if (isUpdatePending) bannerState = "saving";
  else if (isGenerating) bannerState = "reviewing";
  else if (savedTabsCount > 0 && totalWarnings > 0) bannerState = "flagged";
  else if (savedTabsCount > 0 && totalWarnings === 0 && !!companyResearchUpdatedAt) bannerState = "clean";

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
      {/*
        The "Auto" Switch (data-testid="toggle-auto-refresh-company")
        used to live in the PageHeader actions slot and was wired to
        `useAutoRefreshIntelligence`. Per task #738 and the binding
        rule .claude/rules/analyst-trigger-discipline.md, The Analyst
        evaluates ONLY on an explicit AnalystButton click — there is
        no auto-refresh, so the toggle has been removed.
      */}
      <PageHeader
        title="Company Assumptions"
        subtitle={`Configure ${companyName ?? "Hospitality Business"} operating parameters`}
        variant="dark"
        backLink="/company"
      />

      <IntelligenceStatusBar
        researchUpdatedAt={companyResearchUpdatedAt}
        lastAssumptionChangeAt={lastAssumptionChangeAt}
        isGenerating={isGenerating}
        onRunResearch={generateResearch}
        bannerState={bannerState}
        flaggedCount={totalWarnings}
        hideButton
      />

      <RangePillsLayer pills={pills} reKey={activeTab} />
    </>
  );
}
