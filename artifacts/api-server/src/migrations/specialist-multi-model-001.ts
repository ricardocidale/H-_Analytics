/**
 * @deprecated No-op shim — superseded by Drizzle migration
 * `migrations/0022_specialist_llm_overrides.sql` (idx=22).
 *
 * The runtime call site in index.ts was removed in favour of the canonical
 * Drizzle migration. This file is kept to avoid import errors from any tooling
 * or script that may still reference it, but the exported function does nothing.
 */
export async function runSpecialistMultiModel001(): Promise<void> {
  // Intentionally empty — schema changes belong in Drizzle migrations.
}
