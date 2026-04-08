import { logger } from "./logger";

export interface FeatureFlags {
  RI_V2_WRITE: boolean;
  RI_V2_READ: boolean;
  REBECCA_V2: boolean;
  ADMIN_INTEL_V2: boolean;
}

const defaults: FeatureFlags = {
  RI_V2_WRITE: true,
  RI_V2_READ: true,
  REBECCA_V2: true,
  ADMIN_INTEL_V2: true,
};

let resolved: FeatureFlags | null = null;

function resolve(): FeatureFlags {
  if (resolved) return resolved;

  resolved = {
    RI_V2_WRITE: envBool("RI_V2_WRITE", defaults.RI_V2_WRITE),
    RI_V2_READ: envBool("RI_V2_READ", defaults.RI_V2_READ),
    REBECCA_V2: envBool("REBECCA_V2", defaults.REBECCA_V2),
    ADMIN_INTEL_V2: envBool("ADMIN_INTEL_V2", defaults.ADMIN_INTEL_V2),
  };

  const active = Object.entries(resolved)
    .filter(([, v]) => v)
    .map(([k]) => k);
  logger.info(`Feature flags: ${active.length > 0 ? active.join(", ") : "(none active)"}`, "flags");

  return resolved;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function flag(name: keyof FeatureFlags): boolean {
  return resolve()[name];
}

export function resetFlags(): void {
  resolved = null;
}

export function allFlags(): FeatureFlags {
  return { ...resolve() };
}
