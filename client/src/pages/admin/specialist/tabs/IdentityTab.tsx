/**
 * IdentityTab — read-only display of the Specialist persona name and
 * grammatical gender. Per `.claude/rules/specialists-are-dev-defined-only.md`
 * §3, admins cannot edit Specialist identity at runtime; the catalog
 * (engine/analyst/registry/specialist-catalog.ts) is the single source
 * of truth and must be edited in code + redeployed.
 *
 * The GET endpoint stays live so admins can still SEE catalog vs.
 * override state (override rows are pre-existing data; CC's follow-up
 * will decide whether to migrate them or drop them). All mutation code
 * has been removed.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle } from "@/components/icons";

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

export function IdentityTab({ specialistId }: { specialistId: string }) {
  const { data, isLoading, error } = useQuery<IdentityResponse>({
    queryKey: [`/api/admin/specialists/${specialistId}/identity`],
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
  const nameOverride = data.resolved.source.humanName === "override";
  const genderOverride = data.resolved.source.gender === "override";

  return (
    <div className="space-y-4">
      <Alert data-testid="identity-readonly-banner">
        <AlertTitle>Read-only — dev-defined</AlertTitle>
        <AlertDescription>
          Specialist identity is defined in source code per{" "}
          <code>specialists-are-dev-defined-only.md</code>. To change persona,
          edit the Specialist catalog and redeploy.
        </AlertDescription>
      </Alert>

      <Card data-testid="identity-tab">
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>
            The Specialist's persona name (used in narration, log lines, and the page header) and
            grammatical gender (used by the pronoun helper). Catalog defaults are shown below
            alongside the value currently in effect.
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
                {nameOverride && (
                  <Badge variant="secondary" className="ml-2 text-xs" data-testid="badge-identity-name-override">
                    Override active
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground" data-testid="identity-resolved-gender">
                {data.resolved.gender}
                {genderOverride && (
                  <Badge variant="secondary" className="ml-2 text-xs" data-testid="badge-identity-gender-override">
                    Override active
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {hasOverride && data.override && (
            <div className="text-xs text-muted-foreground border-t pt-3" data-testid="identity-audit-footer">
              Override row last updated {new Date(data.override.updatedAt).toLocaleString()}
              {data.override.updatedByUserId != null && ` by user #${data.override.updatedByUserId}`}.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
