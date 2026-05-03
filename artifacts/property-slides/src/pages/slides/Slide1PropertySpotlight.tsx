import { useProperty } from "@/context/PropertyContext";
import { fmtCurrency, fmtPct, getStatusLabel, getTypeLabel, COLORS, FONTS } from "@/lib/slideUtils";

function PhotoPanel({ url, alt }: { url?: string; alt?: string }) {
  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#111d13" }}>
        <span style={{ fontFamily: FONTS.sans, color: COLORS.muted, fontSize: 24, letterSpacing: "0.2em" }}>L+B</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt ?? "Property"}
      crossOrigin="anonymous"
      className="w-full h-full object-cover"
    />
  );
}

export default function Slide1PropertySpotlight() {
  const { property, photos, visionText, loading } = useProperty();

  const heroPhoto = photos.find(p => p.isHero) ?? photos[0];
  const secondPhoto = photos.find(p => !p.isHero && p !== heroPhoto) ?? photos[1];

  const typeLabel = property ? getTypeLabel(property.hospitalityType, property.businessModel) : "Boutique Hotel";
  const statusLabel = property ? getStatusLabel(property.acquisitionStatus) : "Pipeline";
  const city = property?.city ?? "";
  const state = property?.stateProvince ?? "";
  const county = property?.county ?? "";
  const name = property?.name ?? "—";
  const price = property?.purchasePrice ?? 0;
  const rooms = property?.roomCount ?? 0;
  const adr = property?.startAdr ?? 0;
  const occ = Math.min(0.85, Math.max(0.55, property?.maxOccupancy ?? 0.70));
  const revpar = adr * occ;

  if (loading && !property) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ background: COLORS.darkBg }}>
        <span style={{ fontFamily: FONTS.sans, color: COLORS.muted, fontSize: 20 }}>Loading…</span>
      </div>
    );
  }

  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex"
      style={{ background: COLORS.darkBg }}
    >
      {/* LEFT — Hero Photo Panel (~55%) */}
      <div className="relative flex-shrink-0" style={{ width: "55%", height: "100%" }}>
        <PhotoPanel url={heroPhoto?.url} alt={name} />
        {/* Gradient overlay at bottom for caption */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: "35%",
            background: "linear-gradient(to top, rgba(28,43,30,0.95) 0%, transparent 100%)",
          }}
        />
        {/* Cinematic caption */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ padding: "0 32px 32px 32px" }}
        >
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: "0.22em",
              color: COLORS.muted,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {visionText?.cinematicCaption ?? (rooms ? `${rooms} KEYS · ${typeLabel.toUpperCase()}` : typeLabel.toUpperCase())}
          </div>
          {secondPhoto && (
            <div
              style={{
                width: 120,
                height: 80,
                overflow: "hidden",
                border: `1px solid rgba(122,170,136,0.4)`,
                marginTop: 12,
              }}
            >
              <img
                src={secondPhoto.url}
                alt=""
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Content Panel (~45%) */}
      <div
        className="flex flex-col flex-1 overflow-hidden"
        style={{ padding: "40px 40px 32px 48px", background: COLORS.darkBg }}
      >
        {/* Top label */}
        <div style={{ marginBottom: 6 }}>
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.28em",
              color: COLORS.muted,
              textTransform: "uppercase",
            }}
          >
            INVESTMENT SPOTLIGHT
          </span>
        </div>

        {/* Property name */}
        <div
          style={{
            fontFamily: FONTS.serif,
            fontSize: 42,
            fontWeight: 400,
            color: COLORS.white,
            lineHeight: 1.05,
            marginBottom: 6,
          }}
        >
          {name}
        </div>

        {/* Type + status */}
        <div style={{ marginBottom: 4 }}>
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: 11,
              color: COLORS.sage,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {typeLabel}
          </span>
          <span style={{ color: COLORS.muted, margin: "0 8px" }}>·</span>
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: 11,
              color: COLORS.muted,
              letterSpacing: "0.06em",
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Location */}
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 11,
            color: COLORS.muted,
            letterSpacing: "0.04em",
            marginBottom: 16,
          }}
        >
          {[city, state, county].filter(Boolean).join(" · ")}
        </div>

        {/* Green divider */}
        <div style={{ height: 1, background: COLORS.accent, marginBottom: 16, width: "100%" }} />

        {/* Asking Price */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              color: COLORS.muted,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            ASKING PRICE
          </div>
          <div
            style={{
              fontFamily: FONTS.serif,
              fontSize: 34,
              fontWeight: 400,
              color: COLORS.white,
              lineHeight: 1,
            }}
          >
            {fmtCurrency(price)}
          </div>
        </div>

        {/* Thin divider */}
        <div style={{ height: 1, background: "rgba(159,188,164,0.25)", marginBottom: 14 }} />

        {/* Property Specs */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              color: COLORS.muted,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Property Specs
          </div>
          {[
            [`${rooms} Keys / Guest Rooms`, ""],
            [`ADR`, fmtCurrency(adr) + " / night"],
            [`Stabilized Occupancy`, fmtPct(occ)],
            [`RevPAR`, fmtCurrency(revpar)],
            [`Type`, typeLabel],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 4,
                borderBottom: "1px solid rgba(159,188,164,0.15)",
                paddingBottom: 4,
              }}
            >
              <span style={{ fontFamily: FONTS.sans, fontSize: 10, color: COLORS.sage, fontWeight: 300 }}>
                {label}
              </span>
              {value && (
                <span style={{ fontFamily: FONTS.serif, fontSize: 12, color: COLORS.white }}>
                  {value}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* The Vision */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              fontWeight: 600,
              color: COLORS.muted,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            The Vision
          </div>

          {visionText?.visionHeadline && (
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 14,
                color: COLORS.white,
                fontStyle: "italic",
                marginBottom: 6,
                lineHeight: 1.3,
              }}
            >
              {visionText.visionHeadline}
            </div>
          )}

          {visionText?.visionBullet1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 3, alignItems: "flex-start" }}>
              <span style={{ color: COLORS.accent, fontSize: 10, marginTop: 1, flexShrink: 0 }}>▸</span>
              <span style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.muted, lineHeight: 1.4 }}>
                {visionText.visionBullet1}
              </span>
            </div>
          )}

          {visionText?.visionBullet2 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{ color: COLORS.accent, fontSize: 10, marginTop: 1, flexShrink: 0 }}>▸</span>
              <span style={{ fontFamily: FONTS.sans, fontSize: 9, color: COLORS.muted, lineHeight: 1.4 }}>
                {visionText.visionBullet2}
              </span>
            </div>
          )}

          {visionText?.badgeText && (
            <div
              style={{
                display: "inline-block",
                padding: "3px 10px",
                border: `1px solid ${COLORS.accent}`,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 8,
                  fontWeight: 600,
                  color: COLORS.accent,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                {visionText.badgeText}
              </span>
            </div>
          )}

          {visionText?.descriptionParagraph && (
            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 9,
                color: "rgba(159,188,164,0.7)",
                lineHeight: 1.5,
              }}
            >
              {visionText.descriptionParagraph}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 12,
            borderTop: "1px solid rgba(159,188,164,0.2)",
          }}
        >
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              color: "rgba(159,188,164,0.5)",
              letterSpacing: "0.15em",
            }}
          >
            L+B
          </span>
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: 9,
              color: "rgba(159,188,164,0.5)",
              letterSpacing: "0.08em",
            }}
          >
            PAGE 1
          </span>
        </div>
      </div>
    </div>
  );
}
