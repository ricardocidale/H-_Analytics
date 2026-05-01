import { logger } from "./logger";

export interface FeatureFlags {
  REBECCA_V2: boolean;
}

const defaults: FeatureFlags = {
  REBECCA_V2: true,
};

let resolved: FeatureFlags | null = null;

function resolve(): FeatureFlags {
  if (resolved) return resolved;

  resolved = {
    REBECCA_V2: envBool("REBECCA_V2", defaults.REBECCA_V2),
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
