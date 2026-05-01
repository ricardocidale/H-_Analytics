import { useState } from "react";
import { Info, Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./_group.css";

/* U3 — Accessibility & Readability
   Tradeoff: bigger type, stronger label contrast, larger hit targets,
   visible help text instead of icon-only tooltips, redundant
   on/off labels (icon + word), strong focus rings. Trades information
   density for one-shot clarity for low-vision users, keyboard users,
   and anyone in a hurry. Fewer cards visible per screen, but every
   element is unambiguous. */

const CARD_CLASSES =
  "relative overflow-hidden rounded-lg p-7 bg-card border border-border shadow-sm";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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

/* ValuePill — higher-contrast badge: solid muted bg, full-foreground
   text, slightly larger so the number is the second-most-prominent
   thing after the field label. */
function ValuePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-base tabular-nums text-foreground bg-muted border-2 border-border rounded px-3 py-1 font-semibold">
      {children}
    </span>
  );
}

/* StrongLabel — full foreground color, semibold, base size. No
   muted-foreground for any input label on this surface. */
function StrongLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-foreground font-semibold text-base"
    >
      {children}
    </Label>
  );
}

/* HelpText — replaces icon-only tooltips with always-visible help text
   beneath each label. Screen readers no longer have to discover an
   icon to find the explanation. */
function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground leading-snug">{children}</p>
  );
}

/* AccessibleToggle — checkbox-like toggle with redundant icon + word.
   State is signaled by THREE channels (color, icon, text) so it works
   under colorblindness and magnification. Hit target is 44px tall. */
function AccessibleToggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={`${label}: ${on ? "On" : "Off"}`}
      className={`inline-flex items-center gap-2 px-4 h-11 rounded-md border-2 text-sm font-semibold transition-colors ${FOCUS_RING} ${
        on
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border hover:bg-muted/40"
      }`}
    >
      {on ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      <span>{on ? "On" : "Off"}</span>
    </button>
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
      <div className="space-y-7">
        <div>
          <h3 className="text-xl font-display text-foreground">Funding</h3>
          <HelpText>
            Capital raised in two tranches to support management company operations.
          </HelpText>
        </div>

        <div className="space-y-2">
          <StrongLabel htmlFor="funding-source">Funding source name</StrongLabel>
          <Input
            id="funding-source"
            type="text"
            value={fundingLabel}
            onChange={(e) => setFundingLabel(e.target.value)}
            className={`max-w-64 h-11 bg-card border-2 border-border text-foreground text-base ${FOCUS_RING}`}
          />
          <HelpText>
            E.g. SAFE, Seed, Series A. This label is reused across the rest of the page and exports.
          </HelpText>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            { n: 1, amount: cr1Amount, setAmount: setCr1Amount, date: cr1Date, setDate: setCr1Date },
            { n: 2, amount: cr2Amount, setAmount: setCr2Amount, date: cr2Date, setDate: setCr2Date },
          ].map(({ n, amount, setAmount, date, setDate }) => (
            <div key={n} className="p-5 bg-primary/10 rounded-lg space-y-5">
              <h4 className="text-base font-display text-foreground font-semibold">
                Capital Raise {n}
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <StrongLabel>Amount</StrongLabel>
                  <ValuePill>{fmtMoney(amount)}</ValuePill>
                </div>
                <Slider
                  value={[amount]}
                  onValueChange={([v]) => setAmount(v)}
                  {...CAPITAL_RAISE}
                  aria-label={`Capital Raise ${n} amount`}
                />
                <HelpText>
                  Range $100,000–$1,500,000 in $25,000 steps.
                </HelpText>
              </div>
              <div className="space-y-2">
                <StrongLabel htmlFor={`cr${n}-date`}>Date</StrongLabel>
                <Input
                  id={`cr${n}-date`}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`max-w-44 h-11 bg-card border-2 border-border text-foreground text-base ${FOCUS_RING}`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="pt-5 border-t-2 border-border">
          <StrongLabel>Total {fundingLabel} raise</StrongLabel>
          <p className="font-mono font-bold text-2xl text-foreground tabular-nums mt-1">
            {fmtMoney(total)}
          </p>
        </div>
      </div>
    </div>
  );
}

function CostOfCapitalCard() {
  const [coe, setCoe] = useState(0.18);
  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-5">
        <h3 className="text-xl font-display text-foreground">Cost of Capital</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <StrongLabel>Cost of equity</StrongLabel>
            <ValuePill>{fmtPercent(coe)}</ValuePill>
          </div>
          <Slider
            value={[coe * 100]}
            onValueChange={([v]) => setCoe(v / 100)}
            min={5}
            max={40}
            step={0.5}
            aria-label="Cost of Equity"
          />
          <HelpText>
            STR market benchmark: 17.5%. Range 5%–40% in 0.5% steps.
          </HelpText>
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
          <h3 className="text-xl font-display text-foreground">Convertible Terms</h3>
          <HelpText>
            Turn on the terms that apply to your instrument. Each term reveals its inputs below.
          </HelpText>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <StrongLabel>Valuation Cap</StrongLabel>
              <AccessibleToggle on={showCap} onChange={setShowCap} label="Valuation Cap" />
            </div>
            {showCap && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-foreground text-sm font-medium">Cap amount</Label>
                  <ValuePill>{fmtMoney(cap)}</ValuePill>
                </div>
                <Slider
                  value={[cap]}
                  onValueChange={([v]) => setCap(v)}
                  min={100_000}
                  max={5_000_000}
                  step={100_000}
                  aria-label="Valuation Cap amount"
                />
                <HelpText>Range $100k–$5M in $100k steps.</HelpText>
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <StrongLabel>Discount Rate</StrongLabel>
              <AccessibleToggle on={showDiscount} onChange={setShowDiscount} label="Discount Rate" />
            </div>
            {showDiscount && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-foreground text-sm font-medium">Rate</Label>
                  <ValuePill>{fmtPercent(discount)}</ValuePill>
                </div>
                <Slider
                  value={[discount * 100]}
                  onValueChange={([v]) => setDiscount(v / 100)}
                  min={0}
                  max={50}
                  step={5}
                  aria-label="Discount Rate"
                />
                <HelpText>Common SAFE range 10%–25% in 5% steps.</HelpText>
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <StrongLabel>Interest Rate</StrongLabel>
              <AccessibleToggle on={showInterest} onChange={setShowInterest} label="Interest Rate" />
            </div>
            {showInterest && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-foreground text-sm font-medium">Annual rate</Label>
                  <ValuePill>{fmtPercent(interest)}</ValuePill>
                </div>
                <Slider
                  value={[interest * 100]}
                  onValueChange={([v]) => setInterest(v / 100)}
                  min={0}
                  max={15}
                  step={0.5}
                  aria-label="Annual Interest Rate"
                />
                <div className="space-y-2">
                  <StrongLabel htmlFor="freq">Payment frequency</StrongLabel>
                  <Select value={freq} onValueChange={setFreq}>
                    <SelectTrigger id="freq" className={`w-48 h-11 text-base border-2 ${FOCUS_RING}`}>
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

  const metrics = [
    {
      label: "Runway Buffer",
      value: runway,
      set: setRunway,
      min: 3,
      max: 24,
      step: 1,
      fmt: (v: number) => `${v} months`,
      isPct: false,
      help: "Range 3–24 months in 1-month steps.",
    },
    {
      label: "Sizing Overshoot",
      value: overshoot,
      set: setOvershoot,
      min: 0,
      max: 50,
      step: 1,
      fmt: fmtPercent,
      isPct: true,
      help: "Range 0%–50% in 1% steps.",
    },
    {
      label: "Revenue Ramp Delay",
      value: ramp,
      set: setRamp,
      min: 1,
      max: 18,
      step: 1,
      fmt: (v: number) => `${v} months`,
      isPct: false,
      help: "Range 1–18 months in 1-month steps.",
    },
    {
      label: "Burn Flex-Down",
      value: burnFlex,
      set: setBurnFlex,
      min: 0,
      max: 50,
      step: 1,
      fmt: fmtPercent,
      isPct: true,
      help: "Range 0%–50% in 1% steps.",
    },
  ];

  return (
    <div className={CARD_CLASSES}>
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-display text-foreground">Capital Stack Discipline</h3>
          <HelpText>
            Runway, sizing overshoot, revenue ramp, and burn flex-down used to size and stress-test the raise.
          </HelpText>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-3">
              <div className="flex items-center justify-between">
                <StrongLabel>{m.label}</StrongLabel>
                <ValuePill>{m.fmt(m.value)}</ValuePill>
              </div>
              <Slider
                value={[m.isPct ? m.value * 100 : m.value]}
                onValueChange={([v]) => m.set(m.isPct ? v / 100 : v)}
                min={m.min}
                max={m.max}
                step={m.step}
                aria-label={m.label}
              />
              <HelpText>{m.help}</HelpText>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function UsabilityAccessible() {
  return (
    <div className="min-h-screen bg-background p-10">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2 font-semibold">
            U3 · Accessibility &amp; Readability
          </div>
          <h2 className="font-display text-3xl text-foreground">Funding</h2>
          <p className="text-base text-muted-foreground mt-2 leading-relaxed">
            Larger type, stronger labels, always-visible help text, redundant on/off signals, and 44px hit targets. Less fits per screen — but every control is unambiguous.
          </p>
        </header>

        <div className="space-y-6">
          <CapitalRaisesCard />
          <CostOfCapitalCard />
          <ConvertibleTermsCard />
          <DisciplineCard />
        </div>
      </div>
    </div>
  );
}

export default UsabilityAccessible;
