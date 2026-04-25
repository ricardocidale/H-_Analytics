/**
 * CompanyAssumptions.tsx — Editor for management-company-level financial assumptions.
 *
 * Layout: 6 horizontal tabs sit beneath a sticky header. Each tab renders its
 * own bottom Save button wired to `handleSaveTab(tab)`, which persists only
 * that tab's dirty fields and fires the deterministic Analyst watchdog. A
 * single shared `formData` backs all tabs — tabs are pure visual organization
 * over the same form state. The active tab is mirrored to the URL via the
 * `?tab=` query param so deep links and refreshes preserve location.
 *
 * Tabs (April 2026 entity-correctness restructure — see ARCHITECTURE.md §1a):
 *   1. Company           — identity, contact, HQ, financial/regulatory,
 *                          inflation, depreciation, company income tax rate
 *   2. Funding           — funding tranches + cost of equity (DCF discount rate)
 *   3. Revenue Model     — service categories + incentive fee + per-property summary
 *   4. Compensation      — staff salary, staffing tiers, partner comp schedule
 *   5. Overhead          — fixed overhead + variable costs (side-by-side)
 *   6. Property Defaults — USALI ratios + property exit cap rate + sales commission
 *                          (cascading defaults for NEW properties)
 *
 * Note: There is no "Tax & Exit" tab. The Management Company is an operating
 * service business — it has NO cap-rate exit. Property exit defaults live in
 * Property Defaults; cost of equity (the DCF discount rate for any
 * company-level terminal value) lives in Funding.
 *
 * Days Per Month is intentionally NOT here — it lives in
 * Admin → App Defaults → Market & Macro as the single source of truth.
 *
 * Composition (audit #319 R4 split — task #471):
 *   • State / save                  → useCompanyAssumptionsForm (hook)
 *   • Analyst stream + cascade      → useCompanyAnalyst (hook)
 *   • Header / status / pills       → CompanyAssumptionsHeaderBar
 *   • 6-tab editor body             → CompanyAssumptionsTabsView
 *   • Streaming theater + watchdog  → CompanyAnalystOverlay
 *
 * The page itself is just glue: gating rules (per-tab Analyst availability),
 * URL ↔ active-tab sync, and the dependency wiring between the two hooks.
 */
import { useState } from "react";
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics";
import {
  useGlobalAssumptions,
  useUpdateGlobalAssumptions,
  useProperties,
  useAllFeeCategories,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconRefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_MODEL_START_DATE } from "@/lib/constants";
import { isAdminRole } from "@shared/constants";
import {
  SpecialistRequirementsPanel,
  PrerequisitesFailedPanel,
} from "@/components/company/SpecialistRequirementsPanel";
import {
  SummaryFooter,
  CompanyAssumptionsHeaderBar,
  CompanyAssumptionsTabsView,
  CompanyAnalystOverlay,
} from "@/components/company-assumptions";
import {
  useCompanyAssumptionsForm,
  TAB_KEYS,
  type TabKey,
} from "@/hooks/useCompanyAssumptionsForm";
import { useCompanyAnalyst } from "@/hooks/useCompanyAnalyst";

const getInitialTab = (): TabKey => {
  if (typeof window === "undefined") return "company";
  const t = new URLSearchParams(window.location.search).get("tab");
  // Backwards-compat: legacy `setup` and `tax-exit` params remap to `company`.
  const legacyRemap: Record<string, TabKey> = { setup: "company", "tax-exit": "company" };
  if (t && t in legacyRemap) return legacyRemap[t];
  return (TAB_KEYS as readonly string[]).includes(t ?? "") ? (t as TabKey) : "company";
};

export default function CompanyAssumptions() {
  const { data: global, isLoading, isError } = useGlobalAssumptions();
  const { data: properties = [] } = useProperties();
  const { data: allFeeCategories = [] } = useAllFeeCategories();
  const updateMutation = useUpdateGlobalAssumptions();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user ? isAdminRole(user.role) : false;
  const entityId = user?.id ?? 1;

  const formApi = useCompanyAssumptionsForm({
    global,
    isUpdatePending: updateMutation.isPending,
    mutateAsync: updateMutation.mutateAsync,
    toast,
  });

  const analyst = useCompanyAnalyst({
    global,
    isLoading,
    isDirty: formApi.isDirty,
    entityId,
    toast,
  });

  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab);

  const modelStartYear = global?.modelStartDate
    ? new Date(global.modelStartDate).getFullYear()
    : new Date(DEFAULT_MODEL_START_DATE).getFullYear();

  // Per-tab Analyst gating. The Analyst can only research a tab once it has
  // the minimum context it needs to be useful.
  //
  // Rules:
  //   1. Universal — a company name and at least one property must exist.
  //   2. Company anchors — the active tab's anchor fields must be filled in.
  //   3. Cross-tab — every tab except `company` requires Company saved at
  //      least once so the entity is grounded before researching dependents.
  const getTabGating = (tab: TabKey): { enabled: boolean; reason?: string } => {
    if (!formApi.formData.companyName) {
      return { enabled: false, reason: "Set a company name in the Company tab first." };
    }
    if (properties.length === 0) {
      return { enabled: false, reason: "Add at least one property to your portfolio first." };
    }
    if (tab !== "company" && !formApi.savedTabs.has("company")) {
      return {
        enabled: false,
        reason: "Save the Company tab first so the Analyst has anchor context.",
      };
    }
    const num = (k: string): number => {
      const v = (formApi.formData as Record<string, unknown>)[k];
      return typeof v === "number" ? v : Number(v ?? 0);
    };
    switch (tab) {
      case "company":
        if (!formApi.formData.companyCountry) {
          return { enabled: false, reason: "Set the company country so research can localize benchmarks." };
        }
        return { enabled: true };
      case "funding":
        if (num("costOfEquity") <= 0) {
          return { enabled: false, reason: "Set a cost of equity > 0 before researching funding." };
        }
        return { enabled: true };
      case "revenue":
        if (allFeeCategories.length === 0) {
          return { enabled: false, reason: "Define at least one fee category before researching revenue." };
        }
        return { enabled: true };
      case "compensation":
        if (num("staffSalary") <= 0) {
          return { enabled: false, reason: "Set a base staff salary before researching compensation." };
        }
        return { enabled: true };
      case "overhead": {
        const anyOverhead = (
          ["officeLease", "professionalServices", "techInfra", "businessInsurance"] as const
        ).some((k) => num(k) > 0);
        if (!anyOverhead) {
          return { enabled: false, reason: "Enter at least one overhead line item before researching overhead." };
        }
        return { enabled: true };
      }
      case "property-defaults":
        if (num("exitCapRate") <= 0) {
          return { enabled: false, reason: "Set an exit cap rate before researching property defaults." };
        }
        return { enabled: true };
      default:
        return { enabled: true };
    }
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">Failed to load assumptions. Please try refreshing the page.</p>
        </div>
      </Layout>
    );
  }

  if (isLoading || !global) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const handleSaveTab = (tab: TabKey, opts?: { force?: boolean }) =>
    formApi.handleSaveTab(tab, opts, {
      researchValues: analyst.researchValues,
      generateResearch: analyst.generateResearch,
      isGenerating: analyst.isGenerating,
      getTabGating,
    });

  const handleDismissWarning = (tab: TabKey, fieldName: string) =>
    formApi.setTabWarnings((prev) => ({
      ...prev,
      [tab]: prev[tab].filter((w) => w.fieldName !== fieldName),
    }));

  return (
    <Layout>
      <CompanyAnalystOverlay
        isGenerating={analyst.isGenerating}
        streamedContent={analyst.streamedContent}
        abortResearch={analyst.abortResearch}
        watchdogOpen={formApi.watchdogOpen}
        watchdogResult={formApi.watchdogResult}
        watchdogTab={formApi.watchdogTab}
        onWatchdogAction={formApi.handleWatchdogAction}
        onProceedAnyway={formApi.handleProceedAnyway}
        onWatchdogOpenChange={formApi.setWatchdogOpen}
      />
      <AnimatedPage>
        <div className="space-y-6">
          {formApi.hasPendingServerUpdate && (
            <div
              role="status"
              data-testid="banner-pending-server-update"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <div className="flex items-center gap-2">
                <IconRefreshCw className="h-4 w-4" />
                <span>
                  New server values are available. Discard your unsaved edits to refresh from the latest data.
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                data-testid="button-discard-edits-and-refresh"
                onClick={formApi.discardEditsAndRefresh}
              >
                Discard edits and refresh
              </Button>
            </div>
          )}

          <CompanyAssumptionsHeaderBar
            companyName={global.companyName}
            autoRefresh={analyst.autoRefresh}
            setAutoRefresh={analyst.setAutoRefresh}
            companyResearchUpdatedAt={analyst.companyResearchUpdatedAt}
            lastAssumptionChangeAt={global.lastAssumptionChangeAt ?? null}
            isGenerating={analyst.isGenerating}
            isUpdatePending={updateMutation.isPending}
            generateResearch={analyst.generateResearch}
            savedTabsCount={formApi.savedTabs.size}
            tabWarnings={formApi.tabWarnings}
            tabKeys={TAB_KEYS}
            acks={formApi.acks}
            isFirstVisit={analyst.isFirstVisit}
            activeTab={activeTab}
          />

          <CompanyAssumptionsTabsView
            tabKeys={TAB_KEYS}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            formData={formApi.formData}
            onChange={formApi.handleUpdate}
            global={global}
            companyId={global.id}
            isAdmin={isAdmin}
            properties={properties}
            allFeeCategories={allFeeCategories}
            modelStartYear={modelStartYear}
            researchValues={analyst.researchValues}
            tabWarnings={formApi.tabWarnings}
            onDismissWarning={handleDismissWarning}
            dirtyFields={formApi.dirtyFields}
            savedTabs={formApi.savedTabs}
            savingTab={formApi.savingTab}
            isUpdatePending={updateMutation.isPending}
            onSaveTab={handleSaveTab}
            generateResearch={analyst.generateResearch}
            isGenerating={analyst.isGenerating}
            getTabGating={getTabGating}
            companyResearchUpdatedAt={analyst.companyResearchUpdatedAt}
            lastAssumptionChangeAt={global.lastAssumptionChangeAt ?? null}
          />

          <PrerequisitesFailedPanel
            failures={formApi.prerequisiteFailures}
            onDismiss={() => formApi.setPrerequisiteFailures([])}
          />

          <SpecialistRequirementsPanel entityValues={global as unknown as Record<string, unknown> | undefined} />

          <SummaryFooter
            formData={formApi.formData}
            onChange={formApi.handleUpdate}
            global={global}
            activeTab={activeTab}
          />
        </div>
      </AnimatedPage>
    </Layout>
  );
}
