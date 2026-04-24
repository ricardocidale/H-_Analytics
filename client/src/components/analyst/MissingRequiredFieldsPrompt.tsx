import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconAlertTriangle } from "@/components/icons";
import {
  resolveCandidateFieldNavTarget,
  navTargetHref,
  type CandidateFieldLike,
  type NavContext,
} from "@/lib/specialist-nav";

export interface MissingRequiredFieldsPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specialistLabel: string;
  missingFields: CandidateFieldLike[];
  navContext?: NavContext;
}

export function MissingRequiredFieldsPrompt({
  open,
  onOpenChange,
  specialistLabel,
  missingFields,
  navContext,
}: MissingRequiredFieldsPromptProps) {
  const [, setLocation] = useLocation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="dialog-missing-required-fields"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconAlertTriangle className="h-4 w-4 text-destructive" />
            Fill in required fields first
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{specialistLabel}</span>{" "}
            cannot run until the field
            {missingFields.length === 1 ? "" : "s"} below {missingFields.length === 1 ? "is" : "are"} filled in.
            These are required by the catalog and apply to every Specialist
            run — manually re-saving without them would still be blocked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2" data-testid="missing-fields-list">
          {missingFields.map((f) => {
            const target = resolveCandidateFieldNavTarget(f, navContext);
            return (
              <div
                key={f.key}
                className="flex items-center justify-between gap-3 rounded-md border p-2"
                data-testid={`missing-field-row-${f.key}`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="destructive"
                      data-testid={`missing-field-badge-${f.key}`}
                    >
                      {f.label}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {f.surface}
                    </span>
                  </div>
                </div>
                {target ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      setLocation(navTargetHref(target));
                    }}
                    data-testid={`button-go-fill-${f.key}`}
                  >
                    {target.label} →
                  </Button>
                ) : (
                  <span
                    className="text-xs italic text-muted-foreground"
                    data-testid={`missing-field-no-link-${f.key}`}
                  >
                    Open the {f.surface.replace("-", " ")} surface
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-dismiss-missing-fields-prompt"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
