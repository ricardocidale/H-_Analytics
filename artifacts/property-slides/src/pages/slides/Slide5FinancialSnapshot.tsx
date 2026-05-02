import { useProperty } from "@/context/PropertyContext";
import { fmtCurrency, fmtPct, getStableYearIndex, COLORS, FONTS } from "@/lib/slideUtils";

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONTS.sans,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.18em",
        color: COLORS.sage,
        textTransform: "uppercase",
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: `1px solid ${COLORS.accent}`,
      }}
    >
      {children}
    </div>
  );
}

function TableRow({
  label,
  value,
  highlight,
  indent,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "3px 0",
        borderBottom: "1px solid rgba(159,188,164,0.1)",
        paddingLeft: indent ? 10 : 0,
        background: highlight ? "rgba(37,125,65,0.08)" : "transparent",
      }}
    >
      <span
        style={{
          fontFamily: FONTS.sans,
          fontSize: 8.5,
          color: highlight ? COLORS.white : COLORS.sage,
          fontWeight: highlight ? 600 : 300,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: FONTS.serif,
          fontSize: highlight ? 12 : 10,
          color: highlight ? COLORS.white : "rgba(255,249,245,0.85)",
          fontWeight: highlight ? 400 : 300,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function Slide5FinancialSnapshot() {
  const { property, financials, visionText } = useProperty();

  const price = property?.purchasePrice ?? 0;
  const rooms = property?.roomCount ?? 0;
  const adr = property?.startAdr ?? 0;
  const occ = Math.min(0.85, Math.max(0.55, property?.maxOccupancy ?? 0.70));
  const revpar = adr * occ;

  const yearlyIS = financials?.yearlyIS ?? [];
  const stableIdx = getStableYearIndex(yearlyIS);
  const stable = yearlyIS[stableIdx] ?? {};
  const stableRev = (stable as { revenueTotal?: number }).revenueTotal ?? 0;
  const stableNOI = (stable as { noi?: number }).noi ?? 0;
  const stableGOP = (stable as { gop?: number }).gop ?? 0;

  const loanAmount = financials?.loanAmount ?? 0;
  const loanLtv = financials?.loanLtv ?? 0;
  const annDebt = financials?.annualDebtService ?? 0;
  const irr = financials?.irr;
  const equityMultiple = financials?.equityMultiple;
  const exitCapRate = financials?.exitCapRate ?? property?.exitCapRate ?? 0.055;
  const exitValue = stableNOI > 0 ? stableNOI / exitCapRate : 0;
  const renovation = Math.round(price * 0.35);
  const totalInv = price + renovation;
  const equity = totalInv - loanAmount;

  const name = property?.name ?? "—";
  const city = property?.city ?? "";
  const state = property?.stateProvince ?? "";
  const horizon = yearlyIS.length || 5;

  return (
    <div
      className="w-screen h-screen overflow-hidden flex flex-col"
      style={{ background: COLORS.darkBg }}
    >
      {/* Header */}
      <div
        style={{
          padding: "26px 40px 14px",
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
                color: COLORS.sage,
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              FINANCIAL SNAPSHOT
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
            <div style={{ fontFamily: FONTS.sans, fontSize: 9.5, color: COLORS.sage }}>
              {city}{city && state ? `, ${state}` : state}
            </div>
            <div style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.sage, marginTop: 2 }}>
              Stabilized Year {stableIdx + 1} · {horizon}-year horizon
            </div>
          </div>
        </div>
      </div>

      {/* Body — 3 columns */}
      <div style={{ flex: 1, display: "flex", padding: "18px 28px 0", gap: 24, minHeight: 0 }}>
        {/* Column 1 — Transformation Plan */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <TableHeader>Transformation Plan</TableHeader>
          <TableRow label="Purchase Price" value={fmtCurrency(price)} />
          <TableRow label="Renovation Budget" value={fmtCurrency(renovation)} />
          <TableRow label="Closing / Transaction Costs" value={fmtCurrency(price * 0.025)} />
          <TableRow label="Working Capital Reserve" value={fmtCurrency(Math.round(stableRev * 0.1) || 50_000)} />
          <TableRow label="Total Project Cost" value={fmtCurrency(totalInv)} highlight />

          <div style={{ marginTop: 14 }}>
            <TableHeader>Stable Year Snapshot (Yr {stableIdx + 1})</TableHeader>
            <TableRow label="Gross Revenue" value={fmtCurrency(stableRev)} />
            <TableRow label="NOI" value={fmtCurrency(stableNOI)} />
            <TableRow label="NOI Margin" value={stableRev > 0 ? fmtPct(stableNOI / stableRev) : "—"} />
            <TableRow label="RevPAR" value={fmtCurrency(revpar)} />
            <TableRow label="ADR" value={fmtCurrency(adr)} />
            <TableRow label="Occ. Rate" value={fmtPct(occ)} />
            <TableRow label="Rooms" value={String(rooms)} />
            <TableRow label="Exit Value (est.)" value={fmtCurrency(exitValue)} highlight />
          </div>
        </div>

        {/* Column 2 — Financing Summary */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <TableHeader>Financing Summary</TableHeader>
          <TableRow label="Total Project Cost" value={fmtCurrency(totalInv)} />
          <TableRow label="Loan Amount" value={fmtCurrency(loanAmount)} />
          <TableRow label="LTV" value={fmtPct(loanLtv)} />
          <TableRow label="Equity Invested" value={fmtCurrency(equity)} highlight />
          <TableRow label="Annual Debt Service" value={fmtCurrency(annDebt)} />
          <TableRow label="Exit Cap Rate" value={fmtPct(exitCapRate)} />

          {/* Gap filler before key metrics */}
          <div style={{ height: 14 }} />

          <TableHeader>Investor Metrics</TableHeader>
          <TableRow label={`Projected IRR (${horizon} yr)`} value={irr ? fmtPct(irr) : "—"} highlight />
          <TableRow label="Equity Multiple" value={equityMultiple ? `${equityMultiple.toFixed(2)}×` : "—"} highlight />
          <TableRow label="Est. Exit Value" value={fmtCurrency(exitValue)} />
          <TableRow label="Equity at Exit" value={fmtCurrency(exitValue - loanAmount)} highlight />
        </div>

        {/* Column 3 — Vision + Transformation Description */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <TableHeader>Investment Narrative</TableHeader>

          <div
            style={{
              fontFamily: FONTS.serif,
              fontSize: 13,
              fontStyle: "italic",
              color: COLORS.white,
              lineHeight: 1.45,
              marginBottom: 12,
            }}
          >
            {visionText?.investmentModelConcept ?? "A curated boutique hospitality asset positioned for institutional-quality returns."}
          </div>

          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              color: COLORS.sage,
              lineHeight: 1.6,
              marginBottom: 14,
            }}
          >
            {visionText?.transformationDescription ?? "Acquires an underperforming asset and repositions through targeted renovation, brand identity, and programming."}
          </div>

          <div style={{ height: 1, background: "rgba(37,125,65,0.4)", marginBottom: 12 }} />

          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              color: COLORS.sage,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Key Drivers
          </div>
          {[
            visionText?.revenueBullet ?? "Advance-booked group and retreat revenue",
            visionText?.programmingBullet ?? "Premium ADR from curated programming",
            "Asset-backed, cash-flowing real estate position",
          ].map((bullet, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5, alignItems: "flex-start" }}>
              <span style={{ color: COLORS.accent, fontSize: 10, flexShrink: 0, marginTop: 0 }}>▸</span>
              <span style={{ fontFamily: FONTS.sans, fontSize: 8.5, color: COLORS.sage, lineHeight: 1.4 }}>{bullet}</span>
            </div>
          ))}

          <div style={{ flex: 1 }} />

          {visionText?.closingLine && (
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 10,
                fontStyle: "italic",
                color: COLORS.sage,
                borderTop: "1px solid rgba(122,170,136,0.25)",
                paddingTop: 8,
              }}
            >
              {visionText.closingLine}
            </div>
          )}
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
        <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.4)" }}>
          Projections are estimates based on market data. Not an offering of securities.
        </span>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)", letterSpacing: "0.15em" }}>L+B</span>
          <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)" }}>PAGE 5</span>
        </div>
      </div>
    </div>
  );
}
