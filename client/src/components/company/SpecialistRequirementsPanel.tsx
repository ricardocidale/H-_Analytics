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
import { setAdminSection } from "@/lib/admin-nav";
import type { AdminSection } from "@/components/admin/AdminSidebar";

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

export function SpecialistRequirementsPanel() {
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
      <CardContent className="space-y-3">
        {companyScope.map((spec) => (
          <SpecialistRow key={spec.id} spec={spec} />
        ))}
      </CardContent>
    </Card>
  );
}

function SpecialistRow({ spec }: { spec: SpecialistListItem }) {
  const { data: detail } = useQuery<SpecialistDetail>({
    queryKey: [`/api/admin/specialists/${spec.id}`],
  });

  const fieldReqs = detail?.config.fieldRequirements ?? {};
  const prereqState = detail?.config.prerequisiteToggles ?? {};

  const hard = spec.candidateFields.filter((f) => fieldReqs[f.key] === "hard");
  const recommended = spec.candidateFields.filter((f) => fieldReqs[f.key] === "recommended");
  const enforcedPrereqs = spec.prerequisites.filter((p) => prereqState[p.id] === true);

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
          hard.map((f) => (
            <Badge
              key={f.key}
              variant="destructive"
              data-testid={`company-specialist-${spec.id}-hard-${f.key}`}
            >
              {f.label}
            </Badge>
          ))
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
