import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CurrentThemeTab, type CurrentThemeTabItem } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";
import { invalidateAllFinancialQueries } from "@/lib/api";
import type { AdminSaveState } from "@/components/admin/save-state";
import type { Draft } from "./model-defaults/FieldHelpers";
import { MarketMacroTab } from "./model-defaults/MarketMacroTab";
import { ModelConstantsTab } from "./model-defaults/ModelConstantsTab";
import { PropertyUnderwritingTab } from "./model-defaults/PropertyUnderwritingTab";
import { CompanyTab } from "./model-defaults/CompanyTab";
import { DdTemplateTab } from "./model-defaults/DdTemplateTab";
import { CapitalStackDisciplineTab } from "./model-defaults/CapitalStackDisciplineTab";
import { IcpMixTab } from "./model-defaults/IcpMixTab";
import { ManagementCoTab } from "./model-defaults/ManagementCoTab";
import { BrandsTab } from "./model-defaults/BrandsTab";
import { useAuth } from "@/lib/auth";
import {
  useAnalystRefresh,
  type AnalystGuidanceRecord,
} from "@/components/analyst/useAnalystRefresh";
import { MissingRequiredFieldsPrompt } from "@/components/analyst/MissingRequiredFieldsPrompt";
import {
  COMPANY_TAB_ANALYST_FIELDS,
  MARKET_MACRO_TAB_ANALYST_FIELDS,
  PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS,
} from "./model-defaults/analyst-fields";

interface ModelDefaultsTabProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
  initialTab?: string;
  /**
   * If provided, only the listed sub-tabs are rendered. Used by the Defaults
   * section in the admin sidebar so each menu item (Management Company,
   * Property, Market & Macro, Constants) shows only its own defaults.
   * When undefined, all tabs are shown (legacy entry point behavior).
   */
  visibleTabs?: readonly string[];
}

export default function ModelDefaultsTab({ onSaveStateChange, initialTab, visibleTabs }: ModelDefaultsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const { data: saved, isLoading } = useQuery({
    queryKey: ["globalAssumptions"],
    queryFn: async () => {
      const res = await fetch("/api/global-assumptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch global assumptions");
      return res.json();
    },
  });

  // Analyst guidance for the admin's company-scope (entityType="company",
  // entityId=userId). Only fetched for admins — non-admins never reach this
  // component but we guard defensively.
  const guidanceQueryKey = useMemo(
    () => ["analyst-guidance", "company", user?.id] as const,
    [user?.id],
  );
  const { data: guidanceResp } = useQuery({
    queryKey: guidanceQueryKey,
    enabled: Boolean(isAdmin && user?.id),
    queryFn: async () => {
      const res = await fetch(
        `/api/guidance/company/${user!.id}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch analyst guidance");
      return res.json() as Promise<{
        records: AnalystGuidanceRecord[];
      }>;
    },
  });
  const guidance = guidanceResp?.records ?? [];

  // surface the catalog locked-hard preflight gate. The
  // hook checks `entityValues` (the loaded admin defaults) against the
  // catalog before posting; if any locked-hard field is missing the
  // prompt opens and no API call is made.
  const [missingFieldsPrompt, setMissingFieldsPrompt] = useState<{
    open: boolean;
    specialistId: string;
    missingFields: { key: string; label: string; surface: string; surfaceAnchor?: string }[];
  }>({ open: false, specialistId: "", missingFields: [] });
  const analyst = useAnalystRefresh({
    scope: "global-assumptions",
    invalidateKeys: [guidanceQueryKey],
    entityValues: saved as Record<string, unknown> | undefined,
    onMissingRequiredFields: (info) =>
      setMissingFieldsPrompt({
        open: true,
        specialistId: info.specialistId,
        missingFields: info.missingFields,
      }),
  });

  // G2-v1 Revenue Specialist — routes through the v1 single-shot Opus path
  // when the user presses the Analyst button in the Revenue ancillary section.
  // Wired with `entityValues: saved` so the client-side preflight can detect
  // missing required fields before burning the 60s server cooldown.
  const revenueRefresh = useAnalystRefresh({
    scope: "global-assumptions",
    specialistId: "mgmt-co.revenue",
    invalidateKeys: [guidanceQueryKey],
    entityValues: saved as Record<string, unknown> | undefined,
    onMissingRequiredFields: (info) =>
      setMissingFieldsPrompt({
        open: true,
        specialistId: info.specialistId,
        missingFields: info.missingFields,
      }),
  });

  // Funding Specialist — evaluates the management company's capital-raise
  // plan against live benchmarks. Wired to the Capital Stack Discipline tab.
  const fundingRefresh = useAnalystRefresh({
    scope: "global-assumptions",
    specialistId: "mgmt-co.funding",
    invalidateKeys: [guidanceQueryKey],
    entityValues: saved as Record<string, unknown> | undefined,
    onMissingRequiredFields: (info) =>
      setMissingFieldsPrompt({
        open: true,
        specialistId: info.specialistId,
        missingFields: info.missingFields,
      }),
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Draft) => {
      const res = await fetch("/api/global-assumptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...saved, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to save app defaults");
      return res.json();
    },
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
      toast({ title: "App defaults saved", description: "Changes will apply to new entities. Existing properties retain their current values." });
      setIsDirty(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save app defaults.", variant: "destructive" });
    },
  });

  const [draft, setDraft] = useState<Draft>({});
  const [isDirty, setIsDirty] = useState(false);
  const draftRef = useRef<Draft>({});

  useEffect(() => {
    if (saved) {
      setDraft({ ...saved });
      draftRef.current = { ...saved };
      setIsDirty(false);
    }
  }, [saved]);

  const handleChange = useCallback((field: string, value: any) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      draftRef.current = next;
      return next;
    });
    setIsDirty(true);
  }, []);

  const saveRef = useRef<(() => void) | undefined>(undefined);
  saveRef.current = () => saveMutation.mutate(draftRef.current);

  // Tab-scoped Save for the Capital Stack Discipline tab — persists only the
  // four discipline fields so it does not bundle in unsaved edits from other
  // tabs (Company, Market & Macro, etc.).
  const CAPITAL_STACK_DISCIPLINE_FIELDS = [
    "runwayBufferMonths",
    "sizingOvershootPct",
    "revenueRampDelayMonths",
    "burnFlexDownPct",
  ] as const;
  const pickDisciplineFields = (source: Draft): Draft => {
    const out: Draft = {};
    for (const k of CAPITAL_STACK_DISCIPLINE_FIELDS) {
      if (k in source) (out as Record<string, unknown>)[k] = (source as Record<string, unknown>)[k];
    }
    return out;
  };
  const saveCapitalStackDiscipline = () => {
    saveMutation.mutate(pickDisciplineFields(draftRef.current));
  };
  const resetCapitalStackDiscipline = () => {
    if (!saved) return;
    const savedDiscipline = pickDisciplineFields(saved as Draft);
    setDraft((prev) => {
      const next = { ...prev, ...savedDiscipline };
      draftRef.current = next;
      const savedRecord = saved as Record<string, unknown>;
      const nextRecord = next as Record<string, unknown>;
      setIsDirty(Object.keys(savedRecord).some((k) => nextRecord[k] !== savedRecord[k]));
      return next;
    });
  };

  useEffect(() => {
    onSaveStateChange?.({
      isDirty,
      isPending: saveMutation.isPending,
      onSave: () => saveRef.current?.(),
      // Model Defaults uses Save as the admin's endorsement of the
      // displayed values, so the shared header Save button stays clickable
      // even when nothing is dirty. The save is safe to invoke as a no-op
      // (idempotent PUT into globalAssumptions).
      requiresEndorsement: true,
    });
    return () => onSaveStateChange?.(null);
  }, [isDirty, saveMutation.isPending, onSaveStateChange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-pop" />
      </div>
    );
  }

  // When `visibleTabs` is provided, we render only those sub-tabs and clamp
  // the default selection so we don't fall through to a hidden tab.
  const showTab = (tab: string) => !visibleTabs || visibleTabs.includes(tab);
  const resolvedInitialTab =
    initialTab && showTab(initialTab)
      ? initialTab
      : (visibleTabs && visibleTabs[0]) ?? "company";

  const [activeTab, setActiveTab] = useState(resolvedInitialTab);
  useEffect(() => {
    setActiveTab(resolvedInitialTab);
  }, [resolvedInitialTab]);

  const ALL_MODEL_DEFAULTS_TABS: CurrentThemeTabItem[] = [
    { value: "company",                  label: "Company" },
    { value: "icp-mix",                  label: "ICP Mix" },
    { value: "capital-stack-discipline", label: "Capital Stack Discipline" },
    { value: "market-macro",             label: "Market & Macro" },
    { value: "model-constants",          label: "Model Constants" },
    { value: "dd-template",              label: "Due Diligence Template" },
    { value: "property-underwriting",    label: "Property Underwriting" },
    { value: "management-co-fees",       label: "Management Co Fees" },
    { value: "brands",                   label: "Brands" },
  ];

  return (
    <div data-testid="admin-app-defaults">
      <div className="space-y-4">
        <CurrentThemeTab
          tabs={ALL_MODEL_DEFAULTS_TABS.filter(t => showTab(t.value))}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {activeTab === "company" && (
            <CompanyTab
              draft={draft}
              onChange={handleChange}
              guidance={guidance}
              onAnalystRefresh={analyst.triggerRefresh}
              analystRunning={analyst.running}
              analystCooldownMs={analyst.cooldownRemainingMs}
              isDirty={isDirty}
              isPending={saveMutation.isPending}
              onSave={() => saveRef.current?.()}
              onReset={() => {
                if (saved) {
                  const reset = { ...saved };
                  setDraft(reset);
                  draftRef.current = reset;
                  setIsDirty(false);
                }
              }}
            />
        )}

        {activeTab === "icp-mix" && <IcpMixTab />}

        {activeTab === "capital-stack-discipline" && (
            <CapitalStackDisciplineTab
              draft={draft}
              onChange={handleChange}
              onFundingAnalystRefresh={fundingRefresh.triggerRefresh}
              fundingAnalystRunning={fundingRefresh.running}
              fundingAnalystCooldownMs={fundingRefresh.cooldownRemainingMs}
              fundingVerdict={fundingRefresh.lastVerdict}
              isDirty={
                saved
                  ? CAPITAL_STACK_DISCIPLINE_FIELDS.some(
                      (k) =>
                        (draft as Record<string, unknown>)[k] !==
                        (saved as Record<string, unknown>)[k],
                    )
                  : false
              }
              isPending={saveMutation.isPending}
              onSave={saveCapitalStackDiscipline}
              onReset={resetCapitalStackDiscipline}
            />
        )}

        {activeTab === "market-macro" && (
            <MarketMacroTab
              draft={draft}
              onChange={handleChange}
              guidance={guidance}
              onAnalystRefresh={analyst.triggerRefresh}
              analystRunning={analyst.running}
              analystCooldownMs={analyst.cooldownRemainingMs}
            />
        )}

        {activeTab === "model-constants" && (
            <ModelConstantsTab />
        )}

        {activeTab === "dd-template" && (
            <DdTemplateTab />
        )}

        {activeTab === "property-underwriting" && (
            <PropertyUnderwritingTab
              draft={draft}
              onChange={handleChange}
              guidance={guidance}
              onAnalystRefresh={analyst.triggerRefresh}
              analystRunning={analyst.running}
              analystCooldownMs={analyst.cooldownRemainingMs}
              onRevenueAnalystRefresh={revenueRefresh.triggerRefresh}
              revenueAnalystRunning={revenueRefresh.running}
              revenueAnalystCooldownMs={revenueRefresh.cooldownRemainingMs}
              revenueVerdict={revenueRefresh.lastVerdict}
            />
        )}

        {activeTab === "management-co-fees" && (
            <ManagementCoTab />
        )}

        {activeTab === "brands" && (
            <BrandsTab />
        )}

      </div>
      <MissingRequiredFieldsPrompt
        open={missingFieldsPrompt.open}
        onOpenChange={(open) => setMissingFieldsPrompt((p) => ({ ...p, open }))}
        specialistLabel="Analyst refresh"
        missingFields={missingFieldsPrompt.missingFields}
      />
    </div>
  );
}
