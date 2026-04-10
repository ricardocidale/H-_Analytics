import type { UnitType, UnitDef } from "./icp-types";

export const UNIT_DEFS: Record<Exclude<UnitType, "none">, UnitDef> = {
  area: {
    imperial: "sq ft",
    metric: "m²",
    toMetric: (v) => Math.round(v * 0.0929),
    toImperial: (v) => Math.round(v / 0.0929),
  },
  land: {
    imperial: "acres",
    metric: "ha",
    toMetric: (v) => +(v * 0.4047).toFixed(1),
    toImperial: (v) => +(v / 0.4047).toFixed(1),
  },
  distance: {
    imperial: "ft",
    metric: "m",
    toMetric: (v) => Math.round(v * 0.3048),
    toImperial: (v) => Math.round(v / 0.3048),
  },
};

export function dualUnit(value: number, unitType: UnitType, inputMetric: boolean): string {
  if (unitType === "none") return String(value);
  const def = UNIT_DEFS[unitType];
  if (inputMetric) {
    const imp = def.toImperial(value);
    return `${value.toLocaleString()} ${def.metric} (${imp.toLocaleString()} ${def.imperial})`;
  }
  const met = def.toMetric(value);
  return `${value.toLocaleString()} ${def.imperial} (${met.toLocaleString()} ${def.metric})`;
}
