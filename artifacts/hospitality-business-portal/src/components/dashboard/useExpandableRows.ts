import { useState, useCallback } from "react";

/**
 * Shared hook for expandable/collapsible row state used across dashboard tabs.
 * Replaces duplicated toggleRow/toggleFormula/toggleAll logic.
 */
export function useExpandableRows(allKeys: string[]) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedFormulas, setExpandedFormulas] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  }, []);

  const toggleFormula = useCallback((formulaId: string) => {
    setExpandedFormulas(prev => {
      const next = new Set(prev);
      if (next.has(formulaId)) next.delete(formulaId); else next.add(formulaId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setExpandedRows(prev => {
      const allExpanded = allKeys.every(k => prev.has(k));
      return allExpanded ? new Set<string>() : new Set(allKeys);
    });
  }, [allKeys]);

  const allRowsExpanded = allKeys.every(k => expandedRows.has(k));

  return { expandedRows, expandedFormulas, toggleRow, toggleFormula, toggleAll, allRowsExpanded };
}
