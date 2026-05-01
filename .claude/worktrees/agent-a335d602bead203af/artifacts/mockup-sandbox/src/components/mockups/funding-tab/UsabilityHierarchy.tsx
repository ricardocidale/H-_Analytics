import { useState } from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import "./_group.css";

/* U1 — Hierarchy
   Tradeoff: NOT every card gets equal attention. The page declares a
   primary answer (Total Raise) and a primary cost (Cost of Equity) up
   top in hero numerals, then subordinates instrument terms and
   discipline as supporting strips. Trades equal real-estate for one-
   glance scannability. */

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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 font-mono mb-3">
      {children}
    </div>
  );
}

function HeroNumber({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right shrink-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground label-text">
        {label}
      </div>
      <div className="font-mono text-3xl font-semibold text-foreground tabular-nums mt-1">
        {value}
      </div>
    </div>
  );
}

const CAPITAL_RAISE = { min: 100_000, max: 1_500_000, step: 25_000 } as const;

function CapitalRaisesHero() {
  const [fundingLabel, setFundingLabel] = useState("Series Seed");
  const [cr1Amount, setCr1Amount] = useState(750_000);
  const [cr1Date, setCr1Date] = useState("2026-04-01");
  const [cr2Amount, setCr2Amount] = useState(500_000);
  const [cr2Date, setCr2Date] = useState("2026-10-01");
  const total = cr1Amount + cr2Amount;

  return (
    <div className={CARD_CLASSES}>
      <div className="flex items-start justify-between gap-6 mb-6">
        <div className="min-w-0">
          <h3 className="text-xl font-display text-foreground flex items-center">
            Funding<InfoIcon />
          </h3>
          <div className="flex items-center gap-3 mt-3">
            <Label className="text-muted-foreground text-sm label-text whitespace-nowrap">
              Source:
            </Label>
            <Input
              type="text"
              value={fundingLabel}
              onChange={(e) => setFundingLabel(e.target.value)}
              className="max-w-44 bg-card border-border text-foreground"
            />
          </div>
        </div>
        <HeroNumber label={`Total ${fundingLabel}`} value={fmtMoney(total)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { n: 1, amount: cr1Amount, setAmount: setCr1Amount, date: cr1Date, setDate: setCr1Date },
          { n: 2, amount: cr2Amount, setAmount: setCr2Amount, date: cr2Date, setDate: setCr2Date },
        ].map(({ n, amount, setAmount, date, setDate }) => (
          <div key={n} className="p-4 bg-primary/10 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-display text-foreground">Capital Raise {n}</h4>
              <ValueSpan>{fmtMoney(amount)}</ValueSpan>
            </div>
            <Slider
              value={[amount]}
              onValueChange={([v]) => setAmount(v)}
              {...CAPITAL_RAISE}
            />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-40 bg-card border-border text-foreground"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CostOfCapitalHero() {
  const [coe, setCoe] = useState(0.18);
  return (
    <div className={CARD_CLASSES}>
      <div className="flex items-start justify-between gap-6 mb-4">
        <div>
          <h3 className="text-xl font-display text-foreground flex items-center">
            Cost of Capital<InfoIcon />
          </h3>
          <div className="text-[11px] text-muted-foreground/80 font-mono mt-2 uppercase tracking-wider">
            STR benchmark · 17.5%
          </div>
        </div>
        <HeroNumber label="Cost of Equity" value={fmtPercent(coe)} />
      </div>
      <Slider
        value={[coe * 100]}
        onValueChange={([v]) => setCoe(v / 100)}
        min={5}
        max={40}
        step={0.5}
      />
    </div>
  );
}

function ConvertibleTermsCompact() {
  const [showCap, setShowCap] = useState(true);
  const [cap, setCap] = useState(5_000_000);
  const [showDiscount, setShowDiscount] = useState(true);
  const [discount, setDiscount] = useState(0.2);
  const [showInterest, setShowInterest] = useState(false);
  const [interest, setInterest] = useState(0.08);

  return (
    <div className={CARD_CLASSES}>
      <h3 className="text-base font-display text-foreground flex items-center mb-4">
        Convertible Terms<InfoIcon />
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="label-text text-muted-foreground">Valuation Cap</Label>
            <Switch checked={showCap} onCheckedChange={setShowCap} />
          </div>
          {showCap && (
            <>
              <ValueSpan>{fmtMoney(cap)}</ValueSpan>
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="label-text text-muted-foreground">Discount Rate</Label>
            <Switch checked={showDiscount} onCheckedChange={setShowDiscount} />
          </div>
          {showDiscount && (
            <>
              <ValueSpan>{fmtPercent(discount)}</ValueSpan>
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="label-text text-muted-foreground">Interest Rate</Label>
            <Switch checked={showInterest} onCheckedChange={setShowInterest} />
          </div>
          {showInterest && (
            <>
              <ValueSpan>{fmtPercent(interest)}</ValueSpan>
              <Slider
                value={[interest * 100]}
                onValueChange={([v]) => setInterest(v / 100)}
                min={0}
                max={15}
                step={0.5}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DisciplineStrip() {
  const [runway, setRunway] = useState(12);
  const [overshoot, setOvershoot] = useState(0.15);
  const [ramp, setRamp] = useState(6);
  const [burnFlex, setBurnFlex] = useState(0.2);

  return (
    <div className={CARD_CLASSES}>
      <h3 className="text-base font-display text-foreground flex items-center mb-4">
        Capital Stack Discipline<InfoIcon />
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { l: "Runway Buffer", v: runway, set: setRunway, min: 3, max: 24, step: 1, fmt: (x: number) => `${x} mo`, isPct: false },
          { l: "Sizing Overshoot", v: overshoot, set: setOvershoot, min: 0, max: 50, step: 1, fmt: fmtPercent, isPct: true },
          { l: "Revenue Ramp Delay", v: ramp, set: setRamp, min: 1, max: 18, step: 1, fmt: (x: number) => `${x} mo`, isPct: false },
          { l: "Burn Flex-Down", v: burnFlex, set: setBurnFlex, min: 0, max: 50, step: 1, fmt: fmtPercent, isPct: true },
        ].map((m) => (
          <div key={m.l} className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <Label className="text-muted-foreground label-text">{m.l}</Label>
              <ValueSpan>{m.fmt(m.v)}</ValueSpan>
            </div>
            <Slider
              value={[m.isPct ? m.v * 100 : m.v]}
              onValueChange={([x]) => m.set(m.isPct ? x / 100 : x)}
              min={m.min}
              max={m.max}
              step={m.step}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function UsabilityHierarchy() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-8">
          <Eyebrow>U1 · Hierarchy</Eyebrow>
          <h2 className="font-display text-2xl text-foreground">Funding</h2>
          <p className="label-text text-muted-foreground mt-1">
            Hero numbers anchor the page; supporting controls subordinate. The Total Raise and Cost of Equity are the page&apos;s primary answers — everything else recedes.
          </p>
        </header>

        <Eyebrow>Capital</Eyebrow>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
          <div className="lg:col-span-8">
            <CapitalRaisesHero />
          </div>
          <div className="lg:col-span-4">
            <CostOfCapitalHero />
          </div>
        </div>

        <Eyebrow>Instrument Terms</Eyebrow>
        <div className="mb-8">
          <ConvertibleTermsCompact />
        </div>

        <Eyebrow>Discipline</Eyebrow>
        <DisciplineStrip />
      </div>
    </div>
  );
}

export default UsabilityHierarchy;
