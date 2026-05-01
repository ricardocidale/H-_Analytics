import { useState } from "react";
import { Info } from "lucide-react";
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

/* SegmentedPercent — replaces the Slider for Discount Rate. The 0–50%
   range is in 5% steps, but real instruments cluster at 5/10/15/20/25.
   Preset buttons let users pick a market-standard discount in one click,
   with the current selection visually anchored. Below-grid values still
   work via the keyboard arrows on each button. */
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
            className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
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

const CAPITAL_RAISE = { min: 100_000, max: 1_500_000, step: 25_000 } as const;

/* Capital Raises — tranches arranged SIDE-BY-SIDE inside a single card.
   When the card occupies a wider column at the top of the page, the two
   tranches read as a comparable pair instead of a vertical timeline. */
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

        {/* Tranches side-by-side — original tranche-block chrome preserved */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="flex items-center justify-between flex-wrap gap-2">
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

/* Convertible Terms — full-width row with the three optional terms
   arranged SIDE-BY-SIDE in a 3-col inner grid. Each toggle anchors its
   own column; the slider/control reveals beneath the toggle when active. */
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Valuation Cap */}
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

          {/* Discount Rate — segmented preset buttons for SAFE/CN-standard rates */}
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
                <SegmentedPercent
                  value={discount}
                  onChange={setDiscount}
                  options={[5, 10, 15, 20, 25, 30]}
                />
              </>
            )}
          </div>

          {/* Interest Rate */}
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
                <div className="flex items-center justify-between mt-2 gap-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    Frequency<InfoIcon />
                  </span>
                  <Select value={freq} onValueChange={setFreq}>
                    <SelectTrigger className="w-36 h-8 text-xs">
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

/* Discipline — full-width row, 4 metrics in a 4-col grid. */
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
          {[
            {
              label: "Runway Buffer",
              value: runway,
              setValue: setRunway,
              min: 3,
              max: 24,
              step: 1,
              format: (v: number) => `${v} mo`,
              sliderMin: 3,
              sliderMax: 24,
            },
            {
              label: "Sizing Overshoot",
              value: overshoot,
              setValue: setOvershoot,
              min: 0,
              max: 0.5,
              step: 0.01,
              format: fmtPercent,
              sliderMin: 0,
              sliderMax: 50,
              isPercent: true,
            },
            {
              label: "Revenue Ramp Delay",
              value: ramp,
              setValue: setRamp,
              min: 1,
              max: 18,
              step: 1,
              format: (v: number) => `${v} mo`,
              sliderMin: 1,
              sliderMax: 18,
            },
            {
              label: "Burn Flex-Down",
              value: burnFlex,
              setValue: setBurnFlex,
              min: 0,
              max: 0.5,
              step: 0.01,
              format: fmtPercent,
              sliderMin: 0,
              sliderMax: 50,
              isPercent: true,
            },
          ].map((m) => (
            <div key={m.label} className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center text-foreground label-text">
                  {m.label}<InfoIcon />
                </Label>
                <ValueSpan>{m.format(m.value)}</ValueSpan>
              </div>
              <Slider
                value={[m.isPercent ? m.value * 100 : m.value]}
                onValueChange={([v]) => m.setValue(m.isPercent ? v / 100 : v)}
                min={m.sliderMin}
                max={m.sliderMax}
                step={m.isPercent ? 1 : 1}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EditorialPolish() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6">
          <h2 className="font-display text-2xl text-foreground">Funding</h2>
          <p className="label-text text-muted-foreground mt-1">
            Capital raises, convertible terms, cost of capital, and capital-stack discipline.
          </p>
        </header>

        {/* Row 1: 12-col grid — Capital Raises (8/12, side-by-side tranches) | Cost of Capital (4/12) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <CapitalRaisesCard />
          </div>
          <div className="lg:col-span-4">
            <CostOfCapitalCard />
          </div>
        </div>

        {/* Row 2: full-width Convertible Terms — three toggles side-by-side */}
        <div className="mt-6">
          <ConvertibleTermsCard />
        </div>

        {/* Row 3: full-width Discipline — 4-col dashboard */}
        <div className="mt-6">
          <CapitalStackDisciplineCard />
        </div>
      </div>
    </div>
  );
}

export default EditorialPolish;
