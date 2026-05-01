/**
 * RequiredFieldsTab — read-only display of the Specialist's catalog-driven
 * candidate fields and prerequisite conditions. Per
 * `.claude/rules/specialists-are-dev-defined-only.md` §3, admins cannot
 * change field requirements or prerequisite enforcement at runtime —
 * the catalog (`engine/analyst/registry/specialist-catalog.ts`) is the
 * single source of truth and must be edited in code + redeployed.
 *
 * The previous 3-way toggle UI, change-summary input, and both PUT
 * mutations have been removed. The RecommendationsCard sidekick (which
 * promoted candidate fields via the same field-toggles endpoint) is
 * also no longer rendered — promotion is, by rule, a code-only change.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { SpecialistConfigView } from "../types";

type FieldLevel = "hard" | "recommended" | "off";

export function RequiredFieldsTab({
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

  const fieldsBySurface = useMemo(() => {
    const out = new Map<string, typeof candidateFields>();
    for (const c of candidateFields) {
      const list = out.get(c.surface) ?? [];
      list.push(c);
      out.set(c.surface, list);
    }
    return out;
  }, [candidateFields]);

  const noCandidates = candidateFields.length === 0;
  const noPrereqs = prerequisites.length === 0;

  // Resolved level per candidate: locked-hard rows always render as "hard"
  // even if the persisted toggle row says otherwise. For non-locked rows
  // we use the catalog-mirrored fieldRequirements value (default "off").
  const resolveLevel = (key: string): FieldLevel => {
    if (lockedHard.has(key)) return "hard";
    return (config.fieldRequirements?.[key] ?? "off") as FieldLevel;
  };

  return (
    <div className="space-y-4">
      <Alert data-testid="required-fields-readonly-banner">
        <AlertTitle>Read-only — dev-defined</AlertTitle>
        <AlertDescription>
          Specialist field requirements are defined in source code per{" "}
          <code>specialists-are-dev-defined-only.md</code>. To change
          required or recommended fields, edit the Specialist catalog and
          redeploy.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle>Candidate fields</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <strong>Required</strong> fields gate the Specialist's run (research aborts if
            missing). <strong>Recommended</strong> fields are surfaced to the user as nudges
            but do not block. Fields not shown as either are inactive for this Specialist.
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
                  const level = resolveLevel(f.key);
                  return (
                    <div
                      key={f.key}
                      className="flex items-center justify-between px-3 py-2 text-sm gap-3"
                      data-testid={`field-toggle-row-${f.key}`}
                    >
                      <div>
                        <div className="font-medium text-foreground">{f.label}</div>
                        <div className="text-xs font-mono text-muted-foreground">{f.key}</div>
                      </div>
                      <div className="shrink-0" data-testid={`field-level-${f.key}`}>
                        {level === "hard" && (
                          <Badge variant="default" data-testid={`badge-field-required-${f.key}`}>
                            Required
                          </Badge>
                        )}
                        {level === "recommended" && (
                          <Badge variant="secondary" data-testid={`badge-field-recommended-${f.key}`}>
                            Recommended
                          </Badge>
                        )}
                        {level === "off" && (
                          <span
                            className="text-xs text-muted-foreground"
                            data-testid={`field-level-off-${f.key}`}
                          >
                            —
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
              {prerequisites.map((p) => {
                const enforced = config.prerequisiteToggles?.[p.id] === true;
                return (
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
                    <div className="shrink-0" data-testid={`prereq-level-${p.id}`}>
                      {enforced ? (
                        <Badge variant="default" data-testid={`badge-prereq-enforced-${p.id}`}>
                          Enforced
                        </Badge>
                      ) : (
                        <span
                          className="text-xs text-muted-foreground"
                          data-testid={`prereq-level-off-${p.id}`}
                        >
                          —
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
