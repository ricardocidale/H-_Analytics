/**
 * SpecialistPage — read-only assignment + health surface for one Specialist
 * (P5). Renders only the capability tabs the catalog declares for this
 * Specialist, so a Specialist that lacks (e.g.) `required-fields` never
 * shows that tab.
 *
 * Doctrine (replit.md, LOCKED 2026-04-21):
 *   • Specialist pages are READ-ONLY for Resource assignments. There is
 *     no UI affordance to relink an assignment from this page; the
 *     "Edit in Resources →" link is the only escape hatch.
 *   • Funding (A) and Revenue (B) are status="built". Specialists C–G
 *     declare capabilities but render a stub banner — their evaluators
 *     don't exist yet.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconLayers } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setAdminSection } from "@/lib/admin-nav";
import type { AdminSection } from "@/components/admin/AdminSidebar";
import type {
  ResourcePublicView,
  ResourceHealthStatus,
  ProbeStatus,
  ResourceKind,
} from "@shared/schema";

// ── API contract (mirrors server/routes/admin/specialists.ts) ──────────
type Capability = "required-fields" | "llm-config" | "resource-assignments" | "runtime" | "audit";
type Subject = "mgmt-co" | "property" | "photos" | "portfolio-ops";
type Status = "built" | "needs-page";

interface SpecialistAssignmentView {
  kind: ResourceKind;
  slug: string;
  role: string | null;
  required: boolean;
  resource: ResourcePublicView | null;
  health: { status: ResourceHealthStatus; lastChecked: string | null; lastStatus: ProbeStatus | null };
}
interface SpecialistConfigView {
  specialistId: string;
  promptTemplate: string;
  modelResourceId: number | null;
  requiredFields: string[];
  /** Per-Specialist allow-list for requiredFields keys; null = no allow-list. */
  validRequiredFieldKeys: string[] | null;
  runtimeConfig: Record<string, unknown>;
  version: number;
  updatedAt: string;
}
interface SpecialistDetailResponse {
  definition: {
    id: string;
    letter: string;
    realName: string;
    displayName?: string;
    description?: string;
    subject: Subject;
    capabilities: Capability[];
    status: Status;
    assignmentRefs: { kind: ResourceKind; slug: string; role?: string | null; required: boolean }[];
  };
  config: SpecialistConfigView;
  assignments: SpecialistAssignmentView[];
}
interface SpecialistAuditEntry {
  id: number;
  version: number;
  section: "llm-config" | "required-fields" | "runtime";
  changeSummary: string | null;
  changedByUserId: number | null;
  changedAt: string;
  promptTemplate: string;
  modelResourceId: number | null;
  requiredFields: string[];
  runtimeConfig: Record<string, unknown>;
}

const HEALTH_BAND: Record<ResourceHealthStatus, { label: string; cls: string }> = {
  green: { label: "Healthy",            cls: "bg-emerald-500" },
  amber: { label: "Stale or skipped",   cls: "bg-amber-500" },
  red:   { label: "Failing",            cls: "bg-rose-500" },
  gray:  { label: "Never checked",      cls: "bg-slate-400" },
};

const RESOURCE_KIND_TO_SECTION: Record<ResourceKind, AdminSection> = {
  api: "resources-apis",
  source: "resources-sources",
  table: "resources-tables",
  benchmark: "resources-benchmarks",
  model: "resources-models",
};

export default function SpecialistPage({ specialistId }: { specialistId: string }) {
  const { data, isLoading, error } = useQuery<SpecialistDetailResponse>({
    queryKey: [`/api/admin/specialists/${specialistId}`],
  });

  type TabValue = Capability | "workflow";
  const tabsList = useMemo(() => {
    if (!data) return [] as { value: TabValue; label: string }[];
    const order: Capability[] = ["required-fields", "llm-config", "resource-assignments", "runtime", "audit"];
    const labels: Record<Capability, string> = {
      "required-fields": "Required Fields",
      "llm-config": "LLM Config",
      "resource-assignments": "Resources",
      "runtime": "Runtime",
      "audit": "Audit",
    };
    const capTabs = order
      .filter((c) => data.definition.capabilities.includes(c))
      .map((c) => ({ value: c as TabValue, label: labels[c] }));
    return [{ value: "workflow" as TabValue, label: "Overview / Workflow" }, ...capTabs];
  }, [data]);

  const [activeTab, setActiveTab] = useState<TabValue | undefined>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="specialist-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert variant="destructive" data-testid="specialist-error">
        <IconAlertTriangle className="w-4 h-4" />
        <AlertTitle>Could not load Specialist</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  const { definition, config, assignments } = data;
  const current = activeTab ?? tabsList[0]?.value;

  return (
    <div className="space-y-6" data-testid={`specialist-page-${specialistId}`}>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Badge variant="outline" data-testid="badge-specialist-letter">{definition.letter}</Badge>
          <h2 className="text-xl font-semibold" data-testid="text-specialist-name">
            {definition.displayName ?? definition.realName}
          </h2>
          <Badge variant={definition.status === "built" ? "default" : "secondary"} data-testid="badge-specialist-status">
            {definition.status === "built" ? "Built" : "Needs page"}
          </Badge>
          <span className="text-sm text-muted-foreground ml-auto" data-testid="text-specialist-subject">
            Subject: {definition.subject}
          </span>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-specialist-description">
          {definition.description ?? ""}
        </p>
      </div>

      {definition.status === "needs-page" && (
        <Alert data-testid="banner-needs-page">
          <IconAlertTriangle className="w-4 h-4" />
          <AlertTitle>Specialist not yet wired into the engine</AlertTitle>
          <AlertDescription>
            Configuration here is recorded for audit but has no runtime effect until the
            evaluator ships. Edits remain safe — they will activate automatically when
            the Specialist goes live.
          </AlertDescription>
        </Alert>
      )}

      {tabsList.length === 0 ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">This Specialist declares no capability tabs.</CardContent></Card>
      ) : (
        <Tabs value={current} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList>
            {tabsList.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="workflow">
            <WorkflowTab
              specialistId={specialistId}
              description={definition.description}
              assignments={assignments}
            />
          </TabsContent>
          {tabsList.find((t) => t.value === "required-fields") && (
            <TabsContent value="required-fields"><RequiredFieldsTab specialistId={specialistId} config={config} /></TabsContent>
          )}
          {tabsList.find((t) => t.value === "llm-config") && (
            <TabsContent value="llm-config"><LlmConfigTab specialistId={specialistId} config={config} /></TabsContent>
          )}
          {tabsList.find((t) => t.value === "resource-assignments") && (
            <TabsContent value="resource-assignments"><ResourceAssignmentsTab assignments={assignments} /></TabsContent>
          )}
          {tabsList.find((t) => t.value === "runtime") && (
            <TabsContent value="runtime"><RuntimeTab specialistId={specialistId} config={config} /></TabsContent>
          )}
          {tabsList.find((t) => t.value === "audit") && (
            <TabsContent value="audit"><AuditTab specialistId={specialistId} /></TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

// ── RequiredFieldsTab ──────────────────────────────────────────────────
function RequiredFieldsTab({ specialistId, config }: { specialistId: string; config: SpecialistConfigView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fieldsText, setFieldsText] = useState(config.requiredFields.join("\n"));
  const [summary, setSummary] = useState("");

  const allowList = config.validRequiredFieldKeys; // null = no allow-list
  const allowSet = useMemo(() => (allowList === null ? null : new Set(allowList)), [allowList]);

  // Live local-only validation: highlight keys the user has typed that
  // aren't in the allow-list. Server is still the authority and will
  // reject on save with 400 + invalidKeys, but inline feedback is faster.
  const localInvalid = useMemo(() => {
    if (allowSet === null) return [] as string[];
    return fieldsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((k) => !allowSet.has(k));
  }, [fieldsText, allowSet]);

  const mutation = useMutation({
    mutationFn: async () => {
      const fields = fieldsText.split("\n").map((s) => s.trim()).filter(Boolean);
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/required-fields`, {
        fields,
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Required fields updated" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      setSummary("");
    },
    onError: (e: unknown) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Required Fields</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          One field key per line. Research only runs once every required field is populated upstream.
        </p>
        {allowList !== null && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-2" data-testid="hint-valid-required-field-keys">
            <p className="text-xs font-medium text-muted-foreground">
              Valid keys for this Specialist:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allowList.map((k) => (
                <code
                  key={k}
                  className="rounded bg-background px-1.5 py-0.5 text-xs font-mono border"
                  data-testid={`chip-valid-key-${k}`}
                >
                  {k}
                </code>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Keys outside this list will be rejected on save.
            </p>
          </div>
        )}
        <Textarea
          value={fieldsText}
          onChange={(e) => setFieldsText(e.target.value)}
          rows={8}
          data-testid="textarea-required-fields"
          className="font-mono text-sm"
        />
        {localInvalid.length > 0 && (
          <p
            className="text-xs text-destructive"
            data-testid="text-required-fields-invalid"
          >
            {localInvalid.length === 1 ? "Unknown key" : "Unknown keys"}:{" "}
            <code className="font-mono">{localInvalid.join(", ")}</code>
          </p>
        )}
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Change summary (optional, recorded in audit)"
          data-testid="input-change-summary-required-fields"
        />
        <div className="flex justify-end">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || localInvalid.length > 0}
            data-testid="button-save-required-fields"
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── LlmConfigTab ───────────────────────────────────────────────────────
const PipelineConfigTab = lazy(() => import("@/components/admin/intelligence/PipelineConfigTab"));

function LlmConfigTab({ specialistId, config }: { specialistId: string; config: SpecialistConfigView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState(config.promptTemplate);
  const [modelId, setModelId] = useState<string>(config.modelResourceId ? String(config.modelResourceId) : "none");
  const [summary, setSummary] = useState("");

  const { data: models } = useQuery<ResourcePublicView[]>({ queryKey: ["/api/admin/resources?kind=model"] });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/llm-config`, {
        promptTemplate: prompt,
        modelResourceId: modelId === "none" ? null : Number(modelId),
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "LLM config updated" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      setSummary("");
    },
    onError: (e: unknown) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>LLM Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger data-testid="select-llm-model"><SelectValue placeholder="Select a model resource" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {(models ?? []).map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.displayName ?? m.slug}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Models are managed in <a className="underline" data-testid="link-resources-models" onClick={() => setAdminSection("resources-models")} href="#">Resources · Models →</a>
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt template</label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={12} className="font-mono text-sm" data-testid="textarea-prompt-template" />
          </div>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Change summary (optional, recorded in audit)" data-testid="input-change-summary-llm" />
          <div className="flex justify-end">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-llm-config">
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-pipeline-config-embed">
        <CardHeader>
          <CardTitle>Global pipeline configuration</CardTitle>
          <p className="text-xs text-muted-foreground">
            These policies apply to every specialist. Specialist-specific prompt and model are above.
          </p>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}>
            <PipelineConfigTab />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

// ── WorkflowTab ────────────────────────────────────────────────────────
interface ProbeStep {
  name: string;
  description?: string;
  status: "pass" | "fail" | "skipped";
  message?: string;
}
interface ProbeResponse {
  specialistId: string;
  ranAt: string;
  steps: ProbeStep[];
}

const PROBE_STATUS_CLS: Record<ProbeStep["status"], string> = {
  pass: "bg-emerald-500",
  fail: "bg-rose-500",
  skipped: "bg-slate-400",
};

function WorkflowTab({
  specialistId,
  description,
  assignments,
}: {
  specialistId: string;
  description?: string;
  assignments: SpecialistAssignmentView[];
}) {
  const { toast } = useToast();
  const [probeResult, setProbeResult] = useState<ProbeResponse | null>(null);

  const probe = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/specialists/${specialistId}/probe`, {});
      return (await res.json()) as ProbeResponse;
    },
    onSuccess: (data) => setProbeResult(data),
    onError: (e: unknown) =>
      toast({
        title: "Test agent failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const workflowSteps = useMemo(() => {
    if (assignments.length === 0) {
      return [
        {
          name: "Catalog declaration",
          description: "Specialist declared in catalog with no resource assignments.",
          status: "green" as ResourceHealthStatus,
        },
      ];
    }
    return assignments.map((a) => ({
      name: `${a.kind} · ${a.slug}`,
      description: `Role: ${a.role ?? "—"} · ${a.required ? "required" : "optional"}`,
      status: a.health.status,
    }));
  }, [assignments]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Overview / Workflow</CardTitle>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <Button
            onClick={() => probe.mutate()}
            disabled={probe.isPending}
            data-testid="button-test-agent"
          >
            {probe.isPending ? "Testing…" : "Test agent"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-3" data-testid="workflow-steps">
          {workflowSteps.map((s, i) => {
            const band = HEALTH_BAND[s.status];
            return (
              <li
                key={`${s.name}-${i}`}
                className="flex items-start gap-3"
                data-testid={`workflow-step-${i}`}
              >
                <span
                  title={band.label}
                  aria-label={band.label}
                  className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10 ${band.cls}`}
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {probeResult && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3" data-testid="probe-results">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Test results</p>
              <p className="text-xs text-muted-foreground">
                {new Date(probeResult.ranAt).toLocaleString()}
              </p>
            </div>
            <ul className="space-y-2">
              {probeResult.steps.map((step, i) => (
                <li
                  key={`${step.name}-${i}`}
                  className="flex items-start gap-3"
                  data-testid={`probe-step-${i}`}
                  data-status={step.status}
                >
                  <span
                    title={step.status}
                    aria-label={step.status}
                    className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10 ${PROBE_STATUS_CLS[step.status]}`}
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {step.name}{" "}
                      <span className="text-xs uppercase text-muted-foreground">
                        {step.status}
                      </span>
                    </p>
                    {step.message && (
                      <p className="text-xs text-muted-foreground">{step.message}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ResourceAssignmentsTab (READ-ONLY) ─────────────────────────────────
function ResourceAssignmentsTab({ assignments }: { assignments: SpecialistAssignmentView[] }) {
  if (assignments.length === 0) {
    return <Card><CardContent className="py-8 text-sm text-muted-foreground">No Resource assignments declared.</CardContent></Card>;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconLayers className="w-4 h-4" />
          Resource Assignments
          <Badge variant="outline" className="ml-2">read-only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Assignments are wired in code via the Specialist catalog. To change them, edit the
          catalog and ship a deploy. For incident reroute, use the Resources break-glass flow.
        </p>
        <div className="overflow-hidden rounded-md border" data-testid="assignments-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-2">Health</th>
                <th className="p-2">Kind</th>
                <th className="p-2">Slug</th>
                <th className="p-2">Role</th>
                <th className="p-2">Required</th>
                <th className="p-2">Resource</th>
                <th className="p-2">Last checked</th>
                <th className="p-2 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const band = HEALTH_BAND[a.health.status];
                return (
                  <tr key={`${a.kind}:${a.slug}:${a.role ?? ""}`} className="border-t" data-testid={`assignment-row-${a.kind}-${a.slug}`}>
                    <td className="p-2">
                      <span title={band.label} aria-label={band.label}
                        className={`inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10 ${band.cls}`}
                        data-testid={`assignment-health-${a.kind}-${a.slug}`}
                        data-status={a.health.status}
                      />
                    </td>
                    <td className="p-2 font-mono text-xs">{a.kind}</td>
                    <td className="p-2 font-mono text-xs">{a.slug}</td>
                    <td className="p-2">{a.role ?? "—"}</td>
                    <td className="p-2">{a.required ? "Yes" : "No"}</td>
                    <td className="p-2">
                      {a.resource ? (
                        <span data-testid={`assignment-resource-${a.kind}-${a.slug}`}>{a.resource.displayName ?? a.resource.slug}</span>
                      ) : (
                        <Badge variant="destructive" data-testid={`assignment-unbound-${a.kind}-${a.slug}`}>Unbound</Badge>
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {a.health.lastChecked ? new Date(a.health.lastChecked).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setAdminSection(RESOURCE_KIND_TO_SECTION[a.kind])}
                        data-testid={`link-edit-resource-${a.kind}-${a.slug}`}
                      >
                        Edit in Resources →
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── RuntimeTab ─────────────────────────────────────────────────────────
function RuntimeTab({ specialistId, config }: { specialistId: string; config: SpecialistConfigView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState(JSON.stringify(config.runtimeConfig ?? {}, null, 2));
  const [summary, setSummary] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let runtimeConfig: Record<string, unknown>;
      try { runtimeConfig = JSON.parse(text); } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Invalid JSON";
        setParseError(msg);
        throw new Error(msg);
      }
      setParseError(null);
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/runtime`, {
        runtimeConfig,
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Runtime updated" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      setSummary("");
    },
    onError: (e: unknown) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Runtime</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Free-form JSON object passed to the Specialist evaluator at runtime.
        </p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="font-mono text-sm" data-testid="textarea-runtime-json" />
        {parseError && <p className="text-xs text-destructive" data-testid="text-runtime-parse-error">{parseError}</p>}
        <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Change summary (optional, recorded in audit)" data-testid="input-change-summary-runtime" />
        <div className="flex justify-end">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-runtime">
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── AuditTab ───────────────────────────────────────────────────────────
function AuditTab({ specialistId }: { specialistId: string }) {
  const { data, isLoading } = useQuery<SpecialistAuditEntry[]>({
    queryKey: [`/api/admin/specialists/${specialistId}/audit`],
  });
  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin" />;
  const entries = data ?? [];
  return (
    <Card>
      <CardHeader><CardTitle>Audit history</CardTitle></CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No edits yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border" data-testid="audit-table">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-2">Version</th>
                  <th className="p-2">Section</th>
                  <th className="p-2">Summary</th>
                  <th className="p-2">User</th>
                  <th className="p-2">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t" data-testid={`audit-row-${e.id}`}>
                    <td className="p-2 font-mono text-xs">v{e.version}</td>
                    <td className="p-2">{e.section}</td>
                    <td className="p-2">{e.changeSummary ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{e.changedByUserId ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{new Date(e.changedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

