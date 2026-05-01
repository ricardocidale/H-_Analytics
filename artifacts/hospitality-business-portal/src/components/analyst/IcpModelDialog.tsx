/**
 * IcpModelDialog — three-card picker shown when the Funding-tab Analyst
 * gate (server: routes/analyst-admin.ts) returns
 * `400 { code: "ICP_MODEL_REQUIRED", models: { A, B, C } }`. The user
 * selects one of three management-company reference models (Boutique /
 * Growth / Platform); the choice is persisted via PATCH
 * /api/global-assumptions and the host re-fires the Analyst.
 *
 * Voice (per .claude/rules/the-analyst-persona.md and the brand voice
 * blend doctrine): the Analyst is naming the missing piece of context
 * needed to range a funding plan. It does NOT ask permission, scold the
 * user for forgetting, or use form-validation language ("please select",
 * "required field"). The headline names the gap; the body offers the
 * reversible commitment ("you can change this any time") so the choice
 * does not feel locked-in.
 *
 * Wired in `client/src/pages/CompanyAssumptions.tsx` via the
 * `onIcpModelRequired` callback on the funding-tab `useAnalystRefresh`
 * hook (Task A).
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { IconSparkles } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { useUpdateAdminConfig } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  IcpModelProfile,
  IcpModelTier,
} from "@shared/constants-benchmarks";

export interface IcpModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The three model profiles. When opened from the
   * `ICP_MODEL_REQUIRED` 400 response, comes straight from the server
   * payload. When opened by clicking the pre-selection badge (Task C),
   * pass the canonical `ICP_MODEL_PROFILES` from
   * `@shared/constants-benchmarks` so the user sees the same numbers.
   */
  models: Record<IcpModelTier, IcpModelProfile>;
  /**
   * Fires after the PATCH succeeds and the dialog has closed. The host
   * component should refire the Analyst run that triggered the dialog.
   * Optional so the same dialog can be opened from the pre-selection
   * badge without auto-firing the Analyst.
   */
  onModelSelected?: (tier: IcpModelTier) => void;
}

const TIER_ORDER: ReadonlyArray<IcpModelTier> = ["A", "B", "C"];

function formatRaiseUsd(usd: number): string {
  if (usd >= 1_000_000) {
    const millions = usd / 1_000_000;
    return millions >= 10
      ? `$${Math.round(millions)}M`
      : `$${millions.toFixed(1).replace(/\.0$/, "")}M`;
  }
  return `$${Math.round(usd / 1_000).toLocaleString()}K`;
}

function formatRaiseRange(range: { min: number; typical: number; max: number }): string {
  return `${formatRaiseUsd(range.min)}–${formatRaiseUsd(range.max)}`;
}

function formatPropertyRange(range: { min: number; typical: number; max: number }): string {
  return `${range.min}–${range.max}`;
}

export function IcpModelDialog({
  open,
  onOpenChange,
  models,
  onModelSelected,
}: IcpModelDialogProps) {
  const updateConfig = useUpdateAdminConfig();
  const { toast } = useToast();
  const [pendingTier, setPendingTier] = useState<IcpModelTier | null>(null);

  // Reset pending state whenever the dialog reopens so a previous
  // mid-flight selection doesn't ghost the next session.
  useEffect(() => {
    if (open) setPendingTier(null);
  }, [open]);

  const handleSelect = async (tier: IcpModelTier) => {
    if (pendingTier !== null) return;
    setPendingTier(tier);
    try {
      await updateConfig.mutateAsync({ icpModelTier: tier });
      onOpenChange(false);
      onModelSelected?.(tier);
    } catch (err: unknown) {
      setPendingTier(null);
      toast({
        title: "Couldn't save the model",
        description:
          err instanceof Error
            ? err.message
            : "Try again — the choice didn't make it to the server.",
        variant: "destructive",
      });
    }
  };

  const isSaving = pendingTier !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isSaving) onOpenChange(v);
      }}
    >
      <DialogContent
        className="sm:max-w-3xl overflow-hidden p-7"
        data-testid="dialog-icp-model"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="space-y-6"
        >
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-3 font-display text-lg leading-tight">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <IconSparkles className="h-4 w-4" />
              </span>
              The Analyst needs to know your scale
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              To range your funding plan, pick the model that best fits your
              management company today. You can change this any time.
            </DialogDescription>
          </DialogHeader>

          <div
            className="grid gap-4 md:grid-cols-3"
            data-testid="grid-icp-model-cards"
          >
            {TIER_ORDER.map((tier) => {
              const profile = models[tier];
              if (!profile) return null;
              const isPending = pendingTier === tier;
              const isOtherPending = isSaving && !isPending;

              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => void handleSelect(tier)}
                  disabled={isSaving}
                  data-testid={`button-icp-model-${tier.toLowerCase()}`}
                  className={cn(
                    "group relative flex flex-col rounded-lg border bg-card p-5 text-left transition-all",
                    "hover:border-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isPending && "border-primary shadow-md ring-2 ring-primary",
                    isOtherPending && "opacity-50",
                    "border-border",
                  )}
                >
                  {isPending && (
                    <span className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}

                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold",
                        "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
                      )}
                    >
                      {tier}
                    </span>
                    <div>
                      <div
                        className="font-display text-base font-semibold leading-tight"
                        data-testid={`text-icp-model-label-${tier.toLowerCase()}`}
                      >
                        {profile.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Model {tier}
                      </div>
                    </div>
                  </div>

                  <p
                    className="mt-3 text-xs leading-relaxed text-muted-foreground"
                    data-testid={`text-icp-model-tagline-${tier.toLowerCase()}`}
                  >
                    {profile.tagline}
                  </p>

                  <dl className="mt-4 grid grid-cols-1 gap-2 text-xs">
                    <div className="flex items-baseline justify-between gap-2 border-t border-border pt-2">
                      <dt className="text-muted-foreground">Typical raise</dt>
                      <dd className="font-medium tabular-nums">
                        {formatRaiseRange(profile.targetRaiseUsd)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-t border-border pt-2">
                      <dt className="text-muted-foreground">Runway buffer</dt>
                      <dd className="font-medium tabular-nums">
                        {profile.runwayBufferMonths} months
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-t border-border pt-2">
                      <dt className="text-muted-foreground">Properties</dt>
                      <dd className="font-medium tabular-nums">
                        {formatPropertyRange(profile.propertyCount)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex items-center justify-end">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        isPending ? "text-primary" : "text-muted-foreground group-hover:text-primary",
                      )}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-pop" />
                          Saving…
                        </>
                      ) : (
                        "Select"
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              data-testid="button-icp-model-cancel"
            >
              Not now
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
