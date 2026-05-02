import { useProperty } from "@/context/PropertyContext";
import { getTypeLabel, getMarketInsight, COLORS, FONTS } from "@/lib/slideUtils";

export default function Slide3InvestmentModel() {
  const { property, photos, visionText } = useProperty();

  const name = property?.name ?? "—";
  const city = property?.city ?? "";
  const state = property?.stateProvince ?? "";
  const county = property?.county ?? "";
  const typeLabel = getTypeLabel(property?.hospitalityType, property?.businessModel);
  const market = getMarketInsight(city, state);

  const p0 = photos[0];
  const p1 = photos[1];
  const p2 = photos[2];

  return (
    <div
      className="w-screen h-screen overflow-hidden flex"
      style={{ background: COLORS.darkBg }}
    >
      {/* LEFT — Photo Stack (~45%) */}
      <div style={{ width: "45%", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {/* Top photo (large) */}
        <div style={{ flex: 2, position: "relative" }}>
          {p0 ? (
            <img src={p0.url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "#111d13", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: FONTS.sans, color: COLORS.sage, fontSize: 16, letterSpacing: "0.2em" }}>L+B</span>
            </div>
          )}
          {/* "L+B Model" overlay badge */}
          <div
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              background: "rgba(28,43,30,0.85)",
              border: `1px solid ${COLORS.accent}`,
              padding: "6px 12px",
            }}
          >
            <div style={{ fontFamily: FONTS.sans, fontSize: 9, fontWeight: 700, color: COLORS.accent, letterSpacing: "0.15em", textTransform: "uppercase" }}>
              L+B Model
            </div>
          </div>
        </div>
        {/* Bottom two photos */}
        <div style={{ flex: 1, display: "flex" }}>
          {[p1, p2].map((ph, i) => (
            <div key={i} style={{ flex: 1, position: "relative", borderLeft: i === 1 ? "2px solid rgba(28,43,30,0.8)" : "none" }}>
              {ph ? (
                <img src={ph.url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", background: `rgba(20,32,22,${0.7 + i * 0.1})` }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT — Content (~55%) */}
      <div
        style={{
          flex: 1,
          padding: "36px 40px 28px 44px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
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
            INVESTMENT MODEL
          </div>
          <div
            style={{
              fontFamily: FONTS.serif,
              fontSize: 32,
              fontWeight: 400,
              color: COLORS.white,
              lineHeight: 1.1,
              marginBottom: 3,
            }}
          >
            {name}
          </div>
          <div style={{ fontFamily: FONTS.sans, fontSize: 10, color: COLORS.sage, letterSpacing: "0.05em" }}>
            {city}{city && state ? `, ${state}` : state} · {typeLabel}
          </div>
        </div>

        <div style={{ height: 1, background: COLORS.accent, marginBottom: 16 }} />

        {/* THE CONCEPT */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: COLORS.sage,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            THE CONCEPT
          </div>
          <div
            style={{
              fontFamily: FONTS.serif,
              fontSize: 13,
              color: COLORS.white,
              fontStyle: "italic",
              lineHeight: 1.45,
              marginBottom: 6,
            }}
          >
            {visionText?.investmentModelConcept ?? `Not a hotel — a managed boutique experience in ${city} built on curated programming.`}
          </div>
          <div style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.sage }}>
            Model: {visionText?.operationalModelText ?? "Direct Ownership + Active Management + Curated Programming"}
          </div>
        </div>

        {/* Strategic Details */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: COLORS.sage,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Strategic Details
          </div>
          {[
            [`Location`, `${city}, ${state}`],
            [`Market`, market],
            [`Asset Type`, typeLabel],
            [`Strategy`, visionText?.operationalModelText ?? "Direct ownership + active management"],
            [`Structure`, "Single-asset acquisition — lean, replicable ownership"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 3,
                paddingBottom: 3,
                borderBottom: "1px solid rgba(159,188,164,0.12)",
              }}
            >
              <span style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.sage, fontWeight: 300, flexShrink: 0, minWidth: 60 }}>{label}:</span>
              <span style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.sage, lineHeight: 1.3 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Why This Property? */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: COLORS.sage,
              textTransform: "uppercase",
              marginBottom: 5,
            }}
          >
            Why This Property?
          </div>
          <div style={{ fontFamily: FONTS.sans, fontSize: 9.5, color: COLORS.sage, lineHeight: 1.5 }}>
            {visionText?.marketRationale ?? `Boutique supply constrained in ${city}; demand growing from drive-market leisure.`}
          </div>
        </div>

        {/* Why This Model? */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: COLORS.sage,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Why This Model?
          </div>
          {[
            [visionText?.reason1Label ?? "Predictable advance-booked revenue", visionText?.reason1Detail ?? "Group bookings lock in 60–80% of annual revenue 3–6 months before arrival."],
            [visionText?.reason2Label ?? "Premium ADR vs. standard hospitality", visionText?.reason2Detail ?? "Programming + all-inclusive structure drives $50–$150/night premium."],
            [visionText?.reason3Label ?? "Replicable, asset-light scale path", visionText?.reason3Detail ?? "Model can replicate to 2–3 additional sites without brand dilution."],
          ].map(([label, detail], i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  background: COLORS.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                <span style={{ fontFamily: FONTS.sans, fontSize: 8, fontWeight: 700, color: COLORS.white }}>{i + 1}</span>
              </div>
              <div>
                <div style={{ fontFamily: FONTS.sans, fontSize: 9, fontWeight: 600, color: COLORS.white, marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: FONTS.sans, fontSize: 8.5, color: COLORS.sage, lineHeight: 1.4 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Closing line */}
        {visionText?.closingLine && (
          <div
            style={{
              fontFamily: FONTS.serif,
              fontSize: 11,
              fontStyle: "italic",
              color: COLORS.sage,
              borderTop: "1px solid rgba(37,125,65,0.4)",
              paddingTop: 10,
              marginBottom: 6,
            }}
          >
            {visionText.closingLine}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 8,
            borderTop: "1px solid rgba(159,188,164,0.2)",
          }}
        >
          <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)", letterSpacing: "0.15em" }}>L+B</span>
          <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)" }}>PAGE 3</span>
        </div>
      </div>
    </div>
  );
}
