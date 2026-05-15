import { Loader2 } from "@/components/icons/themed-icons";
import { IconCheckCircle, IconAlertCircle } from "@/components/icons/status-icons";
import {
  SLIDE_AGENT_NAMES,
  SLIDE_TEAM_TAGS,
  ORCHESTRATORS,
  MINIONS,
} from "@/lib/agent-taxonomy";
import { AgentThinkingState } from "@/components/agent-animations";
import {
  DINO_VERDICT_CLASS,
  DINO_VERDICT_LABEL,
  MAYA_VERDICT_CLASS,
  MAYA_VERDICT_LABEL,
  PIXEL_DIFF_DECIMALS_BADGE,
  PIXEL_DIFF_DECIMALS_TOOLTIP,
  TOTAL_DECK_SLIDES,
} from "../SlideFactoryConstants";
import { deriveSlotStatus, dinoPctVerdict } from "../SlideFactoryUtils";
import type { SlideFactoryRun } from "../SlideFactoryTypes";

// ── Tab 5 — Agents (build progress) ─────────────────────────────────────────

export function FactoryAgentsTab({ run }: { run: SlideFactoryRun }) {
  const agentResults = run.agentResults ?? {};
  const isBuilding = run.status === "building";
  const isComplete = run.status === "complete";
  const isError = run.status === "error";

  return (
    <div className="space-y-0">
      {/* Marco orchestrator row */}
      <div className="flex items-center gap-2 pb-3 border-b border-border/60 mb-3">
        {isBuilding ? (
          <AgentThinkingState
            persona="marco"
            phase="thinking"
            size="sm"
            aria-label="Marco is orchestrating the build"
            className="shrink-0"
          />
        ) : isComplete ? (
          <AgentThinkingState
            persona="marco"
            phase="complete"
            size="sm"
            aria-label="Marco build complete"
            className="shrink-0"
          />
        ) : (
          <AgentThinkingState
            persona="marco"
            phase="error"
            size="sm"
            aria-label="Marco build error"
            className="shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">
            {ORCHESTRATORS.marco.swarmHeader}
          </span>
        </div>
        <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none shrink-0">
          Orchestrator
        </span>
      </div>

      {/* Status label */}
      <div className="mb-3">
        <p className="text-sm font-semibold text-muted-foreground">
          {isBuilding
            ? "6 teams building…"
            : isComplete
            ? "Build complete"
            : "Build failed"}
        </p>
        {isBuilding && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Each slide is processed by a dedicated agent team, then verified by Maya and Dino.
          </p>
        )}
      </div>

      {/* Per-slide agent rows */}
      <div className="divide-y divide-border">
        {Array.from({ length: TOTAL_DECK_SLIDES }, (_, i) => {
          const slideNum = i + 1;
          const key = `slide${slideNum}`;
          const result = agentResults[key] ?? null;
          const slotStatus = deriveSlotStatus(
            result?.status,
            isBuilding ? "building" : isComplete ? "complete" : "error",
          );

          return (
            <div key={key} className="flex items-start gap-3 py-3">
              <div className="mt-0.5 shrink-0">
                {slotStatus === "approved" ? (
                  <IconCheckCircle weight="fill" className="w-4 h-4 text-success" />
                ) : slotStatus === "rejected" ? (
                  <IconAlertCircle weight="fill" className="w-4 h-4 text-destructive" />
                ) : slotStatus === "running" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-border" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium">
                    {SLIDE_AGENT_NAMES[slideNum]} — Building Slide {slideNum}
                  </span>
                  <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none">
                    Team · Slide {slideNum}
                  </span>
                  <span className="text-[10px] px-1.5 py-px rounded bg-muted/60 text-muted-foreground leading-none">
                    {SLIDE_TEAM_TAGS[slideNum]}
                  </span>
                  {result?.mayaVerdict && (
                    <span
                      className={`text-[10px] px-1.5 py-px rounded leading-none font-medium ${MAYA_VERDICT_CLASS[result.mayaVerdict]}`}
                    >
                      Maya: {MAYA_VERDICT_LABEL[result.mayaVerdict]}
                    </span>
                  )}
                  {result?.pixelDiffPct != null && (() => {
                    const verdict = dinoPctVerdict(result.pixelDiffPct);
                    return (
                      <span
                        className={`text-[10px] px-1.5 py-px rounded leading-none font-medium ${DINO_VERDICT_CLASS[verdict]}`}
                        title={`${MINIONS.dino.role}: ${result.pixelDiffPct.toFixed(PIXEL_DIFF_DECIMALS_TOOLTIP)}% pixel diff`}
                      >
                        {MINIONS.dino.label} · {result.pixelDiffPct.toFixed(PIXEL_DIFF_DECIMALS_BADGE)}% · {DINO_VERDICT_LABEL[verdict]}
                      </span>
                    );
                  })()}
                </div>
                {result?.errorMessage && (
                  <p
                    className="text-xs text-destructive mt-0.5 truncate"
                    title={result.errorMessage}
                  >
                    {result.errorMessage}
                  </p>
                )}
                {result?.mayaNotes && result.mayaVerdict !== "ok" && (
                  <p
                    className="text-xs text-muted-foreground mt-0.5 truncate"
                    title={result.mayaNotes}
                  >
                    {result.mayaNotes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isBuilding && (
        <p className="mt-3 text-[10px] text-muted-foreground/60 leading-relaxed">
          The pipeline advances to download when all slides are approved.
        </p>
      )}
    </div>
  );
}
