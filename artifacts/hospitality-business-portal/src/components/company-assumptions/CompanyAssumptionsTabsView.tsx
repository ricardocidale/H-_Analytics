/**
 * CompanyAssumptionsTabsView — Renders the 5-tab editor body for the Company
 * Assumptions page. Pure presentational composition; all state and handlers
 * are passed in. Extracted from `client/src/pages/CompanyAssumptions.tsx`
 * (task #471). The legacy `Company` tab (CompanySetupSection + TaxSection)
 * has been removed; those identity / tax fields are managed via
 * Admin → Model Defaults.
 */
import type { GlobalResponse, FeeCategoryResponse } from "@/lib/api";
import type { AnalystVerdict } from "@engine/analyst/contracts/verdict";
import { Tabs, TabsContent, CurrentThemeTab } from "@/components/ui/tabs";
import { SaveButton } from "@/components/ui/save-button";
import { Button } from "@/components/ui/button";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { AnalystVerdictDisplay } from "@/components/analyst/AnalystVerdictDisplay";
import { computeFreshnessStatus } from "@/components/intelligence/IntelligenceStatusBar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IconBuilding2 } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  CompanyIdentitySection,
  CapitalRaisesCard,
  ConvertibleTermsCard,
  CapitalStackDisciplineCard,
  ManagementFeesSection,
  CompensationSection,
  FixedOverheadSection,
  VariableCostsSection,
  CostOfEquityCard,
  PartnerCompSection,
  TabWarningsPanel,
  type TabValidationWarning,
} from "@/components/company-assumptions";
import {
  TAB_FIELDS,
  TAB_LABELS,
  type TabKey,
} from "@/hooks/useCompanyAssumptionsForm";

interface PortfolioPropertySummary {
  id: number;
  name: string;
  isActive?: boolean;
  baseManagementFeeRate?: number;
  incentiveManagementFeeRate?: number;
}

interface Props {
  tabKeys: readonly TabKey[];
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;

  formData: Partial<GlobalResponse>;
  onChange: <K extends keyof GlobalResponse>(field: K, value: GlobalResponse[K]) => void;
  global: GlobalResponse;
  /**
   * `globalAssumptions.id` for the singleton management company. Threaded
   * through to TabWarningsPanel so override change-log rows are written
   * against the real company id rather than 0 (task #332).
   */
  companyId: number;
  isAdmin: boolean;
  properties: PortfolioPropertySummary[];
  allFeeCategories: FeeCategoryResponse[];
  modelStartYear: number;
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;

  tabWarnings: Record<TabKey, TabValidationWarning[]>;
  onDismissWarning: (tab: TabKey, fieldName: string) => void;

  dirtyFields: Set<keyof GlobalResponse>;
  savedTabs: Set<TabKey>;
  savingTab: TabKey | null;
  isUpdatePending: boolean;
  onSaveTab: (tab: TabKey, opts?: { force?: boolean }) => void;
  onCancelTab?: () => void;

  generateResearch: () => void | Promise<void>;
  isGenerating: boolean;
  getTabGating: (tab: TabKey) => { enabled: boolean; reason?: string };
  companyResearchUpdatedAt: string | null;
  lastAssumptionChangeAt: string | null;
  /**
   * Latest Analyst verdict for the mgmt-co.funding Specialist (G1.5c-v1).
   * Rendered here below the funding-card grid (full width) once the user
   * has run the Analyst on this tab; FundingSection itself is now
   * verdict-free so its three cards can flow into the parent grid.
   */
  fundingVerdict?: AnalystVerdict | null;
  /**
   * Currently saved management-company ICP model tier ("A" | "B" | "C")
   * or null if the user hasn't picked one yet. When null AND the
   * Funding tab is active, the page-level Analyst CTA renders as a
   * blue/muted "Select a model first" badge that opens the picker
   * directly instead of firing the Analyst (which would 400 on the
   * server's ICP gate). Read on the page from
   * `globalAssumptions.icpModelTier`.
   */
  icpModelTier?: string | null;
  /**
   * Open the IcpModelDialog without first attempting an Analyst run.
   * Wired to the pre-selection badge so the user can choose a model
   * proactively. Required whenever `icpModelTier` is null.
   */
  onSelectIcpModel?: () => void;
  guidance?: import("@/lib/api").GuidanceRecord[];
}

export function CompanyAssumptionsTabsView(props: Props) {
  const {
    tabKeys, activeTab, onTabChange,
    formData, onChange, global, companyId, isAdmin: _isAdmin,
    properties, allFeeCategories, modelStartYear, researchValues,
    tabWarnings, onDismissWarning,
    dirtyFields, savedTabs, savingTab, isUpdatePending, onSaveTab, onCancelTab,
    generateResearch, isGenerating, getTabGating,
    companyResearchUpdatedAt, lastAssumptionChangeAt,
    fundingVerdict,
    icpModelTier, onSelectIcpModel,
    guidance,
  } = props;

  const gating = getTabGating(activeTab);
  const freshnessStatus = computeFreshnessStatus({
    researchUpdatedAt: companyResearchUpdatedAt,
    lastAssumptionChangeAt,
    isGenerating: false,
  }).status;

  const renderBody = (tab: TabKey) => {
    switch (tab) {
      case "company":
        return (
          <CompanyIdentitySection
            formData={formData}
            onChange={onChange}
            global={global}
          />
        );
      case "funding":
        // The funding tab balances four cards across two columns at xl
        // (the other tabs use three columns, but Capital Raises is now
        // taller than the rest because the two tranches stack vertically,
        // so a 3-col layout left columns 2 and 3 visibly short):
        //   col 1 → Capital Raises (the two tranches stacked vertically)
        //   col 2 → Cost of Capital → Convertible Terms → Capital Stack
        //           Discipline (three smaller cards stacked, total height
        //           ≈ the Capital Raises card)
        // Each named card is composed directly so column 2 can stack the
        // three cards in a single vertical container. The Analyst verdict
        // renders below the grid full-width — the structured 5-dimension
        // stack reads better as one wide column than as a single grid cell.
        return (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 items-start">
              <CapitalRaisesCard
                formData={formData}
                onChange={onChange}
                global={global}
              />
              <div className="space-y-6">
                <CostOfEquityCard
                  formData={formData} onChange={onChange} global={global}
                  researchValues={researchValues}
                />
                <ConvertibleTermsCard
                  formData={formData}
                  onChange={onChange}
                  global={global}
                />
                <CapitalStackDisciplineCard
                  formData={formData}
                  onChange={onChange}
                  global={global}
                />
              </div>
            </div>
            {fundingVerdict ? (
              <div data-testid="funding-verdict-section">
                <AnalystVerdictDisplay verdict={fundingVerdict} />
              </div>
            ) : null}
          </div>
        );
      case "revenue":
        return (
          <ManagementFeesSection
            formData={formData} onChange={onChange} global={global}
            properties={properties} allFeeCategories={allFeeCategories}
            researchValues={researchValues}
            guidance={guidance}
          />
        );
      case "compensation":
        return (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
            <CompensationSection
              formData={formData} onChange={onChange} global={global}
              researchValues={researchValues}
              guidance={guidance}
            />
            <PartnerCompSection
              formData={formData} onChange={onChange} global={global}
              modelStartYear={modelStartYear} researchValues={researchValues}
              guidance={guidance}
            />
          </div>
        );
      case "overhead":
        return (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
            <FixedOverheadSection
              formData={formData} onChange={onChange} global={global}
              modelStartYear={modelStartYear} researchValues={researchValues}
              guidance={guidance}
            />
            <VariableCostsSection
              formData={formData} onChange={onChange} global={global}
              researchValues={researchValues}
              guidance={guidance}
            />
          </div>
        );
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabKey)} className="space-y-6">
      <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <CurrentThemeTab
          tabs={tabKeys.map((k) => ({
            value: k,
            label: TAB_LABELS[k],
            statusDot: tabWarnings[k]?.length > 0 ? "text-amber-500" : undefined,
          }))}
          activeTab={activeTab}
          onTabChange={(v) => onTabChange(v as TabKey)}
          rightContent={(() => {
            const activeDirty = TAB_FIELDS[activeTab].some((k) => dirtyFields.has(k));
            const activeNeverSaved = !savedTabs.has(activeTab);
            // Pre-selection badge state (Task C): on the Funding tab,
            // when no ICP model is saved, replace the regular AnalystButton
            // with a blue/muted "Select a model first" badge that opens
            // the picker directly. The Analyst can't run without a model
            // (server returns 400 ICP_MODEL_REQUIRED), so funneling the
            // user to the picker first avoids a wasted click.
            const showIcpPicker =
              activeTab === "funding" && !icpModelTier && !!onSelectIcpModel;
            return (
              <div className="flex items-center gap-2">
                {showIcpPicker ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onSelectIcpModel}
                        data-testid="button-select-icp-model"
                        className={cn(
                          "h-7 gap-1.5 text-xs",
                          // Blue/muted palette so it reads as informational
                          // rather than the amber "ready to run" Analyst CTA.
                          "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100 hover:text-sky-900",
                          "dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/40",
                        )}
                      >
                        <IconBuilding2 className="w-3 h-3" />
                        Select a model first
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[280px] text-center">
                      The Analyst needs to know your management company scale
                      (A / B / C) before it can range your funding plan. Click
                      to select.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <AnalystButton
                    onClick={generateResearch}
                    isRunning={isGenerating}
                    disabled={!gating.enabled}
                    disabledReason={gating.reason}
                    tooltip={`Consult the Analyst on ${TAB_LABELS[activeTab]}`}
                    size="sm"
                    freshnessStatus={freshnessStatus}
                    dataTestId={`button-ask-analyst-${activeTab}`}
                  />
                )}
                {onCancelTab && (activeDirty || activeNeverSaved) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancelTab}
                    disabled={savingTab === activeTab && isUpdatePending}
                    data-testid={`button-cancel-tab-${activeTab}`}
                  >
                    Cancel
                  </Button>
                )}
                <SaveButton
                  onClick={() => onSaveTab(activeTab, { force: activeNeverSaved && !activeDirty })}
                  isPending={savingTab === activeTab && isUpdatePending}
                  hasChanges={activeDirty || activeNeverSaved}
                  alwaysActive
                  size="sm"
                  data-testid={`button-save-tab-${activeTab}`}
                />
              </div>
            );
          })()}
        />
      </div>

      {tabKeys.map((tab) => (
        <TabsContent
          key={tab}
          value={tab}
          className="mt-0 space-y-6"
          data-testid={`tab-content-${tab}`}
        >
          <TabWarningsPanel
            companyId={companyId}
            warnings={tabWarnings[tab]}
            onDismissWarning={(fieldName) => onDismissWarning(tab, fieldName)}
          />
          {renderBody(tab)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
