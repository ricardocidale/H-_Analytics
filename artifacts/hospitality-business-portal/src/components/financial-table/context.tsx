import * as React from "react";

const CalcDetailsContext = React.createContext<boolean>(true);

export function CalcDetailsProvider({ show, children }: { show: boolean; children: React.ReactNode }) {
  return <CalcDetailsContext.Provider value={show}>{children}</CalcDetailsContext.Provider>;
}

export function useCalcDetails() {
  return React.useContext(CalcDetailsContext);
}

/* ─────────────────────────────────────────────
   Design tokens — kept in one place so a palette
   change only touches these four lines.
   ───────────────────────────────────────────── */

/** Section header background (light ice-blue) */
export const SECTION_BG = "hsl(var(--primary) / 0.08)";
export const SUBTOTAL_BG = "hsl(var(--primary) / 0.15)";
/** Grand total row — uses the design-system's primary gradient */
export const GRAND_TOTAL_CLASS =
  "bg-primary font-medium text-primary-foreground shadow-sm";
