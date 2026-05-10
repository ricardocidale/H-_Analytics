import type { RunType } from "@/lib/agent-taxonomy";

// ── Types ─────────────────────────────────────────────────────────────────

export type UnifiedRunStatus =
  | "running" | "completed" | "complete" | "error" | "pending"
  | "new" | "brief_ready" | "ingesting" | "ingested"
  | "drafting" | "draft_review" | "building";

/** Health summary stored in iris_runs.health_summary (JSONB). */
export interface IrisHealthSummary {
  summary?: string;
  toolsInvoked?: number | string[];
  runId?: string;
  error?: string;
  /** Individual error messages collected during the run. */
  errors?: string[];
}

/** A single failed slide entry for display in the run list row. */
export interface FailedSlide {
  num: number;
  reason: string | null;
}

export interface UnifiedRun {
  id: string;
  type: RunType;
  agentName: string;
  agentRole: string;
  status: UnifiedRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  /** Raw numeric ID for slide factory runs — used to fetch detail. */
  slideFactoryRunId?: number;
  /** Scheduler key for analyst/iris scheduler runs. */
  schedulerKey?: string;
  /**
   * Rejected slides for Slide Factory error runs. Populated directly from
   * the agentResults in the list response — no extra fetch required.
   */
  failedSlides?: FailedSlide[];
  meta?: {
    chunksIndexed?: number | null;
    errorsEncountered?: number | null;
    trigger?: string | null;
    modelUsed?: string | null;
    brief?: string | null;
    /** Iris health summary — text from the agent's final report or error string. */
    healthSummary?: IrisHealthSummary | null;
    /** Notes from the scheduler cycle (Analyst runs). */
    notes?: string | null;
    /** Items considered this cycle. */
    considered?: number | null;
    /** Items succeeded this cycle. */
    succeeded?: number | null;
    /** Items failed this cycle. */
    failed?: number | null;
    [k: string]: string | number | null | undefined | IrisHealthSummary;
  };
}

export interface IrisLastRun {
  id: number;
  trigger: string;
  status: string;
  modelUsed: string | null;
  chunksIndexed: number;
  errorsEncountered: number;
  durationMs: number | null;
  runAt: string;
  healthSummary: IrisHealthSummary | null;
}

export interface IrisStatus {
  lastRun: IrisLastRun | null;
  gapsCount: number;
}

export interface SlideAgentResultFE {
  status: "pending" | "running" | "approved" | "rejected";
  pixelDiffPct: number | null;
  mayaVerdict: "ok" | "advisory" | "warning" | "block" | null;
  mayaNotes: string | null;
  approvedAt: string | null;
  errorMessage: string | null;
}

export type FactoryStatus =
  | "new" | "brief_ready" | "ingesting" | "ingested"
  | "drafting" | "draft_review" | "building" | "complete" | "error";

export interface SlideFactoryRun {
  id: number;
  status: FactoryStatus;
  briefFilename: string | null;
  agentResults: Record<string, SlideAgentResultFE> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRecentRun {
  ranAt: string;
  status: "ok" | "warn" | "error";
  durationMs: number | null;
  notes: string | null;
  considered: number;
  succeeded: number;
  failed: number;
}

export interface SchedulerRunRow {
  schedulerKey: string;
  schedulerLabel: string | null;
  lastRunAt: string | null;
  status: string | null;
  durationMs: number | null;
  notes: string | null;
  recentRuns: SchedulerRecentRun[];
}

/** Per-workflow detail returned by GET /api/admin/scheduler-runs/:key/last-run */
export interface WorkflowRunDetail {
  workflowKey: string;
  name: string;
  lastRunStatus: string | null;
  lastRunError: string | null;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
}

export interface SchedulerLastRun {
  schedulerKey: string;
  schedulerLabel: string | null;
  lastRunAt: string | null;
  status: string | null;
  notes: string | null;
  durationMs: number | null;
  considered: number | null;
  succeeded: number | null;
  failed: number | null;
  /** Only present for research-workflows key */
  workflows?: WorkflowRunDetail[];
}
