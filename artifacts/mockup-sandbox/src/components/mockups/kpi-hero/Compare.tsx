import { Swiss } from "./Swiss";
import { Animated } from "./Animated";
import { Glass } from "./Glass";
import { Bento } from "./Bento";

const variants = [
  { label: "Swiss", sub: "Minimal / Editorial", Component: Swiss },
  { label: "Animated", sub: "Count-up + Sparklines", Component: Animated },
  { label: "Glass", sub: "Frosted / Gradient", Component: Glass },
  { label: "Bento", sub: "Year-by-Year Sparkline Grid", Component: Bento },
];

export default function Compare() {
  return (
    <div style={{ background: "#f4f4f5", minHeight: "100vh", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1600, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "system-ui, sans-serif", fontSize: 18, fontWeight: 600, color: "#18181b", marginBottom: 4 }}>
          KPI Hero — Design Comparison
        </h1>
        <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#71717a", marginBottom: 32 }}>
          Four variants of the metric card row. Pick one to ship into the dashboard.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {variants.map(({ label, sub, Component }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e4e4e7" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f4f4f5", display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: 600, color: "#18181b" }}>{label}</span>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, color: "#a1a1aa" }}>{sub}</span>
              </div>
              <div style={{ padding: 16 }}>
                <Component />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
