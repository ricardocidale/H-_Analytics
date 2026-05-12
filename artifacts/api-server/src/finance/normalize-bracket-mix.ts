/**
 * normalize-bracket-mix.ts — re-export from the shared engine lib.
 *
 * The canonical implementation lives in
 * `lib/engine/src/helpers/normalize-bracket-mix.ts` so both the frontend
 * (via @engine/helpers) and the server (via this re-export) share one copy.
 */

export {
  normalizeBracketMix,
  normalizePersistedBracketMix,
} from "@engine/helpers/normalize-bracket-mix";

export type { NormalizedBracketMix } from "@engine/helpers/normalize-bracket-mix";
