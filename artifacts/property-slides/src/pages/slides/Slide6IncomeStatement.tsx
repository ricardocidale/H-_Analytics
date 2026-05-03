import { useProperty } from "@/context/PropertyContext";
import { fmtCurrency, fmtPct, getStableYearIndex, COLORS, FONTS } from "@/lib/slideUtils";

interface YearlyIS {
  year?: number;
  revenueTotal?: number;
  totalExpenses?: number;
  noi?: number;
  gop?: number;
  operationalMonthsInYear?: number;
}

interface YearlyCF {
  year?: number;
  debtService?: number;
  netCashFlowToInvestors?: number;
  cumulativeCashFlow?: number;
  exitValue?: number;
}

function HeaderCell({ children, year }: { children?: React.ReactNode; year?: boolean }) {
  return (
    <th
      style={{
        fontFamily: FONTS.sans,
        fontSize: 8,
        fontWeight: 600,
        color: year ? COLORS.accent : COLORS.muted,
        letterSpacing: year ? "0.05em" : "0.12em",
        textAlign: "right",
        padding: "4px 8px 4px 4px",
        borderBottom: `1px solid ${COLORS.accent}`,
        textTransform: "uppercase",
        background: "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function LabelCell({ children, sub }: { children: React.ReactNode; sub?: boolean }) {
  return (
    <td
      style={{
        fontFamily: FONTS.sans,
        fontSize: 8.5,
        fontWeight: sub ? 300 : 400,
        color: sub ? "rgba(159,188,164,0.7)" : COLORS.muted,
        padding: "3px 4px",
        paddingLeft: sub ? 12 : 0,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

function ValueCell({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <td
      style={{
        fontFamily: FONTS.serif,
        fontSize: highlight ? 10 : 9,
        fontWeight: 400,
        color: highlight ? COLORS.white : "rgba(255,249,245,0.8)",
        textAlign: "right",
        padding: "3px 8px 3px 4px",
        background: highlight ? "rgba(37,125,65,0.08)" : "transparent",
      }}
    >
      {children}
    </td>
  );
}

export default function Slide6IncomeStatement() {
  const { property, financials } = useProperty();

  const name = property?.name ?? "—";
  const city = property?.city ?? "";
  const state = property?.stateProvince ?? "";
  const price = property?.purchasePrice ?? 0;

  const yearlyIS: YearlyIS[] = (financials?.yearlyIS ?? []).slice(0, 5);
  const yearlyCF: YearlyCF[] = (financials?.yearlyCF ?? []).slice(0, 5);
  const stableIdx = getStableYearIndex(yearlyIS as Parameters<typeof getStableYearIndex>[0]);

  const loanAmount = financials?.loanAmount ?? 0;
  const loanLtv = financials?.loanLtv ?? 0;
  const annDebt = financials?.annualDebtService ?? 0;
  const irr = financials?.irr;
  const equityMultiple = financials?.equityMultiple;
  const exitCapRate = financials?.exitCapRate ?? property?.exitCapRate ?? 0.055;

  const stableNOI = yearlyIS[stableIdx]?.noi ?? 0;
  const exitValue = stableNOI > 0 ? stableNOI / exitCapRate : 0;
  const equity = (price + Math.round(price * 0.35)) - loanAmount;
  const horizon = yearlyIS.length || 5;

  const years = yearlyIS.length > 0
    ? yearlyIS.map((_, i) => `Yr ${i + 1}`)
    : Array.from({ length: 5 }, (_, i) => `Yr ${i + 1}`);

  function isRow(rows: YearlyIS[], key: keyof YearlyIS, idx: number) {
    return rows[idx]?.[key];
  }

  return (
    <div
      className="w-screen h-screen overflow-hidden flex flex-col"
      style={{ background: COLORS.darkBg }}
    >
      {/* Header */}
      <div
        style={{
          padding: "24px 40px 12px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(37,125,65,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.28em",
                color: COLORS.muted,
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              INCOME STATEMENT
            </div>
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 32,
                fontWeight: 400,
                color: COLORS.white,
                lineHeight: 1,
              }}
            >
              {name}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.sage }}>
              {city}{city && state ? `, ${state}` : state}
            </div>
            <div style={{ fontFamily: FONTS.sans, fontSize: 8.5, color: COLORS.muted, marginTop: 2 }}>
              {horizon}-year pro forma · Stabilized Year {stableIdx + 1}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", padding: "16px 24px 0 28px", gap: 28, minHeight: 0 }}>
        {/* Left — IS Table */}
        <div style={{ flex: 1.7, minWidth: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <HeaderCell>Line Item</HeaderCell>
                {years.map(y => <HeaderCell key={y} year>{y}</HeaderCell>)}
              </tr>
            </thead>
            <tbody>
              {/* Revenue */}
              <tr style={{ background: "rgba(37,125,65,0.05)" }}>
                <LabelCell>Gross Revenue</LabelCell>
                {yearlyIS.length > 0
                  ? yearlyIS.map((row, i) => <ValueCell key={i} highlight>{fmtCurrency(row.revenueTotal, true)}</ValueCell>)
                  : years.map((_, i) => <ValueCell key={i}>—</ValueCell>)
                }
              </tr>
              {/* Expenses */}
              <tr>
                <LabelCell sub>Operating Expenses</LabelCell>
                {yearlyIS.length > 0
                  ? yearlyIS.map((row, i) => <ValueCell key={i}>{fmtCurrency(row.totalExpenses, true)}</ValueCell>)
                  : years.map((_, i) => <ValueCell key={i}>—</ValueCell>)
                }
              </tr>
              {/* GOP */}
              <tr style={{ background: "rgba(159,188,164,0.04)" }}>
                <LabelCell>Gross Operating Profit</LabelCell>
                {yearlyIS.length > 0
                  ? yearlyIS.map((row, i) => <ValueCell key={i}>{fmtCurrency(row.gop, true)}</ValueCell>)
                  : years.map((_, i) => <ValueCell key={i}>—</ValueCell>)
                }
              </tr>
              {/* NOI */}
              <tr style={{ background: "rgba(37,125,65,0.08)" }}>
                <LabelCell>Net Operating Income</LabelCell>
                {yearlyIS.length > 0
                  ? yearlyIS.map((row, i) => <ValueCell key={i} highlight>{fmtCurrency(row.noi, true)}</ValueCell>)
                  : years.map((_, i) => <ValueCell key={i}>—</ValueCell>)
                }
              </tr>
              {/* NOI Margin */}
              <tr>
                <LabelCell sub>NOI Margin</LabelCell>
                {yearlyIS.length > 0
                  ? yearlyIS.map((row, i) => (
                    <ValueCell key={i}>
                      {row.revenueTotal && row.noi ? fmtPct(row.noi / row.revenueTotal) : "—"}
                    </ValueCell>
                  ))
                  : years.map((_, i) => <ValueCell key={i}>—</ValueCell>)
                }
              </tr>
              {/* Debt Service */}
              {yearlyCF.length > 0 && (
                <tr>
                  <LabelCell sub>Debt Service</LabelCell>
                  {yearlyCF.map((row, i) => <ValueCell key={i}>{fmtCurrency(row.debtService, true)}</ValueCell>)}
                </tr>
              )}
              {/* NCFI */}
              {yearlyCF.length > 0 && (
                <tr style={{ background: "rgba(37,125,65,0.1)" }}>
                  <LabelCell>Cash Flow to Investors</LabelCell>
                  {yearlyCF.map((row, i) => <ValueCell key={i} highlight>{fmtCurrency(row.netCashFlowToInvestors, true)}</ValueCell>)}
                </tr>
              )}
              {/* Cumulative */}
              {yearlyCF.length > 0 && (
                <tr>
                  <LabelCell sub>Cumulative Cash Flow</LabelCell>
                  {yearlyCF.map((row, i) => <ValueCell key={i}>{fmtCurrency(row.cumulativeCashFlow, true)}</ValueCell>)}
                </tr>
              )}
              {/* Exit Value — show only in last year col */}
              {yearlyCF.length > 0 && (
                <tr style={{ background: "rgba(37,125,65,0.08)" }}>
                  <LabelCell>Exit Value</LabelCell>
                  {yearlyCF.map((row, i) => (
                    <ValueCell key={i} highlight>
                      {i === yearlyCF.length - 1 && row.exitValue ? fmtCurrency(row.exitValue, true) : "—"}
                    </ValueCell>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right — Investor Key Metrics */}
        <div style={{ flex: 0.85, minWidth: 180, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: COLORS.muted,
              textTransform: "uppercase",
              marginBottom: 6,
              paddingBottom: 4,
              borderBottom: `1px solid ${COLORS.accent}`,
            }}
          >
            Key Investor Metrics
          </div>

          {[
            ["Purchase Price", fmtCurrency(price)],
            ["Total Investment", fmtCurrency(price + Math.round(price * 0.35))],
            ["Equity Invested", fmtCurrency(equity)],
            ["Loan Amount", fmtCurrency(loanAmount)],
            ["LTV", fmtPct(loanLtv)],
            ["Annual Debt Service", fmtCurrency(annDebt)],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "3.5px 0",
                borderBottom: "1px solid rgba(159,188,164,0.1)",
              }}
            >
              <span style={{ fontFamily: FONTS.sans, fontSize: 8.5, color: COLORS.muted, fontWeight: 300 }}>{label}</span>
              <span style={{ fontFamily: FONTS.serif, fontSize: 10, color: "rgba(255,249,245,0.85)" }}>{value}</span>
            </div>
          ))}

          <div style={{ height: 1, background: COLORS.accent, margin: "10px 0" }} />

          {[
            [irr ? `IRR (${horizon} yr)` : "IRR", irr ? fmtPct(irr) : "—", true],
            ["Equity Multiple", equityMultiple ? `${equityMultiple.toFixed(2)}×` : "—", true],
            ["Exit Value", fmtCurrency(exitValue), false],
            ["Exit Cap Rate", fmtPct(exitCapRate), false],
            ["Equity at Exit", fmtCurrency(exitValue - loanAmount), true],
          ].map(([label, value, highlight]) => (
            <div
              key={String(label)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "4px 0",
                borderBottom: "1px solid rgba(159,188,164,0.1)",
                background: highlight ? "rgba(37,125,65,0.06)" : "transparent",
                paddingLeft: highlight ? 6 : 0,
                paddingRight: highlight ? 6 : 0,
              }}
            >
              <span style={{ fontFamily: FONTS.sans, fontSize: 8.5, color: highlight ? COLORS.white : COLORS.muted, fontWeight: highlight ? 600 : 300 }}>{label}</span>
              <span style={{ fontFamily: FONTS.serif, fontSize: highlight ? 11 : 10, color: highlight ? COLORS.white : "rgba(255,249,245,0.85)" }}>{value}</span>
            </div>
          ))}

          <div style={{ flex: 1 }} />

          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 7.5,
              color: "rgba(159,188,164,0.4)",
              lineHeight: 1.4,
              borderTop: "1px solid rgba(159,188,164,0.15)",
              paddingTop: 8,
              marginTop: 6,
            }}
          >
            Projections are modeled estimates. Not a guarantee of returns. Not an offering of securities.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid rgba(159,188,164,0.2)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: FONTS.sans, fontSize: 7.5, color: "rgba(159,188,164,0.35)" }}>
          Confidential — L+B Hospitality
        </span>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)", letterSpacing: "0.15em" }}>L+B</span>
          <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)" }}>PAGE 6</span>
        </div>
      </div>
    </div>
  );
}
