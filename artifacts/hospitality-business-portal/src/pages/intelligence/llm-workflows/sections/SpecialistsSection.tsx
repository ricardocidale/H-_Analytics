/**
 * SpecialistsSection — section 7 of the LlmWorkflows page.
 *
 * Per-Specialist override status with click-through to each Specialist's LLM
 * Config tab. Reads from /api/admin/specialists.
 *
 * State (specialist list + drift count) lives entirely inside this component —
 * no parent reads it. Navigation is performed via wouter's setLocation.
 *
 * Extracted from LlmWorkflowsPage.tsx during the task-1358 section split.
 */

import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  setIntelligenceSection,
  setIntelligenceTabHint,
} from "@/lib/intelligence-nav";
import { SPECIALIST_ID_TO_SECTION } from "../constants";
import type { SpecialistOverrideListItem } from "../types";

export function SpecialistsSection() {
  const [, setLocation] = useLocation();

  const { data: specialists } = useQuery<SpecialistOverrideListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });

  const overridingSpecialists = useMemo(
    () => (specialists ?? []).filter((s) => s.hasLlmOverrides === true),
    [specialists],
  );

  const jumpToSpecialistLlmConfig = (id: string) => {
    const section = SPECIALIST_ID_TO_SECTION[id];
    if (!section) return;
    setIntelligenceTabHint(id, "llm-config");
    setIntelligenceSection(section);
    setLocation("/intelligence");
  };

  return (
    <div
      className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3"
      data-testid="section-specialists-llm"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Specialists</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each Specialist can override the area defaults above. Click a
            Specialist to open their LLM Config tab.
          </p>
        </div>
        {overridingSpecialists.length > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/10 text-amber-700 border-amber-300 shrink-0"
            data-testid="specialists-custom-count"
          >
            {overridingSpecialists.length} custom
          </Badge>
        )}
      </div>

      {specialists && specialists.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {(specialists as SpecialistOverrideListItem[])
            .filter((s) => !!SPECIALIST_ID_TO_SECTION[s.id])
            .map((s) => {
              const label =
                s.humanName || s.displayName || s.realName || s.id;
              const subLabel = s.humanName
                ? s.displayName || s.realName
                : null;
              const hasOverride = s.hasLlmOverrides === true;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jumpToSpecialistLlmConfig(s.id)}
                  className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  data-testid={`specialist-llm-row-${s.id}`}
                  title={`Open ${label} → LLM Config`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight truncate">
                      {label}
                    </p>
                    {subLabel && (
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                        {subLabel}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1 py-0 h-3.5 shrink-0 ${
                      hasOverride
                        ? "bg-amber-500/10 text-amber-700 border-amber-300"
                        : "bg-muted/50 text-muted-foreground/70 border-border/50"
                    }`}
                  >
                    {hasOverride ? "custom" : "default"}
                  </Badge>
                </button>
              );
            })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No specialists found.
        </p>
      )}
    </div>
  );
}
