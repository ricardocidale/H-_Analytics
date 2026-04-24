/**
 * useCompanyAssumptionsForm — Owns the editable form state, dirty tracking,
 * per-tab save, deterministic Analyst watchdog state, and post-save validation
 * warnings for the Company Assumptions page.
 *
 * Extracted from `client/src/pages/CompanyAssumptions.tsx` (audit #319 R4
 * deferred precursor — task #471) so the page becomes a presentational shell.
 *
 * Boundaries:
 *   • This hook does NOT know about the Analyst research stream itself.
 *     Callers pass `generateResearch` / `isGenerating` / `getTabGating` /
 *     `researchValues` into `saveTab(...)` so the post-save async refresh and
 *     out-of-band warnings can be computed without coupling the two hooks.
 *   • Per-tab field membership (TAB_FIELDS), labels, and the saved-tabs
 *     hydrator live here because they are pure form metadata.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GlobalResponse } from "@/lib/api";
import type { useToast } from "@/hooks/use-toast";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import { getFactoryNumber } from "@shared/model-constants-registry";
import type { AnalystVerdict, VerdictAction } from "../../../engine/analyst/contracts/verdict";
import type {
  TabValidationWarning,
} from "@/components/company-assumptions";
import type { PrerequisiteFailure } from "@/components/company/SpecialistRequirementsPanel";

const DAYS_PER_MONTH = getFactoryNumber("daysPerMonth");

export const TAB_KEYS = [
  "company",
  "funding",
  "revenue",
  "compensation",
  "overhead",
  "property-defaults",
] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export const TAB_LABELS: Record<TabKey, string> = {
  company: "Company",
  funding: "Funding",
  revenue: "Revenue Model",
  compensation: "Compensation",
  overhead: "Overhead",
  "property-defaults": "Property Defaults",
};

/**
 * Which form fields belong to which tab. Drives per-tab save + per-tab
 * validation. Entity-correctness (ARCHITECTURE.md §1a):
 *   - companyTaxRate lives in `company`
 *   - costOfEquity lives in `funding` (DCF discount rate / WACC Re)
 *   - exitCapRate + salesCommissionRate live in `property-defaults`
 */
export const TAB_FIELDS: Record<TabKey, readonly (keyof GlobalResponse)[]> = {
  company: [
    "companyName", "companyCountry", "companyCity", "companyAddress",
    "companyOpsStartDate", "modelStartDate", "projectionYears",
    "companyInflationRate", "inflationRate", "depreciationYears",
    "companyLogoId", "companyPhone", "companyEmail", "companyWebsite",
    "companyRegistrationNumber", "companyTaxId",
    "companyContactName", "companyContactTitle", "companyContactEmail", "companyContactPhone",
    "companyTaxRate",
  ] as unknown as Array<keyof GlobalResponse>,
  funding: [
    "capitalRaise1Amount", "capitalRaise1Date",
    "capitalRaise2Amount", "capitalRaise2Date",
    "capitalRaiseValuationCap", "capitalRaiseDiscountRate",
    "fundingSourceLabel", "fundingInterestRate",
    "costOfEquity",
  ] as unknown as Array<keyof GlobalResponse>,
  revenue: [
    "baseManagementFee", "incentiveManagementFee",
    "svcFeeMarketing", "svcFeeTechRes", "svcFeeAccounting",
    "svcFeeRevMgmt", "svcFeeGeneralMgmt", "svcFeeProcurement",
  ] as unknown as Array<keyof GlobalResponse>,
  compensation: [
    "staffSalary",
    "staffTier1MaxProperties", "staffTier1Fte",
    "staffTier2MaxProperties", "staffTier2Fte", "staffTier3Fte",
    "partnerCompYear1", "partnerCompYear2", "partnerCompYear3",
    "partnerCompYear4", "partnerCompYear5", "partnerCompYear6",
    "partnerCompYear7", "partnerCompYear8", "partnerCompYear9", "partnerCompYear10",
    "partnerCountYear1", "partnerCountYear2", "partnerCountYear3",
    "partnerCountYear4", "partnerCountYear5", "partnerCountYear6",
    "partnerCountYear7", "partnerCountYear8", "partnerCountYear9", "partnerCountYear10",
  ] as unknown as Array<keyof GlobalResponse>,
  overhead: [
    "officeLease", "professionalServices", "techInfra",
    "businessInsurance", "travelCost", "itLicense",
    "eventExpense", "marketingRate", "miscOps",
  ] as unknown as Array<keyof GlobalResponse>,
  "property-defaults": [
    "eventExpenseRate", "otherExpenseRate", "utilitiesVariableSplit",
    "exitCapRate", "salesCommissionRate",
    "industryVertical", "exitRevenueMultiple",
  ] as unknown as Array<keyof GlobalResponse>,
};

const hydrateSavedTabs = (raw: unknown): Set<TabKey> => {
  const seed = new Set<TabKey>();
  if (!Array.isArray(raw)) return seed;
  for (const k of raw) {
    if ((TAB_KEYS as readonly string[]).includes(k)) seed.add(k as TabKey);
  }
  return seed;
};

type AckRow = { fieldName: string; valueAtAck: number; rangeLowAtAck: number; rangeHighAtAck: number };

type SaveDeps = {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
  generateResearch: () => void | Promise<void>;
  isGenerating: boolean;
  getTabGating: (tab: TabKey) => { enabled: boolean; reason?: string };
};

type Toast = ReturnType<typeof useToast>["toast"];

export interface UseCompanyAssumptionsFormArgs {
  global: GlobalResponse | undefined;
  isUpdatePending: boolean;
  mutateAsync: (data: Partial<GlobalResponse>) => Promise<unknown>;
  toast: Toast;
}

export interface UseCompanyAssumptionsFormReturn {
  formData: Partial<GlobalResponse>;
  isDirty: boolean;
  dirtyFields: Set<keyof GlobalResponse>;
  handleUpdate: <K extends keyof GlobalResponse>(field: K, value: GlobalResponse[K]) => void;
  savedTabs: Set<TabKey>;
  savingTab: TabKey | null;
  tabWarnings: Record<TabKey, TabValidationWarning[]>;
  setTabWarnings: React.Dispatch<React.SetStateAction<Record<TabKey, TabValidationWarning[]>>>;
  watchdogOpen: boolean;
  setWatchdogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  watchdogResult: AnalystVerdict | null;
  watchdogTab: TabKey | null;
  prerequisiteFailures: PrerequisiteFailure[];
  setPrerequisiteFailures: React.Dispatch<React.SetStateAction<PrerequisiteFailure[]>>;
  acks: AckRow[];
  handleSaveTab: (tab: TabKey, opts: { force?: boolean } | undefined, deps: SaveDeps) => Promise<void>;
  handleWatchdogAction: (action: VerdictAction) => Promise<void>;
  handleProceedAnyway: () => void;
}

export function useCompanyAssumptionsForm(
  args: UseCompanyAssumptionsFormArgs,
): UseCompanyAssumptionsFormReturn {
  const { global, isUpdatePending: _isUpdatePending, mutateAsync, toast } = args;
  const queryClient = useQueryClient();
  const { markDirty: markGlobalDirty, clearDirty: clearGlobalDirty } = useScenarioDirtyState();

  const [formData, setFormData] = useState<Partial<GlobalResponse>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<Set<keyof GlobalResponse>>(new Set());

  const [tabWarnings, setTabWarnings] = useState<Record<TabKey, TabValidationWarning[]>>({
    company: [], funding: [], revenue: [], compensation: [],
    overhead: [], "property-defaults": [],
  });
  const [savingTab, setSavingTab] = useState<TabKey | null>(null);
  const [watchdogOpen, setWatchdogOpen] = useState(false);
  const [watchdogResult, setWatchdogResult] = useState<AnalystVerdict | null>(null);
  const [watchdogTab, setWatchdogTab] = useState<TabKey | null>(null);
  const [prerequisiteFailures, setPrerequisiteFailures] = useState<PrerequisiteFailure[]>([]);

  // "Keep my value" acknowledgments — keyed by fieldName. Suppress warning
  // re-flagging while the live value stays inside the snapshot window.
  const { data: acks = [] } = useQuery<AckRow[]>({
    queryKey: ["assumption-acknowledgments", "company", 0],
    queryFn: async () => {
      const res = await fetch("/api/assumption-acknowledgments?entityType=company&entityId=0");
      if (!res.ok) return [];
      return res.json();
    },
    refetchOnWindowFocus: false,
  });
  const ackByField = useMemo(() => {
    const m = new Map<string, AckRow>();
    for (const a of acks) m.set(a.fieldName, a);
    return m;
  }, [acks]);

  const [savedTabs, setSavedTabs] = useState<Set<TabKey>>(() => hydrateSavedTabs(global?.savedTabs));

  // Re-seed savedTabs whenever the server payload changes so scenario loads,
  // watchdog rollbacks, or another user's save propagate into local gating.
  useEffect(() => {
    setSavedTabs(hydrateSavedTabs(global?.savedTabs));
  }, [global?.savedTabs]);

  // Hydrate formData from the server payload.
  useEffect(() => {
    if (global) setFormData(global);
  }, [global]);

  // Warn before unload while there are unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Clear a tab's warnings when the user starts editing fields in that tab again.
  useEffect(() => {
    (Object.keys(TAB_FIELDS) as TabKey[]).forEach((tab) => {
      if (tabWarnings[tab].length === 0) return;
      const stillDirty = TAB_FIELDS[tab].some((k) => dirtyFields.has(k));
      if (stillDirty) {
        setTabWarnings((prev) => ({ ...prev, [tab]: [] }));
      }
    });
    // intentionally only depends on dirtyFields; pruning warnings should react to user edits
  }, [dirtyFields]);

  const handleUpdate = <K extends keyof GlobalResponse>(field: K, value: GlobalResponse[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDirtyFields((prev) => new Set(prev).add(field));
    setIsDirty(true);
    markGlobalDirty();

    // Editing a previously-acked field invalidates the override.
    if (ackByField.has(String(field))) {
      void fetch(
        `/api/assumption-acknowledgments/${encodeURIComponent(String(field))}?entityType=company&entityId=0`,
        { method: "DELETE" },
      ).then((res) => {
        if (res.ok) {
          void queryClient.invalidateQueries({
            queryKey: ["assumption-acknowledgments", "company", 0],
          });
        }
      });
    }
  };

  // Parse a "low–high" or "$X–$Y" display string into numeric bounds.
  const parseRange = (display: string): { low: number; high: number } | null => {
    if (!display) return null;
    const nums = display
      .replace(/[kK]/g, "000")
      .replace(/[^0-9.,\-–]/g, " ")
      .split(/[\s–\-]+/)
      .map((s) => parseFloat(s.replace(/,/g, "")))
      .filter((n) => !Number.isNaN(n));
    if (nums.length >= 2) return { low: Math.min(nums[0], nums[1]), high: Math.max(nums[0], nums[1]) };
    return null;
  };

  // Map a formData field key to the researchValues key (most are identical;
  // partnerComp{Year,Count}* collapse to the single "partnerComp" entry).
  const researchKeyFor = (
    field: keyof GlobalResponse,
    researchValues: SaveDeps["researchValues"],
  ): string | null => {
    const f = String(field);
    if (f.startsWith("partnerComp")) return "partnerComp";
    return f in researchValues ? f : null;
  };

  const computeTabWarnings = (
    keys: readonly (keyof GlobalResponse)[],
    data: Partial<GlobalResponse>,
    researchValues: SaveDeps["researchValues"],
  ): TabValidationWarning[] => {
    const out: TabValidationWarning[] = [];
    const seenByResearchKey = new Set<string>();
    for (const k of keys) {
      const rk = researchKeyFor(k, researchValues);
      if (!rk) continue;
      const rv = researchValues[rk];
      if (!rv) continue;
      const range = parseRange(rv.display);
      if (!range) continue;
      const raw = data[k];
      const num = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
      if (!Number.isFinite(num)) continue;
      if (num < range.low || num > range.high) {
        const ack = ackByField.get(String(k));
        if (ack && num >= ack.rangeLowAtAck && num <= ack.rangeHighAtAck) continue;
        if (seenByResearchKey.has(rk)) continue;
        seenByResearchKey.add(rk);
        out.push({
          fieldName: String(k),
          fieldLabel: String(k),
          currentValue: num,
          rangeLow: range.low,
          rangeHigh: range.high,
          display: rv.display,
        });
      }
    }
    return out;
  };

  // Derive Funding-tab evaluator inputs from the saved formData.
  const deriveFundingInputs = (data: Partial<GlobalResponse>) => {
    const merged = { ...(global ?? {}), ...data } as Record<string, unknown>;
    const d1 = typeof merged.capitalRaise1Date === "string" ? new Date(merged.capitalRaise1Date as string).getTime() : NaN;
    const d2 = typeof merged.capitalRaise2Date === "string" ? new Date(merged.capitalRaise2Date as string).getTime() : NaN;
    let trancheGapMonths: number | null = null;
    if (Number.isFinite(d1) && Number.isFinite(d2) && d1 !== d2) {
      trancheGapMonths = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24 * DAYS_PER_MONTH);
    }
    return {
      runwayBufferMonths: null,
      sizingOvershootPct: null,
      trancheGapMonths,
      revenueRampDelayMonths: null,
      burnFlexDownPct: null,
    };
  };

  const handleWatchdogAction = async (action: VerdictAction) => {
    setWatchdogOpen(false);
    if (action.kind === "consult-cognitive") {
      // Roll back the savedTabs commit for this tab so the gate stays locked.
      if (watchdogTab) {
        try {
          await fetch("/api/global-assumptions/save-tab", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ tabKey: watchdogTab, unsave: true }),
          });
          await queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
          setSavedTabs((prev) => {
            if (!prev.has(watchdogTab)) return prev;
            const next = new Set(prev);
            next.delete(watchdogTab);
            return next;
          });
        } catch (err: unknown) {
          console.warn("Failed to roll back save on Adjust:", err);
        }
      }
      const targetField = action.payload.field;
      const el = document.querySelector<HTMLElement>(
        `[data-field="${targetField}"], [name="${targetField}"], #${CSS.escape(targetField)}`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if ("focus" in el && typeof el.focus === "function") setTimeout(() => el.focus(), 250);
      }
    }
  };

  const handleProceedAnyway = () => {
    setWatchdogOpen(false);
  };

  const handleSaveTab = async (
    tab: TabKey,
    opts: { force?: boolean } | undefined,
    deps: SaveDeps,
  ) => {
    const force = opts?.force ?? false;
    const keys = TAB_FIELDS[tab];
    const touched = keys.filter((k) => dirtyFields.has(k));
    if (touched.length === 0 && !force) {
      // Still mark the tab as saved server-side so the downstream gate opens.
      try {
        const res = await fetch("/api/global-assumptions/save-tab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tabKey: tab }),
        });
        if (res.ok) {
          await queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
          toast({ title: `${TAB_LABELS[tab]} saved`, description: "Marked this tab as reviewed." });
        }
      } catch { /* swallow — toast already shown if pertinent */ }
      return;
    }
    const payload: Partial<GlobalResponse> = {};
    for (const k of touched) (payload as Record<string, unknown>)[k as string] = formData[k];

    setSavingTab(tab);
    try {
      await mutateAsync(payload);
      try {
        const fundingInputs = tab === "funding" ? deriveFundingInputs(formData) : undefined;
        const res = await fetch("/api/global-assumptions/save-tab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tabKey: tab, fundingInputs }),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            verdict?: AnalystVerdict | null;
            prerequisiteFailures?: PrerequisiteFailure[] | null;
          };
          await queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
          if (json.verdict && json.verdict.overallSeverity !== "ok") {
            setWatchdogResult(json.verdict);
            setWatchdogTab(tab);
            setWatchdogOpen(true);
          }
          setPrerequisiteFailures(json.prerequisiteFailures ?? []);
        }
      } catch (watchdogErr: unknown) {
        console.warn("Watchdog save-tab call failed:", watchdogErr);
      }
      setDirtyFields((prev) => {
        const next = new Set(prev);
        for (const k of touched) next.delete(k);
        if (next.size === 0) {
          setIsDirty(false);
          clearGlobalDirty();
        }
        return next;
      });

      const warnings = computeTabWarnings(keys, formData, deps.researchValues);
      setTabWarnings((prev) => ({ ...prev, [tab]: warnings }));

      setSavedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));

      const gating = deps.getTabGating(tab);
      if (gating.enabled && !deps.isGenerating) {
        void deps.generateResearch();
      }

      toast({
        title: `${TAB_LABELS[tab]} saved`,
        description: warnings.length > 0
          ? `${warnings.length} value${warnings.length === 1 ? "" : "s"} outside The Analyst's range — review below.`
          : "Changes take effect immediately.",
      });
    } catch (error: unknown) {
      console.error(`Failed to save ${tab} tab:`, error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Failed to save changes.",
        variant: "destructive",
      });
    } finally {
      setSavingTab(null);
    }
  };

  return {
    formData,
    isDirty,
    dirtyFields,
    handleUpdate,
    savedTabs,
    savingTab,
    tabWarnings,
    setTabWarnings,
    watchdogOpen,
    setWatchdogOpen,
    watchdogResult,
    watchdogTab,
    prerequisiteFailures,
    setPrerequisiteFailures,
    acks,
    handleSaveTab,
    handleWatchdogAction,
    handleProceedAnyway,
  };
}
