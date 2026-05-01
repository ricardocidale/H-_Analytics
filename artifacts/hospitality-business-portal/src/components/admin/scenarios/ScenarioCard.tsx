import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconTrash, IconPencil, IconPeople, IconScenarios, IconProperties, IconBuilding2 } from "@/components/icons";
import { formatDateTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";

interface AccessGrant {
  id: number;
  targetType: string;
  targetId: number;
  grantedBy: number;
  createdAt: string;
}

export interface AdminScenario {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  kind: string | null;
  ownerEmail: string;
  ownerName: string | null;
  propertyCount: number;
  createdAt: string;
  updatedAt: string;
  accessGrants: AccessGrant[];
}

interface ScenarioCardProps {
  scenario: AdminScenario;
  onManageAccess: (scenario: AdminScenario) => void;
  onEdit: (scenario: AdminScenario) => void;
  onDelete: (scenario: AdminScenario) => void;
  getGrantLabel: (targetType: string, targetId: number) => string;
}

function getGrantBadgeVariant(targetType: string): "default" | "secondary" | "outline" {
  if (targetType === "group") return "default";
  if (targetType === "company") return "secondary";
  return "outline";
}

export function ScenarioCard({ scenario, onManageAccess, onEdit, onDelete, getGrantLabel }: ScenarioCardProps) {
  return (
    <Card data-testid={`card-scenario-${scenario.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2" data-testid={`text-scenario-name-${scenario.id}`}>
              <IconScenarios className="w-4 h-4 text-muted-foreground" />
              {scenario.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-scenario-owner-${scenario.id}`}>
              Owner: {scenario.ownerName || scenario.ownerEmail}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onManageAccess(scenario)}
              data-testid={`button-manage-access-${scenario.id}`}
              aria-label={`Manage access for ${scenario.name}`}
            >
              <IconPeople className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(scenario)}
              data-testid={`button-edit-scenario-${scenario.id}`}
              aria-label={`Edit ${scenario.name}`}
            >
              <IconPencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(scenario)}
              data-testid={`button-delete-scenario-${scenario.id}`}
              aria-label={`Delete ${scenario.name}`}
            >
              <IconTrash className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {scenario.description && (
            <span data-testid={`text-scenario-desc-${scenario.id}`}>{scenario.description}</span>
          )}
          <span className="flex items-center gap-1">
            <IconProperties className="w-3.5 h-3.5" />
            {scenario.propertyCount} properties
          </span>
          <span>Created {formatDateTime(scenario.createdAt)}</span>
        </div>
        {scenario.accessGrants.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3" data-testid={`grants-${scenario.id}`}>
            {scenario.accessGrants.map(grant => (
              <Badge
                key={grant.id}
                variant={getGrantBadgeVariant(grant.targetType)}
                className="text-xs"
              >
                {grant.targetType === "group" && <IconPeople className="w-3 h-3 mr-1" />}
                {grant.targetType === "company" && <IconBuilding2 className="w-3 h-3 mr-1" />}
                {getGrantLabel(grant.targetType, grant.targetId)}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
