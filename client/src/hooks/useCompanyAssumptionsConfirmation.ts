/**
 * useCompanyAssumptionsConfirmation — gates downstream pages on the user
 * having saved every Company Assumptions tab at least once.
 *
 * Source of truth: the persisted `savedTabs` jsonb array on the user's
 * `globalAssumptions` row, served by GET /api/global-assumptions. Until that
 * array contains all 6 tab keys, the gate is closed and downstream pages
 * (Simulation, Compare, Sensitivity, Executive Summary, Dashboard) render
 * the AssumptionsGate panel instead of their normal content.
 *
 * Returns the memoized triple `{ confirmed, missingTabs, savedTabs }` so
 * components can render correctly without re-evaluating on every render.
 */
import { useMemo } from "react";
import { useGlobalAssumptions } from "@/lib/api";

export const COMPANY_ASSUMPTIONS_TAB_KEYS = [
  "company",
  "funding",
  "revenue",
  "compensation",
  "overhead",
  "property-defaults",
] as const;

export type CompanyAssumptionsTabKey = typeof COMPANY_ASSUMPTIONS_TAB_KEYS[number];

export const TAB_LABELS: Record<CompanyAssumptionsTabKey, string> = {
  company: "Company",
  funding: "Funding",
  revenue: "Revenue Model",
  compensation: "Compensation",
  overhead: "Overhead",
  "property-defaults": "Property Defaults",
};

export interface CompanyAssumptionsConfirmation {
  /** True when every tab has been saved at least once. */
  confirmed: boolean;
  /** Tabs the user still needs to save. */
  missingTabs: CompanyAssumptionsTabKey[];
  /** Tabs the user has already saved. */
  savedTabs: CompanyAssumptionsTabKey[];
  /** True while the underlying global assumptions query is loading. */
  isLoading: boolean;
}

/**
 * Pure computation extracted for unit testing — given a raw value from the
 * `savedTabs` jsonb column, returns the confirmation triple. Exported so
 * tests can exercise it without spinning up a React tree / QueryClient.
 */
export function computeAssumptionsConfirmation(
  rawSavedTabs: unknown,
): Omit<CompanyAssumptionsConfirmation, "isLoading"> {
  const savedSet = new Set<CompanyAssumptionsTabKey>(
    Array.isArray(rawSavedTabs)
      ? rawSavedTabs.filter((k): k is CompanyAssumptionsTabKey =>
          (COMPANY_ASSUMPTIONS_TAB_KEYS as readonly string[]).includes(String(k)),
        )
      : [],
  );
  const missingTabs = COMPANY_ASSUMPTIONS_TAB_KEYS.filter((k) => !savedSet.has(k));
  const savedTabs = COMPANY_ASSUMPTIONS_TAB_KEYS.filter((k) => savedSet.has(k));
  return {
    confirmed: missingTabs.length === 0,
    missingTabs,
    savedTabs,
  };
}

export function useCompanyAssumptionsConfirmation(): CompanyAssumptionsConfirmation {
  const { data: global, isLoading, isError } = useGlobalAssumptions();
  return useMemo<CompanyAssumptionsConfirmation>(() => {
    // Fail-open on query error (e.g. 401 unauthenticated) so the inner
    // ProtectedRoute / ManagementRoute auth wrappers can take over and
    // redirect, instead of the gate panel masking auth UX.
    if (isError) {
      return {
        confirmed: true,
        missingTabs: [],
        savedTabs: [...COMPANY_ASSUMPTIONS_TAB_KEYS],
        isLoading: false,
      };
    }
    const raw = (global as unknown as { savedTabs?: unknown })?.savedTabs;
    return { ...computeAssumptionsConfirmation(raw), isLoading };
  }, [global, isLoading, isError]);
}
