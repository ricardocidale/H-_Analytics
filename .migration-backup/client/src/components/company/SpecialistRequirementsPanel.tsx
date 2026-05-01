/**
 * PrerequisitesFailedPanel — surfaces prerequisite-evaluation failures
 * returned by `POST /api/global-assumptions/save-tab` so the user can see
 * exactly *why* a Specialist refused to run after a save. The save itself
 * still landed (drafts are permissive); this panel is purely informational.
 *
 * Hard rule (see `.agents/skills/front-of-app-admin-isolation/SKILL.md`):
 * the front of the app NEVER navigates to the Admin section. This panel
 * therefore explains the failure in plain language and tells the user what
 * to fix — but it does NOT render an "Open Specialist" button. Admin
 * users reach the Specialist's admin page exclusively via the sidebar's
 * Admin menu item. Enforced by `tests/audit/no-front-app-admin-links.test.ts`.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle } from "@/components/icons";

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
              Your save was kept, but the Specialist below could not run
              because a toggled-on prerequisite failed. An administrator can
              turn the prerequisite off or fix the underlying condition.
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
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-foreground">
                  {specName}
                </div>
                <div className="text-xs text-muted-foreground">
                  Prerequisite:{" "}
                  <span className="font-medium">{prereqLabel}</span>
                </div>
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
