import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCheckCircle } from "@/components/icons/status-icons";
import {
  EST_ALDO_COMPLETE_S,
  EST_CARLO_COMPLETE_S,
  LORENZO_MINION_STEPS,
  LORENZO_PIPELINE_STEPS,
  MS_PER_SECOND,
} from "../SlideFactoryConstants";
import { getLorenzoStepStatus } from "../SlideFactoryUtils";
import type {
  LorenzoFrontendSpec,
  SlideFactoryRun,
  StepStatus,
} from "../SlideFactoryTypes";
import { PlaceholderTab } from "./SharedComponents";
import { FactoryProgressPill } from "./FactoryProgressPill";
import { FactoryErrorPill } from "./FactoryErrorPill";

// ── Tab 2 — Lorenzo canonical ingestion ─────────────────────────────────────

function LorenzoStepRow({
  label,
  tag,
  description,
  status,
}: {
  label: string;
  tag: string;
  description: string;
  status: StepStatus;
}) {
  return (
    <div
      className={[
        "flex items-start gap-3 py-3 transition-colors duration-300",
        status === "running"
          ? "border-l-2 border-primary pl-3 -ml-px"
          : "border-l-2 border-transparent pl-3 -ml-px",
      ].join(" ")}
    >
      <div className="mt-0.5 shrink-0">
        {status === "complete" ? (
          <IconCheckCircle weight="fill" className="w-4 h-4 text-success" />
        ) : status === "running" ? (
          <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-border" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={[
              "text-xs font-medium",
              status === "waiting" ? "text-muted-foreground" : "text-foreground",
            ].join(" ")}
          >
            {label}
          </span>
          <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none">
            {tag}
          </span>
          <span className="text-[10px] px-1 py-px rounded bg-muted/50 text-muted-foreground/60 leading-none italic">
            Minion
          </span>
        </div>
        <p
          className={[
            "text-xs mt-0.5",
            status === "waiting"
              ? "text-muted-foreground/50"
              : "text-muted-foreground",
          ].join(" ")}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function LorenzoIngestingView({ startedAt }: { startedAt: string | null }) {
  const elapsedS = startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / MS_PER_SECOND))
    : 0;

  const allDoneMinions = elapsedS >= EST_CARLO_COMPLETE_S;

  // Find the currently running pipeline step label
  const runningStep = LORENZO_PIPELINE_STEPS.find(
    (_, i) => getLorenzoStepStatus(i, elapsedS) === "running",
  );
  const stepLabel = runningStep ? `Lorenzo · ${runningStep.label}` : "Lorenzo · Processing";

  const minionDetails = (
    <>
      <div className="divide-y divide-border/50">
        {LORENZO_MINION_STEPS.map((step) => {
          const statusFn = (id: string): StepStatus => {
            if (id === "aldo") {
              if (elapsedS >= EST_ALDO_COMPLETE_S) return "complete";
              return "running";
            }
            if (id === "carlo") {
              if (elapsedS >= EST_CARLO_COMPLETE_S) return "complete";
              if (elapsedS >= EST_ALDO_COMPLETE_S) return "running";
              return "waiting";
            }
            return "waiting";
          };
          return (
            <LorenzoStepRow
              key={step.id}
              label={step.label}
              tag={step.tag}
              description={step.description}
              status={statusFn(step.id)}
            />
          );
        })}
      </div>
      {allDoneMinions && (
        <p className="text-[10px] text-success font-medium mt-1">Minions complete</p>
      )}
      <p className="text-[10px] text-muted-foreground/50 mt-2">
        Minions are narrow deterministic utilities — no LLM calls.
      </p>
    </>
  );

  return (
    <>
      {/* Skeleton shimmer — represents content that will appear when done */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-32 w-full rounded-lg mt-2" />
      </div>

      {/* Floating progress pill */}
      <FactoryProgressPill
        label={stepLabel}
        caption="Extracting and enriching slide data — 2–4 min"
        elapsed={elapsedS}
        expandable={minionDetails}
      />
    </>
  );
}

function LorenzoCompleteView({ spec }: { spec: LorenzoFrontendSpec }) {
  const [breakdownOpen, setBreakdownOpen] = useState(true);
  const totalBlocks = spec.blocksBySlide.reduce((sum, s) => sum + s.length, 0);
  const variableBindings = spec.blocksBySlide
    .flat()
    .filter((b) => b.variableBinding !== null).length;

  return (
    <div className="space-y-4">
      {/* Inline status header — no card */}
      <div className="flex items-center gap-2">
        <IconCheckCircle weight="fill" className="w-4 h-4 text-success shrink-0" />
        <div>
          <p className="text-sm font-medium">Canonical spec ready</p>
          <p className="text-xs text-muted-foreground">
            Schema {spec.schemaVersion} · {spec.documentType.toUpperCase()} ·{" "}
            {spec.inspectorApproved ? "Inspector approved" : "Inspector rejected"}
          </p>
        </div>
      </div>

      {/* Stat chips — no card shell */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            { label: "Text blocks", value: String(totalBlocks) },
            { label: "Slides", value: String(spec.slideCount) },
            { label: "Variable slots", value: String(variableBindings) },
            {
              label: "Inspector",
              value: spec.inspectorApproved ? "Approved" : "Rejected",
              destructive: !spec.inspectorApproved,
            },
          ] as const
        ).map((stat) => (
          <div
            key={stat.label}
            className="text-center bg-muted rounded px-3 py-2"
          >
            <p
              className={[
                "text-lg font-semibold tabular-nums leading-none",
                "destructive" in stat && stat.destructive ? "text-destructive" : "",
              ].join(" ")}
            >
              {stat.value}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Per-slide breakdown — borderless, collapsible */}
      <Collapsible open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full">
          <span
            className={`transition-transform duration-150 ${breakdownOpen ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▶
          </span>
          Per-slide breakdown
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="divide-y divide-border mt-2">
            {spec.blocksBySlide.map((slideBlocks, i) => {
              const dynCount = slideBlocks.filter((b) => b.variableBinding !== null).length;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 text-xs"
                >
                  <span className="text-muted-foreground">Slide {i + 1}</span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{slideBlocks.length} blocks</span>
                    {dynCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {dynCount} dynamic
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Inspector gap notes — floating error pill when rejected */}
      {!spec.inspectorApproved && spec.inspectorNotes && (
        <FactoryErrorPill
          message="Inspector gaps detected"
          detail={spec.inspectorNotes}
        />
      )}
    </div>
  );
}

export function FactoryLorenzoTab({ run }: { run: SlideFactoryRun }) {
  if (run.status === "new" || run.status === "brief_ready") {
    return (
      <PlaceholderTab
        title="Lorenzo — Canonical ingestion"
        description="Lorenzo will process the brief and build the canonical spec once the brief is accepted."
      />
    );
  }

  if (run.status === "ingesting") {
    return <LorenzoIngestingView startedAt={run.startedAt} />;
  }

  // ingested or any later status — show the enriched spec if available
  const spec = run.canonicalSpec as LorenzoFrontendSpec | null;
  if (spec && Array.isArray(spec.blocksBySlide) && spec.blocksBySlide.length > 0) {
    return <LorenzoCompleteView spec={spec} />;
  }

  return (
    <PlaceholderTab
      title="Canonical spec unavailable"
      description="The run completed but no enriched spec was stored. Re-run to generate."
    />
  );
}
