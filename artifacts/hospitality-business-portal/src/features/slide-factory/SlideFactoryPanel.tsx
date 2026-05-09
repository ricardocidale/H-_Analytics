/**
 * SlideFactoryPanel — Slide Factory V2 pipeline wizard
 *
 * 6-tab wizard driven by run status.
 *
 *   Tab 1  f-brief       new / brief_ready
 *   Tab 2  f-lorenzo     ingesting
 *   Tab 3  f-properties  ingested
 *   Tab 4  f-lucca       drafting / draft_review
 *   Tab 5  f-agents      building / complete / error
 *   Tab 6  f-download    complete / error
 *
 * Auto-fire pattern: accept-brief immediately starts Lorenzo; saving properties
 * immediately starts Lucca. Both endpoints return 202 Accepted.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconUpload, IconDownload, IconWand2 } from "@/components/icons";
import { IconCheckCircle, IconAlertCircle } from "@/components/icons/status-icons";

import {
  SLIDE_AGENT_NAMES,
  SLIDE_TEAM_TAGS,
  ORCHESTRATORS,
  MINIONS,
} from "@/lib/agent-taxonomy";
import { AgentThinkingState } from "@/components/agent-animations";

// ── Constants ───────────────────────────────────────────────────────────────

const FACTORY_POLL_MS = 5_000;
/** Milliseconds per second — used to convert Date arithmetic to seconds */
const MS_PER_SECOND = 1000;

// ── Lorenzo ingestion step timing estimates ──────────────────────────────────
// Cumulative elapsed seconds at which each pipeline step is expected to finish.
// Used to derive simulated step progress during ingestion (no server-sent events).
const EST_ALDO_COMPLETE_S = 10;
const EST_VISION_COMPLETE_S = 150;
const EST_CARLO_COMPLETE_S = 152;
const EST_INSPECTOR_COMPLETE_S = 185;
const ACCEPTED_FILE_ACCEPT =
  ".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const ACCEPTED_EXTENSIONS = new Set([".pdf", ".pptx"]);
const NONE_VALUE = "__none__";

/** Total number of slides in one LB deck (matches TOTAL_SLIDES in deck-render-constants.ts) */
const TOTAL_DECK_SLIDES = 6;

/** Pixel-diff percentage at which Dino's verdict downgrades from pass → warn */
const DINO_WARN_THRESHOLD_PCT = 5;
/** Pixel-diff percentage at which Dino's verdict downgrades from warn → fail */
const DINO_FAIL_THRESHOLD_PCT = 15;

type DinoVerdict = "pass" | "warn" | "fail";

function dinoPctVerdict(pct: number): DinoVerdict {
  if (pct >= DINO_FAIL_THRESHOLD_PCT) return "fail";
  if (pct >= DINO_WARN_THRESHOLD_PCT) return "warn";
  return "pass";
}

const DINO_VERDICT_CLASS: Record<DinoVerdict, string> = {
  pass: "text-emerald-700 bg-emerald-50",
  warn: "text-amber-700 bg-amber-50",
  fail: "text-red-700 bg-red-50",
};

const DINO_VERDICT_LABEL: Record<DinoVerdict, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
};

const MAYA_VERDICT_LABEL: Record<NonNullable<SlideAgentResultFE["mayaVerdict"]>, string> = {
  ok: "OK",
  advisory: "Advisory",
  warning: "Warning",
  block: "Block",
};

// Palette mirrors the canonical analyst severity chip colors used by
// AnalystVerdictDisplay / AnalystRangeIndicator (CLAUDE.md Intelligence Display).
// Exported so test fixtures consume the same source-of-truth as the Panel.
export const MAYA_VERDICT_CLASS: Record<NonNullable<SlideAgentResultFE["mayaVerdict"]>, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  advisory: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  block: "bg-red-500/10 text-red-700 dark:text-red-400",
};

// ── Types ───────────────────────────────────────────────────────────────────

// Mirrors SlideAgentResult from lib/db/src/schema/slide-factory-runs.ts
interface SlideAgentResultFE {
  status: "pending" | "running" | "approved" | "rejected";
  pixelDiffPct: number | null;
  mayaVerdict: "ok" | "advisory" | "warning" | "block" | null;
  mayaNotes: string | null;
  approvedAt: string | null;
  errorMessage: string | null;
}

type FactoryStatus =
  | "new"
  | "brief_ready"
  | "ingesting"
  | "ingested"
  | "drafting"
  | "draft_review"
  | "building"
  | "complete"
  | "rebuilding"
  | "error";

type FactoryTab =
  | "f-brief"
  | "f-lorenzo"
  | "f-properties"
  | "f-lucca"
  | "f-agents"
  | "f-download";

interface SlideFactoryRun {
  id: number;
  userId: number;
  status: FactoryStatus;
  briefR2Key: string | null;
  briefFilename: string | null;
  briefAccepted: boolean;
  canonicalSpec: unknown | null;
  canonicalPngKeys: string[] | null;
  slide1PropertyId: number | null;
  slide2PropertyId: number | null;
  slide3PropertyId: number | null;
  slide5PropertyId: number | null;
  luccaDraft: Record<string, LuccaSlotDraft> | null;
  agentResults: Record<string, SlideAgentResultFE> | null;
  deckR2Key: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LuccaSlotDraft {
  value: string;
  approved: boolean;
  approvedAt: string | null;
  source: "lucca" | "admin" | "admin-override";
}

// Front-end view of LorenzoCanonicalSpec stored in canonicalSpec JSONB.
// Only the fields Tab 2 needs to display — not the full spec shape.
interface LorenzoFrontendSpec {
  schemaVersion: string;
  documentType: string;
  slideCount: number;
  blocksBySlide: Array<Array<{ variableBinding: string | null }>>;
  inspectorApproved: boolean;
  inspectorNotes: string | null;
}

interface Property {
  id: number;
  name: string;
  city?: string;
  stateProvince?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const TRANSITIONING_STATUSES: ReadonlySet<FactoryStatus> = new Set([
  "ingesting",
  "drafting",
  "building",
  "rebuilding",
]);

function isTerminal(run: SlideFactoryRun | null): boolean {
  return !run || run.status === "complete" || run.status === "error";
}

// Derives the per-slide display status from agentResults, coercing non-terminal
// per-slide states to terminal when the run itself is terminal. A slide left in
// 'running'/'pending' or missing entirely on a complete run is shown as
// 'approved' (run completed = all slides passed); on an errored run it becomes
// 'rejected' (we don't know which slide passed, fail-closed in the UI).
// Exported so test fixtures consume the same source-of-truth as the Panel.
export function deriveSlotStatus(
  resultStatus: SlideAgentResultFE["status"] | undefined,
  runStatus: "building" | "complete" | "error",
): SlideAgentResultFE["status"] | null {
  if (runStatus === "complete") {
    if (!resultStatus || resultStatus === "running" || resultStatus === "pending") {
      return "approved";
    }
    return resultStatus;
  }
  if (runStatus === "error") {
    if (!resultStatus || resultStatus === "running" || resultStatus === "pending") {
      return "rejected";
    }
    return resultStatus;
  }
  return resultStatus ?? "pending";
}

function statusToTab(status: FactoryStatus | undefined): FactoryTab {
  switch (status) {
    case "new":
    case "brief_ready":
      return "f-brief";
    case "ingesting":
      return "f-lorenzo";
    case "ingested":
      return "f-properties";
    case "drafting":
    case "draft_review":
      return "f-lucca";
    case "building":
      return "f-agents";
    case "complete":
    case "rebuilding":
      return "f-download";
    default:
      return "f-brief";
  }
}

function statusBadge(status: FactoryStatus): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  const map: Record<
    FactoryStatus,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    new:          { label: "New",           variant: "secondary" },
    brief_ready:  { label: "Brief ready",   variant: "outline" },
    ingesting:    { label: "Ingesting…",    variant: "outline" },
    ingested:     { label: "Ingested",      variant: "outline" },
    drafting:     { label: "Drafting…",     variant: "outline" },
    draft_review: { label: "Draft review",  variant: "outline" },
    building:     { label: "Building…",     variant: "outline" },
    complete:     { label: "Complete",      variant: "default" },
    rebuilding:   { label: "Rebuilding…",  variant: "outline" },
    error:        { label: "Error",         variant: "destructive" },
  };
  return map[status] ?? { label: status, variant: "secondary" };
}

function isValidBriefFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTENSIONS.has(ext);
}

function propLabel(properties: Property[], id: number | null): string {
  if (!id) return "";
  const p = properties.find((x) => x.id === id);
  if (!p) return String(id);
  return `${p.name}${p.city ? ` — ${p.city}${p.stateProvince ? `, ${p.stateProvince}` : ""}` : ""}`;
}

// ── Data hooks ──────────────────────────────────────────────────────────────

function useActiveFactoryRun() {
  const listQuery = useQuery<SlideFactoryRun | null>({
    queryKey: ["factory-run-list"],
    queryFn: async () => {
      const r = await fetch("/api/lb-slides/factory/runs", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load factory runs");
      const runs = (await r.json()) as SlideFactoryRun[];
      return runs[0] ?? null;
    },
  });

  const run = listQuery.data ?? null;
  const runId = run?.id ?? null;
  // Keep polling while the run is in a transitional pipeline state OR when the
  // run is `complete` but the deck PDF render hasn't written the R2 key yet.
  // The render finishes asynchronously after status flips to complete, and
  // without this branch the user would be stranded on Tab 6 forever.
  const isTransitioning =
    run != null &&
    (TRANSITIONING_STATUSES.has(run.status) ||
      (run.status === "complete" && !run.deckR2Key));

  const pollQuery = useQuery<SlideFactoryRun>({
    queryKey: ["factory-run", runId],
    queryFn: async () => {
      const r = await fetch(`/api/lb-slides/factory/runs/${runId}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to poll factory run");
      return r.json() as Promise<SlideFactoryRun>;
    },
    enabled: runId != null && isTransitioning,
    refetchInterval: isTransitioning ? FACTORY_POLL_MS : false,
  });

  const activeRun =
    isTransitioning && pollQuery.data != null ? pollQuery.data : run;

  return { run: activeRun, isLoading: listQuery.isLoading };
}

function useProperties() {
  return useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: async () => {
      const r = await fetch("/api/properties", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load properties");
      return r.json() as Promise<Property[]>;
    },
  });
}

// ── Upload state ─────────────────────────────────────────────────────────────

type UploadStage = "idle" | "uploading" | "done" | "error";
interface UploadState {
  stage: UploadStage;
  file: File | null;
  error: string | null;
}
const UPLOAD_IDLE: UploadState = { stage: "idle", file: null, error: null };

// ── Shared sub-components ───────────────────────────────────────────────────

function PlaceholderTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}

function FactoryPropertySelector({
  slideNum,
  description,
  value,
  onChange,
  properties,
  disabled,
}: {
  slideNum: number;
  description: string;
  value: number | null;
  onChange: (v: number | null) => void;
  properties: Property[];
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Slide {slideNum}
        </span>
        <span className="text-xs text-muted-foreground">— {description}</span>
      </div>
      <Select
        value={value ? String(value) : NONE_VALUE}
        onValueChange={(v) => onChange(v === NONE_VALUE ? null : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a property…">
            {value ? propLabel(properties, value) : "Select a property…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— None —</SelectItem>
          {properties.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
              {p.city
                ? ` — ${p.city}${p.stateProvince ? `, ${p.stateProvince}` : ""}`
                : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Tab 1 — Brief ───────────────────────────────────────────────────────────

function FactoryBriefTab({
  run,
  onRunUpdate,
}: {
  run: SlideFactoryRun | null;
  onRunUpdate: (r: SlideFactoryRun) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadState>(UPLOAD_IDLE);
  const [isAccepting, setIsAccepting] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/lb-slides/factory/runs", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to create run");
      }
      return r.json() as Promise<SlideFactoryRun>;
    },
    onSuccess: (newRun) => {
      onRunUpdate(newRun);
      toast({ title: "New run started" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start run", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isValidBriefFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Only PDF and PPTX files are accepted.",
        variant: "destructive",
      });
      return;
    }
    setUpload({ stage: "idle", file, error: null });
  };

  const handleUpload = async () => {
    if (!upload.file || !run) return;
    setUpload((prev) => ({ ...prev, stage: "uploading", error: null }));
    try {
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: upload.file.name,
          size: upload.file.size,
          contentType: upload.file.type || "application/octet-stream",
          entityType: "slide_factory_brief",
        }),
      });
      if (!urlRes.ok) {
        const b = (await urlRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Failed to get upload URL");
      }
      const { uploadURL, objectPath } = (await urlRes.json()) as {
        uploadURL: string;
        objectPath: string;
      };

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: upload.file,
        headers: { "Content-Type": upload.file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("Failed to upload file to storage");

      const briefRes = await fetch(
        `/api/lb-slides/factory/runs/${run.id}/brief`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ r2Key: objectPath, filename: upload.file.name }),
        },
      );
      if (!briefRes.ok) {
        const b = (await briefRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Failed to record brief");
      }
      const updated = (await briefRes.json()) as SlideFactoryRun;
      setUpload((prev) => ({ ...prev, stage: "done" }));
      onRunUpdate(updated);
      toast({ title: "Brief uploaded", description: upload.file.name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUpload((prev) => ({ ...prev, stage: "error", error: msg }));
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    }
  };

  const handleAccept = async () => {
    if (!run) return;
    setIsAccepting(true);
    try {
      const r = await fetch(
        `/api/lb-slides/factory/runs/${run.id}/accept-brief`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Failed to accept brief");
      }
      const updated = (await r.json()) as SlideFactoryRun;
      onRunUpdate(updated);
      toast({ title: "Brief accepted" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Accept failed";
      toast({ title: "Failed to accept brief", description: msg, variant: "destructive" });
    } finally {
      setIsAccepting(false);
    }
  };

  // No active run (or previous run ended) — show start CTA
  if (!run || isTerminal(run)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start Factory Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            No active factory run. Create one to begin the pipeline.
          </p>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            )}
            Start new run
          </Button>
        </CardContent>
      </Card>
    );
  }

  // status === "new" — upload + accept flow
  const briefOnServer = Boolean(run.briefR2Key);
  const showUploaded = upload.stage === "done" || briefOnServer;
  const displayFilename = upload.file?.name ?? run.briefFilename;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload Brief</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Upload the brief document (PDF or PPTX). After uploading, review it and
          accept to advance the pipeline to Lorenzo ingestion.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />

        {!showUploaded ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <IconUpload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {upload.file ? upload.file.name : "Click to select a file"}
              </span>
              <span className="text-xs text-muted-foreground">PDF or PPTX only</span>
            </button>

            {upload.file && (
              <Button
                onClick={() => void handleUpload()}
                disabled={upload.stage === "uploading"}
                className="w-full sm:w-auto"
              >
                {upload.stage === "uploading" && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                {upload.stage === "uploading" ? "Uploading…" : "Upload brief"}
              </Button>
            )}
            {upload.error && (
              <p className="text-xs text-destructive">{upload.error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <IconUpload className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{displayFilename}</p>
                <p className="text-xs text-muted-foreground">Uploaded</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  setUpload(UPLOAD_IDLE);
                  fileRef.current?.click();
                }}
              >
                Replace
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                onClick={() => void handleAccept()}
                disabled={isAccepting}
              >
                {isAccepting && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                Accept brief
              </Button>
              <p className="text-xs text-muted-foreground">
                Advances pipeline to Lorenzo ingestion
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tab 2 — Lorenzo canonical ingestion ─────────────────────────────────────

/**
 * Visible pipeline steps — shown in the Lorenzo ingestion card.
 * These are the "named" team steps. Minions (Aldo, Carlo) run as sub-steps
 * and are surfaced only in the Technical Details collapsible.
 */
const LORENZO_PIPELINE_STEPS = [
  {
    id: "l03",
    label: "Lorenzo-03",
    tag: "Vision",
    description: "Opus 4.7 vision enrichment — 6 slide passes",
    completeSecs: EST_VISION_COMPLETE_S,
  },
  {
    id: "l05",
    label: "Lorenzo-05",
    tag: "Inspect",
    description: "Holistic rebuild feasibility check — Opus 4.7",
    completeSecs: EST_INSPECTOR_COMPLETE_S,
  },
] as const;

/**
 * Minion steps — deterministic utilities hidden by default.
 * Shown in the Technical Details collapsible (agent-taxonomy: Minion tier).
 */
const LORENZO_MINION_STEPS = [
  {
    id: "aldo",
    label: "Aldo",
    tag: "Extract",
    description: "PDF text extraction — word-level bounding boxes",
    completeSecs: EST_ALDO_COMPLETE_S,
  },
  {
    id: "carlo",
    label: "Carlo",
    tag: "Validate",
    description: "Zod schema validation — font metrics and types",
    completeSecs: EST_CARLO_COMPLETE_S,
  },
] as const;

type StepStatus = "complete" | "running" | "waiting";

function getLorenzoStepStatus(stepIndex: number, elapsedS: number): StepStatus {
  const step = LORENZO_PIPELINE_STEPS[stepIndex];
  const prev = stepIndex > 0 ? LORENZO_PIPELINE_STEPS[stepIndex - 1] : null;
  if (elapsedS >= step.completeSecs) return "complete";
  if (!prev || elapsedS >= prev.completeSecs) return "running";
  return "waiting";
}

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
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
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
  const [minionOpen, setMinionOpen] = useState(false);
  const elapsedS = startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / MS_PER_SECOND))
    : 0;

  const allDoneMinions = elapsedS >= EST_CARLO_COMPLETE_S;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Building canonical spec</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Lorenzo is extracting and enriching slide data. This takes 2–4 minutes.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {LORENZO_PIPELINE_STEPS.map((step, i) => {
            const status = getLorenzoStepStatus(i, elapsedS);
            return (
              <div
                key={step.id}
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
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
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
                      {step.label}
                    </span>
                    <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none">
                      {step.tag}
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
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Technical Details — Minion steps (Aldo, Carlo) */}
        <Collapsible open={minionOpen} onOpenChange={setMinionOpen} className="mt-2 border-t border-border/50 pt-2">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1 w-full">
            <span
              className={`transition-transform duration-150 ${minionOpen ? "rotate-90" : ""}`}
              aria-hidden
            >
              ▶
            </span>
            <span>Technical Details</span>
            {allDoneMinions && (
              <span className="ml-auto text-[10px] text-success font-medium">
                Minions complete
              </span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-1 divide-y divide-border/50">
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
            <p className="text-[10px] text-muted-foreground/50 mt-2 pb-1">
              Minions are narrow deterministic utilities that run automatically — no LLM calls.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <p className="mt-3 text-[10px] text-muted-foreground/60 leading-relaxed">
          Step progress is estimated from elapsed time. The pipeline advances automatically
          once all steps are complete.
        </p>
      </CardContent>
    </Card>
  );
}

function LorenzoCompleteView({ spec }: { spec: LorenzoFrontendSpec }) {
  const totalBlocks = spec.blocksBySlide.reduce((sum, s) => sum + s.length, 0);
  const variableBindings = spec.blocksBySlide
    .flat()
    .filter((b) => b.variableBinding !== null).length;

  return (
    <div className="space-y-4">
      {/* Status header */}
      <Card>
        <CardContent className="py-4 flex items-center gap-3">
          <IconCheckCircle weight="fill" className="w-5 h-5 text-success shrink-0" />
          <div>
            <p className="text-sm font-medium">Canonical spec ready</p>
            <p className="text-xs text-muted-foreground">
              Schema {spec.schemaVersion} · {spec.documentType.toUpperCase()} ·{" "}
              {spec.inspectorApproved ? "Inspector approved" : "Inspector rejected"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <Card key={stat.label} className="text-center">
            <CardContent className="py-3">
              <p
                className={[
                  "text-lg font-semibold tabular-nums leading-none",
                  "destructive" in stat && stat.destructive ? "text-destructive" : "",
                ].join(" ")}
              >
                {stat.value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-slide breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Per-slide breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y divide-border">
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
        </CardContent>
      </Card>

      {/* Inspector gap notes (only when rejected) */}
      {!spec.inspectorApproved && spec.inspectorNotes && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 flex gap-2">
            <IconAlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-destructive">Inspector gaps</p>
              <p className="text-xs text-muted-foreground mt-0.5">{spec.inspectorNotes}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FactoryLorenzoTab({ run }: { run: SlideFactoryRun }) {
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

// ── Tab 3 — Properties ──────────────────────────────────────────────────────

function FactoryPropertiesTab({
  run,
  onRunUpdate,
}: {
  run: SlideFactoryRun;
  onRunUpdate: (r: SlideFactoryRun) => void;
}) {
  const { toast } = useToast();
  const { data: properties = [], isLoading: propsLoading } = useProperties();
  const [saved, setSaved] = useState(false);

  const [s1, setS1] = useState<number | null>(run.slide1PropertyId);
  const [s2, setS2] = useState<number | null>(run.slide2PropertyId);
  const [s3, setS3] = useState<number | null>(run.slide3PropertyId);
  const [s5, setS5] = useState<number | null>(run.slide5PropertyId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, number | null> = {};
      if (s1 != null) body.slide1PropertyId = s1;
      if (s2 != null) body.slide2PropertyId = s2;
      if (s3 != null) body.slide3PropertyId = s3;
      if (s5 != null) body.slide5PropertyId = s5;

      const r = await fetch(
        `/api/lb-slides/factory/runs/${run.id}/properties`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Failed to save properties");
      }
      return r.json() as Promise<SlideFactoryRun>;
    },
    onSuccess: (updated) => {
      onRunUpdate(updated);
      setSaved(true);
      toast({ title: "Properties saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save properties", description: err.message, variant: "destructive" });
    },
  });

  if (saved) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <p className="text-sm font-medium">
            Properties saved — waiting for Lucca to draft
          </p>
          <p className="text-xs text-muted-foreground">
            The Lucca agent will begin drafting slide content shortly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assign Properties</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Choose which property appears on each spotlight slide. Slides 4 and 6
          are auto-generated.
        </p>

        <FactoryPropertySelector
          slideNum={1}
          description="Pipeline Spotlight · hero photo + specs"
          value={s1}
          onChange={setS1}
          properties={properties}
          disabled={propsLoading || saveMutation.isPending}
        />
        <FactoryPropertySelector
          slideNum={2}
          description="Photo Gallery · 2×2 photo showcase"
          value={s2}
          onChange={setS2}
          properties={properties}
          disabled={propsLoading || saveMutation.isPending}
        />
        <FactoryPropertySelector
          slideNum={3}
          description="Investment Model · concept + market rationale"
          value={s3}
          onChange={setS3}
          properties={properties}
          disabled={propsLoading || saveMutation.isPending}
        />
        <FactoryPropertySelector
          slideNum={5}
          description="Financial Snapshot · transformation plan"
          value={s5}
          onChange={setS5}
          properties={properties}
          disabled={propsLoading || saveMutation.isPending}
        />

        <div className="rounded-md bg-muted/40 border border-border/50 px-3 py-2.5 space-y-0.5">
          <p className="font-medium text-foreground/80 text-xs uppercase tracking-wide mb-1">
            Auto-generated — no assignment needed
          </p>
          <p className="text-muted-foreground text-xs">
            Slide 4 — Portfolio grid of all properties with hero photos
          </p>
          <p className="text-muted-foreground text-xs">
            Slide 6 — 10-year aggregated USALI consolidated income statement
          </p>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || propsLoading}
          className="w-full sm:w-auto"
        >
          {saveMutation.isPending && (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          )}
          Save property assignments
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Tab 4 — Lucca draft review ──────────────────────────────────────────────

const SLOT_LABELS: Record<string, string> = {
  "slide1.headerSubtitle":          "Slide 1 — Header subtitle",
  "slide1.visionBullets":           "Slide 1 — Vision bullets",
  "slide2.operationalModelText":    "Slide 2 — Operational model",
  "slide2.revenueBullet":           "Slide 2 — Revenue bullet",
  "slide2.programmingBullet":       "Slide 2 — Programming bullet",
  "slide3.conceptParagraph":        "Slide 3 — Concept paragraph",
  "slide3.marketRationale":         "Slide 3 — Market rationale",
  "slide3.reasons":                 "Slide 3 — Investment reasons",
  "slide3.closingLine":             "Slide 3 — Closing line",
  "slide5.transformationDescription": "Slide 5 — Transformation description",
  "slide5.transformationRows":      "Slide 5 — Transformation rows",
  "slide5.transformationRows[0]":   "Slide 5 — Transformation row 1",
  "slide5.transformationRows[1]":   "Slide 5 — Transformation row 2",
  "slide5.transformationRows[2]":   "Slide 5 — Transformation row 3",
  "slide5.transformationRows[3]":   "Slide 5 — Transformation row 4",
};

function slotLabel(key: string): string {
  return SLOT_LABELS[key] ?? key;
}

interface SlotRowProps {
  slotKey: string;
  draft: LuccaSlotDraft;
  onApprove: (key: string, approved: boolean) => Promise<void>;
  onSaveValue: (key: string, value: string) => Promise<void>;
  disabled: boolean;
}

function SlotRow({ slotKey, draft, onApprove, onSaveValue, disabled }: SlotRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(draft.value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (editValue === draft.value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSaveValue(slotKey, editValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(draft.value);
    setEditing(false);
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            {slotLabel(slotKey)}
            {draft.source === "admin" && (
              <span className="ml-1.5 text-xs text-info">(edited)</span>
            )}
          </p>
          {editing ? (
            <div className="mt-1.5 space-y-2">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={3}
                className="text-sm"
                disabled={saving}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                  {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{draft.value}</p>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setEditValue(draft.value);
                setEditing(true);
              }}
              disabled={disabled}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant={draft.approved ? "default" : "outline"}
              className="text-xs h-7 min-w-[84px]"
              onClick={() => void onApprove(slotKey, !draft.approved)}
              disabled={disabled}
            >
              {draft.approved ? "✓ Approved" : "Approve"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FactoryLuccaTab({
  run,
  onRunUpdate,
}: {
  run: SlideFactoryRun;
  onRunUpdate: (r: SlideFactoryRun) => void;
}) {
  const { toast } = useToast();
  const [approvingAll, setApprovingAll] = useState(false);
  const [triggeringBuild, setTriggeringBuild] = useState(false);

  const handleApproveSlot = useCallback(
    async (key: string, approved: boolean) => {
      try {
        const r = await fetch(
          `/api/lb-slides/factory/runs/${run.id}/slots/${encodeURIComponent(key)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ approved }),
          },
        );
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? "Failed to update slot");
        }
        onRunUpdate((await r.json()) as SlideFactoryRun);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Update failed";
        toast({ title: "Failed to update slot", description: msg, variant: "destructive" });
      }
    },
    [run.id, onRunUpdate, toast],
  );

  const handleSaveValue = useCallback(
    async (key: string, value: string) => {
      try {
        const r = await fetch(
          `/api/lb-slides/factory/runs/${run.id}/slots/${encodeURIComponent(key)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ value }),
          },
        );
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? "Failed to save slot value");
        }
        onRunUpdate((await r.json()) as SlideFactoryRun);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Save failed";
        toast({ title: "Failed to save slot", description: msg, variant: "destructive" });
      }
    },
    [run.id, onRunUpdate, toast],
  );

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      const r = await fetch(
        `/api/lb-slides/factory/runs/${run.id}/approve-all-slots`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Failed to approve all slots");
      }
      onRunUpdate((await r.json()) as SlideFactoryRun);
      toast({ title: "All slots approved" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approve failed";
      toast({ title: "Failed to approve all", description: msg, variant: "destructive" });
    } finally {
      setApprovingAll(false);
    }
  };

  const handleTriggerBuild = async () => {
    setTriggeringBuild(true);
    try {
      const r = await fetch(
        `/api/lb-slides/factory/runs/${run.id}/trigger-build`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Failed to trigger build");
      }
      onRunUpdate((await r.json()) as SlideFactoryRun);
      toast({ title: "Build triggered", description: "Slide agents are building the deck." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Trigger failed";
      toast({ title: "Failed to trigger build", description: msg, variant: "destructive" });
    } finally {
      setTriggeringBuild(false);
    }
  };

  // Lucca is still running
  if (run.status === "drafting") {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <p className="text-sm font-medium">Lucca is drafting slide content…</p>
          <p className="text-xs text-muted-foreground">
            The pipeline advances automatically once all slots are ready.
          </p>
        </CardContent>
      </Card>
    );
  }

  // draft_review
  const draft = run.luccaDraft ?? {};
  const slots = Object.entries(draft);
  const allApproved = slots.length > 0 && slots.every(([, d]) => d.approved);
  const approvedCount = slots.filter(([, d]) => d.approved).length;
  const busy = approvingAll || triggeringBuild;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Lucca Draft Review</CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {approvedCount} / {slots.length} approved
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleApproveAll()}
              disabled={busy || allApproved}
            >
              {approvingAll && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              Approve all
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No draft slots found.
          </p>
        ) : (
          slots.map(([key, slotDraft]) => (
            <SlotRow
              key={key}
              slotKey={key}
              draft={slotDraft}
              onApprove={handleApproveSlot}
              onSaveValue={handleSaveValue}
              disabled={busy}
            />
          ))
        )}

        <div className="pt-2 flex items-center gap-3">
          <Button
            onClick={() => void handleTriggerBuild()}
            disabled={!allApproved || busy}
          >
            {triggeringBuild && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Proceed to build
          </Button>
          {!allApproved && slots.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Approve all slots before proceeding.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Tab 5 — Agents (build progress) ─────────────────────────────────────────

function FactoryAgentsTab({ run }: { run: SlideFactoryRun }) {
  const agentResults = run.agentResults ?? {};
  const isBuilding = run.status === "building";
  const isComplete = run.status === "complete";
  const isError = run.status === "error";

  return (
    <Card>
      <CardHeader className="pb-3">
        {/* Orchestrator row — taxonomy: Marco [Orchestrator] above the Swarm */}
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/60">
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
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            {isBuilding
              ? "6 teams building…"
              : isComplete
              ? "Build complete"
              : "Build failed"}
          </CardTitle>
        </div>
        {isBuilding && (
          <p className="text-xs text-muted-foreground">
            Each slide is processed by a dedicated agent team, then verified by Maya and Dino.
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
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
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Persona-first label: "Sofia — Building Slide 1" */}
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
                          title={`${MINIONS.dino.role}: ${result.pixelDiffPct.toFixed(2)}% pixel diff`}
                        >
                          {MINIONS.dino.label} · {result.pixelDiffPct.toFixed(1)}% · {DINO_VERDICT_LABEL[verdict]}
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
      </CardContent>
    </Card>
  );
}

// ── Tab 6 — Override panel (edit slots after completion) ─────────────────────

interface SlotConfig {
  key: string;
  label: string;
  hint: string;
  multiline?: boolean;
  type?: "text" | "photo";
}

const OVERRIDE_SLOT_GROUPS: Array<{ slideLabel: string; slots: SlotConfig[] }> = [
  {
    slideLabel: "Slide 1 — Vision",
    slots: [
      { key: "slide1.headerSubtitle", label: "Tagline", hint: "", multiline: false },
      {
        key: "slide1.visionBullets",
        label: "Vision Bullets",
        hint: "One bullet per line — start each with •",
        multiline: true,
      },
    ],
  },
  {
    slideLabel: "Slide 2 — Operational Model",
    slots: [
      { key: "slide2.operationalModelText", label: "Operational Model", hint: "", multiline: true },
      { key: "slide2.revenueBullet", label: "Revenue Mix", hint: "", multiline: false },
      { key: "slide2.programmingBullet", label: "Programming", hint: "", multiline: false },
    ],
  },
  {
    slideLabel: "Slide 3 — Concept",
    slots: [
      { key: "slide3.conceptParagraph", label: "Concept Paragraph", hint: "", multiline: true },
      { key: "slide3.marketRationale", label: "Market Rationale", hint: "", multiline: true },
      {
        key: "slide3.reasons",
        label: "Investment Reasons",
        hint: "Format: Label: detail — one reason per blank line",
        multiline: true,
      },
      { key: "slide3.closingLine", label: "Closing Line", hint: "", multiline: false },
      {
        key: "slide3.interiorPhotoUrl",
        label: "Interior Photo",
        hint: "Paste an R2 photo URL to override the auto-selected interior photo",
        type: "photo" as const,
      },
    ],
  },
  {
    slideLabel: "Slide 4 — Portfolio",
    slots: [
      { key: "slide4.sectionSubtitle", label: "Section Subtitle", hint: "", multiline: false },
    ],
  },
  {
    slideLabel: "Slide 5 — Transformation",
    slots: [
      {
        key: "slide5.transformationDescription",
        label: "Transformation Description",
        hint: "",
        multiline: true,
      },
      {
        key: "slide5.transformationRows",
        label: "Transformation Table",
        hint: "Format: Feature | Existing | Proposed — one row per line",
        multiline: true,
      },
    ],
  },
  {
    slideLabel: "Slide 6 — Disclaimer",
    slots: [
      { key: "slide6.disclaimer", label: "Disclaimer", hint: "", multiline: true },
    ],
  },
];

function SlotEditor({
  slotKey,
  draft,
  runId,
  onRunUpdate,
  disabled,
}: {
  slotKey: string;
  draft: LuccaSlotDraft | undefined;
  runId: number;
  onRunUpdate: (r: SlideFactoryRun) => void;
  disabled: boolean;
}) {
  const { toast } = useToast();
  const config = OVERRIDE_SLOT_GROUPS.flatMap((g) => g.slots).find((s) => s.key === slotKey);
  const [localValue, setLocalValue] = useState(draft?.value ?? "");
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const isDirty = localValue !== (draft?.value ?? "");

  // Sync if draft value changes externally (e.g. after another slot save)
  useEffect(() => {
    setLocalValue(draft?.value ?? "");
  }, [draft?.value]);

  const handleSave = async (valueOverride?: string) => {
    // Accept an explicit value to bypass React state-batching staleness when
    // a caller (e.g. the photo "clear" button) needs to save a value it just set.
    const valueToSave = valueOverride !== undefined ? valueOverride : localValue;
    setSaving(true);
    try {
      const r = await fetch(
        `/api/lb-slides/factory/runs/${runId}/slots/${encodeURIComponent(slotKey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ value: valueToSave }),
        },
      );
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Failed to save slot");
      }
      onRunUpdate((await r.json()) as SlideFactoryRun);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Failed to save slot", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const r = await fetch(
        `/api/lb-slides/factory/runs/${runId}/slots/${encodeURIComponent(slotKey)}/suggest`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Suggestion unavailable");
      }
      const data = (await r.json()) as { suggestion: string };
      setSuggestion(data.suggestion);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Suggestion failed";
      toast({ title: "Could not generate suggestion", description: msg, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };

  const isOverride = draft?.source === "admin-override";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-1.5">
        <label className="text-xs font-medium text-foreground">
          {config?.label ?? slotKey}
          {isOverride && (
            <span className="ml-1.5 text-[10px] font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-px">
              overridden
            </span>
          )}
        </label>
        <div className="flex items-center gap-1">
          {config?.type !== "photo" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-primary"
              onClick={() => void handleSuggest()}
              disabled={disabled || suggesting}
              title="Suggest improved copy"
              data-testid={`suggest-slot-${slotKey}`}
            >
              {suggesting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <IconWand2 className="w-3 h-3" />
              )}
              <span className="ml-1">{suggesting ? "Suggesting…" : "Suggest"}</span>
            </Button>
          )}
          {isDirty && config?.type !== "photo" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2"
              onClick={() => void handleSave()}
              disabled={saving || disabled}
              data-testid={`save-slot-${slotKey}`}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
          )}
        </div>
      </div>
      {config?.hint && (
        <p className="text-[10px] text-muted-foreground">{config.hint}</p>
      )}
      {config?.type === "photo" ? (
        <div className="space-y-2">
          {localValue && (
            <div className="relative inline-block">
              <img
                src={localValue}
                alt="Interior photo override"
                className="h-24 w-auto rounded border object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setLocalValue("");
                  // Pass "" explicitly — React state batching means localValue
                  // would still hold the old URL inside handleSave's closure.
                  void handleSave("");
                }}
                disabled={disabled}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center"
                title="Clear photo override"
              >
                ×
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              disabled={disabled}
              placeholder="Paste R2 photo URL…"
              className="text-xs h-8 flex-1"
              data-testid={`slot-photo-input-${slotKey}`}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px] px-2 shrink-0"
              onClick={() => void handleSave()}
              disabled={saving || disabled || localValue === (draft?.value ?? "")}
              data-testid={`save-slot-${slotKey}`}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Set"}
            </Button>
          </div>
        </div>
      ) : config?.multiline ? (
        <Textarea
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          disabled={disabled}
          rows={localValue.split("\n").length + 1}
          className="text-xs font-mono resize-none min-h-[3rem]"
          data-testid={`slot-textarea-${slotKey}`}
        />
      ) : (
        <Input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          disabled={disabled}
          className="text-xs h-8"
          data-testid={`slot-input-${slotKey}`}
        />
      )}
      {suggestion !== null && (
        <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs">
          <span className="flex-1 text-foreground leading-relaxed">{suggestion}</span>
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              size="sm"
              variant="default"
              className="h-5 text-[11px] px-2"
              onClick={() => {
                setLocalValue(suggestion);
                setSuggestion(null);
              }}
              data-testid={`accept-suggestion-${slotKey}`}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[11px] px-2 text-muted-foreground"
              onClick={() => setSuggestion(null)}
              data-testid={`dismiss-suggestion-${slotKey}`}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FactoryOverridePanel({
  run,
  onRunUpdate,
}: {
  run: SlideFactoryRun;
  onRunUpdate: (r: SlideFactoryRun) => void;
}) {
  const { toast } = useToast();
  const [rebuilding, setRebuilding] = useState(false);

  const isRebuilding = run.status === "rebuilding";
  const draft = run.luccaDraft ?? {};

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const r = await fetch(`/api/lb-slides/factory/runs/${run.id}/rebuild`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Rebuild failed");
      }
      onRunUpdate((await r.json()) as SlideFactoryRun);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rebuild failed";
      toast({ title: "Rebuild failed", description: msg, variant: "destructive" });
    } finally {
      setRebuilding(false);
    }
  };

  const editorDisabled = isRebuilding || rebuilding;

  return (
    <Card data-testid={`override-panel-${run.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Override Slots</CardTitle>
          <p className="text-xs text-muted-foreground">
            Edit and save individual slots, then rebuild the PDF.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isRebuilding ? (
          <div className="flex items-center gap-3 py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Rebuilding PDF…</p>
          </div>
        ) : (
          <>
            {OVERRIDE_SLOT_GROUPS.map(({ slideLabel, slots }) => (
              <Collapsible key={slideLabel} defaultOpen={false}>
                <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left group">
                  <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                    {slideLabel}
                  </span>
                  {slots.some((s) => draft[s.key]?.source === "admin-override") && (
                    <span className="text-[10px] text-amber-600 font-medium">• edited</span>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3 pl-2 border-l border-border">
                  {slots.map((s) => (
                    <SlotEditor
                      key={s.key}
                      slotKey={s.key}
                      draft={draft[s.key]}
                      runId={run.id}
                      onRunUpdate={onRunUpdate}
                      disabled={editorDisabled}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
            <div className="pt-2 border-t border-border">
              <Button
                onClick={() => void handleRebuild()}
                disabled={editorDisabled}
                size="sm"
                data-testid="rebuild-pdf-button"
              >
                {rebuilding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <IconDownload className="w-3.5 h-3.5 mr-1.5" />
                )}
                Rebuild PDF
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tab 6 — Download (complete) ──────────────────────────────────────────────

function FactoryDownloadTab({ run, onRunUpdate }: { run: SlideFactoryRun; onRunUpdate: (r: SlideFactoryRun) => void }) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasDeck = Boolean(run.deckR2Key);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleDownload = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloading(true);
    try {
      const r = await fetch(`/api/lb-slides/factory/runs/${run.id}/download`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Download failed");
      }
      const blob = await r.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `slide-deck-run-${run.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // a.click() is synchronous; the browser has already grabbed the URL by
      // this line, so revoke immediately rather than via setTimeout.
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Download failed";
      toast({ title: "Download failed", description: msg, variant: "destructive" });
    } finally {
      if (!controller.signal.aborted) setDownloading(false);
    }
  };

  if (run.status === "error") {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <IconAlertCircle weight="fill" className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Build failed</p>
              <p className="text-xs text-muted-foreground mt-1">
                One or more slides were rejected. Review the Agents tab for details.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid={`download-tab-${run.id}`}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            {run.status === "rebuilding" ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <IconCheckCircle weight="fill" className="w-4 h-4 text-success" />
            )}
            <CardTitle className="text-sm font-semibold">
              {run.status === "rebuilding" ? "Rebuilding PDF…" : "Deck ready"}
            </CardTitle>
          </div>
          {run.completedAt && run.status !== "rebuilding" && (
            <p className="text-xs text-muted-foreground">
              Completed {new Date(run.completedAt).toLocaleDateString()} at{" "}
              {new Date(run.completedAt).toLocaleTimeString()}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {hasDeck && run.status !== "rebuilding" ? (
            <Button onClick={() => void handleDownload()} disabled={downloading}>
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <IconDownload className="w-4 h-4 mr-2" />
              )}
              Download PDF
            </Button>
          ) : run.status === "rebuilding" ? (
            <p className="text-xs text-muted-foreground">
              A new version of the PDF is being generated…
            </p>
          ) : (
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4">
              <IconAlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Deck not yet rendered</p>
                <p className="text-xs text-muted-foreground mt-1">
                  The build completed but the PDF has not been generated. Please contact your
                  administrator.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FactoryOverridePanel run={run} onRunUpdate={onRunUpdate} />
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

const FACTORY_TABS: Array<{ value: FactoryTab; label: string }> = [
  { value: "f-brief",      label: "1 · Brief" },
  { value: "f-lorenzo",    label: "2 · Lorenzo" },
  { value: "f-properties", label: "3 · Properties" },
  { value: "f-lucca",      label: "4 · Lucca" },
  { value: "f-agents",     label: "5 · Agents" },
  { value: "f-download",   label: "6 · Download" },
];

export function SlideFactoryPanel() {
  const qc = useQueryClient();
  const { run, isLoading } = useActiveFactoryRun();

  const handleRunUpdate = (updated: SlideFactoryRun) => {
    qc.setQueryData(["factory-run-list"], updated);
    qc.setQueryData(["factory-run", updated.id], updated);
  };

  const activeTab = statusToTab(run?.status);
  const badge = run ? statusBadge(run.status) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Factory Pipeline</p>
        {badge && (
          <Badge variant={badge.variant} className="text-xs">
            {badge.label}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {FACTORY_TABS.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              disabled={value !== activeTab}
              className="text-xs"
              title={value !== activeTab ? "Complete the previous step to unlock" : undefined}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="f-brief" className="mt-4">
          <FactoryBriefTab run={run} onRunUpdate={handleRunUpdate} />
        </TabsContent>

        <TabsContent value="f-lorenzo" className="mt-4">
          {run ? (
            <FactoryLorenzoTab run={run} />
          ) : (
            <PlaceholderTab
              title="Lorenzo — Canonical ingestion"
              description="Lorenzo will process the brief once it has been accepted."
            />
          )}
        </TabsContent>

        <TabsContent value="f-properties" className="mt-4">
          {run?.status === "ingested" ? (
            <FactoryPropertiesTab run={run} onRunUpdate={handleRunUpdate} />
          ) : (
            <PlaceholderTab
              title="Properties"
              description="Waiting for Lorenzo to finish ingesting the brief."
            />
          )}
        </TabsContent>

        <TabsContent value="f-lucca" className="mt-4">
          {run && (run.status === "drafting" || run.status === "draft_review") ? (
            <FactoryLuccaTab run={run} onRunUpdate={handleRunUpdate} />
          ) : (
            <PlaceholderTab
              title="Lucca — Drafting"
              description="Lucca will draft slide content once properties are assigned."
            />
          )}
        </TabsContent>

        <TabsContent value="f-agents" className="mt-4">
          {run && (run.status === "building" || run.status === "complete" || run.status === "error") ? (
            <FactoryAgentsTab run={run} />
          ) : (
            <PlaceholderTab
              title="Agents — Building slides"
              description="The slide agents will build each individual slide once the draft review is complete."
            />
          )}
        </TabsContent>

        <TabsContent value="f-download" className="mt-4">
          {run && (run.status === "complete" || run.status === "rebuilding" || run.status === "error") ? (
            <FactoryDownloadTab run={run} onRunUpdate={handleRunUpdate} />
          ) : (
            <PlaceholderTab
              title="Complete — Download deck"
              description="The deck will be available for download once all slides are built and approved."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
