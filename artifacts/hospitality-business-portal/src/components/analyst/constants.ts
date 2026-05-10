// Canonical chip colors mirror AnalystVerdictDisplay severity system (§11).
// high → ok (emerald), moderate → advisory (sky), low → warning (amber).
export const CONFIDENCE_CHIP: Record<string, { label: string; color: string }> = {
  high:     { label: "High confidence",     color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  moderate: { label: "Moderate confidence", color: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  low:      { label: "Low confidence",      color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};
