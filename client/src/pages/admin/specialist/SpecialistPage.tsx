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
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { setAiIntelligenceSection } from "@/lib/ai-intelligence-nav";
import type { AiIntelligenceSection } from "@/components/ai-intelligence/AiIntelligenceSidebar";
import { useLocation } from "wouter";
import type {
  ResourcePublicView,
  ResourceHealthStatus,
  ProbeStatus,
  ResourceKind,
} from "@shared/schema";

// ── API contract (mirrors server/routes/admin/specialists.ts) ──────────
type Capability = "required-fields" | "llm-config" | "resource-assignments" | "runtime" | "audit";
type Subject = "mgmt-co" | "property" | "photos" | "portfolio-ops" | "resources" | "constants";
type Status = "built" | "needs-page" | "stub";
type Gender = "male" | "female" | "neutral";

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
  /** Per-candidate-field toggle state (catalog-keyed). */
  fieldRequirements: Record<string, "hard" | "recommended" | "off">;
  /** Per-prerequisite toggle state (catalog-keyed). */
  prerequisiteToggles: Record<string, boolean>;
  runtimeConfig: Record<string, unknown>;
  /** Effective scheduled-refresh cadence (override → catalog default → null). */
  refreshCadenceDays: number | null;
  /** Catalog baseline used when no override is set. */
  defaultRefreshCadenceDays: number | null;
  /** Whether the admin has set a per-Specialist cadence override. */
  refreshCadenceOverridden: boolean;
  /** Catalog candidate-field keys observed missing on the most recent run. */
  lastObservedMissing: string[];
  /** ISO timestamp of the run that produced lastObservedMissing, or null. */
  lastObservedMissingAt: string | null;
  version: number;
  updatedAt: string;
}
interface SpecialistDetailResponse {
  definition: {
    id: string;
    letter: string;
    realName: string;
    displayName?: string;
    /** Persona first name (e.g. "Helena"). Mirrors catalog `humanName`. */
    humanName?: string;
    /** Pronoun set used by narration helpers. */
    gender?: Gender;
    description?: string;
    subject: Subject;
    capabilities: Capability[];
    status: Status;
    assignmentRefs: { kind: ResourceKind; slug: string; role?: string | null; required: boolean }[];
    constantsOwned?: string[];
    defaultRefreshCadenceDays?: number | null;
    candidateFields?: { key: string; label: string; surface: string }[];
    prerequisites?: { id: string; label: string; description: string }[];
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

const RESOURCE_KIND_TO_SECTION: Record<ResourceKind, AiIntelligenceSection> = {
  api: "resources-apis",
  source: "resources-sources",
  table: "resources-tables",
  benchmark: "resources-benchmarks",
  model: "resources-models",
};

function navigateToResources(
  setLocation: (path: string) => void,
  section: AiIntelligenceSection,
) {
  setAiIntelligenceSection(section);
  setLocation("/ai-intelligence");
}

export default function SpecialistPage({ specialistId }: { specialistId: string }) {
  const { data, isLoading, error } = useQuery<SpecialistDetailResponse>({
    queryKey: [`/api/admin/specialists/${specialistId}`],
  });

  // "identity" is a synthetic tab — always present, regardless of declared
  // capabilities. Phase 3 (Task #453) makes humanName + gender admin-editable
  // for every Specialist (and for Gaspar through the same surface).
  type TabValue = Capability | "workflow" | "identity";
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
    return [
      { value: "workflow" as TabValue, label: "Overview / Workflow" },
      { value: "identity" as TabValue, label: "Identity" },
      ...capTabs,
    ];
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
            {/* Persona-first header: humanName ("Helena") leads, with the
                catalog displayName / realName shown beside it as a quiet
                subtitle so admins can still trace the slug. */}
            {definition.humanName ?? definition.displayName ?? definition.realName}
            {definition.humanName && (
              <span className="ml-2 text-sm font-normal text-muted-foreground" data-testid="text-specialist-role">
                · {definition.displayName ?? definition.realName}
              </span>
            )}
          </h2>
          <Badge
            variant={definition.status === "built" ? "default" : "secondary"}
            data-testid="badge-specialist-status"
          >
            {definition.status === "built" ? "Built" : definition.status === "stub" ? "Stub" : "Needs page"}
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
          <TabsContent value="identity">
            <IdentityTab specialistId={specialistId} />
          </TabsContent>
          {tabsList.find((t) => t.value === "required-fields") && (
            <TabsContent value="required-fields">
              <RequiredFieldsTab
                specialistId={specialistId}
                config={config}
                candidateFields={data.definition.candidateFields ?? []}
                prerequisites={data.definition.prerequisites ?? []}
              />
            </TabsContent>
          )}
          {tabsList.find((t) => t.value === "llm-config") && (
            <TabsContent value="llm-config"><LlmConfigTab specialistId={specialistId} config={config} /></TabsContent>
          )}
          {tabsList.find((t) => t.value === "resource-assignments") && (
            <TabsContent value="resource-assignments"><ResourceAssignmentsTab assignments={assignments} /></TabsContent>
          )}
          {tabsList.find((t) => t.value === "runtime") && (
            <TabsContent value="runtime">
              <div className="space-y-6">
                {(definition.constantsOwned ?? []).length > 0 && (
                  <CadenceCard specialistId={specialistId} config={config} />
                )}
                <RuntimeTab specialistId={specialistId} config={config} />
              </div>
            </TabsContent>
          )}
          {tabsList.find((t) => t.value === "audit") && (
            <TabsContent value="audit"><AuditTab specialistId={specialistId} /></TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

// ── IdentityTab ────────────────────────────────────────────────────────
// Phase 3 (Task #453) — admin-editable humanName + gender, with catalog
// factory defaults clearly labelled and a "Restore default" button that
// deletes the override row. The same surface is used by Gaspar (id="gaspar")
// because the route family accepts the orchestrator id.
type IdentityGender = "male" | "female" | "neutral";
interface IdentityResponse {
  specialistId: string;
  catalog: { humanName: string; gender: IdentityGender };
  override: {
    humanName: string | null;
    gender: IdentityGender | null;
    updatedByUserId: number | null;
    updatedAt: string;
  } | null;
  resolved: {
    humanName: string;
    gender: IdentityGender;
    source: { humanName: "override" | "catalog"; gender: "override" | "catalog" };
  };
}

function IdentityTab({ specialistId }: { specialistId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<IdentityResponse>({
    queryKey: [`/api/admin/specialists/${specialistId}/identity`],
  });

  const [humanName, setHumanName] = useState<string>("");
  const [gender, setGender] = useState<IdentityGender>("female");
  const [changeSummary, setChangeSummary] = useState("");

  // Hydrate the form from the resolved view so the inputs always start at
  // "what is currently in effect" (override-when-present, catalog otherwise).
  useEffect(() => {
    if (data) {
      setHumanName(data.resolved.humanName);
      setGender(data.resolved.gender);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/identity`, {
        humanName,
        gender,
        changeSummary: changeSummary || undefined,
      });
      return res.json() as Promise<IdentityResponse>;
    },
    onSuccess: () => {
      toast({ title: "Identity saved", description: "Override active for this Specialist." });
      setChangeSummary("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/identity`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not save identity",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/specialists/${specialistId}/identity`, {
        changeSummary: changeSummary || undefined,
      });
      return res.json() as Promise<IdentityResponse>;
    },
    onSuccess: () => {
      toast({ title: "Restored to factory default", description: "Override row removed." });
      setChangeSummary("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/identity`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not reset identity",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card><CardContent className="py-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }
  if (error || !data) {
    return (
      <Alert variant="destructive" data-testid="identity-error">
        <IconAlertTriangle className="w-4 h-4" />
        <AlertTitle>Could not load identity</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  const hasOverride = data.override !== null;
  const dirty =
    humanName !== data.resolved.humanName || gender !== data.resolved.gender;

  return (
    <Card data-testid="identity-tab">
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>
          The Specialist's persona name (used in narration, log lines, and the page header) and
          grammatical gender (used by the pronoun helper). The catalog supplies factory defaults;
          values you set here override the catalog for this Specialist only and propagate
          everywhere the engine references the persona.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded border p-3 bg-muted/30 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Catalog default</div>
            <div data-testid="identity-default-name">{data.catalog.humanName}</div>
            <div className="text-muted-foreground" data-testid="identity-default-gender">{data.catalog.gender}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">In effect</div>
            <div data-testid="identity-resolved-name">
              {data.resolved.humanName}
              {data.resolved.source.humanName === "override" && (
                <Badge variant="secondary" className="ml-2 text-xs">custom</Badge>
              )}
            </div>
            <div className="text-muted-foreground" data-testid="identity-resolved-gender">
              {data.resolved.gender}
              {data.resolved.source.gender === "override" && (
                <Badge variant="secondary" className="ml-2 text-xs">custom</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="identity-human-name">Persona name</Label>
          <Input
            id="identity-human-name"
            data-testid="input-identity-human-name"
            value={humanName}
            onChange={(e) => setHumanName(e.target.value)}
            maxLength={40}
          />
        </div>

        <div className="space-y-2">
          <Label>Gender (pronouns)</Label>
          <RadioGroup
            value={gender}
            onValueChange={(v) => setGender(v as IdentityGender)}
            className="flex gap-6"
          >
            {(["female", "male", "neutral"] as IdentityGender[]).map((g) => (
              <div key={g} className="flex items-center gap-2">
                <RadioGroupItem value={g} id={`identity-gender-${g}`} data-testid={`radio-identity-gender-${g}`} />
                <Label htmlFor={`identity-gender-${g}`} className="capitalize cursor-pointer">{g}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="identity-change-summary">Change summary (optional)</Label>
          <Input
            id="identity-change-summary"
            data-testid="input-identity-change-summary"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="e.g. corrected spelling per legal review"
            maxLength={500}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            data-testid="button-identity-save"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save override
          </Button>
          <Button
            variant="outline"
            data-testid="button-identity-reset"
            onClick={() => resetMutation.mutate()}
            disabled={!hasOverride || resetMutation.isPending}
          >
            Restore default
          </Button>
        </div>

        {hasOverride && data.override && (
          <div className="text-xs text-muted-foreground border-t pt-3" data-testid="identity-audit-footer">
            Override last updated {new Date(data.override.updatedAt).toLocaleString()}
            {data.override.updatedByUserId != null && ` by user #${data.override.updatedByUserId}`}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── RequiredFieldsTab ──────────────────────────────────────────────────
// Catalog-driven toggle UI. Each candidate field renders as a 3-way control
// (Off / Recommended / Hard-required) and each prerequisite as an On/Off
// switch. There is intentionally NO free-form input — the catalog
// (`engine/analyst/registry/specialist-catalog.ts`) is the only place new
// candidate fields or prerequisites can appear.
type FieldLevel = "hard" | "recommended" | "off";

function RequiredFieldsTab({
  specialistId,
  config,
  candidateFields,
  prerequisites,
}: {
  specialistId: string;
  config: SpecialistConfigView;
  candidateFields: { key: string; label: string; surface: string }[];
  prerequisites: { id: string; label: string; description: string }[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [summary, setSummary] = useState("");
  const [fieldState, setFieldState] = useState<Record<string, FieldLevel>>(() => {
    const init: Record<string, FieldLevel> = {};
    for (const c of candidateFields) init[c.key] = (config.fieldRequirements?.[c.key] ?? "off") as FieldLevel;
    return init;
  });
  const [prereqState, setPrereqState] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of prerequisites) init[p.id] = config.prerequisiteToggles?.[p.id] === true;
    return init;
  });

  const fieldsBySurface = useMemo(() => {
    const out = new Map<string, typeof candidateFields>();
    for (const c of candidateFields) {
      const list = out.get(c.surface) ?? [];
      list.push(c);
      out.set(c.surface, list);
    }
    return out;
  }, [candidateFields]);

  const fieldMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/field-toggles`, {
        fieldRequirements: fieldState,
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Required-field toggles saved" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
      setSummary("");
    },
    onError: (e: unknown) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  const prereqMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/prerequisite-toggles`, {
        prerequisiteToggles: prereqState,
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prerequisite toggles saved" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
      setSummary("");
    },
    onError: (e: unknown) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  const noCandidates = candidateFields.length === 0;
  const noPrereqs = prerequisites.length === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Candidate fields</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Toggle each candidate field for this Specialist. <strong>Hard-required</strong> fields gate the
            Specialist's run (research aborts if missing). <strong>Recommended</strong> fields are
            surfaced to the user as nudges but do not block. The catalog is the only place new
            candidates can be added.
          </p>
          {noCandidates && (
            <p className="text-sm text-muted-foreground italic" data-testid="empty-candidate-fields">
              This Specialist has no candidate fields declared in the catalog.
            </p>
          )}
          {Array.from(fieldsBySurface.entries()).map(([surface, fields]) => (
            <div key={surface}>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                {surface}
              </div>
              <div className="border rounded-md divide-y">
                {fields.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-center justify-between px-3 py-2 text-sm gap-3"
                    data-testid={`field-toggle-row-${f.key}`}
                  >
                    <div>
                      <div className="font-medium text-foreground">{f.label}</div>
                      <div className="text-xs font-mono text-muted-foreground">{f.key}</div>
                    </div>
                    <Select
                      value={fieldState[f.key] ?? "off"}
                      onValueChange={(v) =>
                        setFieldState((s) => ({ ...s, [f.key]: v as FieldLevel }))
                      }
                    >
                      <SelectTrigger
                        className="w-[180px]"
                        data-testid={`select-field-level-${f.key}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off" data-testid={`select-field-level-${f.key}-off`}>Off</SelectItem>
                        <SelectItem value="recommended" data-testid={`select-field-level-${f.key}-recommended`}>Recommended</SelectItem>
                        <SelectItem value="hard" data-testid={`select-field-level-${f.key}-hard`}>Hard-required</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!noCandidates && (
            <>
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Change summary (optional, recorded in audit)"
                data-testid="input-change-summary-field-toggles"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => fieldMutation.mutate()}
                  disabled={fieldMutation.isPending}
                  data-testid="button-save-field-toggles"
                >
                  {fieldMutation.isPending ? "Saving…" : "Save fields"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prerequisite conditions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Conditions larger than a single field. When enforced, the Specialist refuses to run
            until the condition is met (e.g. every property must have a fully-computed financial
            statement).
          </p>
          {noPrereqs && (
            <p className="text-sm text-muted-foreground italic" data-testid="empty-prerequisites">
              This Specialist has no prerequisite conditions declared in the catalog.
            </p>
          )}
          {prerequisites.length > 0 && (
            <div className="border rounded-md divide-y">
              {prerequisites.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 text-sm gap-3"
                  data-testid={`prereq-toggle-row-${p.id}`}
                >
                  <div>
                    <div className="font-medium text-foreground">{p.label}</div>
                    {p.description && (
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    )}
                  </div>
                  <Select
                    value={prereqState[p.id] ? "on" : "off"}
                    onValueChange={(v) =>
                      setPrereqState((s) => ({ ...s, [p.id]: v === "on" }))
                    }
                  >
                    <SelectTrigger
                      className="w-[140px]"
                      data-testid={`select-prereq-${p.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="on">Enforced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="px-3 py-3">
                <Button
                  size="sm"
                  onClick={() => prereqMutation.mutate()}
                  disabled={prereqMutation.isPending}
                  data-testid="button-save-prereq-toggles"
                >
                  {prereqMutation.isPending ? "Saving…" : "Save prerequisites"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <RecommendationsCard
        specialistId={specialistId}
        config={config}
        candidateFields={candidateFields}
        fieldState={fieldState}
        setFieldState={setFieldState}
      />
    </div>
  );
}

// ── RecommendationsCard ────────────────────────────────────────────────
// Renders the most recent run's "missing but materially useful" candidate
// fields with one-click "promote to Recommended" / "promote to Hard-required"
// affordances. Promotion calls the existing field-toggles endpoint so the
// audit trail and gate semantics stay unified with manual edits.
function RecommendationsCard({
  specialistId,
  config,
  candidateFields,
  fieldState,
  setFieldState,
}: {
  specialistId: string;
  config: SpecialistConfigView;
  candidateFields: { key: string; label: string; surface: string }[];
  fieldState: Record<string, FieldLevel>;
  setFieldState: (updater: (prev: Record<string, FieldLevel>) => Record<string, FieldLevel>) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const labelByKey = useMemo(() => {
    const m = new Map<string, { label: string; surface: string }>();
    for (const c of candidateFields) m.set(c.key, { label: c.label, surface: c.surface });
    return m;
  }, [candidateFields]);

  // Defensive filter: only surface keys still in the catalog AND still
  // toggled "off". A key the admin has already promoted should disappear
  // from the recommendations list immediately.
  const recommendations = (config.lastObservedMissing ?? []).filter(
    (k) => labelByKey.has(k) && (fieldState[k] ?? "off") === "off",
  );

  const promoteMutation = useMutation({
    mutationFn: async ({ key, level }: { key: string; level: "recommended" | "hard" }) => {
      const next = { ...fieldState, [key]: level };
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/field-toggles`, {
        fieldRequirements: next,
        changeSummary: `Promoted ${key} to ${level} from last-run recommendation`,
      });
      return { json: await res.json(), key, level };
    },
    onMutate: ({ key }) => setPendingKey(key),
    onSuccess: ({ key, level }) => {
      setFieldState((s) => ({ ...s, [key]: level }));
      toast({ title: `Promoted ${labelByKey.get(key)?.label ?? key} to ${level === "hard" ? "Hard-required" : "Recommended"}` });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
    },
    onError: (e: unknown) =>
      toast({ title: "Promote failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
    onSettled: () => setPendingKey(null),
  });

  const lastRunLabel = config.lastObservedMissingAt
    ? new Date(config.lastObservedMissingAt).toLocaleString()
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendations from last run</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastRunLabel && (
          <p className="text-xs text-muted-foreground" data-testid="text-last-run-time">
            Last run: {lastRunLabel}
          </p>
        )}
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic" data-testid="empty-recommendations">
            No recommendations yet. After this Specialist runs, any fields it observed as
            "missing but materially useful" will appear here so you can promote them to
            Recommended or Hard-required.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              The last run flagged these candidate fields as missing-but-useful. Promote
              one to surface it on the user-facing nudge ("Recommended") or to gate the
              Specialist's run until it's filled in ("Hard-required").
            </p>
            <div className="border rounded-md divide-y">
              {recommendations.map((key) => {
                const meta = labelByKey.get(key)!;
                const isThisRowPending = pendingKey === key && promoteMutation.isPending;
                const isAnyPending = promoteMutation.isPending;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3 py-2 text-sm gap-3"
                    data-testid={`recommendation-row-${key}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{meta.label}</div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {key} · {meta.surface}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isAnyPending}
                        onClick={() => promoteMutation.mutate({ key, level: "recommended" })}
                        data-testid={`button-promote-recommended-${key}`}
                      >
                        {isThisRowPending ? "Promoting…" : "Promote to Recommended"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={isAnyPending}
                        onClick={() => promoteMutation.mutate({ key, level: "hard" })}
                        data-testid={`button-promote-hard-${key}`}
                      >
                        {isThisRowPending ? "Promoting…" : "Promote to Hard-required"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── LlmConfigTab ───────────────────────────────────────────────────────
const PipelineConfigTab = lazy(() => import("@/components/admin/intelligence/PipelineConfigTab"));

function LlmConfigTab({ specialistId, config }: { specialistId: string; config: SpecialistConfigView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
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
              Models are managed in <a className="underline" data-testid="link-resources-models" onClick={(e) => { e.preventDefault(); navigateToResources(setLocation, "resources-models"); }} href="#">Resources · Models →</a>
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
  const [, setLocation] = useLocation();
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
                        onClick={() => navigateToResources(setLocation, RESOURCE_KIND_TO_SECTION[a.kind])}
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

// ── CadenceCard ────────────────────────────────────────────────────────
// Per-Specialist override for the scheduled Constants refresh cadence.
// Only rendered for Constants Specialists (those whose catalog entry
// owns one or more registry keys). Passing a blank value or clicking
// "Reset to default" clears the override and the scheduler falls back
// to the catalog default.
function CadenceCard({ specialistId, config }: { specialistId: string; config: SpecialistConfigView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string>(
    config.refreshCadenceOverridden ? String(config.refreshCadenceDays ?? "") : "",
  );
  const [summary, setSummary] = useState("");

  const mutation = useMutation({
    mutationFn: async (refreshCadenceDays: number | null) => {
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/cadence`, {
        refreshCadenceDays,
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Refresh cadence updated" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/model-constants"] });
      setSummary("");
    },
    onError: (e: unknown) =>
      toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  const parsed = draft.trim() === "" ? null : Number(draft);
  const invalid = draft.trim() !== "" && (!Number.isInteger(parsed) || (parsed as number) < 1 || (parsed as number) > 3650);

  return (
    <Card data-testid="card-refresh-cadence">
      <CardHeader>
        <CardTitle>Scheduled refresh cadence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          How often the scheduler re-runs this Specialist across the Constants it owns.
          Leave blank to use the catalog default of{" "}
          <span className="font-mono" data-testid="text-cadence-default">
            {config.defaultRefreshCadenceDays ?? "—"}
          </span>{" "}
          days.
        </p>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Days between refreshes</label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                config.defaultRefreshCadenceDays != null
                  ? `Default: ${config.defaultRefreshCadenceDays}`
                  : "e.g. 30"
              }
              className="w-40"
              data-testid="input-refresh-cadence-days"
            />
          </div>
          <div className="text-xs text-muted-foreground pb-2">
            Effective:{" "}
            <span className="font-mono" data-testid="text-cadence-effective">
              {config.refreshCadenceDays ?? "—"}
            </span>{" "}
            day{config.refreshCadenceDays === 1 ? "" : "s"}
            {config.refreshCadenceOverridden && (
              <Badge variant="outline" className="ml-2" data-testid="badge-cadence-override">
                Override
              </Badge>
            )}
          </div>
        </div>
        {invalid && (
          <p className="text-xs text-destructive" data-testid="text-cadence-invalid">
            Enter a whole number of days between 1 and 3650, or leave blank to use the default.
          </p>
        )}
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Change summary (optional, recorded in audit)"
          data-testid="input-change-summary-cadence"
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDraft("");
              mutation.mutate(null);
            }}
            disabled={mutation.isPending || !config.refreshCadenceOverridden}
            data-testid="button-reset-cadence"
          >
            Reset to default
          </Button>
          <Button
            onClick={() => mutation.mutate(parsed === null ? null : Number(parsed))}
            disabled={mutation.isPending || invalid}
            data-testid="button-save-cadence"
          >
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

