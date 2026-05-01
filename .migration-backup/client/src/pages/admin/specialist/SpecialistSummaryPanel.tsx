/**
 * SpecialistSummaryPanel — page-level summary card rendered above the
 * SpecialistPage tabs. Answers four questions for anyone landing on a
 * Specialist for the first time: who they are, what they do, where in
 * the app their output shows up, and what resources they read or write.
 *
 * Doctrine: every line of copy here is derived from `SPECIALIST_CATALOG`
 * (delivered through the `/api/admin/specialists/:id` response). No
 * hand-curated descriptions live in this component — adding a new
 * Specialist or polishing wording in the catalog flows through with
 * zero edits here.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SpecialistAssignmentView, SpecialistDetailResponse } from "./types";

type Definition = SpecialistDetailResponse["definition"];

const SUBJECT_SURFACE_LABEL: Record<Definition["subject"], string> = {
  "mgmt-co": "Management Company pages",
  property: "Property workspace",
  photos: "Photos page",
  "portfolio-ops": "Portfolio Ops alerts",
  constants: "Constants tab (Source of Truth)",
  resources: "Resources catalog",
};

const CANDIDATE_SURFACE_LABEL: Record<string, string> = {
  "company-assumptions": "Company Assumptions",
  "property-edit": "Property Edit",
  "market-macro": "Market & Macro Defaults",
  constants: "Constants tab",
};

/**
 * Friendly label for a `candidateFields[].surface` value. Falls back to a
 * title-cased version of the raw key so a future catalog expansion (a new
 * surface enum value) doesn't silently disappear from the summary panel.
 */
function surfaceLabel(surface: string): string {
  if (CANDIDATE_SURFACE_LABEL[surface]) return CANDIDATE_SURFACE_LABEL[surface];
  return surface
    .split(/[-_]/)
    .filter((s) => s.length > 0)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(" ");
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v && v.length > 0)));
}

function whereTheyHelp(def: Definition): string[] {
  const surfaces: string[] = [SUBJECT_SURFACE_LABEL[def.subject]];
  for (const cf of def.candidateFields ?? []) {
    surfaces.push(surfaceLabel(cf.surface));
  }
  if ((def.constantsOwned ?? []).length > 0) {
    surfaces.push("Constants tab (Source of Truth)");
  }
  return dedupe(surfaces);
}

interface ResourceLine {
  key: string;
  label: string;
  detail?: string;
}

function resourcesUsed(
  def: Definition,
  assignments: SpecialistAssignmentView[],
): ResourceLine[] {
  const lines: ResourceLine[] = [];
  for (const ref of def.assignmentRefs) {
    const live = assignments.find(
      (a) => a.kind === ref.kind && a.slug === ref.slug && (a.role ?? null) === (ref.role ?? null),
    );
    const friendly = live?.resource?.displayName ?? ref.slug;
    const role = ref.role ? ` · ${ref.role}` : "";
    lines.push({
      key: `${ref.kind}:${ref.slug}:${ref.role ?? ""}`,
      label: `${ref.kind.toUpperCase()} — ${friendly}`,
      detail: `${ref.required ? "required" : "optional"}${role}`,
    });
  }
  for (const key of def.constantsOwned ?? []) {
    lines.push({
      key: `constant:${key}`,
      label: `CONSTANT — ${key}`,
      detail: "owned (read + write authority)",
    });
  }
  return lines;
}

function cadenceLabel(days: number): string {
  if (days === 1) return "Daily";
  if (days === 7) return "Weekly";
  if (days === 30) return "Monthly";
  if (days === 90) return "Quarterly";
  if (days === 365) return "Annually";
  return `Every ${days} days`;
}

export function SpecialistSummaryPanel({
  definition,
  assignments,
}: {
  definition: Definition;
  assignments: SpecialistAssignmentView[];
}) {
  const role = definition.displayName ?? definition.realName;
  const persona = definition.humanName ?? role;
  const surfaces = whereTheyHelp(definition);
  const resources = resourcesUsed(definition, assignments);
  const cadenceDays = definition.defaultRefreshCadenceDays ?? null;

  return (
    <Card data-testid="specialist-summary-panel">
      <CardContent className="py-5 space-y-5">
        <div className="flex items-start gap-3">
          <Badge
            variant="outline"
            className="text-base h-8 w-8 flex items-center justify-center shrink-0"
            data-testid="summary-letter"
          >
            {definition.letter}
          </Badge>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-lg font-semibold" data-testid="summary-human-name">
                {persona}
              </h3>
              {persona !== role && (
                <span className="text-sm text-muted-foreground" data-testid="summary-role">
                  · {role}
                </span>
              )}
            </div>
            {definition.description && (
              <p className="text-sm text-muted-foreground" data-testid="summary-job">
                {definition.description}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SummarySection title="Where they help" testId="summary-where">
            {surfaces.length === 0 ? (
              <EmptyLine>No surfaces wired yet.</EmptyLine>
            ) : (
              <ul className="space-y-1">
                {surfaces.map((s) => (
                  <li
                    key={s}
                    className="text-sm text-foreground"
                    data-testid={`summary-where-item-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </SummarySection>

          <SummarySection title="Resources used" testId="summary-resources">
            {resources.length === 0 ? (
              <EmptyLine>No resources declared in the catalog.</EmptyLine>
            ) : (
              <ul className="space-y-1">
                {resources.map((r) => (
                  <li
                    key={r.key}
                    className="text-sm text-foreground"
                    data-testid={`summary-resource-${r.key}`}
                  >
                    <span>{r.label}</span>
                    {r.detail && (
                      <span className="text-xs text-muted-foreground"> — {r.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SummarySection>
        </div>

        {cadenceDays !== null && (
          <SummarySection title="Refresh cadence" testId="summary-cadence">
            <p className="text-sm text-foreground">
              {cadenceLabel(cadenceDays)}
              <span className="text-xs text-muted-foreground">
                {" "}
                — re-runs every {cadenceDays} day{cadenceDays === 1 ? "" : "s"} per
                (constant × locality) row.
              </span>
            </p>
          </SummarySection>
        )}
      </CardContent>
    </Card>
  );
}

function SummarySection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic">{children}</p>;
}
