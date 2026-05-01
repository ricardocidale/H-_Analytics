/**
 * Gustavo — orchestrator identity.
 *
 * The orchestrator (formerly "The Analyst") is humanized as Gustavo so that
 * activity logs, narration, and admin-facing UX read as a named team
 * rather than a faceless pipeline. Gustavo coordinates the 12 Specialists
 * declared in `engine/analyst/registry/specialist-catalog.ts`.
 *
 * This module is the SINGLE source of truth for the orchestrator persona.
 * Anywhere the engine narrates "the orchestrator decided …" or "the
 * Analyst dispatched …", import from here instead of hard-coding strings.
 */

export interface OrchestratorIdentity {
  /**
   * Canonical first name used in narration. Mirrors the `humanName` field
   * on each Specialist so callsites can treat orchestrator and Specialists
   * uniformly when rendering badges / log prefixes.
   */
  readonly humanName: "Gustavo";
  /** Back-compat alias for `humanName`. */
  readonly name: "Gustavo";
  /** Persona role line for activity-log subheadings. */
  readonly role: "Orchestrator";
  /**
   * Persona gender for pronoun selection in narration helpers. Mirrors
   * the `gender` enum on Specialists (`male | female | neutral`).
   */
  readonly gender: "male";
  /**
   * Lower-case identifier used as the bracketed log prefix:
   *   `[gaspar] dispatched Helena to refresh tax constants`
   */
  readonly logKey: "gaspar";
  /** 1-line description rendered above the orchestrator dashboard. */
  readonly description: string;
  /**
   * Voice doctrine for narration produced under Gustavo's name. Used by
   * prompt builders and copy reviewers so the persona reads consistently
   * across activity logs, refresh theaters, and status banners.
   */
  readonly voice: {
    /** Language to narrate in. */
    readonly language: "en";
    /** Grammatical person used in narration ("I dispatched Helena …"). */
    readonly person: "first";
    /** Tonal register — calm, factual, no hype. */
    readonly tone: "calm";
    /** Length budget per narration line. */
    readonly length: "brief";
    /** Whether emojis are permitted in narration. */
    readonly emojis: false;
  };
}

/**
 * Synthetic specialistId reserved for the orchestrator. The Phase-3 admin
 * identity routes accept this id alongside the catalog-declared specialist
 * ids so Gustavo's humanName/gender can be edited through the same surface.
 */
export const ORCHESTRATOR_SPECIALIST_ID = "gaspar" as const;

export type Gender = "male" | "female" | "neutral";

export interface PronounSet {
  /** Subject pronoun: "she", "he", "they". */
  readonly subject: string;
  /** Object pronoun: "her", "him", "them". */
  readonly object: string;
  /** Possessive determiner: "her", "his", "their" (used as "her work"). */
  readonly possessive: string;
  /** Possessive pronoun: "hers", "his", "theirs" (used as "the work is hers"). */
  readonly possessivePronoun: string;
  /** Reflexive: "herself", "himself", "themself". */
  readonly reflexive: string;
}

const PRONOUNS: Record<Gender, PronounSet> = {
  female:  { subject: "she",  object: "her",  possessive: "her",   possessivePronoun: "hers",   reflexive: "herself" },
  male:    { subject: "he",   object: "him",  possessive: "his",   possessivePronoun: "his",    reflexive: "himself" },
  neutral: { subject: "they", object: "them", possessive: "their", possessivePronoun: "theirs", reflexive: "themself" },
};

/**
 * Resolve a gender-correct pronoun set for narration. Used everywhere the
 * engine writes Specialist-attributable copy — never hard-code "she/her" or
 * "he/his" in narration strings; always read through this helper so that
 * flipping a Specialist's gender via the Phase-3 admin override propagates
 * to every callsite.
 */
export function pronounSet(gender: Gender | string): PronounSet {
  // Defensive: the type annotation is a compile-time hint, but the value
  // can originate from a DB row (override) or a stale catalog field that
  // bypasses Zod (manual SQL, future enum extension, etc.). Indexing
  // `PRONOUNS[gender]` directly would return undefined for an unknown
  // value and `.possessive` on undefined throws TypeError far from the
  // bad-data origin. Switch + neutral fallback keeps narration safe.
  switch (gender) {
    case "female": return PRONOUNS.female;
    case "male":   return PRONOUNS.male;
    case "neutral": return PRONOUNS.neutral;
    default: {
      // Lazy logger import — identity.ts is consumed by both server and
      // client bundles; keep the cold-path warning out of the hot path.
      try {
        const { logger } = require("../../server/logger");
        logger?.warn?.(`pronounSet fallback: unknown gender "${String(gender)}"`, "identity");
      } catch { /* client bundle — silently fall back */ }
      return PRONOUNS.neutral;
    }
  }
}

export interface ResolvedIdentitySource {
  readonly humanName: "override" | "catalog";
  readonly gender: "override" | "catalog";
}

export interface ResolvedIdentity {
  readonly humanName: string;
  readonly gender: Gender;
  readonly source: ResolvedIdentitySource;
}

export interface IdentityCatalogDefault {
  readonly humanName: string;
  readonly gender: Gender;
}

export interface IdentityOverridePatch {
  readonly humanName: string | null;
  readonly gender: Gender | null;
}

/**
 * Merge the catalog factory default with an admin override. Per-field
 * resolution: override-when-non-null, catalog otherwise. Pure function —
 * shared between server (logger/route) and client (SpecialistPage display)
 * via `engine/` so behavior cannot drift between the two surfaces.
 */
export function resolveSpecialistIdentity(
  catalog: IdentityCatalogDefault,
  override: IdentityOverridePatch | null | undefined,
): ResolvedIdentity {
  const humanName = override?.humanName ?? catalog.humanName;
  const gender = override?.gender ?? catalog.gender;
  return {
    humanName,
    gender,
    source: {
      humanName: override?.humanName != null ? "override" : "catalog",
      gender: override?.gender != null ? "override" : "catalog",
    },
  };
}

export const GASPAR_IDENTITY: OrchestratorIdentity = {
  humanName: "Gustavo",
  name: "Gustavo",
  role: "Orchestrator",
  gender: "male",
  logKey: "gaspar",
  description:
    "Coordinates the team of 12 Specialists, dispatches research jobs, and reconciles their outputs into the model.",
  voice: {
    language: "en",
    person: "first",
    tone: "calm",
    length: "brief",
    emojis: false,
  },
} as const;
