import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconTrendingUp, IconPercent, IconCheckCircle, IconXCircle } from "@/components/icons";
import { formatMoney } from "@/lib/financialEngine";
import { InsightPanel } from "@/components/graphics";
import { InputField, formatPct } from "./InputField";

export function DebtYieldTab() {
  const [noi, setNoi] = useState("500000");
  const [loanAmount, setLoanAmount] = useState("4000000");
  const [minYield, setMinYield] = useState("8");
  const [purchasePrice, setPurchasePrice] = useState("5000000");
  const [ltvMax, setLtvMax] = useState("75");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const calculate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/financing/debt-yield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          noi_annual: parseFloat(noi),
          loan_amount: parseFloat(loanAmount) || undefined,
          min_debt_yield: parseFloat(minYield) / 100 || undefined,
          purchase_price: parseFloat(purchasePrice) || undefined,
          ltv_max: parseFloat(ltvMax) / 100 || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Calculation failed");
      }
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  }, [noi, loanAmount, minYield, purchasePrice, ltvMax]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InputField label="Annual ANOI" value={noi} onChange={setNoi} prefix="$" helpText="Adjusted NOI used to calculate debt yield" data-testid="input-dy-noi" />
        <InputField label="Loan Amount" value={loanAmount} onChange={setLoanAmount} prefix="$" helpText="Proposed loan amount to evaluate" data-testid="input-dy-loan" />
        <InputField label="Min Debt Yield" value={minYield} onChange={setMinYield} suffix="%" helpText="Lender's minimum debt yield threshold (typically 8–10%)" data-testid="input-dy-min" />
        <InputField label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} prefix="$" helpText="Property purchase price for LTV calculation" data-testid="input-dy-price" />
        <InputField label="Max LTV" value={ltvMax} onChange={setLtvMax} suffix="%" helpText="Maximum Loan-to-Value ratio allowed" data-testid="input-dy-ltv" />
      </div>
      <Button
        onClick={calculate}
        disabled={loading}
        variant="default"
        data-testid="button-dy-calculate"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : <IconTrendingUp className="w-4 h-4 mr-2 inline" />}
        Analyze Debt Yield
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Debt Yield"
            value={result.debt_yield ? formatPct(result.debt_yield) : "N/A"}
            format="text"
            icon={<IconPercent className="w-4 h-4" />}
            variant={result.passes_min_threshold ? "sage" : "light"}
            data-testid="stat-dy-yield"
          />
          <StatCard
            label="Status"
            value={result.passes_min_threshold === null ? "N/A" : result.passes_min_threshold ? "PASS" : "FAIL"}
            format="text"
            variant={result.passes_min_threshold ? "sage" : "light"}
            icon={result.passes_min_threshold ? <IconCheckCircle className="w-5 h-5" /> : <IconXCircle className="w-5 h-5" />}
            data-testid="stat-dy-pass"
          />
          <StatCard
            label="Max Loan (Debt Yield)"
            value={result.max_loan_debt_yield ? formatMoney(result.max_loan_debt_yield) : "N/A"}
            format="text"
            data-testid="stat-dy-max-loan"
          />
          <StatCard
            label="Binding Constraint"
            value={result.binding_constraint === "debt_yield" ? "Debt Yield" : result.binding_constraint === "ltv" ? "LTV" : "None"}
            format="text"
            variant="sage"
            data-testid="stat-dy-binding"
          />
          <StatCard label="Max Loan (LTV)" value={result.max_loan_ltv ? formatMoney(result.max_loan_ltv) : "N/A"} format="text" />
          <StatCard label="Final Max Loan" value={result.max_loan_binding ? formatMoney(result.max_loan_binding) : "N/A"} format="text" variant="sage" />
          <StatCard label="Implied LTV" value={result.implied_ltv ? formatPct(result.implied_ltv) : "N/A"} format="text" />
        </div>
      )}
      {result && (
        <InsightPanel
          data-testid="insight-debt-yield"
          variant="compact"
          title="Debt Yield Analysis"
          insights={[
            { text: "Debt Yield", metric: result.debt_yield ? formatPct(result.debt_yield) : "N/A", type: result.passes_min_threshold ? "positive" as const : "warning" as const },
            { text: `${result.passes_min_threshold ? "Passes" : "Fails"} minimum threshold`, type: result.passes_min_threshold ? "positive" as const : "negative" as const },
            { text: "Binding constraint", metric: result.binding_constraint === "debt_yield" ? "Debt Yield" : result.binding_constraint === "ltv" ? "LTV" : "None", type: "neutral" as const },
          ]}
        />
      )}
    </div>
  );
}
