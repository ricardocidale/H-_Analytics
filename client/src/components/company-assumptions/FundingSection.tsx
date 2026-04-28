/**
 * FundingSection.tsx — Funding instrument tranches for the management company.
 *
 * Startup management companies often raise pre-revenue capital through
 * various funding instruments (e.g. SAFE, Convertible Note, Seed Round).
 * This section lets users configure up to two tranches, each with:
 *   • Amount — the dollar amount of the funding instrument
 *   • Date — when the funding is received
 *
 * Optionally, users can enable:
 *   • Valuation cap — maximum pre-money valuation at which the instrument
 *     converts to equity in a future priced round
 *   • Discount rate — percentage discount on the conversion price vs. the
 *     priced round price (e.g. 20% discount)
 *
 * Funding proceeds flow into the company's cash flow statement as financing
 * inflows and appear on the balance sheet as a liability until conversion.
 * They provide the runway needed to operate before management fee revenue
 * from the property portfolio covers overhead.
 *
 * The file exposes three named card components — `CapitalRaisesCard`,
 * `ConvertibleTermsCard`, `CapitalStackDisciplineCard` — so the parent can
 * arrange them across the funding-tab grid (e.g. stack Cost of Capital atop
 * Convertible Terms in column 2). The default `FundingSection` export
 * renders all three in source order for any caller that wants the legacy
 * fragment behavior.
 */
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/financialEngine";
import { DEFAULT_CAPITAL_RAISE_VALUATION_CAP, DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE, DEFAULT_FUNDING_INTEREST_RATE } from "@shared/constants";
import {
  DEFAULT_RUNWAY_BUFFER_MONTHS,
  DEFAULT_SIZING_OVERSHOOT_PCT,
  DEFAULT_REVENUE_RAMP_DELAY_MONTHS,
  DEFAULT_BURN_FLEX_DOWN_PCT,
} from "@shared/constants-funding";
import EditableValue from "./EditableValue";
import type { FundingSectionProps } from "./types";

// Both Capital Raise tranches share the same UI bounds so slider/stepper
// behavior stays in sync by construction.
const CAPITAL_RAISE_SLIDER = { min: 100_000, max: 1_500_000, step: 25_000 } as const;

// Shared chrome for every card emitted by FundingSection. Matches the rest
// of the Mgmt-Co Defaults surface so the new sub-cards visually belong with
// CompensationSection / FixedOverheadSection / etc.
const CARD_CLASSES =
  "relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm";

/* ───────────────── Card 1: Capital Raises ─────────────────
   Funding-source label + the two tranches stacked vertically (one atop the
   other) so the card occupies a single grid column. Each tranche keeps its
   amount slider + date input; the running total is shown below. */
export function CapitalRaisesCard({ formData, onChange, global }: FundingSectionProps) {
  const fundingLabel = formData.fundingSourceLabel ?? global.fundingSourceLabel ?? "Funding Vehicle";

  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h3 className="text-lg font-display text-foreground flex items-center">
              Funding
              <InfoTooltip text="Capital raised to fund management company operations before fee revenue begins" manualSection="funding-financing" />
            </h3>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Label className="text-muted-foreground text-sm label-text whitespace-nowrap">Funding Source Name:</Label>
            <Input
              type="text"
              value={fundingLabel}
              onChange={(e) => onChange("fundingSourceLabel", e.target.value)}
              placeholder="e.g., Funding Vehicle, SAFE, Seed, Series A"
              className="max-w-48 bg-card border-border text-foreground"
              data-testid="input-funding-source-label"
            />
            <InfoTooltip text="Customize the name of your capital raise (e.g., Funding Vehicle, SAFE, Seed, Series A)" />
          </div>
          <p className="text-muted-foreground text-sm label-text">Capital raised via {fundingLabel} in two tranches to support management company operations</p>
        </div>
        <div className="space-y-4">
          <div className="p-4 bg-primary/10 rounded-lg space-y-4">
            <h4 className="text-sm font-display text-foreground">Capital Raise 1</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground label-text flex items-center gap-1">Amount<InfoTooltip text="Capital amount raised in the first tranche of the capital raise to cover initial operating expenses before management fee revenue begins." /></Label>
                <span data-field="capitalRaise1Amount">
                  <EditableValue
                    value={formData.capitalRaise1Amount ?? global.capitalRaise1Amount}
                    onChange={(v) => onChange("capitalRaise1Amount", v)}
                    format="dollar"
                    {...CAPITAL_RAISE_SLIDER}
                  />
                </span>
              </div>
              <Slider
                value={[formData.capitalRaise1Amount ?? global.capitalRaise1Amount]}
                onValueChange={([v]) => onChange("capitalRaise1Amount", v)}
                {...CAPITAL_RAISE_SLIDER}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground label-text flex items-center gap-1">Date<InfoTooltip text="Date when the first tranche of the capital raise is received and recorded on the balance sheet." /></Label>
              <Input
                type="date"
                value={formData.capitalRaise1Date ?? global.capitalRaise1Date}
                onChange={(e) => onChange("capitalRaise1Date", e.target.value)}
                className="max-w-40 bg-card border-border text-foreground"
                data-field="capitalRaise1Date"
                name="capitalRaise1Date"
              />
            </div>
          </div>
          <div className="p-4 bg-primary/10 rounded-lg space-y-4">
            <h4 className="text-sm font-display text-foreground">Capital Raise 2</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground label-text flex items-center gap-1">Amount<InfoTooltip text="Capital amount raised in the second tranche of the capital raise, typically deployed as the portfolio grows." /></Label>
                <span data-field="capitalRaise2Amount">
                  <EditableValue
                    value={formData.capitalRaise2Amount ?? global.capitalRaise2Amount}
                    onChange={(v) => onChange("capitalRaise2Amount", v)}
                    format="dollar"
                    {...CAPITAL_RAISE_SLIDER}
                  />
                </span>
              </div>
              <Slider
                value={[formData.capitalRaise2Amount ?? global.capitalRaise2Amount]}
                onValueChange={([v]) => onChange("capitalRaise2Amount", v)}
                {...CAPITAL_RAISE_SLIDER}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground label-text flex items-center gap-1">Date<InfoTooltip text="Date when the second tranche of the capital raise is received and recorded on the balance sheet." /></Label>
              <Input
                type="date"
                value={formData.capitalRaise2Date ?? global.capitalRaise2Date}
                onChange={(e) => onChange("capitalRaise2Date", e.target.value)}
                className="max-w-40 bg-card border-border text-foreground"
                data-field="capitalRaise2Date"
                name="capitalRaise2Date"
              />
            </div>
          </div>
        </div>
        <div className="mt-2 pt-4 border-t border-border">
          <Label className="text-muted-foreground text-sm label-text">Total {fundingLabel} Raise</Label>
          <p className="font-mono font-semibold text-lg text-foreground">
            {formatMoney((formData.capitalRaise1Amount ?? global.capitalRaise1Amount) + (formData.capitalRaise2Amount ?? global.capitalRaise2Amount))}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Card 2: Convertible Terms ─────────────────
   Optional terms (valuation cap, discount rate, interest rate) the user
   can toggle on or off. Each toggle is local UI state seeded from whether
   the underlying value is already non-zero. */
export function ConvertibleTermsCard({ formData, onChange, global }: FundingSectionProps) {
  const hasValuationCap = (formData.capitalRaiseValuationCap ?? global.capitalRaiseValuationCap) > 0;
  const hasDiscountRate = (formData.capitalRaiseDiscountRate ?? global.capitalRaiseDiscountRate) > 0;
  const hasInterestRate = (formData.fundingInterestRate ?? global.fundingInterestRate ?? 0) > 0;
  const [showValuationCap, setShowValuationCap] = useState(hasValuationCap);
  const [showDiscountRate, setShowDiscountRate] = useState(hasDiscountRate);
  const [showInterestRate, setShowInterestRate] = useState(hasInterestRate);

  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-display text-foreground flex items-center">
            Convertible Terms
            <InfoTooltip text="Optional terms that determine how the capital raise converts to equity in a future priced round. Toggle on only the terms your instrument carries." manualSection="funding-financing" />
          </h3>
          <p className="text-muted-foreground text-sm label-text mt-1">Toggle on the terms that apply to your instrument.</p>
        </div>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Valuation Cap
                <InfoTooltip text="Maximum company valuation at which the capital raise converts to equity. Enable this if your instrument includes a valuation cap (common for SAFEs and convertible notes)." manualSection="funding-financing" />
              </Label>
              <Switch
                checked={showValuationCap}
                onCheckedChange={(checked) => {
                  setShowValuationCap(checked);
                  if (!checked) {
                    onChange("capitalRaiseValuationCap", 0);
                  } else if ((formData.capitalRaiseValuationCap ?? global.capitalRaiseValuationCap) <= 0) {
                    onChange("capitalRaiseValuationCap", DEFAULT_CAPITAL_RAISE_VALUATION_CAP);
                  }
                }}
                data-testid="toggle-valuation-cap"
                // Auto-expand contract (task #787): if an Adjust click
                // deep-links to capitalRaiseValuationCap, the focus hook
                // will click this Switch on a missed lookup so the row
                // renders before the retry budget is exhausted. See
                // `EXPAND_TRIGGER_ATTR` in `analyst-focus-field.ts`.
                data-expand-trigger="capitalRaiseValuationCap"
              />
            </div>
            {showValuationCap && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cap Amount</span>
                  <EditableValue
                    value={formData.capitalRaiseValuationCap ?? global.capitalRaiseValuationCap}
                    onChange={(v) => onChange("capitalRaiseValuationCap", v)}
                    format="dollar"
                    min={100000}
                    max={5000000}
                    step={100000}
                  />
                </div>
                <Slider
                  value={[formData.capitalRaiseValuationCap ?? global.capitalRaiseValuationCap]}
                  onValueChange={([v]) => onChange("capitalRaiseValuationCap", v)}
                  min={100000}
                  max={5000000}
                  step={100000}
                />
              </>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Discount Rate
                <InfoTooltip text="Percentage discount on share price when the capital raise converts to equity. Enable this if your instrument includes a discount rate." manualSection="funding-financing" />
              </Label>
              <Switch
                checked={showDiscountRate}
                onCheckedChange={(checked) => {
                  setShowDiscountRate(checked);
                  if (!checked) {
                    onChange("capitalRaiseDiscountRate", 0);
                  } else if ((formData.capitalRaiseDiscountRate ?? global.capitalRaiseDiscountRate) <= 0) {
                    onChange("capitalRaiseDiscountRate", DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE);
                  }
                }}
                data-testid="toggle-discount-rate"
                data-expand-trigger="capitalRaiseDiscountRate"
              />
            </div>
            {showDiscountRate && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rate</span>
                  <EditableValue
                    value={formData.capitalRaiseDiscountRate ?? global.capitalRaiseDiscountRate}
                    onChange={(v) => onChange("capitalRaiseDiscountRate", v)}
                    format="percent"
                    min={0}
                    max={0.5}
                    step={0.05}
                  />
                </div>
                <Slider
                  value={[(formData.capitalRaiseDiscountRate ?? global.capitalRaiseDiscountRate) * 100]}
                  onValueChange={([v]) => onChange("capitalRaiseDiscountRate", v / 100)}
                  min={0}
                  max={50}
                  step={5}
                />
              </>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Interest Rate
                <InfoTooltip text="Annual simple interest rate on the outstanding capital raise principal. Common for convertible notes and interest-bearing SAFEs. Interest accrues monthly and flows through the income statement as Interest Expense." manualSection="funding-financing" />
              </Label>
              <Switch
                checked={showInterestRate}
                onCheckedChange={(checked) => {
                  setShowInterestRate(checked);
                  if (!checked) {
                    onChange("fundingInterestRate", 0);
                    onChange("fundingInterestPaymentFrequency", "accrues_only");
                  } else if ((formData.fundingInterestRate ?? global.fundingInterestRate ?? 0) <= 0) {
                    onChange("fundingInterestRate", DEFAULT_FUNDING_INTEREST_RATE);
                  }
                }}
                data-testid="toggle-interest-rate"
                // Two field ids (the rate + its payment-frequency dropdown)
                // share this single toggle, so the contract uses the
                // space-separated form to advertise both at once.
                data-expand-trigger="fundingInterestRate fundingInterestPaymentFrequency"
              />
            </div>
            {showInterestRate && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Annual Rate</span>
                  <EditableValue
                    value={formData.fundingInterestRate ?? global.fundingInterestRate ?? 0}
                    onChange={(v) => onChange("fundingInterestRate", v)}
                    format="percent"
                    min={0}
                    max={0.15}
                    step={0.005}
                  />
                </div>
                <Slider
                  value={[(formData.fundingInterestRate ?? global.fundingInterestRate ?? 0) * 100]}
                  onValueChange={([v]) => onChange("fundingInterestRate", v / 100)}
                  min={0}
                  max={15}
                  step={0.5}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    Payment Frequency
                    <InfoTooltip text="How often accrued interest is paid out. 'Accrues Only' means interest accumulates as a liability until conversion (standard for convertible notes). Quarterly or annually pays out the accrued interest, reducing cash." />
                  </span>
                  <Select
                    value={formData.fundingInterestPaymentFrequency ?? global.fundingInterestPaymentFrequency ?? "accrues_only"}
                    onValueChange={(v) => onChange("fundingInterestPaymentFrequency", v)}
                  >
                    <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-interest-payment-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accrues_only">Accrues Only</SelectItem>
                      <SelectItem value="quarterly">Paid Quarterly</SelectItem>
                      <SelectItem value="annually">Paid Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Card 3: Capital Stack Discipline ───────────────
   Funding-Specialist required-field cascade (G1.5b Packet B). Per
   .claude/rules/inflation-cascade.md these four values flow
   Constants → Defaults → Assumptions; this panel is the
   Assumption-tier surface. Values fall back to the global Default
   tier (`global.<field>`) and ultimately to the named DEFAULT_*
   constants if neither layer has a value, so the slider always
   renders a number. trancheGapMonths intentionally has no input —
   it is derived from the two capital-raise dates in Card 1 (see
   useCompanyAssumptionsForm). */
export function CapitalStackDisciplineCard({ formData, onChange, global }: FundingSectionProps) {
  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-display text-foreground flex items-center">
            Capital Stack Discipline
            <InfoTooltip text="Discipline metrics the Funding Specialist evaluates against live capital-raise benchmarks. Override here when your raise plan diverges from the company defaults; leave alone to inherit." manualSection="funding-financing" />
          </h3>
          <p className="text-muted-foreground text-xs label-text mt-1">Runway, sizing overshoot, revenue ramp, and burn flex-down used to size and stress-test the raise.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Runway Buffer
                <InfoTooltip text="Months of runway buffer past the company operations start date. Sized so the plan does not run dry the day revenue should arrive — the Specialist flags raises with less than this cushion." />
              </Label>
              <span data-field="runwayBufferMonths">
                <EditableValue
                  value={formData.runwayBufferMonths ?? global.runwayBufferMonths ?? DEFAULT_RUNWAY_BUFFER_MONTHS}
                  onChange={(v) => onChange("runwayBufferMonths", v)}
                  format="number"
                  min={3}
                  max={24}
                  step={1}
                />
              </span>
            </div>
            <Slider
              value={[formData.runwayBufferMonths ?? global.runwayBufferMonths ?? DEFAULT_RUNWAY_BUFFER_MONTHS]}
              onValueChange={([v]) => onChange("runwayBufferMonths", v)}
              min={3}
              max={24}
              step={1}
              data-testid="slider-runway-buffer-months"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Sizing Overshoot
                <InfoTooltip text="Headroom over the modeled cash need, expressed as a percent of the modeled raise. Covers slippage between plan and actual; the Specialist prefers raises sized at or above the mid-band." />
              </Label>
              <span data-field="sizingOvershootPct">
                <EditableValue
                  value={formData.sizingOvershootPct ?? global.sizingOvershootPct ?? DEFAULT_SIZING_OVERSHOOT_PCT}
                  onChange={(v) => onChange("sizingOvershootPct", v)}
                  format="percent"
                  min={0}
                  max={0.5}
                  step={0.01}
                />
              </span>
            </div>
            <Slider
              value={[(formData.sizingOvershootPct ?? global.sizingOvershootPct ?? DEFAULT_SIZING_OVERSHOOT_PCT) * 100]}
              onValueChange={([v]) => onChange("sizingOvershootPct", v / 100)}
              min={0}
              max={50}
              step={1}
              data-testid="slider-sizing-overshoot-pct"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Revenue Ramp Delay
                <InfoTooltip text="Months between operations start and the first material property revenue. Used to size the operating reserve and validate the gap between raise dates and revenue arrival." />
              </Label>
              <span data-field="revenueRampDelayMonths">
                <EditableValue
                  value={formData.revenueRampDelayMonths ?? global.revenueRampDelayMonths ?? DEFAULT_REVENUE_RAMP_DELAY_MONTHS}
                  onChange={(v) => onChange("revenueRampDelayMonths", v)}
                  format="number"
                  min={1}
                  max={18}
                  step={1}
                />
              </span>
            </div>
            <Slider
              value={[formData.revenueRampDelayMonths ?? global.revenueRampDelayMonths ?? DEFAULT_REVENUE_RAMP_DELAY_MONTHS]}
              onValueChange={([v]) => onChange("revenueRampDelayMonths", v)}
              min={1}
              max={18}
              step={1}
              data-testid="slider-revenue-ramp-delay-months"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Burn Flex-Down
                <InfoTooltip text="Discretionary headroom in the burn plan that can be cut without breaking operations, as a percent of plan burn. Quantifies how much the company can absorb before a covenant or runway tripwire fires." />
              </Label>
              <span data-field="burnFlexDownPct">
                <EditableValue
                  value={formData.burnFlexDownPct ?? global.burnFlexDownPct ?? DEFAULT_BURN_FLEX_DOWN_PCT}
                  onChange={(v) => onChange("burnFlexDownPct", v)}
                  format="percent"
                  min={0}
                  max={0.5}
                  step={0.01}
                />
              </span>
            </div>
            <Slider
              value={[(formData.burnFlexDownPct ?? global.burnFlexDownPct ?? DEFAULT_BURN_FLEX_DOWN_PCT) * 100]}
              onValueChange={([v]) => onChange("burnFlexDownPct", v / 100)}
              min={0}
              max={50}
              step={1}
              data-testid="slider-burn-flex-down-pct"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Default export keeps backward compatibility for any caller that wants
// all three cards rendered in source order. The Funding tab in
// CompanyAssumptionsTabsView composes the named exports directly so it
// can interleave Cost of Capital between them.
export default function FundingSection(props: FundingSectionProps) {
  return (
    <>
      <CapitalRaisesCard {...props} />
      <ConvertibleTermsCard {...props} />
      <CapitalStackDisciplineCard {...props} />
    </>
  );
}
