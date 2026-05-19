import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/field-section";
import { NumberField, PctField, type Draft } from "./FieldHelpers";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { AnalystVerdictDisplay } from "@/components/analyst/AnalystVerdictDisplay";
import { SaveButton } from "@/components/ui/save-button";
import { useFocusFieldFromUrl } from "@/lib/analyst-focus-field";
import { IconBriefcase } from "@/components/icons";
import {
  DEFAULT_RUNWAY_BUFFER_MONTHS,
  DEFAULT_SIZING_OVERSHOOT_PCT,
  DEFAULT_REVENUE_RAMP_DELAY_MONTHS,
  DEFAULT_BURN_FLEX_DOWN_PCT,
} from "@shared/constants-funding";

interface CapitalStackDisciplineTabProps {
  draft: Draft;
  onChange: (field: string, value: any) => void;
  onFundingAnalystRefresh?: () => void;
  fundingAnalystRunning?: boolean;
  fundingAnalystCooldownMs?: number;
  fundingVerdict?: import("@engine/analyst/contracts/verdict").AnalystVerdict | null;
  /**
   * Traffic-light freshness dot for the Funding Analyst button.
   * null = no dot (ran this session). "missing" = never run.
   */
  fundingFreshnessStatus?: "stale" | "very_stale" | "missing" | null;
  /** Whether there are unsaved changes. Controls Cancel button visibility. */
  isDirty?: boolean;
  /** Whether a save mutation is in flight. */
  isPending?: boolean;
  /** Called when the Save button inside the tab is clicked. */
  onSave?: () => void;
  /** Called when Cancel is clicked — discards unsaved changes. */
  onReset?: () => void;
}

export function CapitalStackDisciplineTab(props: CapitalStackDisciplineTabProps) {
  const {
    draft,
    onChange,
    onFundingAnalystRefresh,
    fundingAnalystRunning,
    fundingAnalystCooldownMs,
    fundingVerdict,
    fundingFreshnessStatus,
    isDirty = false,
    isPending = false,
    onSave,
    onReset,
  } = props;

  useFocusFieldFromUrl();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-4 space-y-3 flex-1">
          <div className="flex items-start gap-2">
            <IconBriefcase className="w-4 h-4 text-accent-pop mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">What this controls</p>
              <p className="text-sm text-muted-foreground mt-1">
                These four thresholds are consumed exclusively by the{" "}
                <strong>Funding Specialist (mgmt-co-funding)</strong> when it evaluates a
                management company's capital-raise plan against live benchmarks. They define
                the minimum safety margins the Specialist uses to score and flag funding plans.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground pl-0 list-none">
                <li>
                  <strong>Runway Buffer</strong> — minimum months of runway past the operations
                  start date. Raises that leave less than this cushion are flagged as undersized.
                </li>
                <li>
                  <strong>Sizing Overshoot</strong> — minimum headroom (as % of the raise) over
                  the modeled cash need. The Specialist prefers raises sized at or above this
                  band to cover plan slippage.
                </li>
                <li>
                  <strong>Revenue Ramp Delay</strong> — estimated months between operations
                  start and first material property revenue, used to size the operating reserve.
                </li>
                <li>
                  <strong>Burn Flex-Down</strong> — discretionary portion of the burn plan that
                  can be cut without breaking operations. Measures available slack before a
                  covenant or runway tripwire fires.
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              data-testid="button-capital-stack-discipline-tab-cancel"
            >
              Cancel
            </Button>
          )}
          {onFundingAnalystRefresh && (
            <AnalystButton
              isRunning={fundingAnalystRunning}
              cooldownRemainingMs={fundingAnalystCooldownMs}
              freshnessStatus={fundingFreshnessStatus ?? null}
              onClick={onFundingAnalystRefresh}
              dataTestId="button-analyst-capital-stack-discipline"
            />
          )}
          {onSave && (
            <SaveButton
              onClick={onSave}
              hasChanges={isDirty}
              isPending={isPending}
              alwaysActive
              size="sm"
              data-testid="button-capital-stack-discipline-tab-save"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        <Section grid title="Runway & Sizing" description="Thresholds that size the raise and validate it covers the full operating window before revenue arrives.">
          <NumberField
            label="Runway Buffer"
            tooltip="Months of runway buffer past the company operations start date. Sized so the plan does not run dry the day revenue should arrive — the Specialist flags raises with less than this cushion."
            value={draft.runwayBufferMonths}
            fallback={DEFAULT_RUNWAY_BUFFER_MONTHS}
            onChange={(_, v) => onChange("runwayBufferMonths", v)}
            min={3}
            max={24}
            step={1}
            testId="field-runwayBufferMonths"
            researchRange="6–12 months"
          />
          <PctField
            label="Sizing Overshoot"
            tooltip="Headroom over the modeled cash need, expressed as a percent of the modeled raise. Covers slippage between plan and actual; the Specialist prefers raises sized at or above the mid-band."
            value={draft.sizingOvershootPct}
            fallback={DEFAULT_SIZING_OVERSHOOT_PCT}
            onChange={(_, v) => onChange("sizingOvershootPct", v)}
            min={0}
            max={0.50}
            step={0.01}
            testId="field-sizingOvershootPct"
            researchRange="10%–35%"
          />
        </Section>

        <Section grid title="Revenue & Burn" description="Thresholds that validate the timing gap between raise, revenue arrival, and the company's burn flexibility.">
          <NumberField
            label="Revenue Ramp Delay"
            tooltip="Months between operations start and the first material property revenue. Used to size the operating reserve and validate the gap between raise dates and revenue arrival."
            value={draft.revenueRampDelayMonths}
            fallback={DEFAULT_REVENUE_RAMP_DELAY_MONTHS}
            onChange={(_, v) => onChange("revenueRampDelayMonths", v)}
            min={1}
            max={18}
            step={1}
            testId="field-revenueRampDelayMonths"
            researchRange="3–9 months"
          />
          <PctField
            label="Burn Flex-Down"
            tooltip="Discretionary headroom in the burn plan that can be cut without breaking operations, as a percent of plan burn. Quantifies how much the company can absorb before a covenant or runway tripwire fires."
            value={draft.burnFlexDownPct}
            fallback={DEFAULT_BURN_FLEX_DOWN_PCT}
            onChange={(_, v) => onChange("burnFlexDownPct", v)}
            min={0}
            max={0.50}
            step={0.01}
            testId="field-burnFlexDownPct"
            researchRange="10%–30%"
          />
        </Section>
      </div>

      {fundingVerdict && (
        <div data-testid="capital-stack-discipline-verdict-section">
          <AnalystVerdictDisplay verdict={fundingVerdict} />
        </div>
      )}
    </div>
  );
}
