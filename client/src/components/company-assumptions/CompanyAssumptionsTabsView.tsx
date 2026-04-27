/**
 * CompanyAssumptionsTabsView — Renders the 5-tab editor body for the Company
 * Assumptions page. Pure presentational composition; all state and handlers
 * are passed in. Extracted from `client/src/pages/CompanyAssumptions.tsx`
 * (task #471). The legacy `Company` tab (CompanySetupSection + TaxSection)
 * has been removed; those identity / tax fields are managed via
 * Admin → Model Defaults.
 */
import type { GlobalResponse, FeeCategoryResponse } from "@/lib/api";
import { Tabs, TabsContent, CurrentThemeTab } from "@/components/ui/tabs";
import { SaveButton } from "@/components/ui/save-button";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { computeFreshnessStatus } from "@/components/intelligence/IntelligenceStatusBar";
import {
  FundingSection,
  ManagementFeesSection,
  CompensationSection,
  FixedOverheadSection,
  VariableCostsSection,
  CostOfEquityCard,
  PropertyExpenseRatesSection,
  PropertyExitDefaultsCard,
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

  generateResearch: () => void | Promise<void>;
  isGenerating: boolean;
  getTabGating: (tab: TabKey) => { enabled: boolean; reason?: string };
  companyResearchUpdatedAt: string | null;
  lastAssumptionChangeAt: string | null;
}

export function CompanyAssumptionsTabsView(props: Props) {
  const {
    tabKeys, activeTab, onTabChange,
    formData, onChange, global, companyId, isAdmin,
    properties, allFeeCategories, modelStartYear, researchValues,
    tabWarnings, onDismissWarning,
    dirtyFields, savedTabs, savingTab, isUpdatePending, onSaveTab,
    generateResearch, isGenerating, getTabGating,
    companyResearchUpdatedAt, lastAssumptionChangeAt,
  } = props;

  const gating = getTabGating(activeTab);
  const freshnessStatus = computeFreshnessStatus({
    researchUpdatedAt: companyResearchUpdatedAt,
    lastAssumptionChangeAt,
    isGenerating: false,
  }).status;

  const renderBody = (tab: TabKey) => {
    switch (tab) {
      case "funding":
        return (
          <div className="space-y-6">
            <FundingSection formData={formData} onChange={onChange} global={global} />
            <CostOfEquityCard
              formData={formData} onChange={onChange} global={global}
              researchValues={researchValues}
            />
          </div>
        );
      case "revenue":
        return (
          <ManagementFeesSection
            formData={formData} onChange={onChange} global={global}
            properties={properties} allFeeCategories={allFeeCategories}
            researchValues={researchValues}
          />
        );
      case "compensation":
        return (
          <>
            <CompensationSection
              formData={formData} onChange={onChange} global={global}
              researchValues={researchValues}
            />
            <PartnerCompSection
              formData={formData} onChange={onChange} global={global}
              modelStartYear={modelStartYear} researchValues={researchValues}
            />
          </>
        );
      case "overhead":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <FixedOverheadSection
              formData={formData} onChange={onChange} global={global}
              modelStartYear={modelStartYear} researchValues={researchValues}
            />
            <VariableCostsSection
              formData={formData} onChange={onChange} global={global}
              researchValues={researchValues}
            />
          </div>
        );
      case "property-defaults":
        return (
          <div className="space-y-6">
            <PropertyExpenseRatesSection
              formData={formData} onChange={onChange} global={global}
              researchValues={researchValues}
            />
            <PropertyExitDefaultsCard
              formData={formData} onChange={onChange} global={global}
              researchValues={researchValues}
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
          rightContent={
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
          }
        />
      </div>

      {tabKeys.map((tab) => {
        const dirty = TAB_FIELDS[tab].some((k) => dirtyFields.has(k));
        const tabNeverSaved = !savedTabs.has(tab);
        return (
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
            <div className="flex justify-end pt-4 border-t border-border/40">
              <SaveButton
                onClick={() => onSaveTab(tab, { force: tabNeverSaved && !dirty })}
                isPending={savingTab === tab && isUpdatePending}
                hasChanges={dirty || tabNeverSaved}
                alwaysActive
                size="default"
                data-testid={`button-save-tab-${tab}`}
              />
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
