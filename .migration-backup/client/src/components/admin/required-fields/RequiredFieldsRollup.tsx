/**
 * Required Fields Roll-Up — read-only aggregate across every Specialist.
 *
 * The Specialist catalog (`engine/analyst/registry/specialist-catalog.ts`) is
 * the single source of truth for what fields each Specialist may require, and
 * `specialist_configs.field_requirements` holds the admin's per-Specialist
 * toggle state. This page reads both via `GET /api/admin/specialists` (catalog)
 * and `GET /api/admin/specialists/:id` (per-Specialist config) and renders a
 * single table grouped by Specialist + surface.
 *
 * Editing happens on the owning Specialist's Required Fields tab — every row
 * here links to that page. There is intentionally no write surface here; the
 * old textarea-driven `/api/admin/required-fields` is retired (410 Gone).
 */
import { useQuery, useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { useAdminSection } from "@/lib/admin-nav";
import { setAiIntelligenceTabHint } from "@/lib/ai-intelligence-nav";
import {
  SPECIALIST_SECTION_TO_ID,
  type AdminSection,
  type SpecialistSection,
} from "@/components/admin/AdminSidebar";

interface PerennialOffender {
  specialistId: string;
  specialistLetter: string;
  specialistRealName: string;
  specialistDisplayName: string;
  fieldKey: string;
  fieldLabel: string;
  fieldSurface: "company-assumptions" | "property-edit" | "market-macro" | "constants";
  appearances: number;
  firstObservedAt: string;
  lastObservedAt: string;
}

interface CandidateField {
  key: string;
  label: string;
  surface: "company-assumptions" | "property-edit" | "market-macro" | "constants";
}

interface PrerequisiteRef {
  id: string;
  label: string;
  description: string;
}

interface SpecialistListItem {
  id: string;
  letter: string;
  realName: string;
  displayName: string;
  description: string | null;
  subject: string;
  candidateFields: CandidateField[];
  prerequisites: PrerequisiteRef[];
}

interface SpecialistDetail {
  config: {
    fieldRequirements: Record<string, "hard" | "recommended" | "off">;
    prerequisiteToggles: Record<string, boolean>;
  };
}

const SURFACE_LABEL: Record<CandidateField["surface"], string> = {
  "company-assumptions": "Company Assumptions",
  "property-edit": "Property Edit",
  "market-macro": "Market & Macro",
  "constants": "Constants",
};

const LEVEL_LABEL: Record<"hard" | "recommended" | "off", string> = {
  hard: "Hard-required",
  recommended: "Recommended",
  off: "Off",
};

const LEVEL_VARIANT: Record<"hard" | "recommended" | "off", "default" | "secondary" | "outline"> = {
  hard: "default",
  recommended: "secondary",
  off: "outline",
};

/**
 * Find the sidebar section value for a given Specialist id. The map is
 * bijective with SPECIALIST_CATALOG (asserted by a coverage test), so a
 * missing entry here means catalog drift — we fall back to staying on the
 * roll-up page rather than navigating to nowhere.
 */
function specialistSectionForId(specialistId: string): SpecialistSection | null {
  for (const [section, id] of Object.entries(SPECIALIST_SECTION_TO_ID)) {
    if (id === specialistId) return section as SpecialistSection;
  }
  return null;
}

export default function RequiredFieldsRollup() {
  const [, setSection] = useAdminSection();

  const listQuery = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });

  // Task #614 — cross-Specialist roll-up of "perennial offender" candidate
  // fields (appearances >= 3, never promoted). Surfaced as a dedicated
  // panel above the per-Specialist breakdown so admins can act on the
  // most-ignored recommendations without visiting each Specialist's
  // Recommendations card one by one.
  const offendersQuery = useQuery<PerennialOffender[]>({
    queryKey: ["/api/admin/specialists/perennial-offenders"],
  });

  // Click-through: navigate to the offending Specialist's section AND
  // pre-select the Required Fields tab (where the Recommendations card
  // lives). The tab hint is consumed once on SpecialistPage mount, so a
  // back-button + re-click works correctly thanks to the nonce in the
  // hint store.
  const openRecommendations = (specialistId: string) => {
    const sectionValue = specialistSectionForId(specialistId);
    if (!sectionValue) return;
    setAiIntelligenceTabHint(specialistId, "required-fields");
    setSection(sectionValue as AdminSection);
  };

  // Fetch each Specialist's config in parallel. Disabled until the list
  // resolves so we don't fire 11 placeholder requests against `/api/admin/
  // specialists/undefined`.
  const detailQueries = useQueries({
    queries: (listQuery.data ?? []).map((s) => ({
      queryKey: ["/api/admin/specialists", s.id],
      enabled: Boolean(listQuery.data),
    })),
  }) as ReturnType<typeof useQueries> & Array<{ data?: SpecialistDetail; isLoading: boolean }>;

  if (listQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="rollup-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const specialists = listQuery.data ?? [];

  return (
    <div className="space-y-4" data-testid="required-fields-rollup">
      <Card>
        <CardHeader>
          <CardTitle>How required fields work now</CardTitle>
          <CardDescription>
            Each Specialist owns its own list of candidate fields and prerequisite conditions.
            Toggle rows on the Specialist's Required Fields tab — this page is a read-only
            roll-up across all Specialists. Hard-required fields gate the Specialist's run;
            Recommended fields are surfaced to the user but do not block.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card data-testid="card-perennial-offenders">
        <CardHeader>
          <CardTitle>Perennial recommendations</CardTitle>
          <CardDescription>
            Candidate fields a Specialist has surfaced at least three runs in a row without
            ever being promoted. Click a row to jump straight to that Specialist's
            Recommendations card and either promote the field or dismiss it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {offendersQuery.isLoading ? (
            <div
              className="flex items-center justify-center py-6"
              data-testid="perennial-offenders-loading"
            >
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !offendersQuery.data || offendersQuery.data.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-perennial-offenders-empty"
            >
              No perennial offenders right now — every recurring recommendation has
              either been promoted or appeared fewer than three times.
            </p>
          ) : (
            <div className="border rounded-md divide-y" data-testid="list-perennial-offenders">
              {offendersQuery.data.map((o) => (
                <button
                  key={`${o.specialistId}:${o.fieldKey}`}
                  type="button"
                  onClick={() => openRecommendations(o.specialistId)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted/40 transition-colors"
                  data-testid={`perennial-offender-${o.specialistId}-${o.fieldKey}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {o.fieldLabel}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Specialist {o.specialistLetter} — {o.specialistRealName} ·{" "}
                      {SURFACE_LABEL[o.fieldSurface] ?? o.fieldSurface} · {o.fieldKey}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Badge
                      variant="secondary"
                      data-testid={`perennial-offender-appearances-${o.specialistId}-${o.fieldKey}`}
                    >
                      {o.appearances} appearances
                    </Badge>
                    <span className="text-xs text-muted-foreground">Open →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {specialists.map((spec, idx) => {
        const detail = detailQueries[idx]?.data as SpecialistDetail | undefined;
        const fieldRequirements = detail?.config?.fieldRequirements ?? {};
        const prereqToggles = detail?.config?.prerequisiteToggles ?? {};

        const candidatesBySurface = new Map<string, CandidateField[]>();
        for (const cand of spec.candidateFields) {
          const list = candidatesBySurface.get(cand.surface) ?? [];
          list.push(cand);
          candidatesBySurface.set(cand.surface, list);
        }

        const sectionValue = specialistSectionForId(spec.id);
        const noFieldsOrPrereqs =
          spec.candidateFields.length === 0 && spec.prerequisites.length === 0;

        return (
          <Card key={spec.id} data-testid={`rollup-specialist-${spec.id}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  Specialist {spec.letter} — {spec.realName}
                </CardTitle>
                {spec.description && (
                  <CardDescription className="mt-1">{spec.description}</CardDescription>
                )}
              </div>
              {sectionValue && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSection(sectionValue as AdminSection)}
                  data-testid={`button-open-specialist-${spec.id}`}
                >
                  Open Specialist →
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {noFieldsOrPrereqs && (
                <p className="text-sm text-muted-foreground">
                  This Specialist does not declare any candidate fields or prerequisite conditions.
                </p>
              )}

              {Array.from(candidatesBySurface.entries()).map(([surface, fields]: [string, CandidateField[]]) => (
                <div key={surface} data-testid={`rollup-surface-${spec.id}-${surface}`}>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    {SURFACE_LABEL[surface as CandidateField["surface"]] ?? surface}
                  </div>
                  <div className="border rounded-md divide-y">
                    {fields.map((f) => {
                      const level = (fieldRequirements[f.key] ?? "off") as "hard" | "recommended" | "off";
                      return (
                        <div
                          key={f.key}
                          className="flex items-center justify-between px-3 py-2 text-sm"
                          data-testid={`rollup-field-${spec.id}-${f.key}`}
                        >
                          <div>
                            <div className="font-medium text-foreground">{f.label}</div>
                            <div className="text-xs text-muted-foreground">{f.key}</div>
                          </div>
                          <Badge variant={LEVEL_VARIANT[level]} data-testid={`rollup-field-level-${spec.id}-${f.key}`}>
                            {LEVEL_LABEL[level]}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {spec.prerequisites.length > 0 && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Prerequisite conditions
                  </div>
                  <div className="border rounded-md divide-y">
                    {spec.prerequisites.map((p) => {
                      const enabled = prereqToggles[p.id] === true;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between px-3 py-2 text-sm gap-3"
                          data-testid={`rollup-prereq-${spec.id}-${p.id}`}
                        >
                          <div>
                            <div className="font-medium text-foreground">{p.label}</div>
                            {p.description && (
                              <div className="text-xs text-muted-foreground">{p.description}</div>
                            )}
                          </div>
                          <Badge
                            variant={enabled ? "default" : "outline"}
                            data-testid={`rollup-prereq-state-${spec.id}-${p.id}`}
                          >
                            {enabled ? "Enforced" : "Off"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
