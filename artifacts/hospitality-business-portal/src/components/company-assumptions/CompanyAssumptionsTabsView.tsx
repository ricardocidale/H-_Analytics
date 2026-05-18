/**
 * CompanyAssumptionsTabsView — Renders the collapsible sections editor body
 * for the Company Assumptions page. Pure presentational composition; all
 * state and handlers are passed in. Extracted from
 * `client/src/pages/CompanyAssumptions.tsx` (task #471).
 *
 * T2-7 (2026-05-18): Converted from horizontal tabs to CollapsibleSection.
 * Each tab is now a collapsible section. Per-section Save / Cancel / Analyst
 * buttons appear at the bottom of each section's expanded content. The
 * `onSectionOpen` callback notifies the parent when a section is expanded so
 * the parent can sync the URL (`?tab=`) and route Analyst calls correctly.
 *
 * The legacy `Company` tab (CompanySetupSection + TaxSection) has been
 * removed; those identity / tax fields are managed via Admin → Model Defaults.
 */
import type { GlobalResponse, FeeCategoryResponse } from "@/lib/api";
import type { AnalystVerdict } from "@engine/analyst/contracts/verdict";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SaveButton } from "@/components/ui/save-button";
import { Button } from "@/components/ui/button";
import { CancelButton } from "@/components/ui/cancel-button";
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
  ManagementFeesSection,
  CompensationSection,
  FixedOverheadSection,
  VariableCostsSection,
  CostOfEquityCard,
  PartnerCompSection,
  TabWarningsPanel,
  type TabValidationWarning,
} from "@/components/company-assumptions";
import { MgmtCoAssumptionsSection } from "@/components/company/MgmtCoAssumptionsSection";
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
      case "mgmt-co-assumptions":
        return <MgmtCoAssumptionsSection />;
    }
  };

  return (
    <CollapsibleSection
      defaultOpenId={activeTab}
      forceOpenId={activeTab}
      onSectionOpen={(id) => onTabChange(id as TabKey)}
      items={tabKeys.map((tab) => {
        const gating = getTabGating(tab);
        const tabDirty = TAB_FIELDS[tab].some((k) => dirtyFields.has(k));
        const neverSaved = !savedTabs.has(tab);
        const showIcpPicker = tab === "funding" && !icpModelTier && !!onSelectIcpModel;
        const hasWarnings = (tabWarnings[tab]?.length ?? 0) > 0;

        return {
          id: tab,
          summary: (
            <span className="flex items-center gap-2">
              {TAB_LABELS[tab]}
              {hasWarnings && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                  aria-label="has warnings"
                />
              )}
            </span>
          ),
          indicators: hasWarnings
            ? [
                <span key="warn" className="text-xs text-amber-600 dark:text-amber-400">
                  {tabWarnings[tab].length} warning{tabWarnings[tab].length !== 1 ? "s" : ""}
                </span>,
              ]
            : undefined,
          expandedContent: (
            <div className="space-y-6" data-testid={`tab-content-${tab}`}>
              <TabWarningsPanel
                companyId={companyId}
                warnings={tabWarnings[tab]}
                onDismissWarning={(fieldName) => onDismissWarning(tab, fieldName)}
              />
              {renderBody(tab)}
              <div className="flex items-center gap-2 pt-4 border-t border-border/30">
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
                    tooltip={`Consult the Analyst on ${TAB_LABELS[tab]}`}
                    size="sm"
                    freshnessStatus={freshnessStatus}
                    dataTestId={`button-analyst-${tab}`}
                  />
                )}
                {onCancelTab && (tabDirty || neverSaved) && (
                  <CancelButton
                    size="sm"
                    onClick={onCancelTab}
                    disabled={savingTab === tab && isUpdatePending}
                    data-testid={`button-cancel-tab-${tab}`}
                  />
                )}
                <SaveButton
                  onClick={() => onSaveTab(tab, { force: neverSaved && !tabDirty })}
                  isPending={savingTab === tab && isUpdatePending}
                  hasChanges={tabDirty || neverSaved}
                  alwaysActive
                  size="sm"
                  data-testid={`button-save-tab-${tab}`}
                />
              </div>
            </div>
          ),
        };
      })}
    />
  );
}
