/**
 * RequiredFieldsTab — catalog-driven 3-way toggle UI (Off / Recommended /
 * Hard-required) for candidate fields plus on/off prerequisites. There is
 * intentionally NO free-form input — the catalog
 * (`engine/analyst/registry/specialist-catalog.ts`) is the only place new
 * candidate fields or prerequisites can appear.
 *
 * The RecommendationsCard sidekick (its own module) is rendered at the
 * bottom and shares the candidate-field state via setter props so promotion
 * is reflected immediately in the toggle UI.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SpecialistConfigView } from "../types";
import { RecommendationsCard, type FieldLevel } from "./RecommendationsCard";

export function RequiredFieldsTab({
  specialistId,
  config,
  candidateFields,
  prerequisites,
}: {
  specialistId: string;
  config: SpecialistConfigView;
  candidateFields: { key: string; label: string; surface: string; lockedHard?: boolean; surfaceAnchor?: string }[];
  prerequisites: { id: string; label: string; description: string }[];
}) {
  const lockedHard = useMemo(
    () => new Set(config.lockedHardKeys ?? candidateFields.filter((c) => c.lockedHard).map((c) => c.key)),
    [config.lockedHardKeys, candidateFields],
  );
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
                {fields.map((f) => {
                  const isLocked = lockedHard.has(f.key);
                  return (
                    <div
                      key={f.key}
                      className="flex items-center justify-between px-3 py-2 text-sm gap-3"
                      data-testid={`field-toggle-row-${f.key}`}
                    >
                      <div>
                        <div className="font-medium text-foreground flex items-center gap-2">
                          {f.label}
                          {isLocked && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-wide"
                              data-testid={`badge-locked-hard-${f.key}`}
                              title="Hard-required by the catalog. Admins cannot change this tier."
                            >
                              Locked
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">{f.key}</div>
                      </div>
                      {isLocked ? (
                        <div
                          className="w-[220px] text-right text-xs text-muted-foreground"
                          data-testid={`field-locked-hint-${f.key}`}
                        >
                          Hard-required (locked by catalog)
                        </div>
                      ) : (
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
                            {/* Hard-required is owned by the catalog. The admin
                                UI deliberately omits it from the dropdown for non-locked rows;
                                the server `/field-toggles` endpoint also rejects this transition
                                as a defense-in-depth check. */}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
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
