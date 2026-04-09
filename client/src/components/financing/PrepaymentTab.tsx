import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { ContentPanel } from "@/components/ui/content-panel";
import { Loader2, Info } from "@/components/icons/themed-icons";
import { IconShield } from "@/components/icons";
import { formatMoney } from "@/lib/financialEngine";
import { InputField, formatPct } from "./InputField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PrepaymentTab() {
  const [balance, setBalance] = useState("3000000");
  const [prepayMonth, setPrepayMonth] = useState("36");
  const [loanRate, setLoanRate] = useState("7");
  const [termMonths, setTermMonths] = useState("120");
  const [penaltyType, setPenaltyType] = useState<"yield_maintenance" | "step_down" | "defeasance">("yield_maintenance");
  const [treasuryRate, setTreasuryRate] = useState("4");
  const [defeasanceFeePct, setDefeasanceFeePct] = useState("1");
  const [result, setResult] = useState<any>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const calculatePenalty = async (type: string) => {
    const body: any = {
      outstanding_balance: parseFloat(balance),
      prepayment_month: parseInt(prepayMonth),
      loan_rate_annual: parseFloat(loanRate) / 100,
      term_months: parseInt(termMonths),
      prepayment_type: type,
    };
    if (type === "yield_maintenance" || type === "defeasance") {
      body.treasury_rate_annual = parseFloat(treasuryRate) / 100;
    }
    if (type === "step_down") {
      body.step_down_schedule = [0.05, 0.04, 0.03, 0.02, 0.01];
    }
    if (type === "defeasance") {
      body.defeasance_fee_pct = parseFloat(defeasanceFeePct) / 100;
    }
    const res = await fetch("/api/financing/prepayment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const calculate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const mainResult = await calculatePenalty(penaltyType);
      if (mainResult.error) throw new Error(mainResult.error);
      setResult(mainResult);

      const [ym, sd, df] = await Promise.all([
        calculatePenalty("yield_maintenance"),
        calculatePenalty("step_down"),
        calculatePenalty("defeasance"),
      ]);

      setComparison({
        yield_maintenance: ym.penalty_amount,
        step_down: sd.penalty_amount,
        defeasance: df.penalty_amount,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  }, [balance, prepayMonth, loanRate, termMonths, penaltyType, treasuryRate, defeasanceFeePct]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InputField label="Outstanding Balance" value={balance} onChange={setBalance} prefix="$" helpText="Remaining loan principal at prepayment date" data-testid="input-prepay-balance" />
        <InputField label="Prepayment Month" value={prepayMonth} onChange={setPrepayMonth} helpText="Month number from loan origination when you plan to prepay" data-testid="input-prepay-month" />
        <InputField label="Loan Rate" value={loanRate} onChange={setLoanRate} suffix="%" helpText="Annual interest rate on the loan being prepaid" data-testid="input-prepay-rate" />
        <InputField label="Loan Term (months)" value={termMonths} onChange={setTermMonths} helpText="Original loan term in months" data-testid="input-prepay-term" />
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Penalty Method</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["yield_maintenance", "step_down", "defeasance"] as const).map((type) => (
                <Button
                  key={type}
                  variant={penaltyType === type ? "outline" : "ghost"}
                  onClick={() => setPenaltyType(type)}
                  data-testid={`button-prepay-type-${type}`}
                  className={`flex flex-col items-start p-3 rounded-xl h-auto whitespace-normal ${
                    penaltyType === type
                      ? "bg-primary/10 border-primary text-primary shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  <span className="text-sm font-bold capitalize">{type.replace("_", " ")}</span>
                  <span className="text-[10px] opacity-70 mt-1 leading-tight text-left">
                    {type === "yield_maintenance" && "Interest differential PV"}
                    {type === "step_down" && "Fixed % schedule"}
                    {type === "defeasance" && "Bond substitution"}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {(penaltyType === "yield_maintenance" || penaltyType === "defeasance") && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl border border-border/50">
              <InputField label="Treasury Rate" value={treasuryRate} onChange={setTreasuryRate} suffix="%" data-testid="input-prepay-treasury" />
              {penaltyType === "defeasance" && (
                <InputField label="Admin Fee %" value={defeasanceFeePct} onChange={setDefeasanceFeePct} suffix="%" data-testid="input-prepay-admin-fee" />
              )}
            </div>
          )}

          {penaltyType === "step_down" && (
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50 flex items-center gap-3">
              <Info className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Using standard 5-4-3-2-1 step-down schedule based on loan year.</p>
            </div>
          )}

          <Button size="lg" className="w-full md:w-auto" onClick={calculate} disabled={loading} data-testid="button-prepay-calculate">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconShield className="w-4 h-4 mr-2" />}
            Calculate Prepayment Cost
          </Button>
        </div>

        {comparison && (
          <div className="w-full md:w-80 space-y-4">
            <Card className="bg-muted/30 border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Scenario Comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { id: "yield_maintenance", label: "Yield Maint." },
                  { id: "step_down", label: "Step-Down" },
                  { id: "defeasance", label: "Defeasance" },
                ].map((item) => (
                  <div key={item.id} className={`flex justify-between items-center p-2 rounded-lg border ${penaltyType === item.id ? "bg-background border-primary shadow-sm" : "border-transparent"}`}>
                    <span className="text-xs font-medium">{item.label}</span>
                    <span className={`text-sm font-mono ${penaltyType === item.id ? "font-bold text-primary" : "text-muted-foreground"}`}>
                      {formatMoney(comparison[item.id])}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {result && (
        <div className="space-y-4 pt-4 border-t border-border/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Outstanding Balance" value={result.balance_at_prepayment} format="money" data-testid="stat-prepay-balance" />
            <StatCard label="Penalty Amount" value={result.penalty_amount} format="money" variant="light" data-testid="stat-prepay-penalty" />
            <StatCard label="Penalty %" value={formatPct(result.penalty_pct)} format="text" />
            <StatCard label="Total Cost" value={result.total_prepayment_cost} format="money" variant="sage" data-testid="stat-prepay-total" />
          </div>

          {result.details && (
            <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Penalty Breakdown</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {result.details.type === "yield_maintenance" && (
                  <>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Rate Differential</p>
                      <p className="text-sm font-semibold font-mono">{formatPct(result.details.rate_differential)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">PV of Differential</p>
                      <p className="text-sm font-semibold font-mono">{formatMoney(result.details.pv_differential)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Discount Rate (Treasury)</p>
                      <p className="text-sm font-semibold font-mono">{formatPct(result.details.treasury_rate)}</p>
                    </div>
                  </>
                )}
                {result.details.type === "step_down" && (
                  <>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Current Loan Year</p>
                      <p className="text-sm font-semibold font-mono">{result.details.loan_year}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Year Penalty Rate</p>
                      <p className="text-sm font-semibold font-mono">{formatPct(result.details.year_penalty_pct)}</p>
                    </div>
                  </>
                )}
                {result.details.type === "defeasance" && (
                  <>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Securities Cost</p>
                      <p className="text-sm font-semibold font-mono">{formatMoney(result.details.securities_cost)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Admin & Legal Fees</p>
                      <p className="text-sm font-semibold font-mono">{formatMoney(result.details.admin_fees)}</p>
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Months Remaining</p>
                  <p className="text-sm font-semibold font-mono">{result.months_remaining}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
