import { useState } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./_group.css";

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

function ValueSpan({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-sm tabular-nums text-foreground bg-muted/40 border border-border rounded px-2 py-0.5">
      {children}
    </span>
  );
}

/* Stepper — replaces Slider for small integer ranges where discrete
   button clicks read more naturally than dragging a thumb. */
function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <div className="inline-flex items-center gap-0 border border-border rounded-md overflow-hidden bg-card">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className="h-8 w-8 grid place-items-center text-muted-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed border-r border-border"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="font-mono text-sm tabular-nums text-foreground min-w-[64px] text-center px-2">
        {value}
        {suffix ? ` ${suffix}` : ""}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        className="h-8 w-8 grid place-items-center text-muted-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed border-l border-border"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const CAPITAL_RAISE = { min: 100_000, max: 1_500_000, step: 25_000 } as const;

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
            Funding
            <InfoIcon />
          </h3>
          <div className="flex items-center gap-3 mb-3">
            <Label className="text-muted-foreground text-sm label-text whitespace-nowrap">
              Funding Source Name:
            </Label>
            <Input
              type="text"
              value={fundingLabel}
              onChange={(e) => setFundingLabel(e.target.value)}
              placeholder="e.g., SAFE, Seed, Series A"
              className="max-w-48 bg-card border-border text-foreground"
            />
            <InfoIcon />
          </div>
          <p className="text-muted-foreground text-sm label-text">
            Capital raised via {fundingLabel} in two tranches to support management company operations
          </p>
        </div>

        <div className="space-y-4">
          {[
            { n: 1, amount: cr1Amount, setAmount: setCr1Amount, date: cr1Date, setDate: setCr1Date },
            { n: 2, amount: cr2Amount, setAmount: setCr2Amount, date: cr2Date, setDate: setCr2Date },
          ].map(({ n, amount, setAmount, date, setDate }) => (
            <div key={n} className="p-4 bg-primary/10 rounded-lg space-y-4">
              <h4 className="text-sm font-display text-foreground">Capital Raise {n}</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground label-text flex items-center gap-1">
                    Amount<InfoIcon />
                  </Label>
                  <ValueSpan>{fmtMoney(amount)}</ValueSpan>
                </div>
                <Slider
                  value={[amount]}
                  onValueChange={([v]) => setAmount(v)}
                  {...CAPITAL_RAISE}
                />
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
          Cost of Capital
          <InfoIcon />
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground label-text flex items-center gap-2">
              Cost of Equity
              <InfoIcon />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-mono">
                STR · 17.5%
              </span>
            </Label>
            <ValueSpan>{fmtPercent(coe)}</ValueSpan>
          </div>
          <Slider
            value={[coe * 100]}
            onValueChange={([v]) => setCoe(v / 100)}
            min={5}
            max={40}
            step={0.5}
          />
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
            Convertible Terms
            <InfoIcon />
          </h3>
          <p className="text-muted-foreground text-sm label-text mt-1">
            Toggle on the terms that apply to your instrument.
          </p>
        </div>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Valuation Cap<InfoIcon />
              </Label>
              <Switch checked={showCap} onCheckedChange={setShowCap} />
            </div>
            {showCap && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cap Amount</span>
                  <ValueSpan>{fmtMoney(cap)}</ValueSpan>
                </div>
                <Slider
                  value={[cap]}
                  onValueChange={([v]) => setCap(v)}
                  min={100_000}
                  max={5_000_000}
                  step={100_000}
                />
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Discount Rate<InfoIcon />
              </Label>
              <Switch checked={showDiscount} onCheckedChange={setShowDiscount} />
            </div>
            {showDiscount && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rate</span>
                  <ValueSpan>{fmtPercent(discount)}</ValueSpan>
                </div>
                <Slider
                  value={[discount * 100]}
                  onValueChange={([v]) => setDiscount(v / 100)}
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
                Interest Rate<InfoIcon />
              </Label>
              <Switch checked={showInterest} onCheckedChange={setShowInterest} />
            </div>
            {showInterest && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Annual Rate</span>
                  <ValueSpan>{fmtPercent(interest)}</ValueSpan>
                </div>
                <Slider
                  value={[interest * 100]}
                  onValueChange={([v]) => setInterest(v / 100)}
                  min={0}
                  max={15}
                  step={0.5}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    Payment Frequency<InfoIcon />
                  </span>
                  <Select value={freq} onValueChange={setFreq}>
                    <SelectTrigger className="w-40 h-8 text-xs">
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

/* Discipline — full-width 4-col footer row.
   The 4 metrics naturally read as a dashboard strip when given full
   width instead of a cramped 2x2 inside a half-column.
   Integer-month metrics (Runway, Ramp Delay) use a stepper instead of
   a slider — discrete clicks read better for small integer ranges. */
function CapitalStackDisciplineCard() {
  const [runway, setRunway] = useState(12);
  const [overshoot, setOvershoot] = useState(0.15);
  const [ramp, setRamp] = useState(6);
  const [burnFlex, setBurnFlex] = useState(0.2);

  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-display text-foreground flex items-center">
            Capital Stack Discipline
            <InfoIcon />
          </h3>
          <p className="text-muted-foreground text-xs label-text mt-1">
            Runway, sizing overshoot, revenue ramp, and burn flex-down used to size and stress-test the raise.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-3">
            <Label className="flex items-center text-foreground label-text">
              Runway Buffer<InfoIcon />
            </Label>
            <Stepper
              value={runway}
              onChange={setRunway}
              min={3}
              max={24}
              suffix="mo"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Sizing Overshoot<InfoIcon />
              </Label>
              <ValueSpan>{fmtPercent(overshoot)}</ValueSpan>
            </div>
            <Slider
              value={[overshoot * 100]}
              onValueChange={([v]) => setOvershoot(v / 100)}
              min={0}
              max={50}
              step={1}
            />
          </div>
          <div className="space-y-3">
            <Label className="flex items-center text-foreground label-text">
              Revenue Ramp Delay<InfoIcon />
            </Label>
            <Stepper
              value={ramp}
              onChange={setRamp}
              min={1}
              max={18}
              suffix="mo"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-foreground label-text">
                Burn Flex-Down<InfoIcon />
              </Label>
              <ValueSpan>{fmtPercent(burnFlex)}</ValueSpan>
            </div>
            <Slider
              value={[burnFlex * 100]}
              onValueChange={([v]) => setBurnFlex(v / 100)}
              min={0}
              max={50}
              step={1}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RefinedDensity() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-6">
          <h2 className="font-display text-2xl text-foreground">Funding</h2>
          <p className="label-text text-muted-foreground mt-1">
            Capital raises, convertible terms, cost of capital, and capital-stack discipline.
          </p>
        </header>

        {/* Top: 2-col grid (Capital Raises | Cost of Capital + Convertible Terms) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CapitalRaisesCard />
          <div className="space-y-6">
            <CostOfCapitalCard />
            <ConvertibleTermsCard />
          </div>
        </div>

        {/* Bottom: full-width Discipline row, contents render as a 4-col dashboard */}
        <div className="mt-6">
          <CapitalStackDisciplineCard />
        </div>
      </div>
    </div>
  );
}

export default RefinedDensity;
