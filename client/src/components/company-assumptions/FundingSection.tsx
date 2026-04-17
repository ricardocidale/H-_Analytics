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
import EditableValue from "./EditableValue";
import type { FundingSectionProps } from "./types";

export default function FundingSection({ formData, onChange, global }: FundingSectionProps) {
  const fundingLabel = formData.fundingSourceLabel ?? global.fundingSourceLabel ?? "Funding Vehicle";

  const hasValuationCap = (formData.capitalRaiseValuationCap ?? global.capitalRaiseValuationCap) > 0;
  const hasDiscountRate = (formData.capitalRaiseDiscountRate ?? global.capitalRaiseDiscountRate) > 0;
  const hasInterestRate = (formData.fundingInterestRate ?? global.fundingInterestRate ?? 0) > 0;
  const [showValuationCap, setShowValuationCap] = useState(hasValuationCap);
  const [showDiscountRate, setShowDiscountRate] = useState(hasDiscountRate);
  const [showInterestRate, setShowInterestRate] = useState(hasInterestRate);

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="p-4 bg-primary/10 rounded-lg space-y-4">
            <h4 className="text-sm font-display text-foreground">Capital Raise 1</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground label-text flex items-center gap-1">Amount<InfoTooltip text="Capital amount raised in the first tranche of the capital raise to cover initial operating expenses before management fee revenue begins." /></Label>
                <EditableValue
                  value={formData.capitalRaise1Amount ?? global.capitalRaise1Amount}
                  onChange={(v) => onChange("capitalRaise1Amount", v)}
                  format="dollar"
                  min={100000}
                  max={1500000}
                  step={25000}
                />
              </div>
              <Slider
                value={[formData.capitalRaise1Amount ?? global.capitalRaise1Amount]}
                onValueChange={([v]) => onChange("capitalRaise1Amount", v)}
                min={100000}
                max={1500000}
                step={25000}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground label-text flex items-center gap-1">Date<InfoTooltip text="Date when the first tranche of the capital raise is received and recorded on the balance sheet." /></Label>
              <Input
                type="date"
                value={formData.capitalRaise1Date ?? global.capitalRaise1Date}
                onChange={(e) => onChange("capitalRaise1Date", e.target.value)}
                className="max-w-40 bg-card border-border text-foreground"
              />
            </div>
          </div>
          <div className="p-4 bg-primary/10 rounded-lg space-y-4">
            <h4 className="text-sm font-display text-foreground">Capital Raise 2</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground label-text flex items-center gap-1">Amount<InfoTooltip text="Capital amount raised in the second tranche of the capital raise, typically deployed as the portfolio grows." /></Label>
                <EditableValue
                  value={formData.capitalRaise2Amount ?? global.capitalRaise2Amount}
                  onChange={(v) => onChange("capitalRaise2Amount", v)}
                  format="dollar"
                  min={100000}
                  max={1500000}
                  step={25000}
                />
              </div>
              <Slider
                value={[formData.capitalRaise2Amount ?? global.capitalRaise2Amount]}
                onValueChange={([v]) => onChange("capitalRaise2Amount", v)}
                min={100000}
                max={1500000}
                step={25000}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground label-text flex items-center gap-1">Date<InfoTooltip text="Date when the second tranche of the capital raise is received and recorded on the balance sheet." /></Label>
              <Input
                type="date"
                value={formData.capitalRaise2Date ?? global.capitalRaise2Date}
                onChange={(e) => onChange("capitalRaise2Date", e.target.value)}
                className="max-w-40 bg-card border-border text-foreground"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label className="text-muted-foreground text-sm label-text">Total {fundingLabel} Raise</Label>
              <p className="font-mono font-semibold text-lg text-foreground">
                {formatMoney((formData.capitalRaise1Amount ?? global.capitalRaise1Amount) + (formData.capitalRaise2Amount ?? global.capitalRaise2Amount))}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
    </div>
    </div>
  );
}
