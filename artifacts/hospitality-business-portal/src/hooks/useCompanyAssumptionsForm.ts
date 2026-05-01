/**
 * useCompanyAssumptionsForm — Owns the editable form state, dirty tracking,
 * per-tab save, and post-save validation warnings for the Company
 * Assumptions page.
 *
 * Extracted from `client/src/pages/CompanyAssumptions.tsx` (audit #319 R4
 * deferred precursor — task #471) so the page becomes a presentational shell.
 *
 * Trigger discipline (task #738 / .claude/rules/analyst-trigger-discipline.md):
 * Save is now a quiet persistence step. The save-tab response shape is
 * `{ ok, savedTabs, requiredFieldsMissing? }` — there is no `verdict`
 * and no `prerequisiteFailures`. Save no longer side-effect-fires the
 * deterministic Analyst watchdog dialog or auto-runs research on
 * success. The Analyst evaluates ONLY on an explicit AnalystButton
 * click; tabs are simply persisted and the gate progressively unlocks
 * via the savedTabs set.
 *
 * Boundaries:
 *   • This hook does NOT know about the Analyst research stream itself.
 *     Callers pass `researchValues` into `saveTab(...)` so out-of-band
 *     warnings can be computed without coupling the two hooks.
 *   • Per-tab field membership (TAB_FIELDS), labels, and the saved-tabs
 *     hydrator live here because they are pure form metadata.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GlobalResponse } from "@/lib/api";
import type { useToast } from "@/hooks/use-toast";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import { getFactoryNumber } from "@shared/model-constants-registry";
import type {
  TabValidationWarning,
} from "@/components/company-assumptions";
import {
  computeExitMultipleWarning,
  type ExitMultipleBand,
} from "./exit-multiple-warning";

const DAYS_PER_MONTH = getFactoryNumber("daysPerMonth");

export const TAB_KEYS = [
  "funding",
  "revenue",
  "compensation",
  "overhead",
  "property-defaults",
] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export const TAB_LABELS: Record<TabKey, string> = {
  funding: "Funding",
  revenue: "Revenue Model",
  compensation: "Compensation",
  overhead: "Overhead",
  "property-defaults": "Property Defaults",
};

/**
 * Which form fields belong to which tab. Drives per-tab save + per-tab
 * validation. Entity-correctness (ARCHITECTURE.md §1a):
 *   - companyTaxRate / inflation / company identity now live in
 *     Admin → Model Defaults (the legacy `company` tab here was removed).
 *   - costOfEquity lives in `funding` (DCF discount rate / WACC Re)
 *   - exitCapRate + salesCommissionRate live in `property-defaults`
 */
export const TAB_FIELDS: Record<TabKey, readonly (keyof GlobalResponse)[]> = {
  funding: [
    "capitalRaise1Amount", "capitalRaise1Date",
    "capitalRaise2Amount", "capitalRaise2Date",
    "capitalRaiseValuationCap", "capitalRaiseDiscountRate",
    "fundingSourceLabel", "fundingInterestRate",
    "costOfEquity",
    // G1.5b Packet B: Funding-Specialist required-field cascade.
    // Per .claude/rules/inflation-cascade.md these live as Defaults
    // (admin) and Assumptions (user) — listing them here makes the
    // user edits dirty-trackable and persisted via PUT /api/global-assumptions.
    "runwayBufferMonths", "sizingOvershootPct",
    "revenueRampDelayMonths", "burnFlexDownPct",
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


/**
 * Save deps now contain only what `handleSaveTab` actually needs:
 * `researchValues` for post-save tab-warning recomputation. Per task #738
 * (.claude/rules/analyst-trigger-discipline.md), Save does NOT auto-invoke
 * The Analyst, so `generateResearch` / `isGenerating` / `getTabGating`
 * have been dropped from this contract — keeping them around as unused
 * inputs would create a regression vector for re-introducing an implicit
 * save-time trigger.
 */
type SaveDeps = {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
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
  /**
   * Per-tab list of admin-declared required fields that were still
   * blank at the most-recent save. Surfaces the new save-tab response
   * field `requiredFieldsMissing?: string[]` (task #737) so the page
   * can render a non-blocking banner without auto-invoking The
   * Analyst (task #738). Empty array means the last save reported
   * none missing (or no save has happened yet for this tab).
   */
  requiredFieldsMissingByTab: Record<TabKey, string[]>;
  /** Manually clear the banner for one tab (e.g. after the user fills the field). */
  clearRequiredFieldsMissing: (tab: TabKey) => void;
  acks: AckRow[];
  handleSaveTab: (tab: TabKey, opts: { force?: boolean } | undefined, deps: SaveDeps) => Promise<boolean>;
  hasPendingServerUpdate: boolean;
  discardEditsAndRefresh: () => void;
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
  // When a background refetch updates `global` while the user has unsaved
  // edits (`isDirty === true`), we must NOT clobber what they're typing.
  // Instead we stash the incoming server snapshot here so the page can
  // surface a "new server values available — discard your edits to refresh"
  // affordance. The user explicitly opts in to overwrite via
  // `discardEditsAndRefresh()`. See task #333.
  const [pendingServerSnapshot, setPendingServerSnapshot] =
    useState<GlobalResponse | null>(null);

  const [tabWarnings, setTabWarnings] = useState<Record<TabKey, TabValidationWarning[]>>({
    funding: [], revenue: [], compensation: [],
    overhead: [], "property-defaults": [],
  });
  const [savingTab, setSavingTab] = useState<TabKey | null>(null);

  // Per-tab `requiredFieldsMissing` — the new save-tab response shape
  // (task #737) returns `{ ok, savedTabs, requiredFieldsMissing? }`
  // where `requiredFieldsMissing` is the list of admin-declared
  // required fields that were still blank at save time. Save itself
  // succeeds (the row is persisted), but the page surfaces the list
  // as a non-blocking banner so the user knows what to fill in to
  // unlock the next tab / Analyst run. This is the data-only,
  // non-Analyst-triggering save UX the new shape is for; per task
  // #738 we read it but never auto-dispatch on it.
  const [requiredFieldsMissingByTab, setRequiredFieldsMissingByTab] =
    useState<Record<TabKey, string[]>>({
      funding: [], revenue: [], compensation: [],
      overhead: [], "property-defaults": [],
    });

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

  // Admin-managed exit-multiple bands. Shares the cache key with
  // PropertyExitDefaultsCard so the inline card warning and the save-flow
  // warning never disagree about which range a vertical lives in.
  const { data: exitMultiples = [] } = useQuery<ExitMultipleBand[]>({
    queryKey: ["/api/exit-multiples"],
    queryFn: async () => {
      const res = await fetch("/api/exit-multiples", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
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

  // Tracks the last server snapshot we successfully hydrated into formData.
  // We use this (and not `global` itself) to detect "the server moved out
  // from under me while I was editing", because `global` is just whatever
  // react-query last handed us — it is not a record of what the user has
  // already seen / accepted into their form state.
  const lastHydratedRef = useRef<GlobalResponse | null>(null);

  // Hydrate formData from the server payload. We skip overwriting whenever
  // the user has unsaved edits (`isDirty === true`) AND the incoming server
  // snapshot is genuinely new — clobbering live typing during a background
  // refetch is the data-loss bug from task #333. When we skip, we stash the
  // incoming snapshot so the UI can offer a "discard edits and refresh"
  // affordance and the user can opt in explicitly.
  useEffect(() => {
    if (!global) return;
    const isNewSnapshot = global !== lastHydratedRef.current;
    if (isDirty && isNewSnapshot) {
      setPendingServerSnapshot(global);
      return;
    }
    if (!isDirty) {
      setFormData(global);
      lastHydratedRef.current = global;
      setPendingServerSnapshot(null);
    }
  }, [global, isDirty]);

  const discardEditsAndRefresh = () => {
    const snapshot = pendingServerSnapshot ?? global;
    if (!snapshot) return;
    setFormData(snapshot);
    lastHydratedRef.current = snapshot;
    setDirtyFields(new Set());
    setIsDirty(false);
    clearGlobalDirty();
    setPendingServerSnapshot(null);
  };

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

    // Editing a previously-acked field invalidates the override. Editing
    // industryVertical also invalidates an existing exitRevenueMultiple ack
    // because changing the vertical changes the band — a snapshot taken
    // under the old band must not silently suppress the new warning.
    if (ackByField.has(String(field))) {
      const extras: string[] =
        String(field) === "industryVertical" && ackByField.has("exitRevenueMultiple")
          ? ["exitRevenueMultiple"]
          : [];
      void Promise.all(
        [String(field), ...extras].map((f) =>
          fetch(
            `/api/assumption-acknowledgments/${encodeURIComponent(f)}?entityType=company&entityId=0`,
            { method: "DELETE" },
          ),
        ),
      ).then((results) => {
        const res = results[0];
        if (res.ok) {
          void queryClient.invalidateQueries({
            queryKey: ["assumption-acknowledgments", "company", 0],
          });
        }
      });
    } else if (
      String(field) === "industryVertical" &&
      ackByField.has("exitRevenueMultiple")
    ) {
      // Vertical changed but no ack on vertical itself — still clear the
      // exit-multiple ack so the new band is evaluated against fresh state.
      void fetch(
        `/api/assumption-acknowledgments/${encodeURIComponent("exitRevenueMultiple")}?entityType=company&entityId=0`,
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

    // Exit revenue multiple — admin-managed band check (separate from the
    // Analyst research ranges above). The PropertyExitDefaultsCard already
    // surfaces this inline, but at save time we also push it into
    // tabWarnings so the post-save toast count and the warnings panel
    // include it — making it harder to miss when batching multiple edits.
    if (keys.includes("exitRevenueMultiple" as keyof GlobalResponse)) {
      const merged = { ...(global ?? {}), ...data } as Partial<GlobalResponse>;
      const exitWarning = computeExitMultipleWarning({
        industryVertical: merged.industryVertical,
        exitRevenueMultiple: merged.exitRevenueMultiple,
        bands: exitMultiples,
        ack: ackByField.get("exitRevenueMultiple") ?? null,
      });
      if (exitWarning) out.push(exitWarning);
    }

    return out;
  };

  // Derive Funding-tab evaluator inputs from the saved formData.
  // G1.5b Packet B: the four user-editable cascade fields (runway buffer,
  // sizing overshoot, revenue-ramp delay, burn flex-down) now read from
  // the merged form snapshot (formData ∪ global). NULL-on-disk indicates
  // "inherit Default tier"; the read here surfaces concrete numbers when
  // the user has typed any value, otherwise the AnalystButton transform
  // applies `?? DEFAULT_*` from `shared/constants-funding.ts`.
  // trancheGapMonths is derived from the two capital-raise dates and is
  // NOT a user input on the funding tab — see the inflation-cascade rule.
  const deriveFundingInputs = (data: Partial<GlobalResponse>) => {
    const merged = { ...(global ?? {}), ...data } as Record<string, unknown>;
    const d1 = typeof merged.capitalRaise1Date === "string" ? new Date(merged.capitalRaise1Date as string).getTime() : NaN;
    const d2 = typeof merged.capitalRaise2Date === "string" ? new Date(merged.capitalRaise2Date as string).getTime() : NaN;
    let trancheGapMonths: number | null = null;
    if (Number.isFinite(d1) && Number.isFinite(d2) && d1 !== d2) {
      trancheGapMonths = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24 * DAYS_PER_MONTH);
    }
    const numOrNull = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    return {
      runwayBufferMonths: numOrNull(merged.runwayBufferMonths),
      sizingOvershootPct: numOrNull(merged.sizingOvershootPct),
      trancheGapMonths,
      revenueRampDelayMonths: numOrNull(merged.revenueRampDelayMonths),
      burnFlexDownPct: numOrNull(merged.burnFlexDownPct),
    };
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
      // No-change "mark reviewed" save — still hits save-tab so the
      // downstream gate opens. Mirrors the main parsing path below
      // so the required-fields banner is consistent for the user
      // whether they changed any fields or just clicked Save again.
      try {
        const res = await fetch("/api/global-assumptions/save-tab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tabKey: tab }),
        });
        if (res.ok) {
          // Defensive parse — same shape & guards as the main path.
          let body: { requiredFieldsMissing?: unknown } = {};
          try {
            body = (await res.json()) as { requiredFieldsMissing?: unknown };
          } catch {
            body = {};
          }
          const missing = Array.isArray(body.requiredFieldsMissing)
            ? body.requiredFieldsMissing.filter(
                (x): x is string => typeof x === "string",
              )
            : [];
          setRequiredFieldsMissingByTab((prev) => ({ ...prev, [tab]: missing }));
          await queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
          toast({ title: `${TAB_LABELS[tab]} saved`, description: "Marked this tab as reviewed." });
          return true;
        }
        return false;
      } catch { /* swallow — toast already shown if pertinent */ }
      return false;
    }
    const payload: Partial<GlobalResponse> = {};
    for (const k of touched) (payload as Record<string, unknown>)[k as string] = formData[k];

    setSavingTab(tab);
    try {
      await mutateAsync(payload);
      // Persist the per-tab "reviewed" marker server-side so the
      // savedTabs gate progresses. The server response shape is
      // `{ ok, savedTabs, requiredFieldsMissing? }` (see task #737):
      //   • `verdict` / `prerequisiteFailures` are no longer emitted
      //     (task #738 — Save does NOT invoke The Analyst).
      //   • `requiredFieldsMissing?` is consumed below to drive the
      //     non-blocking banner exposed via `requiredFieldsMissingByTab`.
      try {
        const fundingInputs = tab === "funding" ? deriveFundingInputs(formData) : undefined;
        const res = await fetch("/api/global-assumptions/save-tab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tabKey: tab, fundingInputs }),
        });
        if (res.ok) {
          // Defensive parse — server may legally return an empty body
          // on a no-op acknowledge. Treat any parse error as "no
          // requiredFieldsMissing reported" rather than failing Save.
          let body: { requiredFieldsMissing?: unknown } = {};
          try {
            body = (await res.json()) as { requiredFieldsMissing?: unknown };
          } catch {
            body = {};
          }
          const missing = Array.isArray(body.requiredFieldsMissing)
            ? body.requiredFieldsMissing.filter(
                (x): x is string => typeof x === "string",
              )
            : [];
          setRequiredFieldsMissingByTab((prev) => ({ ...prev, [tab]: missing }));
          await queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
        }
      } catch (saveTabErr: unknown) {
        console.warn("save-tab persistence call failed:", saveTabErr);
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

      // NOTE (task #738): Save used to auto-fire `deps.generateResearch()`
      // on success when the tab gate was enabled. That implicit auto-trigger
      // has been removed — see .claude/rules/analyst-trigger-discipline.md.
      // The Analyst evaluates ONLY on an explicit AnalystButton click.

      toast({
        title: `${TAB_LABELS[tab]} saved`,
        description: warnings.length > 0
          ? `${warnings.length} value${warnings.length === 1 ? "" : "s"} outside The Analyst's range — review below.`
          : "Changes take effect immediately.",
      });
      return true;
    } catch (error: unknown) {
      console.error(`Failed to save ${tab} tab:`, error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Failed to save changes.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSavingTab(null);
    }
  };

  const clearRequiredFieldsMissing = (tab: TabKey) =>
    setRequiredFieldsMissingByTab((prev) =>
      prev[tab].length === 0 ? prev : { ...prev, [tab]: [] },
    );

  return {
    formData,
    isDirty,
    dirtyFields,
    handleUpdate,
    savedTabs,
    savingTab,
    tabWarnings,
    setTabWarnings,
    requiredFieldsMissingByTab,
    clearRequiredFieldsMissing,
    acks,
    handleSaveTab,
    hasPendingServerUpdate: pendingServerSnapshot !== null,
    discardEditsAndRefresh,
  };
}
