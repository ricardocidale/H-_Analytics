/**
 * Prerequisite library — first-class gates that are larger than a single
 * required field.
 *
 * Each prerequisite is declared once here and may be toggled on or off per
 * Specialist via `specialist_configs.prerequisite_toggles`. Specialists
 * never toggle a prerequisite that isn't in their catalog declaration —
 * the Specialist page UI only shows checkboxes for ids that appear in the
 * Specialist's `prerequisites[]` list. Adding a new prerequisite means
 * editing this library AND attaching it to the Specialists that need it
 * in `specialist-catalog.ts`.
 *
 * Evaluators (the runtime "is this satisfied?" check) live alongside in
 * `prerequisite-registry.ts`. The library here is pure metadata: id,
 * human label, and a short description rendered as helper text in the
 * Required Fields tab.
 */

export interface PrerequisiteDefinition {
  id: string;
  label: string;
  description: string;
  /**
   * Which Specialist subjects this prerequisite is meaningful for. The
   * catalog uses this as a sanity check when declaring per-Specialist
   * prerequisites — declaring `all-properties-financials-computed` for
   * a `constants` Specialist would be meaningless.
   */
  appliesTo: ReadonlyArray<"mgmt-co" | "property" | "photos" | "portfolio-ops" | "constants">;
}

export const PREREQUISITES: Record<string, PrerequisiteDefinition> = {
  "all-properties-financials-computed": {
    id: "all-properties-financials-computed",
    label: "All properties have financial statements computed",
    description:
      "Every property in scope must have a fully-computed financial model (revenue + cost lines + capital stack). Blocks runs that would otherwise reason on partial data.",
    appliesTo: ["mgmt-co", "portfolio-ops"],
  },
  "all-properties-required-fields-complete": {
    id: "all-properties-required-fields-complete",
    label: "Every property has its own required fields populated",
    description:
      "Each property in scope must satisfy its property-level Specialists' hard-required fields before this Specialist runs.",
    appliesTo: ["mgmt-co", "portfolio-ops"],
  },
  "company-profile-saved": {
    id: "company-profile-saved",
    label: "Company profile saved at least once",
    description:
      "The management-company profile (name, segment, target market) must have been saved at least once. Prevents zero-state runs.",
    appliesTo: ["mgmt-co", "portfolio-ops"],
  },
  "constants-refreshed-within-cadence": {
    id: "constants-refreshed-within-cadence",
    label: "All Constants research engines refreshed within cadence",
    description:
      "Every owned Model Constant must have a successful refresh within its declared cadence window. Prevents reasoning against stale authority data.",
    appliesTo: ["constants", "mgmt-co", "property", "portfolio-ops"],
  },
} as const;

export type PrerequisiteId = keyof typeof PREREQUISITES;

export function getPrerequisite(id: string): PrerequisiteDefinition | undefined {
  return PREREQUISITES[id];
}

export function isPrerequisiteId(id: string): id is PrerequisiteId {
  return id in PREREQUISITES;
}
