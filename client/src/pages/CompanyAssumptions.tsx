/**
 * CompanyAssumptions.tsx — Editor for management-company-level financial assumptions.
 *
 * Layout: 5 horizontal tabs sit beneath a sticky header. Each tab renders its
 * own bottom Save button wired to `handleSaveTab(tab)`, which persists only
 * that tab's dirty fields. Save is data-only — it DOES NOT invoke The
 * Analyst (per binding rule .claude/rules/analyst-trigger-discipline.md and
 * task #738). The Analyst evaluates ONLY on an explicit `<AnalystButton />`
 * press. The save-tab response shape is `{ ok, savedTabs, requiredFieldsMissing? }`
 * (task #737); `requiredFieldsMissing` (if present) is surfaced as a
 * non-blocking amber banner on the active tab and never auto-dispatches.
 * A single shared `formData` backs all tabs — tabs are pure visual
 * organization over the same form state. The active tab is mirrored to
 * the URL via the `?tab=` query param so deep links and refreshes preserve
 * location.
 *
 * Tabs (April 2026 entity-correctness restructure — see ARCHITECTURE.md §1a):
 *   1. Funding           — funding tranches + cost of equity (DCF discount rate)
 *   2. Revenue Model     — service categories + incentive fee + per-property summary
 *   3. Compensation      — staff salary, staffing tiers, partner comp schedule
 *   4. Overhead          — fixed overhead + variable costs (side-by-side)
 *   5. Property Defaults — USALI ratios + property exit cap rate + sales commission
 *                          (cascading defaults for NEW properties)
 *
 * The legacy `Company` tab (identity / contact / HQ / inflation / depreciation
 * / company income tax rate) was removed. Those fields are now managed
 * exclusively via Admin → Model Defaults — they are not editable on this page.
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
 *   • 5-tab editor body             → CompanyAssumptionsTabsView
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
  if (typeof window === "undefined") return "funding";
  const t = new URLSearchParams(window.location.search).get("tab");
  // Backwards-compat: the legacy `company`, `setup`, and `tax-exit` params
  // (from before the Company tab was removed) all remap to `funding`, the
  // new default landing tab.
  const legacyRemap: Record<string, TabKey> = {
    company: "funding",
    setup: "funding",
    "tax-exit": "funding",
  };
  if (t && t in legacyRemap) return legacyRemap[t];
  return (TAB_KEYS as readonly string[]).includes(t ?? "") ? (t as TabKey) : "funding";
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
  //   1. Universal — a company name (from Admin → Model Defaults) and at
  //      least one property must exist.
  //   2. Tab anchors — the active tab's anchor fields must be filled in.
  //
  // The previous "save the Company tab first" cross-tab gate was dropped
  // along with the Company tab itself; company identity/tax/inflation now
  // live in Admin → Model Defaults and are seeded before this page loads.
  const getTabGating = (tab: TabKey): { enabled: boolean; reason?: string } => {
    if (!formApi.formData.companyName) {
      return { enabled: false, reason: "Set a company name in Admin → Model Defaults first." };
    }
    if (properties.length === 0) {
      return { enabled: false, reason: "Add at least one property to your portfolio first." };
    }
    const num = (k: string): number => {
      const v = (formApi.formData as Record<string, unknown>)[k];
      return typeof v === "number" ? v : Number(v ?? 0);
    };
    switch (tab) {
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

  // Save is purely a persistence step — per task #738 + the binding rule
  // `.claude/rules/analyst-trigger-discipline.md`, it does NOT trigger
  // The Analyst. The only data the form hook needs back from this surface
  // is `researchValues` so it can recompute the per-tab warning list
  // against the current Analyst-suggested ranges.
  const handleSaveTab = (tab: TabKey, opts?: { force?: boolean }) =>
    formApi.handleSaveTab(tab, opts, {
      researchValues: analyst.researchValues,
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

          {/*
            Required-fields banner — driven by the new save-tab response
            shape `{ ok, savedTabs, requiredFieldsMissing? }` (task #737).
            Save persists the row regardless; this banner just surfaces
            what's still blank so the user knows what to fill in next.
            It is intentionally non-blocking and DOES NOT auto-invoke
            The Analyst (task #738 / .claude/rules/analyst-trigger-discipline.md).
            Replaces the old <PrerequisitesFailedPanel> that consumed
            the now-removed `verdict.prerequisiteFailures` payload.
          */}
          {formApi.requiredFieldsMissingByTab[activeTab].length > 0 && (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              data-testid={`banner-required-fields-missing-${activeTab}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    Required fields still blank on this tab
                  </div>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {formApi.requiredFieldsMissingByTab[activeTab].map((field) => (
                      <li key={field} data-testid={`text-required-field-${field}`}>
                        {field}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 text-xs opacity-80">
                    Save was successful — fill these in to unlock the next tab
                    and to let The Analyst run when you press its button.
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => formApi.clearRequiredFieldsMissing(activeTab)}
                  data-testid={`button-dismiss-required-fields-${activeTab}`}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

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
