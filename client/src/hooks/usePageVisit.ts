import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { UserPageVisit } from "@shared/schema";

const STALE_ANALYST_HOURS = 24;

interface UsePageVisitResult {
  visit: UserPageVisit | null;
  isFirstVisit: boolean;
  isAnalystStale: boolean;
  recordSave: (compulsoryFieldsComplete: boolean) => Promise<void>;
  recordAnalystRun: () => Promise<void>;
  isLoading: boolean;
}

export function usePageVisit(
  pageKey: string,
  entityType?: string,
  entityId?: number
): UsePageVisitResult {
  const [visit, setVisit] = useState<UserPageVisit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!pageKey) return;
    setIsLoading(true);

    const body: Record<string, unknown> = {};
    if (entityType) body.entityType = entityType;
    if (entityId) body.entityId = entityId;

    apiRequest("POST", `/api/page-visit/${encodeURIComponent(pageKey)}/visit`, body)
      .then((res) => res.json())
      .then((data: UserPageVisit) => {
        if (mounted.current) {
          setVisit(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (mounted.current) setIsLoading(false);
      });
  }, [pageKey, entityType, entityId]);

  const isFirstVisit = !visit?.endorsed;

  const isAnalystStale = (() => {
    if (!visit?.lastAnalystRunAt) return true;
    const ageMs = Date.now() - new Date(visit.lastAnalystRunAt).getTime();
    return ageMs > STALE_ANALYST_HOURS * 60 * 60 * 1000;
  })();

  const recordSave = useCallback(async (compulsoryFieldsComplete: boolean) => {
    const res = await apiRequest("POST", `/api/page-visit/${encodeURIComponent(pageKey)}/save`, {
      compulsoryFieldsComplete,
    });
    const updated = await res.json();
    if (mounted.current) setVisit(updated);
  }, [pageKey]);

  const recordAnalystRun = useCallback(async () => {
    const res = await apiRequest("POST", `/api/page-visit/${encodeURIComponent(pageKey)}/analyst-run`);
    const updated = await res.json();
    if (mounted.current) setVisit(updated);
  }, [pageKey]);

  return { visit, isFirstVisit, isAnalystStale, recordSave, recordAnalystRun, isLoading };
}
