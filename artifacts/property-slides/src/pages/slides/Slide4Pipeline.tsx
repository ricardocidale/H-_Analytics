import { useProperty } from "@/context/PropertyContext";
import { fmtCurrency, getTypeLabel, getStatusLabel, COLORS, FONTS } from "@/lib/slideUtils";

interface CardProps {
  name: string;
  city?: string;
  state?: string;
  price?: number;
  typeLabel: string;
  statusLabel: string;
  photoUrl?: string;
  isPrimary?: boolean;
}

function PropertyCard({ name, city, state, price, typeLabel, statusLabel, photoUrl, isPrimary }: CardProps) {
  const location = [city, state].filter(Boolean).join(", ");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: isPrimary ? "rgba(37,125,65,0.12)" : "rgba(20,32,22,0.7)",
        border: `1px solid ${isPrimary ? COLORS.accent : "rgba(122,170,136,0.25)"}`,
        overflow: "hidden",
        height: "100%",
      }}
    >
      {/* Photo */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {photoUrl ? (
          <img src={photoUrl} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: isPrimary ? "rgba(37,125,65,0.15)" : "rgba(28,43,30,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontFamily: FONTS.sans, color: COLORS.muted, fontSize: isPrimary ? 14 : 10, letterSpacing: "0.2em" }}>L+B</span>
          </div>
        )}
        {/* Status badge */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            background: "rgba(28,43,30,0.85)",
            padding: "2px 6px",
            border: isPrimary ? `1px solid ${COLORS.accent}` : "none",
          }}
        >
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: 7,
              fontWeight: 600,
              color: isPrimary ? COLORS.accent : COLORS.muted,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Card info */}
      <div style={{ padding: isPrimary ? "10px 12px" : "7px 10px", flexShrink: 0 }}>
        <div
          style={{
            fontFamily: FONTS.serif,
            fontSize: isPrimary ? 16 : 12,
            fontWeight: 400,
            color: COLORS.white,
            lineHeight: 1.2,
            marginBottom: 3,
          }}
        >
          {name}
        </div>
        {location && (
          <div style={{ fontFamily: FONTS.sans, fontSize: 8, color: COLORS.muted, marginBottom: 3 }}>
            {location}
          </div>
        )}
        {price ? (
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              color: isPrimary ? COLORS.accent : COLORS.sage,
            }}
          >
            {fmtCurrency(price)}
          </div>
        ) : (
          <div style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)" }}>Coming Soon</div>
        )}
      </div>
    </div>
  );
}

export default function Slide4Pipeline() {
  const { property, photos, siblings } = useProperty();

  const name = property?.name ?? "—";
  const city = property?.city ?? "";
  const state = property?.stateProvince ?? "";
  const typeLabel = getTypeLabel(property?.hospitalityType, property?.businessModel);
  const statusLabel = getStatusLabel(property?.acquisitionStatus);
  const price = property?.purchasePrice ?? 0;
  const heroPhoto = photos.find(p => p.isHero) ?? photos[0];

  const nSiblings = siblings.length;

  const slots = [
    {
      name,
      city,
      state,
      price,
      typeLabel,
      statusLabel,
      photoUrl: heroPhoto?.url,
      isPrimary: true,
    },
    ...siblings.slice(0, 4).map(s => ({
      name: s.name ?? "Pipeline Property",
      city: s.city ?? "",
      state: s.stateProvince ?? "",
      price: s.purchasePrice,
      typeLabel: getTypeLabel(s.hospitalityType),
      statusLabel: getStatusLabel(s.acquisitionStatus),
      photoUrl: undefined,
      isPrimary: false,
    })),
    ...Array.from({ length: Math.max(0, 4 - siblings.length) }).map((_, i) => ({
      name: "Coming Soon",
      city: "",
      state: "",
      price: undefined,
      typeLabel: "Pipeline",
      statusLabel: "Pipeline",
      photoUrl: undefined,
      isPrimary: false,
    })),
  ].slice(0, 5);

  return (
    <div
      className="w-screen h-screen overflow-hidden flex flex-col"
      style={{ background: COLORS.darkBg }}
    >
      {/* Header */}
      <div
        style={{
          padding: "28px 40px 16px",
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
                marginBottom: 4,
              }}
            >
              PROPERTY PIPELINE
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
              {state || "Portfolio"} Pipeline Overview
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.sage }}>
              {name} + {nSiblings} related {nSiblings === 1 ? "property" : "properties"}
            </div>
          </div>
        </div>
      </div>

      {/* Card Grid — 5 cards */}
      <div style={{ flex: 1, display: "flex", padding: "20px 32px 16px", gap: 12 }}>
        {/* Primary card (wider) */}
        <div style={{ flex: 1.5, minWidth: 0 }}>
          <PropertyCard {...slots[0]} />
        </div>

        {/* Secondary cards */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {/* Top row: 2 cards */}
          <div style={{ flex: 1, display: "flex", gap: 12 }}>
            {slots.slice(1, 3).map((card, i) => (
              <div key={i} style={{ flex: 1, minWidth: 0 }}>
                <PropertyCard {...card} />
              </div>
            ))}
          </div>
          {/* Bottom row: 2 cards */}
          <div style={{ flex: 1, display: "flex", gap: 12 }}>
            {slots.slice(3, 5).map((card, i) => (
              <div key={i} style={{ flex: 1, minWidth: 0 }}>
                <PropertyCard {...card} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tagline + Footer */}
      <div
        style={{
          padding: "10px 40px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid rgba(159,188,164,0.2)",
        }}
      >
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: 9,
            fontWeight: 600,
            color: COLORS.muted,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          STRATEGIC FILTER · CURATED BOUTIQUE HOSPITALITY ASSETS
        </span>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)", letterSpacing: "0.15em" }}>L+B</span>
          <span style={{ fontFamily: FONTS.sans, fontSize: 8, color: "rgba(159,188,164,0.5)" }}>PAGE 4</span>
        </div>
      </div>
    </div>
  );
}
