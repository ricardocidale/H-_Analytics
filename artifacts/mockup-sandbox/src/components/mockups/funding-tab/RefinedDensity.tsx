import { useState } from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "./_group.css";

const DEFAULT_CAPITAL_RAISE_VALUATION_CAP = 5000000;
const DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE = 0.2;
const DEFAULT_FUNDING_INTEREST_RATE = 0.08;
const DEFAULT_RUNWAY_BUFFER_MONTHS = 12;
const DEFAULT_SIZING_OVERSHOOT_PCT = 0.15;
const DEFAULT_REVENUE_RAMP_DELAY_MONTHS = 6;
const DEFAULT_BURN_FLEX_DOWN_PCT = 0.20;
const DEFAULT_COST_OF_EQUITY = 0.175;

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

const CARD_CLASSES = "relative bg-card border border-border shadow-sm flex flex-col rounded-none";
const HEADER_CLASSES = "px-5 pt-4 pb-3 border-b border-border/60";
const BODY_CLASSES = "p-5";

function CardHeader({ title, eyebrow }: { title: string, eyebrow: string }) {
  return (
    <div className={HEADER_CLASSES}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-display text-foreground flex items-center tracking-tight">
          {title}
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-mono font-medium">{eyebrow}</span>
      </div>
    </div>
  );
}

function CapitalRaisesCard() {
  const [fundingLabel, setFundingLabel] = useState("Series Seed");
  const [cr1Amount, setCr1Amount] = useState(750000);
  const [cr1Date, setCr1Date] = useState("2024-03-01");
  const [cr2Amount, setCr2Amount] = useState(250000);
  const [cr2Date, setCr2Date] = useState("2024-09-01");

  const total = cr1Amount + cr2Amount;

  return (
    <div className={CARD_CLASSES}>
      <CardHeader title="Capital Raises" eyebrow="Capital · Two tranches" />
      <div className={BODY_CLASSES + " space-y-6 flex-1 flex flex-col"}>
        
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <Label className="text-foreground label-text flex items-center">
            Funding Source Name
            <Info className="ml-1.5 h-3.5 w-3.5 text-muted-foreground/60" />
          </Label>
          <Input
            type="text"
            value={fundingLabel}
            onChange={(e) => setFundingLabel(e.target.value)}
            className="w-48 h-8 rounded-none border-border/60 text-right font-medium text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring"
          />
        </div>

        <div className="space-y-4">
          <div className="relative border border-border/50 bg-card p-4 rounded-sm border-l-[3px] border-l-[hsl(var(--brand-teal))] shadow-sm">
            <div className="flex justify-between items-baseline mb-4">
              <div>
                <h4 className="text-sm font-display text-foreground">Tranche 1</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Initial operating capital</p>
              </div>
              <div className="text-right">
                <span className="metric-md font-mono text-foreground font-bold tracking-tight">{formatMoney(cr1Amount)}</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <Slider
                value={[cr1Amount]}
                onValueChange={([v]) => setCr1Amount(v)}
                min={100000}
                max={1500000}
                step={25000}
                className="py-1"
              />
              <div className="flex items-center justify-between pt-2">
                <Label className="text-muted-foreground text-xs flex items-center">
                  Target Date <Info className="ml-1 h-3 w-3 text-muted-foreground/50" />
                </Label>
                <Input
                  type="date"
                  value={cr1Date}
                  onChange={(e) => setCr1Date(e.target.value)}
                  className="w-36 h-7 text-xs rounded-none border-border/60 font-mono focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </div>

          <div className="relative border border-border/50 bg-card p-4 rounded-sm border-l-[3px] border-l-[hsl(var(--brand-navy))] shadow-sm">
            <div className="flex justify-between items-baseline mb-4">
              <div>
                <h4 className="text-sm font-display text-foreground">Tranche 2</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Follow-on deployment</p>
              </div>
              <div className="text-right">
                <span className="metric-md font-mono text-foreground font-bold tracking-tight">{formatMoney(cr2Amount)}</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <Slider
                value={[cr2Amount]}
                onValueChange={([v]) => setCr2Amount(v)}
                min={0}
                max={1500000}
                step={25000}
                className="py-1"
              />
              <div className="flex items-center justify-between pt-2">
                <Label className="text-muted-foreground text-xs flex items-center">
                  Target Date <Info className="ml-1 h-3 w-3 text-muted-foreground/50" />
                </Label>
                <Input
                  type="date"
                  value={cr2Date}
                  onChange={(e) => setCr2Date(e.target.value)}
                  className="w-36 h-7 text-xs rounded-none border-border/60 font-mono focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6">
          <div className="flex items-end justify-between bg-muted/40 p-4 rounded-sm border border-border/40">
            <Label className="text-muted-foreground text-sm font-medium">Total {fundingLabel} Raise</Label>
            <div className="text-right">
              <span className="font-mono text-2xl font-bold text-[hsl(var(--brand-gold))] tracking-tight drop-shadow-sm">
                {formatMoney(total)}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function CostOfCapitalCard() {
  const [costOfEquity, setCostOfEquity] = useState(DEFAULT_COST_OF_EQUITY);

  return (
    <div className={CARD_CLASSES}>
      <CardHeader title="Cost of Capital" eyebrow="Returns · Re" />
      <div className={BODY_CLASSES}>
        <div className="flex justify-between items-end mb-4">
          <Label className="label-text text-foreground flex items-center gap-1.5 pb-1">
            Cost of Equity
            <Info className="h-3 w-3 text-muted-foreground/60" />
            <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground/80 font-mono bg-muted/50 px-1.5 py-0.5 rounded-sm border border-border/40">STR · 17.5%</span>
          </Label>
          <span className="metric-md font-mono text-foreground font-bold tracking-tight">{formatPercent(costOfEquity)}</span>
        </div>
        <Slider
          value={[costOfEquity * 100]}
          onValueChange={([v]) => setCostOfEquity(v / 100)}
          min={5}
          max={40}
          step={0.5}
        />
      </div>
    </div>
  );
}

function ConvertibleTermsCard() {
  const [showValCap, setShowValCap] = useState(true);
  const [valCap, setValCap] = useState(DEFAULT_CAPITAL_RAISE_VALUATION_CAP);
  
  const [showDiscount, setShowDiscount] = useState(true);
  const [discount, setDiscount] = useState(DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE);
  
  const [showInterest, setShowInterest] = useState(false);
  const [interest, setInterest] = useState(DEFAULT_FUNDING_INTEREST_RATE);
  const [freq, setFreq] = useState("accrues_only");

  return (
    <div className={CARD_CLASSES}>
      <CardHeader title="Convertible Terms" eyebrow="Terms · Optional" />
      <div className={BODY_CLASSES + " space-y-6"}>
        
        {/* Valuation Cap */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center text-foreground label-text font-medium">
              Valuation Cap <Info className="ml-1.5 h-3.5 w-3.5 text-muted-foreground/60" />
            </Label>
            <div className="flex items-center gap-3">
              {showValCap && <span className="metric-table font-mono text-foreground font-bold">{formatMoney(valCap)}</span>}
              <Switch checked={showValCap} onCheckedChange={setShowValCap} className="scale-90" />
            </div>
          </div>
          {showValCap && (
            <div className="pt-1">
              <Slider value={[valCap]} onValueChange={([v]) => setValCap(v)} min={100000} max={15000000} step={100000} />
            </div>
          )}
        </div>

        <div className="h-px w-full bg-border/40" />

        {/* Discount Rate */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center text-foreground label-text font-medium">
              Discount Rate <Info className="ml-1.5 h-3.5 w-3.5 text-muted-foreground/60" />
            </Label>
            <div className="flex items-center gap-3">
              {showDiscount && <span className="metric-table font-mono text-foreground font-bold">{formatPercent(discount)}</span>}
              <Switch checked={showDiscount} onCheckedChange={setShowDiscount} className="scale-90" />
            </div>
          </div>
          {showDiscount && (
            <div className="pt-1">
              <Slider value={[discount * 100]} onValueChange={([v]) => setDiscount(v / 100)} min={0} max={50} step={1} />
            </div>
          )}
        </div>

        <div className="h-px w-full bg-border/40" />

        {/* Interest Rate */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center text-foreground label-text font-medium">
              Interest Rate <Info className="ml-1.5 h-3.5 w-3.5 text-muted-foreground/60" />
            </Label>
            <div className="flex items-center gap-3">
              {showInterest && <span className="metric-table font-mono text-foreground font-bold">{formatPercent(interest)}</span>}
              <Switch checked={showInterest} onCheckedChange={setShowInterest} className="scale-90" />
            </div>
          </div>
          {showInterest && (
            <div className="pt-1 space-y-4">
              <Slider value={[interest * 100]} onValueChange={([v]) => setInterest(v / 100)} min={0} max={15} step={0.5} />
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">Payment Freq.</span>
                <Select value={freq} onValueChange={setFreq}>
                  <SelectTrigger className="w-36 h-7 text-xs rounded-none border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accrues_only" className="text-xs">Accrues Only</SelectItem>
                    <SelectItem value="quarterly" className="text-xs">Paid Quarterly</SelectItem>
                    <SelectItem value="annually" className="text-xs">Paid Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function CapitalStackDisciplineCard() {
  const [runway, setRunway] = useState(DEFAULT_RUNWAY_BUFFER_MONTHS);
  const [overshoot, setOvershoot] = useState(DEFAULT_SIZING_OVERSHOOT_PCT);
  const [rampDelay, setRampDelay] = useState(DEFAULT_REVENUE_RAMP_DELAY_MONTHS);
  const [burnFlex, setBurnFlex] = useState(DEFAULT_BURN_FLEX_DOWN_PCT);

  return (
    <div className={CARD_CLASSES}>
      <CardHeader title="Capital Stack Discipline" eyebrow="Discipline · Specialist Guardrails" />
      <div className={BODY_CLASSES}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-8">
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground flex items-center">
                Runway Buffer <Info className="ml-1 h-3 w-3 text-muted-foreground/50" />
              </Label>
              <span className="metric-table font-mono text-foreground font-semibold">{formatNumber(runway)} mo</span>
            </div>
            <Slider value={[runway]} onValueChange={([v]) => setRunway(v)} min={3} max={24} step={1} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground flex items-center">
                Sizing Overshoot <Info className="ml-1 h-3 w-3 text-muted-foreground/50" />
              </Label>
              <span className="metric-table font-mono text-foreground font-semibold">{formatPercent(overshoot)}</span>
            </div>
            <Slider value={[overshoot * 100]} onValueChange={([v]) => setOvershoot(v / 100)} min={0} max={50} step={1} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground flex items-center">
                Rev. Ramp Delay <Info className="ml-1 h-3 w-3 text-muted-foreground/50" />
              </Label>
              <span className="metric-table font-mono text-foreground font-semibold">{formatNumber(rampDelay)} mo</span>
            </div>
            <Slider value={[rampDelay]} onValueChange={([v]) => setRampDelay(v)} min={1} max={18} step={1} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground flex items-center">
                Burn Flex-Down <Info className="ml-1 h-3 w-3 text-muted-foreground/50" />
              </Label>
              <span className="metric-table font-mono text-foreground font-semibold">{formatPercent(burnFlex)}</span>
            </div>
            <Slider value={[burnFlex * 100]} onValueChange={([v]) => setBurnFlex(v / 100)} min={0} max={50} step={1} />
          </div>

        </div>
      </div>
    </div>
  );
}

export function RefinedDensity() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-8 lg:p-10 font-body">
      <div className="mx-auto max-w-[1000px]">
        <header className="mb-8">
          <h2 className="font-display text-2xl text-foreground font-semibold tracking-tight">Funding Assumptions</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Capital raises, convertible terms, cost of capital, and capital-stack discipline.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CapitalRaisesCard />
          <div className="space-y-6">
            <CostOfCapitalCard />
            <ConvertibleTermsCard />
            <CapitalStackDisciplineCard />
          </div>
        </div>
      </div>
    </div>
  );
}
