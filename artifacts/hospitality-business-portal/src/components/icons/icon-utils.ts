import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export const defaults = (p: IconProps) => ({
  width: p.size ?? 24,
  height: p.size ?? 24,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  ...p,
  size: undefined,
});

export const S = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, stroke: "currentColor", strokeWidth: 1.75 };
export const F = { fill: "currentColor", opacity: 0.12 };
