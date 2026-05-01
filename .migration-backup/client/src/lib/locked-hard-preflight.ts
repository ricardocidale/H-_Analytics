import {
  getLockedHardCandidateFields,
  type LockedHardCandidateField,
} from "../../../engine/analyst/registry/specialist-catalog";

export interface MissingFieldDescriptor {
  key: string;
  label: string;
  surface: string;
  surfaceAnchor?: string;
}

export function isFieldMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (typeof value === "number" && Number.isNaN(value)) return true;
  return false;
}

export function collectMissingLockedHardFields(
  specialistIds: readonly string[],
  entity: Record<string, unknown> | null | undefined,
): MissingFieldDescriptor[] {
  if (!entity) return [];
  const seen = new Set<string>();
  const out: MissingFieldDescriptor[] = [];
  for (const sid of specialistIds) {
    const lockedFields: LockedHardCandidateField[] =
      getLockedHardCandidateFields(sid);
    for (const f of lockedFields) {
      if (seen.has(f.key)) continue;
      if (isFieldMissing(entity[f.key])) {
        seen.add(f.key);
        out.push({
          key: f.key,
          label: f.label,
          surface: f.surface,
          surfaceAnchor: f.surfaceAnchor,
        });
      }
    }
  }
  return out;
}
