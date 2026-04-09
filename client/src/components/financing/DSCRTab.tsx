import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCalculator, IconShield } from "@/components/icons";
import { formatMoney } from "@/lib/financialEngine";
import { Gauge, DonutChart, InsightPanel } from "@/components/graphics";
import { InputField, formatPct, formatRatio } from "./InputField";
import { Badge } from "@/components/ui/badge";

interface MoodysRiskData {
  propertyRiskScore?: { value: number };
  defaultProbability?: { value: number };
  creditRating?: { value: string };
  riskPremiumBps?: { value: number };
  lossGivenDefault?: { value: number };
  watchlistStatus?: { value: string };
}

export function DSCRTab() {
  const [noi, setNoi] = useState("500000");
  const [rate, setRate] = useState("7");
  const [termMonths, setTermMonths] = useState("120");
  const [amortMonths, setAmortMonths] = useState("360");
  const [ioMonths, setIoMonths] = useState("24");
  const [minDscr, setMinDscr] = useState("1.25");
  const [purchasePrice, setPurchasePrice] = useState("5000000");
  const [ltvMax, setLtvMax] = useState("75");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [moodysData, setMoodysData] = useState<MoodysRiskData | null>(null);
  const [moodysAvailable, setMoodysAvailable] = useState(false);
  const [propertyLocation, setPropertyLocation] = useState("");

  useEffect(() => {
    fetch("/api/market-intelligence/status", { credentials: "include" })
      .then((r) => r.json())
      .then((status) => setMoodysAvailable(!!status.moodys))
      .catch(() => { /* ignore — status check is best-effort */ });
  }, []);

  const calculate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dscrRes] = await Promise.all([
        fetch("/api/financing/dscr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            noi_annual: parseFloat(noi),
            interest_rate_annual: parseFloat(rate) / 100,
            term_months: parseInt(termMonths),
            amortization_months: parseInt(amortMonths),
            io_months: parseInt(ioMonths) || 0,
            min_dscr: parseFloat(minDscr),
            purchase_price: parseFloat(purchasePrice) || undefined,
            ltv_max: parseFloat(ltvMax) / 100 || undefined,
            location: moodysAvailable && propertyLocation.trim() ? propertyLocation.trim() : undefined,
          }),
        }),
        ...(moodysAvailable && propertyLocation.trim()
          ? [fetch(`/api/market-intelligence/credit-risk?location=${encodeURIComponent(propertyLocation.trim())}`, { credentials: "include" })
              .then((r) => r.json())
              .then((data) => setMoodysData(data.moodys || null))
              .catch(() => setMoodysData(null))]
          : []),
      ]);
      if (!dscrRes.ok) {
        const err = await dscrRes.json();
        throw new Error(err.error || "Calculation failed");
      }
      setResult(await dscrRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  }, [noi, rate, termMonths, amortMonths, ioMonths, minDscr, purchasePrice, ltvMax, moodysAvailable, propertyLocation]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InputField label="Annual ANOI" value={noi} onChange={setNoi} prefix="$" helpText="Adjusted Net Operating Income: NOI minus management fees minus FF&E reserve — the income available to service debt" data-testid="input-dscr-noi" />
        <InputField label="Interest Rate" value={rate} onChange={setRate} suffix="%" step="0.25" helpText="Annual interest rate on the loan" data-testid="input-dscr-rate" />
        <InputField label="Loan Term (months)" value={termMonths} onChange={setTermMonths} helpText="Total duration of the loan before maturity or balloon payment" data-testid="input-dscr-term" />
        <InputField label="Amortization (months)" value={amortMonths} onChange={setAmortMonths} helpText="Period over which principal is repaid — longer = lower monthly payments" data-testid="input-dscr-amort" />
        <InputField label="IO Period (months)" value={ioMonths} onChange={setIoMonths} helpText="Interest-only period at the start of the loan — no principal payments during this time" data-testid="input-dscr-io" />
        <InputField label="Minimum DSCR" value={minDscr} onChange={setMinDscr} step="0.05" helpText="Lender's required minimum Debt Service Coverage Ratio (typically 1.20x–1.35x)" data-testid="input-dscr-min" />
        <InputField label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} prefix="$" helpText="Total acquisition price of the property" data-testid="input-dscr-price" />
        <InputField label="Max LTV" value={ltvMax} onChange={setLtvMax} suffix="%" helpText="Maximum Loan-to-Value ratio the lender will allow (typically 65–75%)" data-testid="input-dscr-ltv" />
        {moodysAvailable && (
          <InputField label="Property Location" value={propertyLocation} onChange={setPropertyLocation} helpText="City/market for Moody's credit risk data (optional)" data-testid="input-dscr-location" />
        )}
      </div>
      <Button
        onClick={calculate}
        disabled={loading}
        variant="default"
        data-testid="button-dscr-calculate"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : <IconCalculator className="w-4 h-4 mr-2 inline" />}
        Calculate Max Loan
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Max Loan (DSCR)" value={result.max_loan_dscr} format="money" data-testid="stat-dscr-max-loan" />
            <StatCard label="Max Loan (LTV)" value={result.max_loan_ltv ?? "N/A"} format={result.max_loan_ltv ? "money" : "text"} data-testid="stat-dscr-ltv-loan" />
            <StatCard label="Binding Constraint" value={result.binding_constraint === "dscr" ? "DSCR" : result.binding_constraint === "ltv" ? "LTV" : "None"} format="text" variant="sage" data-testid="stat-dscr-binding" />
            <StatCard label="Final Max Loan" value={result.max_loan_binding} format="money" variant="sage" data-testid="stat-dscr-final-loan" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Amortizing DSCR" value={formatRatio(result.actual_dscr)} format="text" data-testid="stat-dscr-actual" />
            <StatCard label="IO DSCR" value={result.io_dscr ? formatRatio(result.io_dscr) : "N/A"} format="text" />
            <StatCard label="Monthly Payment (Amort)" value={result.monthly_payment_amortizing} format="money" />
            <StatCard label="Implied LTV" value={result.implied_ltv ? formatPct(result.implied_ltv) : "N/A"} format="text" />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Gauge
              data-testid="gauge-dscr"
              value={result.actual_dscr ?? 0}
              min={0}
              max={3}
              label="Amortizing DSCR"
              format={(v: number) => `${v.toFixed(2)}x`}
              thresholds={{ good: parseFloat(minDscr), warn: 1.0 }}
              markers={[parseFloat(minDscr), 1.0]}
              size="lg"
            />
            {result.io_dscr && (
              <Gauge
                data-testid="gauge-io-dscr"
                value={result.io_dscr}
                min={0}
                max={3}
                label="IO Period DSCR"
                format={(v: number) => `${v.toFixed(2)}x`}
                thresholds={{ good: parseFloat(minDscr), warn: 1.0 }}
                markers={[parseFloat(minDscr), 1.0]}
                size="lg"
              />
            )}
            <DonutChart
              data-testid="donut-loan-constraint"
              data={[
                { name: "DSCR Limit", value: result.max_loan_dscr ?? 0 },
                ...(result.max_loan_ltv ? [{ name: "LTV Limit", value: result.max_loan_ltv }] : []),
              ]}
              title="Loan Constraint Comparison"
              subtitle="Max loan by constraint type"
              centerValue={formatMoney(result.max_loan_binding)}
              centerLabel="Binding Limit"
              formatValue={(v: number) => formatMoney(v)}
              height={200}
            />
          </div>
          <InsightPanel
            data-testid="insight-dscr"
            variant="compact"
            title="Loan Sizing Insights"
            insights={[
              { text: `Binding constraint is ${result.binding_constraint === "dscr" ? "DSCR" : "LTV"}`, type: "neutral" as const },
              { text: "Actual DSCR", metric: formatRatio(result.actual_dscr), type: (result.actual_dscr ?? 0) >= parseFloat(minDscr) ? "positive" as const : "warning" as const },
              ...(result.implied_ltv ? [{ text: "Implied LTV", metric: formatPct(result.implied_ltv), type: (result.implied_ltv ?? 0) <= 0.75 ? "positive" as const : "warning" as const }] : []),
              { text: "Max loan amount", metric: formatMoney(result.max_loan_binding), type: "neutral" as const },
              ...(result.risk_premium_bps ? [{ text: "Moody's risk premium applied", metric: `+${result.risk_premium_bps} bps → ${(result.effective_rate * 100).toFixed(2)}%`, type: "warning" as const }] : []),
            ]}
          />
          {moodysData && (
            <div className="border border-border rounded-lg p-4 bg-muted/30" data-testid="moodys-credit-risk-panel">
              <div className="flex items-center gap-2 mb-3">
                <IconShield className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold">Moody's Credit Risk Metrics</h4>
                <Badge variant="secondary" className="text-xs" data-testid="badge-moodys-source">Moody's Analytics</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {moodysData.propertyRiskScore && (
                  <StatCard label="Property Risk Score" value={`${moodysData.propertyRiskScore.value} / 100`} format="text" data-testid="stat-moodys-risk-score" />
                )}
                {moodysData.defaultProbability && (
                  <StatCard label="Default Probability" value={`${(moodysData.defaultProbability.value * 100).toFixed(2)}%`} format="text" data-testid="stat-moodys-default-prob" />
                )}
                {moodysData.creditRating && (
                  <StatCard label="Credit Rating" value={moodysData.creditRating.value} format="text" data-testid="stat-moodys-credit-rating" />
                )}
                {moodysData.riskPremiumBps && (
                  <StatCard label="Risk Premium" value={`${moodysData.riskPremiumBps.value} bps`} format="text" data-testid="stat-moodys-risk-premium" />
                )}
                {moodysData.lossGivenDefault && (
                  <StatCard label="Loss Given Default" value={`${(moodysData.lossGivenDefault.value * 100).toFixed(1)}%`} format="text" data-testid="stat-moodys-lgd" />
                )}
                {moodysData.watchlistStatus && (
                  <StatCard label="Watchlist Status" value={moodysData.watchlistStatus.value} format="text" data-testid="stat-moodys-watchlist" />
                )}
              </div>
            </div>
          )}
          {moodysAvailable && !moodysData && (
            <p className="text-xs text-muted-foreground italic" data-testid="text-moodys-hint">Moody's credit risk data available — run research on a property to see risk metrics here.</p>
          )}
        </div>
      )}
    </div>
  );
}
