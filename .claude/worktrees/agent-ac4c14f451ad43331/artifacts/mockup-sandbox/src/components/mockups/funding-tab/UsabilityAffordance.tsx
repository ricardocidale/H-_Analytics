import { useState } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./_group.css";

/* U2 — Affordance
   Tradeoff: NO bare sliders. Every control is an explicit, visible
   widget — numeric inputs flanked by +/- steppers, OFF/ON segmented
   toggles, segmented preset buttons. Trades visual elegance and
   vertical compactness for instant clarity about what's interactive
   and how to operate it. Sliders hide their step granularity; explicit
   widgets show it. */

const CARD_CLASSES =
  "relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPercent = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n);

function InfoIcon() {
  return <Info className="ml-1.5 h-3.5 w-3.5 text-muted-foreground/70 inline-block" />;
}

/* NumericStepper — explicit "click to change" affordance.
   [-] [input] [+]. The input is editable so power users can type. */
function NumericStepper({
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  width = "w-32",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  width?: string;
}) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(4)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(4)));
  return (
    <div className={`inline-flex items-stretch border border-border rounded-md overflow-hidden bg-card ${width}`}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className="w-9 grid place-items-center text-muted-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed border-r border-border shrink-0"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 flex items-center justify-center px-1 font-mono text-sm tabular-nums text-foreground">
        {prefix}
        {Number.isInteger(step) ? value : value.toFixed(2)}
        {suffix ? ` ${suffix}` : ""}
      </div>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        className="w-9 grid place-items-center text-muted-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed border-l border-border shrink-0"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* OnOffToggle — replaces the Switch. Two labelled buttons make state
   redundant by both color AND text, and a much larger hit target. */
function OnOffToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
          !on ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/40"
        }`}
      >
        Off
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
          on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"
        }`}
      >
        On
      </button>
    </div>
  );
}

/* SegmentedPercent — preset rate picker, consistent with Editorial Polish */
function SegmentedPercent({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (v: number) => void;
  options: number[];
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5 gap-0.5">
      {options.map((opt) => {
        const active = Math.abs(value - opt / 100) < 0.001;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt / 100)}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            {opt}%
          </button>
        );
      })}
    </div>
  );
}

function CapitalRaisesCard() {
  const [fundingLabel, setFundingLabel] = useState("Series Seed");
  const [cr1Amount, setCr1Amount] = useState(750_000);
  const [cr1Date, setCr1Date] = useState("2026-04-01");
  const [cr2Amount, setCr2Amount] = useState(500_000);
  const [cr2Date, setCr2Date] = useState("2026-10-01");
  const total = cr1Amount + cr2Amount;

  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-display text-foreground flex items-center mb-2">
            Funding<InfoIcon />
          </h3>
          <div className="flex items-center gap-3 mb-3">
            <Label className="text-muted-foreground text-sm label-text whitespace-nowrap">
              Funding Source Name:
            </Label>
            <Input
              type="text"
              value={fundingLabel}
              onChange={(e) => setFundingLabel(e.target.value)}
              className="max-w-48 bg-card border-border text-foreground"
            />
            <InfoIcon />
          </div>
          <p className="text-muted-foreground text-sm label-text">
            Capital raised via {fundingLabel} in two tranches to support management company operations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { n: 1, amount: cr1Amount, setAmount: setCr1Amount, date: cr1Date, setDate: setCr1Date },
            { n: 2, amount: cr2Amount, setAmount: setCr2Amount, date: cr2Date, setDate: setCr2Date },
          ].map(({ n, amount, setAmount, date, setDate }) => (
            <div key={n} className="p-4 bg-primary/10 rounded-lg space-y-4">
              <h4 className="text-sm font-display text-foreground">Capital Raise {n}</h4>
              <div className="space-y-2">
                <Label className="text-foreground label-text flex items-center gap-1">
                  Amount<InfoIcon />
                </Label>
                <NumericStepper
                  value={amount}
                  onChange={setAmount}
                  min={100_000}
                  max={1_500_000}
                  step={25_000}
                  prefix="$"
                  width="w-44"
                />
                <div className="text-[11px] text-muted-foreground/80 font-mono">
                  $25k step · range $100k–$1.5M
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground label-text flex items-center gap-1">
                  Date<InfoIcon />
                </Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="max-w-40 bg-card border-border text-foreground"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 pt-4 border-t border-border">
          <Label className="text-muted-foreground text-sm label-text">
            Total {fundingLabel} Raise
          </Label>
          <p className="font-mono font-semibold text-lg text-foreground">{fmtMoney(total)}</p>
        </div>
      </div>
    </div>
  );
}

function CostOfCapitalCard() {
  const [coe, setCoe] = useState(0.18);
  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-4">
        <h3 className="text-lg font-display text-foreground flex items-center gap-2">
          Cost of Capital<InfoIcon />
        </h3>
        <div className="space-y-2">
          <Label className="text-foreground label-text flex items-center gap-2">
            Cost of Equity<InfoIcon />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-mono">
              STR · 17.5%
            </span>
          </Label>
          <NumericStepper
            value={+(coe * 100).toFixed(1)}
            onChange={(v) => setCoe(v / 100)}
            min={5}
            max={40}
            step={0.5}
            suffix="%"
            width="w-36"
          />
          <button
            type="button"
            onClick={() => setCoe(0.175)}
            className="text-[11px] font-mono uppercase tracking-wider text-primary hover:underline"
          >
            ↺ Reset to STR benchmark
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvertibleTermsCard() {
  const [showCap, setShowCap] = useState(true);
  const [cap, setCap] = useState(5_000_000);
  const [showDiscount, setShowDiscount] = useState(true);
  const [discount, setDiscount] = useState(0.2);
  const [showInterest, setShowInterest] = useState(false);
  const [interest, setInterest] = useState(0.08);
  const [freq, setFreq] = useState("accrues_only");

  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-display text-foreground flex items-center">
            Convertible Terms<InfoIcon />
          </h3>
          <p className="text-muted-foreground text-sm label-text mt-1">
            Toggle on the terms that apply to your instrument.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center text-foreground label-text">
                Valuation Cap<InfoIcon />
              </Label>
              <OnOffToggle on={showCap} onChange={setShowCap} />
            </div>
            {showCap && (
              <>
                <Label className="text-xs text-muted-foreground">Cap Amount</Label>
                <NumericStepper
                  value={cap}
                  onChange={setCap}
                  min={100_000}
                  max={5_000_000}
                  step={100_000}
                  prefix="$"
                  width="w-44"
                />
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center text-foreground label-text">
                Discount Rate<InfoIcon />
              </Label>
              <OnOffToggle on={showDiscount} onChange={setShowDiscount} />
            </div>
            {showDiscount && (
              <>
                <Label className="text-xs text-muted-foreground">Rate</Label>
                <SegmentedPercent
                  value={discount}
                  onChange={setDiscount}
                  options={[5, 10, 15, 20, 25, 30]}
                />
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center text-foreground label-text">
                Interest Rate<InfoIcon />
              </Label>
              <OnOffToggle on={showInterest} onChange={setShowInterest} />
            </div>
            {showInterest && (
              <>
                <Label className="text-xs text-muted-foreground">Annual Rate</Label>
                <NumericStepper
                  value={+(interest * 100).toFixed(1)}
                  onChange={(v) => setInterest(v / 100)}
                  min={0}
                  max={15}
                  step={0.5}
                  suffix="%"
                  width="w-32"
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    Frequency<InfoIcon />
                  </Label>
                  <Select value={freq} onValueChange={setFreq}>
                    <SelectTrigger className="w-44 h-9 text-xs">
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

function DisciplineCard() {
  const [runway, setRunway] = useState(12);
  const [overshoot, setOvershoot] = useState(0.15);
  const [ramp, setRamp] = useState(6);
  const [burnFlex, setBurnFlex] = useState(0.2);

  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-display text-foreground flex items-center">
            Capital Stack Discipline<InfoIcon />
          </h3>
          <p className="text-muted-foreground text-xs label-text mt-1">
            Runway, sizing overshoot, revenue ramp, and burn flex-down used to size and stress-test the raise.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Label className="flex items-center text-foreground label-text">
              Runway Buffer<InfoIcon />
            </Label>
            <NumericStepper value={runway} onChange={setRunway} min={3} max={24} step={1} suffix="mo" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center text-foreground label-text">
              Sizing Overshoot<InfoIcon />
            </Label>
            <NumericStepper
              value={+(overshoot * 100).toFixed(0)}
              onChange={(v) => setOvershoot(v / 100)}
              min={0}
              max={50}
              step={1}
              suffix="%"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center text-foreground label-text">
              Revenue Ramp Delay<InfoIcon />
            </Label>
            <NumericStepper value={ramp} onChange={setRamp} min={1} max={18} step={1} suffix="mo" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center text-foreground label-text">
              Burn Flex-Down<InfoIcon />
            </Label>
            <NumericStepper
              value={+(burnFlex * 100).toFixed(0)}
              onChange={(v) => setBurnFlex(v / 100)}
              min={0}
              max={50}
              step={1}
              suffix="%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function UsabilityAffordance() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 font-mono mb-1">
            U2 · Affordance
          </div>
          <h2 className="font-display text-2xl text-foreground">Funding</h2>
          <p className="label-text text-muted-foreground mt-1">
            Every value has a visible widget — steppers, segmented presets, off/on buttons. No mystery sliders. The page is louder; the controls are unmistakable.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <CapitalRaisesCard />
          </div>
          <div className="lg:col-span-4">
            <CostOfCapitalCard />
          </div>
        </div>

        <div className="mt-6">
          <ConvertibleTermsCard />
        </div>

        <div className="mt-6">
          <DisciplineCard />
        </div>
      </div>
    </div>
  );
}

export default UsabilityAffordance;
