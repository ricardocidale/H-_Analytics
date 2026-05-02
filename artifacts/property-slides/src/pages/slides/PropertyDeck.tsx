import { useState, useEffect, useCallback } from "react";

interface Property {
  id: string;
  name: string;
  location: string | null;
  city: string | null;
  stateProvince: string | null;
  status: string | null;
  hospitalityType: string | null;
  type: string | null;
  acquisitionDate: string | null;
  purchasePrice: number | null;
  startAdr: number | null;
  startOccupancy: number | null;
  exitCapRate: number | null;
  imageUrl: string | null;
  roomCount: number | null;
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(1) + "%";
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function fmtLocation(p: Property): string {
  if (p.city && p.stateProvince) return `${p.city}, ${p.stateProvince}`;
  if (p.city) return p.city;
  if (p.location) return p.location;
  return "—";
}

function fmtType(p: Property): string {
  if (p.hospitalityType) return p.hospitalityType;
  if (p.type) return p.type;
  return "—";
}

function fmtStatus(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function CoverSlide({ total }: { total: number }) {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "#FFF9F5" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 30% 60%, #F4EDE3 0%, #FFF9F5 60%)",
        }}
      />

      <div
        className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full opacity-10"
        style={{
          background: "#257D41",
          transform: "translate(20%, -20%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-[30vw] h-[30vw] rounded-full opacity-10"
        style={{
          background: "#1C2B1E",
          transform: "translate(-30%, 30%)",
        }}
      />

      <div className="relative z-10 flex flex-col h-full px-[8vw] py-[7vh]">
        <div className="flex items-center gap-[1.5vw]">
          <div
            className="text-[2.2vw] tracking-[0.4em] font-bold"
            style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#1C2B1E", fontWeight: 200 }}
          >
            L+B
          </div>
          <div
            className="h-[0.1vh] flex-1"
            style={{ background: "#5A7A62", opacity: 0.4 }}
          />
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div
            className="text-[1.6vw] tracking-[0.25em] mb-[3vh]"
            style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
          >
            INVESTMENT PORTFOLIO
          </div>

          <div
            className="text-[6.5vw] leading-[1.08] mb-[4vh]"
            style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 400 }}
          >
            Property
            <div style={{ color: "#257D41" }}>Overview</div>
          </div>

          <div
            className="h-[0.3vh] w-[8vw] mb-[4vh]"
            style={{ background: "#1C2B1E" }}
          />

          <div
            className="text-[1.8vw]"
            style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#2A4030", fontWeight: 200 }}
          >
            {total} {total === 1 ? "Property" : "Properties"} · Portfolio Review 2026
          </div>
        </div>

        <div
          className="text-[1.5vw] tracking-[0.15em]"
          style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
        >
          CONFIDENTIAL
        </div>
      </div>
    </div>
  );
}

function PropertySlide({
  property: p,
  page,
  total,
}: {
  property: Property;
  page: number;
  total: number;
}) {
  const location = fmtLocation(p);
  const status = fmtStatus(p.status);
  const propType = fmtType(p);

  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex flex-col"
      style={{ background: "#FFF9F5" }}
    >
      <div
        className="flex-none flex flex-col justify-end px-[5vw] py-[2.5vh]"
        style={{ background: "#1C2B1E", height: "22vh" }}
      >
        <div
          className="text-[1.5vw] tracking-[0.2em] mb-[1.2vh]"
          style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#9FBCA4", fontWeight: 200 }}
        >
          INVESTMENT SPOTLIGHT
          <span style={{ color: "#7AAA88" }}> · </span>
          <span style={{ color: "#257D41" }}>{status}</span>
        </div>
        <div
          className="text-[4vw] leading-[1.1]"
          style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#FFFFFF", fontWeight: 400 }}
        >
          {p.name || "—"}
        </div>
        <div
          className="text-[1.6vw] mt-[0.6vh]"
          style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#7AAA88", fontWeight: 200 }}
        >
          {location}
        </div>
      </div>

      <div className="flex-1 flex flex-row px-[5vw] py-[3vh] gap-[4vw]">
        <div className="flex flex-col" style={{ width: "52%" }}>
          <div
            className="text-[1.5vw] mb-[2vh]"
            style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
          >
            <span style={{ color: "#257D41" }}>{propType}</span>
            {p.acquisitionDate && (
              <span>
                {" · "}Acquired {fmtDate(p.acquisitionDate)}
              </span>
            )}
          </div>

          {p.imageUrl ? (
            <div
              className="flex-1 overflow-hidden"
              style={{ borderRadius: "0.3vw" }}
            >
              <img
                src={p.imageUrl}
                alt={p.name || "Property"}
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div
              className="flex-1 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #E8F0EB 0%, #D4E3D9 100%)",
                borderRadius: "0.3vw",
              }}
            >
              <div
                className="text-[2.5vw] tracking-[0.2em]"
                style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#9FBCA4", fontWeight: 200 }}
              >
                L+B
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-center" style={{ width: "44%" }}>
          <div
            className="text-[1.5vw] tracking-[0.2em] mb-[1.5vh]"
            style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#9FBCA4", fontWeight: 200 }}
          >
            PROPERTY SPECS
          </div>

          <div
            className="mb-[2.5vh]"
            style={{ height: "0.15vh", background: "#257D41" }}
          />

          <div className="flex flex-col gap-[1.8vh]">
            <div className="flex flex-row justify-between items-baseline">
              <div
                className="text-[1.5vw]"
                style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
              >
                Purchase Price
              </div>
              <div
                className="text-[1.8vw]"
                style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 500 }}
              >
                {fmtCurrency(p.purchasePrice)}
              </div>
            </div>

            <div
              className="w-full"
              style={{ height: "0.08vh", background: "#E8EDE9" }}
            />

            <div className="flex flex-row justify-between items-baseline">
              <div
                className="text-[1.5vw]"
                style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
              >
                ADR
              </div>
              <div
                className="text-[1.8vw]"
                style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 500 }}
              >
                {fmtCurrency(p.startAdr)}
              </div>
            </div>

            <div
              className="w-full"
              style={{ height: "0.08vh", background: "#E8EDE9" }}
            />

            <div className="flex flex-row justify-between items-baseline">
              <div
                className="text-[1.5vw]"
                style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
              >
                Occupancy
              </div>
              <div
                className="text-[1.8vw]"
                style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 500 }}
              >
                {fmtPct(p.startOccupancy)}
              </div>
            </div>

            <div
              className="w-full"
              style={{ height: "0.08vh", background: "#E8EDE9" }}
            />

            <div className="flex flex-row justify-between items-baseline">
              <div
                className="text-[1.5vw]"
                style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
              >
                Exit Cap Rate
              </div>
              <div
                className="text-[1.8vw]"
                style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 500 }}
              >
                {fmtPct(p.exitCapRate)}
              </div>
            </div>

            <div
              className="w-full"
              style={{ height: "0.08vh", background: "#E8EDE9" }}
            />

            <div className="flex flex-row justify-between items-baseline">
              <div
                className="text-[1.5vw]"
                style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
              >
                Acq. Date
              </div>
              <div
                className="text-[1.8vw]"
                style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 500 }}
              >
                {fmtDate(p.acquisitionDate)}
              </div>
            </div>

            {p.roomCount != null && (
              <>
                <div
                  className="w-full"
                  style={{ height: "0.08vh", background: "#E8EDE9" }}
                />
                <div className="flex flex-row justify-between items-baseline">
                  <div
                    className="text-[1.5vw]"
                    style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
                  >
                    Room Count
                  </div>
                  <div
                    className="text-[1.8vw]"
                    style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 500 }}
                  >
                    {p.roomCount}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex-none flex flex-row items-center justify-between px-[5vw]"
        style={{ height: "7vh", background: "#F0EDE8", borderTop: "0.1vh solid #E0D9D0" }}
      >
        <div
          className="text-[1.5vw] tracking-[0.12em]"
          style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#9FBCA4", fontWeight: 200 }}
        >
          L+B
        </div>
        <div
          className="text-[1.5vw]"
          style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#9FBCA4", fontWeight: 200 }}
        >
          {page} of {total}
        </div>
      </div>
    </div>
  );
}

function LoadingSlide() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex items-center justify-center"
      style={{ background: "#FFF9F5" }}
    >
      <div className="flex flex-col items-center gap-[2vh]">
        <div
          className="text-[2.5vw] tracking-[0.3em]"
          style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#1C2B1E", fontWeight: 200 }}
        >
          L+B
        </div>
        <div
          className="text-[1.8vw]"
          style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#5A7A62", fontWeight: 200 }}
        >
          Loading properties...
        </div>
      </div>
    </div>
  );
}

function AuthPromptSlide() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex flex-col items-center justify-center"
      style={{ background: "#FFF9F5" }}
    >
      <div
        className="text-[2.5vw] tracking-[0.3em] mb-[3vh]"
        style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#1C2B1E", fontWeight: 200 }}
      >
        L+B
      </div>
      <div
        className="text-[3vw] mb-[2vh]"
        style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 400 }}
      >
        Authentication Required
      </div>
      <div
        className="text-[1.8vw] text-center max-w-[50vw]"
        style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#2A4030", fontWeight: 200 }}
      >
        Open the H+ Analytics app to sign in, then return to this deck to view the portfolio.
      </div>
    </div>
  );
}

function EmptySlide() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex flex-col items-center justify-center"
      style={{ background: "#FFF9F5" }}
    >
      <div
        className="text-[2.5vw] tracking-[0.3em] mb-[3vh]"
        style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#1C2B1E", fontWeight: 200 }}
      >
        L+B
      </div>
      <div
        className="text-[3vw] mb-[2vh]"
        style={{ fontFamily: "EB Garamond, Georgia, serif", color: "#1C2B1E", fontWeight: 400 }}
      >
        No Properties Found
      </div>
      <div
        className="text-[1.8vw]"
        style={{ fontFamily: "Poppins, system-ui, sans-serif", color: "#2A4030", fontWeight: 200 }}
      >
        Add properties in the H+ Analytics app to populate this deck.
      </div>
    </div>
  );
}

export default function PropertyDeck() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    fetch("/api/properties", { credentials: "include" })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          setAuthError(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data === null) return;
        setProperties(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const totalSlides = properties.length + 1;

  const goNext = useCallback(() => {
    setCurrentSlide((i) => Math.min(i + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setCurrentSlide((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  if (loading) {
    return <LoadingSlide />;
  }

  if (authError) {
    return <AuthPromptSlide />;
  }

  if (properties.length === 0) {
    return <EmptySlide />;
  }

  const canPrev = currentSlide > 0;
  const canNext = currentSlide < totalSlides - 1;

  return (
    <div className="w-screen h-screen overflow-hidden relative">
      {currentSlide === 0 && <CoverSlide total={properties.length} />}

      {currentSlide > 0 && currentSlide <= properties.length && (
        <PropertySlide
          property={properties[currentSlide - 1]}
          page={currentSlide}
          total={properties.length}
        />
      )}

      {canPrev && (
        <button
          onClick={goPrev}
          className="absolute left-[1.5vw] top-1/2 z-50 flex items-center justify-center cursor-pointer"
          style={{
            transform: "translateY(-50%)",
            width: "4vw",
            height: "4vw",
            borderRadius: "50%",
            background: "rgba(28, 43, 30, 0.55)",
            border: "none",
            color: "#9FBCA4",
            fontSize: "2vw",
          }}
          aria-label="Previous slide"
        >
          ‹
        </button>
      )}

      {canNext && (
        <button
          onClick={goNext}
          className="absolute right-[1.5vw] top-1/2 z-50 flex items-center justify-center cursor-pointer"
          style={{
            transform: "translateY(-50%)",
            width: "4vw",
            height: "4vw",
            borderRadius: "50%",
            background: "rgba(28, 43, 30, 0.55)",
            border: "none",
            color: "#9FBCA4",
            fontSize: "2vw",
          }}
          aria-label="Next slide"
        >
          ›
        </button>
      )}
    </div>
  );
}
