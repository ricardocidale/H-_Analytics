/**
 * CollapsibleSection — generic collapsible sections component (T2-7).
 *
 * Replaces horizontal-tab navigation on non-main pages. Each section is
 * independently expandable; multiple can be open simultaneously (not an
 * accordion). Modeled on AgentRosterAccordion.
 *
 * Props:
 *   items          — section definitions (id, summary, indicators, expandedContent)
 *   defaultOpenId  — single section ID to expand on mount
 *   defaultOpenAll — expand every section on mount (overrides defaultOpenId)
 *   lazyMount      — delay rendering expandedContent until first expansion
 *                    (default false; set true for heavyweight sub-pages)
 *   className      — additional class for the wrapper div
 */

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { cn } from "@/lib/utils";

export interface CollapsibleSectionItem {
  id: string;
  summary: React.ReactNode;
  indicators?: React.ReactNode[];
  expandedContent: React.ReactNode;
}

interface CollapsibleSectionProps {
  items: CollapsibleSectionItem[];
  defaultOpenId?: string;
  defaultOpenAll?: boolean;
  lazyMount?: boolean;
  /**
   * When changed to a new non-null value, forces that section open without
   * closing others. Used for deep-link / tab-hint navigation (e.g. SpecialistPage).
   */
  forceOpenId?: string;
  /**
   * Called when a section is expanded (not on collapse). Used by parent
   * components that need to track which section is active (e.g. URL sync,
   * per-section Analyst routing in CompanyAssumptionsTabsView).
   */
  onSectionOpen?: (id: string) => void;
  className?: string;
}

export function CollapsibleSection({
  items,
  defaultOpenId,
  defaultOpenAll = false,
  lazyMount = false,
  forceOpenId,
  onSectionOpen,
  className,
}: CollapsibleSectionProps) {
  const initIds = (): Set<string> => {
    if (defaultOpenAll) return new Set(items.map((i) => i.id));
    if (defaultOpenId) return new Set([defaultOpenId]);
    return new Set<string>();
  };

  const [openIds, setOpenIds] = useState<Set<string>>(initIds);

  const [mountedIds, setMountedIds] = useState<Set<string>>(() => {
    if (!lazyMount) return new Set(items.map((i) => i.id));
    return initIds();
  });

  const lastForcedId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (forceOpenId == null) return;
    if (forceOpenId === lastForcedId.current) return;
    lastForcedId.current = forceOpenId;
    setOpenIds((prev) => new Set([...prev, forceOpenId]));
    if (lazyMount) {
      setMountedIds((prev) =>
        prev.has(forceOpenId) ? prev : new Set([...prev, forceOpenId]),
      );
    }
  }, [forceOpenId, lazyMount]);

  function toggle(id: string) {
    const isOpening = !openIds.has(id);
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (isOpening) {
      onSectionOpen?.(id);
    }
    if (lazyMount) {
      setMountedIds((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item) => {
        const open = openIds.has(item.id);
        const mounted = mountedIds.has(item.id);
        return (
          <Card key={item.id} className="overflow-hidden">
            <Collapsible open={open} onOpenChange={() => toggle(item.id)}>
              <CollapsibleTrigger asChild>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <div className="font-medium text-sm text-foreground min-w-0">
                      {item.summary}
                    </div>
                    {!open && item.indicators && item.indicators.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap ml-auto">
                        {item.indicators.map((ind, idx) => (
                          <span key={idx}>{ind}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 pt-3 border-t border-border/50">
                  {mounted && item.expandedContent}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
