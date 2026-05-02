import { useProperty } from "@/context/PropertyContext";
import { fmtCurrency, fmtPct, getTypeLabel, getStableYearIndex, COLORS, FONTS } from "@/lib/slideUtils";

export default function Slide2PhotoGallery() {
  const { property, photos, financials, visionText } = useProperty();

  const name = property?.name ?? "—";
  const city = property?.city ?? "";
  const state = property?.stateProvince ?? "";
  const county = property?.county ?? "";
  const price = property?.purchasePrice ?? 0;
  const rooms = property?.roomCount ?? 0;
  const occ = Math.min(0.85, Math.max(0.55, property?.maxOccupancy ?? 0.70));

  const yearlyIS = financials?.yearlyIS ?? [];
  const stableIdx = getStableYearIndex(yearlyIS);
  const stable = yearlyIS[stableIdx] ?? {};
  const stableRev = (stable as { revenueTotal?: number }).revenueTotal ?? 0;
  const stableNOI = (stable as { noi?: number }).noi ?? 0;
  const irr = financials?.irr;
  const horizon = yearlyIS.length || 5;

  const renovBudget = Math.round(price * 0.35);
  const totalInv = price + renovBudget;

  const panelPhotos = photos.slice(2, 6);

  return (
    <div
      className="w-screen h-screen overflow-hidden flex flex-col"
      style={{ background: COLORS.darkBg }}
    >
      {/* Top Header */}
      <div
        style={{
          background: COLORS.darkBg,
          padding: "28px 40px 18px",
          borderBottom: "1px solid rgba(37,125,65,0.4)",
          flexShrink: 0,
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
                marginBottom: 4,
              }}
            >
              INVESTMENT SPOTLIGHT
            </div>
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 36,
                fontWeight: 400,
                color: COLORS.white,
                lineHeight: 1,
              }}
            >
              {name}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 10,
                color: COLORS.sage,
                letterSpacing: "0.05em",
              }}
            >
              {[city, state, county].filter(Boolean).join(" · ")}
            </div>
            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 9,
                color: COLORS.sage,
                letterSpacing: "0.05em",
                marginTop: 2,
              }}
            >
              {getTypeLabel(property?.hospitalityType, property?.businessModel)}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Photo panels */}
        <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
          {panelPhotos.length > 0 ? panelPhotos.map((ph, i) => (
            <div key={ph.id} style={{ flex: 1, position: "relative", borderRight: i < panelPhotos.length - 1 ? "2px solid rgba(28,43,30,0.8)" : "none" }}>
              <img
                src={ph.url}
                alt=""
                crossOrigin="anonymous"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )) : Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: `rgba(28,43,30,${0.6 + i * 0.1})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRight: i < 3 ? "2px solid rgba(28,43,30,0.8)" : "none",
              }}
            >
              <span style={{ fontFamily: FONTS.sans, color: COLORS.sage, fontSize: 12, opacity: 0.5 }}>L+B</span>
            </div>
          ))}
        </div>

        {/* Right Specs Panel */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            padding: "24px 28px",
            background: "rgba(20,32,22,0.95)",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {/* Financial specs */}
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: COLORS.sage,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Property Specs
          </div>

          {[
            ["Purchase Price", fmtCurrency(price)],
            ["Renovation Budget", fmtCurrency(renovBudget)],
            ["Total Investment", fmtCurrency(totalInv)],
            [`Stabilized Revenue (Yr ${stableIdx + 1})`, fmtCurrency(stableRev)],
            ["Projected NOI", fmtCurrency(stableNOI)],
            ["Est. IRR", irr ? `${fmtPct(irr)} / ${horizon} yr` : "See Financials"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "5px 0",
                borderBottom: "1px solid rgba(159,188,164,0.15)",
              }}
            >
              <span style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.sage, fontWeight: 300 }}>{label}</span>
              <span style={{ fontFamily: FONTS.serif, fontSize: 11, color: COLORS.white }}>{value}</span>
            </div>
          ))}

          {/* Divider */}
          <div style={{ height: 1, background: COLORS.accent, margin: "16px 0" }} />

          {/* The Vision / Operational model */}
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: COLORS.sage,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            The Vision
          </div>

          {visionText?.operationalModelText && (
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 12,
                color: COLORS.white,
                fontStyle: "italic",
                marginBottom: 8,
                lineHeight: 1.35,
              }}
            >
              {visionText.operationalModelText}
            </div>
          )}

          {visionText?.revenueBullet && (
            <div style={{ display: "flex", gap: 5, marginBottom: 4, alignItems: "flex-start" }}>
              <span style={{ color: COLORS.accent, fontSize: 9, flexShrink: 0, marginTop: 1 }}>▸</span>
              <span style={{ fontFamily: FONTS.sans, fontSize: 8.5, color: COLORS.sage, lineHeight: 1.4 }}>
                {visionText.revenueBullet}
              </span>
            </div>
          )}

          {visionText?.programmingBullet && (
            <div style={{ display: "flex", gap: 5, marginBottom: 10, alignItems: "flex-start" }}>
              <span style={{ color: COLORS.accent, fontSize: 9, flexShrink: 0, marginTop: 1 }}>▸</span>
              <span style={{ fontFamily: FONTS.sans, fontSize: 8.5, color: COLORS.sage, lineHeight: 1.4 }}>
                {visionText.programmingBullet}
              </span>
            </div>
          )}

          {visionText?.operationalParagraph && (
            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 8.5,
                color: "rgba(159,188,164,0.65)",
                lineHeight: 1.5,
              }}
            >
              {visionText.operationalParagraph}
            </div>
          )}

          {/* Footer */}
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 12,
              borderTop: "1px solid rgba(159,188,164,0.2)",
            }}
          >
            <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)", letterSpacing: "0.15em" }}>L+B</span>
            <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)" }}>PAGE 2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
