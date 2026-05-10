import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
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
import { IconSparkles } from "@/components/icons";
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
        className="sm:max-w-lg overflow-hidden"
        data-testid="dialog-missing-required-fields"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                <IconSparkles className="h-4 w-4" />
              </span>
              The Analyst needs these to proceed
            </DialogTitle>
            <DialogDescription className="label-text">
              <span className="font-medium text-foreground">{specialistLabel}</span>
              {" "}can't form a view without the field
              {missingFields.length === 1 ? "" : "s"} below. Set
              {missingFields.length === 1 ? " it" : " them"} on Company
              Assumptions and save, then come back and try again.
            </DialogDescription>
          </DialogHeader>

          <div
            className="space-y-2 mt-2"
            data-testid="missing-fields-list"
          >
            <AnimatePresence initial={false}>
              {missingFields.map((f, idx) => {
                const target = resolveCandidateFieldNavTarget(f, navContext);
                return (
                  <motion.div
                    key={f.key}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.18,
                      delay: 0.05 + idx * 0.04,
                      ease: "easeOut",
                    }}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card/60 backdrop-blur-sm p-2.5 shadow-sm"
                    data-testid={`missing-field-row-${f.key}`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="bg-primary/10 text-primary border-primary/30"
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
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:bg-primary/10"
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
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="default"
              onClick={() => onOpenChange(false)}
              data-testid="button-dismiss-missing-fields-prompt"
            >
              OK, let me fill them in
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
