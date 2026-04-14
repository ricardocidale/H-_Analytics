import { useState, useEffect, useRef, useCallback } from "react";
import { computeFreshnessStatus } from "@/components/intelligence/IntelligenceStatusBar";

const STORAGE_KEY = "hp-auto-refresh-intelligence";

function getStoredPreference(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

function setStoredPreference(val: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(val));
  } catch {
    // ignore
  }
}

interface UseAutoRefreshIntelligenceOpts {
  entityKey: string;
  entityReady: boolean;
  isGenerating: boolean;
  isDirty: boolean;
  researchUpdatedAt: string | Date | null | undefined;
  lastAssumptionChangeAt: string | Date | null | undefined;
  generateResearch: () => void;
}

export function useAutoRefreshIntelligence(opts: UseAutoRefreshIntelligenceOpts) {
  const [autoRefresh, setAutoRefreshState] = useState(getStoredPreference);
  const autoRefreshFired = useRef(false);
  const lastEntityKey = useRef(opts.entityKey);

  const setAutoRefresh = useCallback((val: boolean) => {
    setAutoRefreshState(val);
    setStoredPreference(val);
  }, []);

  useEffect(() => {
    if (lastEntityKey.current !== opts.entityKey) {
      autoRefreshFired.current = false;
      lastEntityKey.current = opts.entityKey;
    }
  }, [opts.entityKey]);

  useEffect(() => {
    if (!autoRefresh || autoRefreshFired.current) return;
    if (!opts.entityReady || opts.isDirty || opts.isGenerating) return;
    const { status } = computeFreshnessStatus({
      researchUpdatedAt: opts.researchUpdatedAt,
      lastAssumptionChangeAt: opts.lastAssumptionChangeAt,
      isGenerating: false,
    });
    if (status === "missing" || status === "stale" || status === "very_stale") {
      autoRefreshFired.current = true;
      opts.generateResearch();
    }
  }, [autoRefresh, opts.entityKey, opts.entityReady, opts.researchUpdatedAt, opts.lastAssumptionChangeAt, opts.isDirty, opts.isGenerating]);

  return { autoRefresh, setAutoRefresh };
}
