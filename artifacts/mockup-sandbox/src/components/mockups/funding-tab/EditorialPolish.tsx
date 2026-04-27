import { useState } from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "./_group.css";

// Utilities
const formatMoney = (amount: number) => {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
};
const formatPercent = (val: number) => {
  return (val * 100).toFixed(1) + "%";
};

const InfoTooltip = () => <Info className="inline-block ml-1.5 h-3.5 w-3.5 text-muted-foreground/70" />;

// Layout Primitives
const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">{children}</div>
);

const CardHeader = ({ title, subtitle }: { title: React.ReactNode; subtitle: string }) => (
  <div className="p-8 pb-6">
    <h3 className="text-xl font-display text-foreground tracking-tight mb-2 flex items-center">
      {title}
    </h3>
    <p className="label-text text-muted-foreground/90">{subtitle}</p>
  </div>
);

const Row = ({ 
  label, 
  value, 
  children,
  active = false
}: { 
  label: React.ReactNode; 
  value?: React.ReactNode; 
  children?: React.ReactNode;
  active?: boolean;
}) => (
  <div className={`py-5 border-t border-border/50 first:border-0 ${active ? "bg-[hsl(var(--brand-teal))/0.03]" : ""}`}>
    <div className="flex items-center justify-between px-8">
      <div className="flex items-center gap-2">{label}</div>
      {value && <div className="flex items-center justify-end">{value}</div>}
    </div>
    {children && <div className="px-8 mt-5 mb-1">{children}</div>}
  </div>
);

function CapitalRaisesCard() {
  const [fundingLabel, setFundingLabel] = useState("SAFE");
  const [r1Amount, setR1Amount] = useState(750000);
  const [r1Date, setR1Date] = useState("2024-06-01");
  const [r2Amount, setR2Amount] = useState(500000);
  const [r2Date, setR2Date] = useState("2025-01-15");

  return (
    <Card>
      <CardHeader 
        title={<>Funding <InfoTooltip /></>} 
        subtitle="Capital raised across two tranches to fund operations before fee revenue arrives." 
      />
      <div className="flex flex-col">
        <Row
          label={<Label className="text-foreground label-text font-medium">Funding Source Name</Label>}
          value={
            <Input
              type="text"
              value={fundingLabel}
              onChange={(e) => setFundingLabel(e.target.value)}
              className="w-48 text-right bg-transparent border-0 border-b border-transparent hover:border-border focus-visible:border-primary focus-visible:ring-0 rounded-none px-0 h-8 font-mono text-sm"
            />
          }
        />
        
        <div className="bg-primary/5 border-t border-b border-border/50">
          <div className="px-8 py-4 font-display text-sm tracking-wide text-foreground">Tranche 1</div>
          <Row 
            label={<Label className="text-muted-foreground label-text">Amount <InfoTooltip /></Label>}
            value={<span className="metric-md font-mono text-[hsl(var(--brand-navy))]">{formatMoney(r1Amount)}</span>}
          >
            <Slider
              value={[r1Amount]}
              onValueChange={([v]) => setR1Amount(v)}
              min={100000}
              max={1500000}
              step={25000}
              className="[&_[role=slider]]:border-[hsl(var(--brand-navy))]"
            />
          </Row>
          <Row 
            label={<Label className="text-muted-foreground label-text">Date <InfoTooltip /></Label>}
            value={
              <Input
                type="date"
                value={r1Date}
                onChange={(e) => setR1Date(e.target.value)}
                className="w-auto border-0 bg-transparent text-right font-mono text-sm text-foreground focus-visible:ring-0 p-0 h-8"
              />
            }
          />
        </div>

        <div className="bg-primary/5 border-b border-border/50">
          <div className="px-8 py-4 font-display text-sm tracking-wide text-foreground">Tranche 2</div>
          <Row 
            label={<Label className="text-muted-foreground label-text">Amount <InfoTooltip /></Label>}
            value={<span className="metric-md font-mono text-[hsl(var(--brand-navy))]">{formatMoney(r2Amount)}</span>}
          >
            <Slider
              value={[r2Amount]}
              onValueChange={([v]) => setR2Amount(v)}
              min={100000}
              max={1500000}
              step={25000}
              className="[&_[role=slider]]:border-[hsl(var(--brand-navy))]"
            />
          </Row>
          <Row 
            label={<Label className="text-muted-foreground label-text">Date <InfoTooltip /></Label>}
            value={
              <Input
                type="date"
                value={r2Date}
                onChange={(e) => setR2Date(e.target.value)}
                className="w-auto border-0 bg-transparent text-right font-mono text-sm text-foreground focus-visible:ring-0 p-0 h-8"
              />
            }
          />
        </div>

        <div className="px-8 py-6 flex items-center justify-between bg-[hsl(var(--brand-navy))] text-primary-foreground">
          <span className="font-display tracking-wide text-sm text-primary-foreground/80 uppercase">Total {fundingLabel} Raise</span>
          <span className="metric-md font-mono text-xl">{formatMoney(r1Amount + r2Amount)}</span>
        </div>
      </div>
    </Card>
  );
}

function CostOfCapitalCard() {
  const [costOfEquity, setCostOfEquity] = useState(0.18);

  return (
    <Card>
      <CardHeader 
        title={<>Cost of Capital <InfoTooltip /></>} 
        subtitle="The equity investor's required annual return — used as Re in WACC." 
      />
      <div className="flex flex-col border-t border-border/50">
        <Row
          label={<Label className="text-foreground label-text flex items-center gap-3">Cost of Equity <InfoTooltip /> <span className="text-[10px] uppercase tracking-wider bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono">STR · 17.5%</span></Label>}
          value={<span className="metric-md font-mono text-foreground">{formatPercent(costOfEquity)}</span>}
        >
          <Slider
            value={[costOfEquity * 100]}
            onValueChange={([v]) => setCostOfEquity(v / 100)}
            min={5}
            max={40}
            step={0.5}
          />
        </Row>
      </div>
    </Card>
  );
}

function ConvertibleTermsCard() {
  const [hasValCap, setHasValCap] = useState(true);
  const [valCap, setValCap] = useState(5000000);
  
  const [hasDiscount, setHasDiscount] = useState(true);
  const [discount, setDiscount] = useState(0.20);
  
  const [hasInterest, setHasInterest] = useState(false);
  const [interest, setInterest] = useState(0.08);
  const [frequency, setFrequency] = useState("accrues_only");

  return (
    <Card>
      <CardHeader 
        title={<>Convertible Terms <InfoTooltip /></>} 
        subtitle="Optional conversion mechanics — toggle on what your instrument carries." 
      />
      <div className="flex flex-col border-t border-border/50">
        <Row
          active={hasValCap}
          label={<Label className={`label-text ${hasValCap ? "text-[hsl(var(--brand-teal))] font-medium" : "text-foreground"}`}>Valuation Cap <InfoTooltip /></Label>}
          value={
            <div className="flex items-center gap-6">
              {hasValCap && <span className="metric-table font-mono text-[hsl(var(--brand-teal))]">{formatMoney(valCap)}</span>}
              <Switch checked={hasValCap} onCheckedChange={setHasValCap} className="data-[state=checked]:bg-[hsl(var(--brand-teal))]" />
            </div>
          }
        >
          {hasValCap && (
            <Slider
              value={[valCap]}
              onValueChange={([v]) => setValCap(v)}
              min={100000}
              max={15000000}
              step={100000}
              className="[&_[role=slider]]:border-[hsl(var(--brand-teal))] [&_[role=track]>div]:bg-[hsl(var(--brand-teal))]"
            />
          )}
        </Row>

        <Row
          active={hasDiscount}
          label={<Label className={`label-text ${hasDiscount ? "text-[hsl(var(--brand-teal))] font-medium" : "text-foreground"}`}>Discount Rate <InfoTooltip /></Label>}
          value={
            <div className="flex items-center gap-6">
              {hasDiscount && <span className="metric-table font-mono text-[hsl(var(--brand-teal))]">{formatPercent(discount)}</span>}
              <Switch checked={hasDiscount} onCheckedChange={setHasDiscount} className="data-[state=checked]:bg-[hsl(var(--brand-teal))]" />
            </div>
          }
        >
          {hasDiscount && (
            <Slider
              value={[discount * 100]}
              onValueChange={([v]) => setDiscount(v / 100)}
              min={0}
              max={50}
              step={1}
              className="[&_[role=slider]]:border-[hsl(var(--brand-teal))] [&_[role=track]>div]:bg-[hsl(var(--brand-teal))]"
            />
          )}
        </Row>

        <Row
          active={hasInterest}
          label={<Label className={`label-text ${hasInterest ? "text-[hsl(var(--brand-teal))] font-medium" : "text-foreground"}`}>Interest Rate <InfoTooltip /></Label>}
          value={
            <div className="flex items-center gap-6">
              {hasInterest && <span className="metric-table font-mono text-[hsl(var(--brand-teal))]">{formatPercent(interest)}</span>}
              <Switch checked={hasInterest} onCheckedChange={setHasInterest} className="data-[state=checked]:bg-[hsl(var(--brand-teal))]" />
            </div>
          }
        >
          {hasInterest && (
            <div className="space-y-6">
              <Slider
                value={[interest * 100]}
                onValueChange={([v]) => setInterest(v / 100)}
                min={0}
                max={15}
                step={0.5}
                className="[&_[role=slider]]:border-[hsl(var(--brand-teal))] [&_[role=track]>div]:bg-[hsl(var(--brand-teal))]"
              />
              <div className="flex items-center justify-between border-t border-border/40 pt-4">
                <span className="text-sm text-muted-foreground flex items-center">Payment Frequency <InfoTooltip /></span>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger className="w-40 h-8 border-border bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accrues_only">Accrues Only</SelectItem>
                    <SelectItem value="quarterly">Paid Quarterly</SelectItem>
                    <SelectItem value="annually">Paid Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </Row>
      </div>
    </Card>
  );
}

function CapitalStackDisciplineCard() {
  const [runway, setRunway] = useState(12);
  const [overshoot, setOvershoot] = useState(0.25);
  const [rampDelay, setRampDelay] = useState(6);
  const [flexDown, setFlexDown] = useState(0.15);

  return (
    <Card>
      <CardHeader 
        title={<>Capital Stack Discipline <InfoTooltip /></>} 
        subtitle="Specialist-evaluated guardrails for runway, sizing, ramp, and burn." 
      />
      <div className="flex flex-col border-t border-border/50">
        <Row
          label={<Label className="text-foreground label-text">Runway Buffer <InfoTooltip /></Label>}
          value={<span className="metric-table font-mono text-foreground">{runway} mo</span>}
        >
          <Slider value={[runway]} onValueChange={([v]) => setRunway(v)} min={3} max={24} step={1} />
        </Row>
        <Row
          label={<Label className="text-foreground label-text">Sizing Overshoot <InfoTooltip /></Label>}
          value={<span className="metric-table font-mono text-foreground">{formatPercent(overshoot)}</span>}
        >
          <Slider value={[overshoot * 100]} onValueChange={([v]) => setOvershoot(v / 100)} min={0} max={50} step={1} />
        </Row>
        <Row
          label={<Label className="text-foreground label-text">Revenue Ramp Delay <InfoTooltip /></Label>}
          value={<span className="metric-table font-mono text-foreground">{rampDelay} mo</span>}
        >
          <Slider value={[rampDelay]} onValueChange={([v]) => setRampDelay(v)} min={1} max={18} step={1} />
        </Row>
        <Row
          label={<Label className="text-foreground label-text">Burn Flex-Down <InfoTooltip /></Label>}
          value={<span className="metric-table font-mono text-foreground">{formatPercent(flexDown)}</span>}
        >
          <Slider value={[flexDown * 100]} onValueChange={([v]) => setFlexDown(v / 100)} min={0} max={50} step={1} />
        </Row>
      </div>
    </Card>
  );
}

export function EditorialPolish() {
  return (
    <div className="min-h-screen bg-background p-8 font-body">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-10 pl-2">
          <h2 className="font-display text-3xl font-medium tracking-tight text-foreground">Funding</h2>
          <p className="label-text text-muted-foreground/80 mt-2 max-w-2xl">
            Capital raises, convertible terms, cost of capital, and capital-stack discipline.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <CapitalRaisesCard />
          <div className="space-y-8">
            <CostOfCapitalCard />
            <ConvertibleTermsCard />
            <CapitalStackDisciplineCard />
          </div>
        </div>
      </div>
    </div>
  );
}
