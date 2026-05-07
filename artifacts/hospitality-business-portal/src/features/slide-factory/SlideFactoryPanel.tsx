/**
 * SlideFactoryPanel — Slide Factory V2 pipeline wizard
 *
 * 6-tab wizard driven by run status. Only Tab 1 (Brief) and Tab 3 (Properties)
 * have working UI; the others are placeholders for later build units.
 *
 *   Tab 1  f-brief       new / brief_ready
 *   Tab 2  f-lorenzo     ingesting            (placeholder)
 *   Tab 3  f-properties  ingested
 *   Tab 4  f-lucca       drafting / draft_review (placeholder)
 *   Tab 5  f-agents      building             (placeholder)
 *   Tab 6  f-download    complete             (placeholder)
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconUpload } from "@/components/icons";

// ── Constants ───────────────────────────────────────────────────────────────

const FACTORY_POLL_MS = 5_000;
const ACCEPTED_FILE_ACCEPT =
  ".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const ACCEPTED_EXTENSIONS = new Set([".pdf", ".pptx"]);
const NONE_VALUE = "__none__";

// ── Types ───────────────────────────────────────────────────────────────────

type FactoryStatus =
  | "new"
  | "brief_ready"
  | "ingesting"
  | "ingested"
  | "drafting"
  | "draft_review"
  | "building"
  | "complete"
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
  luccaDraft: Record<string, unknown> | null;
  agentResults: Record<string, unknown> | null;
  deckR2Key: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
]);

function isTerminal(run: SlideFactoryRun | null): boolean {
  return !run || run.status === "complete" || run.status === "error";
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
  const isTransitioning = run != null && TRANSITIONING_STATUSES.has(run.status);

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

  // brief_ready — waiting for Lorenzo
  if (run.status === "brief_ready") {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <p className="text-sm font-medium">
            Brief accepted — waiting for Lorenzo to process
          </p>
          {run.briefFilename && (
            <p className="text-xs text-muted-foreground">
              File: {run.briefFilename}
            </p>
          )}
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
        <p className="text-sm font-semibold text-foreground">Factory Pipeline</p>
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
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="f-brief" className="mt-4">
          <FactoryBriefTab run={run} onRunUpdate={handleRunUpdate} />
        </TabsContent>

        <TabsContent value="f-lorenzo" className="mt-4">
          <PlaceholderTab
            title="Lorenzo — Ingesting brief"
            description="Lorenzo is processing the brief and building the canonical spec. This step runs automatically — the pipeline advances once ingestion is complete."
          />
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
          <PlaceholderTab
            title="Lucca — Drafting"
            description="Lucca is drafting slide content from the canonical spec and property data. This step runs automatically."
          />
        </TabsContent>

        <TabsContent value="f-agents" className="mt-4">
          <PlaceholderTab
            title="Agents — Building slides"
            description="The slide agents are building each individual slide. This step runs automatically."
          />
        </TabsContent>

        <TabsContent value="f-download" className="mt-4">
          <PlaceholderTab
            title="Complete — Download deck"
            description="The deck is ready. Download functionality will be available here once the build unit is complete."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
