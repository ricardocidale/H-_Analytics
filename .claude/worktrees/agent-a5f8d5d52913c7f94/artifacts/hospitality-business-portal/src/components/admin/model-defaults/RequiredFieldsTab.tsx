/**
 * Legacy Model-Defaults → Required Fields tab.
 *
 * This UI was retired by Task #413. Required fields are now owned per
 * Specialist (the catalog is the single source of truth). The roll-up
 * across all 11 Specialists lives at Admin → Required Fields, and
 * per-Specialist editing happens on each Specialist page.
 *
 * The component is kept (instead of being deleted) so that any
 * still-mounted Model-Defaults sub-tab in the wild renders an explicit
 * banner rather than a 404. The legacy `PUT /api/admin/required-fields`
 * endpoint now returns 410 Gone — there is intentionally no save path
 * here.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IconAlertTriangle } from "@/components/icons";
import { setAdminSection } from "@/lib/admin-nav";

export function RequiredFieldsTab() {
  return (
    <Card data-testid="legacy-required-fields-banner">
      <CardHeader>
        <CardTitle className="text-base">Required Fields</CardTitle>
        <CardDescription>
          Required fields are now owned per Specialist.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <IconAlertTriangle className="h-4 w-4" />
          <AlertTitle>This panel was moved</AlertTitle>
          <AlertDescription>
            The single global required-fields list has been replaced. Each
            Specialist now declares its own candidate fields and prerequisite
            conditions in the catalog, and admins toggle each one as
            <em> hard-required</em>, <em>recommended</em>, or <em>off</em> on
            that Specialist&apos;s page. Use the Required Fields page for the
            roll-up view across all Specialists.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button
            onClick={() => setAdminSection("required-fields")}
            data-testid="button-open-required-fields-rollup"
          >
            Open Required Fields roll-up →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
