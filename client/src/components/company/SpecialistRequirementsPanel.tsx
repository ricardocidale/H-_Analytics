/**
 * Per-Specialist "what we need" panel for the Company Assumptions surface.
 *
 * Reads the catalog of mgmt-co + portfolio-ops Specialists and shows, for
 * each one, a roll-up of its hard-required fields and active prerequisite
 * toggles. Read-only; the editing surface lives on each Specialist page in
 * Admin. The panel is intentionally additive so it can sit beside the
 * existing tab layout without restructuring CompanyAssumptions.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle } from "@/components/icons";
import { setAdminSection } from "@/lib/admin-nav";
import type { AdminSection } from "@/components/admin/AdminSidebar";
import {
  resolveCandidateFieldNavTarget,
  navTargetHref,
} from "@/lib/specialist-nav";
import { useLocation } from "wouter";

export interface PrerequisiteFailure {
  id: string;
  specialistId: string;
  reason: string;
}

interface SpecialistListItem {
  id: string;
  letter: string;
  realName: string;
  displayName: string;
  subject: "mgmt-co" | "property" | "photos" | "portfolio-ops";
  candidateFields: { key: string; label: string; surface: string }[];
  prerequisites: { id: string; label: string; description: string }[];
}

interface SpecialistDetail {
  definition: SpecialistListItem;
  config: {
    fieldRequirements: Record<string, "hard" | "recommended" | "off">;
    prerequisiteToggles: Record<string, boolean>;
    requiredFields: string[];
  };
}

// Mirror of `SPECIALIST_SECTION_TO_ID` (AdminSidebar) for the company surface.
// Only Specialists that have a real admin section render an "Open Specialist"
// link; the rest still appear in the panel (read-only roll-up) without a
// link, which is fine — adding a Specialist section in the sidebar map will
// automatically wire the link here when this map is extended.
const SPECIALIST_SECTION: Record<string, AdminSection> = {
  "mgmt-co.funding":          "specialist-mgmt-co-funding",
  "mgmt-co.revenue":          "specialist-mgmt-co-revenue",
  "mgmt-co.icp-intelligence": "specialist-mgmt-co-icp-intelligence",
  "portfolio-ops.watchdog":   "specialist-portfolio-ops-watchdog",
};

export function SpecialistRequirementsPanel({
  entityValues,
}: {
  /**
   * current values of the surface (e.g. the loaded
   * GlobalAssumptions draft). When provided, hard-required fields whose
   * value resolves to null/undefined/empty render a red "Missing" badge
   * so users can see at a glance which inputs are blocking a Specialist
   * run before clicking Refresh research.
   */
  entityValues?: Record<string, unknown>;
} = {}) {
  const { data: specialists } = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });

  const companyScope = (specialists ?? []).filter(
    (s) => s.subject === "mgmt-co" || s.subject === "portfolio-ops",
  );

  if (companyScope.length === 0) return null;

  return (
    <Card data-testid="company-specialist-requirements-panel">
      <CardHeader>
        <CardTitle className="text-base">What each Specialist needs from this surface</CardTitle>
        <CardDescription>
          Catalog-driven view. Each Specialist owns its own list — toggle changes happen on the
          Specialist&apos;s admin page.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {companyScope.map((spec) => (
          <SpecialistRow key={spec.id} spec={spec} entityValues={entityValues} />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * true when the value at `entityValues[key]` is missing
 * (null, undefined, empty string, or NaN). Mirrors the server-side
 * `findMissingRequiredFields` definition so the badge and the gate
 * never disagree.
 */
function isFieldMissing(
  entityValues: Record<string, unknown> | undefined,
  key: string,
): boolean {
  if (!entityValues) return false;
  const v = entityValues[key];
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (typeof v === "number" && Number.isNaN(v)) return true;
  return false;
}

function SpecialistRow({
  spec,
  entityValues,
}: {
  spec: SpecialistListItem;
  entityValues?: Record<string, unknown>;
}) {
  const [, setLocation] = useLocation();
  const { data: detail } = useQuery<SpecialistDetail>({
    queryKey: [`/api/admin/specialists/${spec.id}`],
  });

  const fieldReqs = detail?.config.fieldRequirements ?? {};
  const prereqState = detail?.config.prerequisiteToggles ?? {};

  const hard = spec.candidateFields.filter((f) => fieldReqs[f.key] === "hard");
  const recommended = spec.candidateFields.filter((f) => fieldReqs[f.key] === "recommended");
  const enforcedPrereqs = spec.prerequisites.filter((p) => prereqState[p.id] === true);
  // the subset of hard-required fields that are currently
  // missing on this surface. When `entityValues` is omitted, this stays
  // empty and the panel falls back to the previous label-only display.
  const missingHard = hard.filter((f) => isFieldMissing(entityValues, f.key));

  const sectionKey = SPECIALIST_SECTION[spec.id];

  return (
    <div
      className="rounded-md border p-3 space-y-2"
      data-testid={`company-specialist-row-${spec.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {spec.letter}. {spec.displayName}
          </div>
          <div className="text-xs text-muted-foreground capitalize">{spec.subject}</div>
        </div>
        {sectionKey && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdminSection(sectionKey)}
            data-testid={`button-open-specialist-from-company-${spec.id}`}
          >
            Open Specialist →
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Hard-required:</span>
        {hard.length === 0 ? (
          <span className="italic text-muted-foreground">none</span>
        ) : (
          hard.map((f) => {
            const missing = missingHard.some((m) => m.key === f.key);
            const target = missing
              ? resolveCandidateFieldNavTarget(f, undefined)
              : null;
            return (
              <span key={f.key} className="inline-flex items-center gap-1">
                <Badge
                  variant="destructive"
                  data-testid={`company-specialist-${spec.id}-hard-${f.key}`}
                >
                  {f.label}
                  {missing && (
                    <span
                      className="ml-1 rounded bg-background/30 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      data-testid={`company-specialist-${spec.id}-missing-${f.key}`}
                    >
                      Missing
                    </span>
                  )}
                </Badge>
                {missing && target && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => setLocation(navTargetHref(target))}
                    data-testid={`button-go-fill-company-${spec.id}-${f.key}`}
                  >
                    Fix →
                  </Button>
                )}
              </span>
            );
          })
        )}
      </div>

      {recommended.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Recommended:</span>
          {recommended.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              data-testid={`company-specialist-${spec.id}-recommended-${f.key}`}
            >
              {f.label}
            </Badge>
          ))}
        </div>
      )}

      {enforcedPrereqs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Prerequisites enforced:</span>
          {enforcedPrereqs.map((p) => (
            <Badge
              key={p.id}
              variant="outline"
              data-testid={`company-specialist-${spec.id}-prereq-${p.id}`}
            >
              {p.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * PrerequisitesFailedPanel — surfaces prerequisite-evaluation failures
 * returned by `POST /api/global-assumptions/save-tab` so the user can see
 * exactly *why* a Specialist refused to run after a save. The save itself
 * still landed (drafts are permissive); this panel is informational and
 * provides a jump link to the owning Specialist's admin page where the
 * toggle can be turned off or the underlying condition fixed.
 */
export function PrerequisitesFailedPanel({
  failures,
  onDismiss,
}: {
  failures: PrerequisiteFailure[];
  onDismiss?: () => void;
}) {
  const { data: specialists } = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });

  if (failures.length === 0) return null;

  const lookup = new Map((specialists ?? []).map((s) => [s.id, s]));

  return (
    <Card
      className="border-destructive/50"
      data-testid="company-prerequisite-failures-panel"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <IconAlertTriangle className="h-4 w-4 text-destructive" />
              Specialist prerequisites not met
            </CardTitle>
            <CardDescription>
              Your save was kept, but the Specialist below could not run because
              a toggled-on prerequisite failed. Open the Specialist to turn the
              prerequisite off or fix the underlying condition.
            </CardDescription>
          </div>
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              data-testid="button-dismiss-prerequisite-failures"
            >
              Dismiss
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {failures.map((f) => {
          const spec = lookup.get(f.specialistId);
          const prereq = spec?.prerequisites.find((p) => p.id === f.id);
          const sectionKey = SPECIALIST_SECTION[f.specialistId];
          const specName = spec
            ? `${spec.letter}. ${spec.displayName}`
            : f.specialistId;
          const prereqLabel = prereq?.label ?? f.id;
          return (
            <div
              key={`${f.specialistId}:${f.id}`}
              className="rounded-md border p-3 space-y-1"
              data-testid={`company-prerequisite-failure-${f.specialistId}-${f.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-foreground">
                    {specName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Prerequisite: <span className="font-medium">{prereqLabel}</span>
                  </div>
                </div>
                {sectionKey && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdminSection(sectionKey)}
                    data-testid={`button-open-specialist-from-prereq-failure-${f.specialistId}`}
                  >
                    Open Specialist →
                  </Button>
                )}
              </div>
              <div
                className="text-sm text-foreground"
                data-testid={`text-prerequisite-failure-reason-${f.specialistId}-${f.id}`}
              >
                {f.reason}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
