/**
 * Admin routes for governed Model Constants (Phase 2).
 *
 * Read path: GET /api/admin/model-constants?country=&subdivision=
 *   For every key in MODEL_CONSTANTS_REGISTRY, returns the resolved value at
 *   the requested locality together with provenance (factory | analyst |
 *   manual). Supplies enough metadata to render the three-state badges and
 *   the "Reset to factory" affordance without a second round-trip.
 *
 * Write path: PUT /api/admin/model-constants/:key
 *   Manual override only. The body must include `value` and `overrideNote`
 *   (note is required for source='manual' as a forcing function — admins
 *   should explain why they are departing from the governed baseline).
 *   The storage layer enforces the "departures only" invariant: writing a
 *   value equal to factory deletes the row instead.
 *
 * Reset path: DELETE /api/admin/model-constants/:key?country=&subdivision=
 *   Removes any override row at that locality, returning the constant to
 *   the factory baseline (or the next-most-specific override layer).
 *
 * Analyst regeneration is intentionally NOT exposed here — that lives in
 * Phase 3's `regenerate-constants` pipeline which writes via the same
 * storage method but with source='analyst' and a research_run_id.
 */

import { type Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import {
  MODEL_CONSTANTS_REGISTRY,
  REGISTERED_CONSTANT_KEYS,
  getFactoryValue,
} from "@shared/model-constants-registry";
import { getEffectiveConstant } from "@shared/get-effective-constant";
import { COUNTRY_DEFAULTS } from "@shared/countryDefaults";
import { proposeConstantRegeneration } from "../../ai/regenerate-constants";

const overrideBodySchema = z.object({
  country: z.string().nullable().optional(),
  countrySubdivision: z.string().nullable().optional(),
  value: z.unknown(),
  overrideNote: z.string().min(1, "An override note is required for manual overrides"),
});

/**
 * Body schema for the analyst-apply route. Mirrors a regeneration proposal
 * so the client can round-trip the response from POST .../regenerate
 * straight into POST .../apply-research.
 */
const applyResearchBodySchema = z.object({
  country: z.string().nullable().optional(),
  countrySubdivision: z.string().nullable().optional(),
  value: z.unknown(),
  authority: z.string().min(1, "Analyst overrides must cite an authority"),
  referenceUrl: z.string().nullable().optional(),
  reasoning: z.string().min(1, "Analyst overrides must include a reasoning string"),
});

const localityQuerySchema = z.object({
  country: z.string().optional(),
  subdivision: z.string().optional(),
});

function normaliseLocality(country?: string | null, subdivision?: string | null) {
  return {
    country: country && country.trim() !== "" ? country.trim() : null,
    subdivision: subdivision && subdivision.trim() !== "" ? subdivision.trim() : null,
  };
}

/**
 * Validate that the locality matches the constant's registered locality.
 * Shared by PUT (write) and DELETE (reset) so invalid locality requests are
 * always explicit 4xx instead of silent no-ops.
 */
function validateLocality(
  key: string,
  country: string | null,
  subdivision: string | null,
): { ok: true } | { ok: false; error: string } {
  const entry = MODEL_CONSTANTS_REGISTRY[key]!;
  if (entry.locality === "universal" && (country || subdivision)) {
    return { ok: false, error: `Constant '${key}' is universal — country/subdivision must be null.` };
  }
  if (entry.locality === "country" && subdivision) {
    return { ok: false, error: `Constant '${key}' does not support country subdivisions.` };
  }
  if (entry.locality !== "universal" && !country) {
    return { ok: false, error: `Constant '${key}' requires a country.` };
  }
  return { ok: true };
}

export function registerModelConstantsRoutes(app: Express) {
  /**
   * List every registered constant resolved at the requested locality.
   * The response is keyed by constant for easy table rendering.
   */
  app.get("/api/admin/model-constants", requireAdmin, async (req, res) => {
    try {
      const parsed = localityQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { country, subdivision } = normaliseLocality(parsed.data.country, parsed.data.subdivision);

      const allOverrides = await storage.listModelConstantOverrides();

      const items = REGISTERED_CONSTANT_KEYS.map((key) => {
        const entry = MODEL_CONSTANTS_REGISTRY[key]!;
        // For "universal" constants, callers may pass a country but it is
        // irrelevant — fold to NULL/NULL so resolution and badges are honest.
        const localityForKey = entry.locality === "universal"
          ? { country: null as string | null, subdivision: null as string | null }
          : entry.locality === "country"
            ? { country, subdivision: null as string | null }
            : { country, subdivision };

        const factory = getFactoryValue(key, localityForKey.country, localityForKey.subdivision);
        const resolved = getEffectiveConstant({
          key,
          country: localityForKey.country,
          subdivision: localityForKey.subdivision,
          overrides: allOverrides,
        });

        // Did the factory call fall back to the US baseline because the
        // requested country has no entry of its own? Compute by checking the
        // raw COUNTRY_DEFAULTS entry instead of relying on equality with the
        // US value (which would false-positive when a country happens to
        // share the US value).
        let factoryWasFallback = false;
        if (entry.locality !== "universal" && localityForKey.country) {
          const def = COUNTRY_DEFAULTS[localityForKey.country];
          // For Phase 1 the only country-keyed key is `depreciationYears`.
          // Reading via index keeps this generic for future country keys
          // without per-key branches.
          const directHit = def ? (def as unknown as Record<string, unknown>)[key] : undefined;
          factoryWasFallback = directHit === undefined && localityForKey.country !== "United States";
        }

        return {
          key,
          label: entry.label,
          locality: entry.locality,
          authority: entry.meta.authority,
          referenceUrl: entry.meta.referenceUrl,
          helperText: entry.meta.helperText,
          requestedAt: localityForKey,
          factoryValue: factory,
          factoryWasFallback,
          effectiveValue: resolved.value,
          source: resolved.source,
          resolvedAt: resolved.resolvedAt ?? null,
          override: resolved.override ?? null,
        };
      });

      res.json({
        country,
        subdivision,
        items,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list model constants", error);
    }
  });

  /**
   * Manual override at the given locality. Validates the locality matches
   * the registered locality of the constant (e.g. cannot pass a country for
   * a universal constant; cannot pass a subdivision for a country-only
   * constant) so we don't silently produce dead override rows.
   */
  app.put("/api/admin/model-constants/:key", requireAdmin, async (req, res) => {
    try {
      const key = String(req.params.key ?? "");
      const entry = MODEL_CONSTANTS_REGISTRY[key];
      if (!entry) return res.status(404).json({ error: `Unknown constant key: ${key}` });

      const parsed = overrideBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      // Normalise body locality the same way query strings are normalised so
      // whitespace-only values collapse to NULL and never produce dead rows.
      const { country, subdivision } = normaliseLocality(parsed.data.country, parsed.data.countrySubdivision);

      const localityCheck = validateLocality(key, country, subdivision);
      if (!localityCheck.ok) {
        return res.status(400).json({ error: localityCheck.error });
      }
      // entry referenced for symmetry with read path; locality already validated.
      void entry;

      const userId = (req as any).user?.id ?? null;

      const result = await storage.upsertModelConstantOverride({
        constantKey: key,
        country,
        countrySubdivision: subdivision,
        value: parsed.data.value,
        source: "manual",
        overrideNote: parsed.data.overrideNote,
        createdBy: userId,
      });

      logActivity(
        req,
        "manual-override-model-constant",
        "model-constant",
        0,
        result === null
          ? `Reset ${key} (${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}) to factory — value matched baseline.`
          : `Manual override of ${key} (${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}).`,
      );

      res.json({
        wasFactoryEqual: result === null,
        override: result,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to override model constant", error);
    }
  });

  /**
   * Reset to factory by deleting any override row at that locality.
   */
  app.delete("/api/admin/model-constants/:key", requireAdmin, async (req, res) => {
    try {
      const key = String(req.params.key ?? "");
      if (!MODEL_CONSTANTS_REGISTRY[key]) {
        return res.status(404).json({ error: `Unknown constant key: ${key}` });
      }

      const parsed = localityQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { country, subdivision } = normaliseLocality(parsed.data.country, parsed.data.subdivision);

      // Same locality rules as PUT: explicit 4xx instead of silent no-ops.
      const localityCheck = validateLocality(key, country, subdivision);
      if (!localityCheck.ok) {
        return res.status(400).json({ error: localityCheck.error });
      }

      await storage.deleteModelConstantOverride(key, country, subdivision);

      logActivity(
        req,
        "reset-model-constant",
        "model-constant",
        0,
        `Reset ${key} (${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}) to factory.`,
      );

      res.json({ ok: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to reset model constant", error);
    }
  });

  /**
   * Analyst-driven regeneration — proposal only, no DB write.
   *
   * The Admin UI calls this when the user clicks "Regenerate via Analyst".
   * We return the proposed value plus authority + reasoning + sources so the
   * UI can show a diff against the currently-effective value. The user then
   * confirms (or cancels) via POST .../apply-research below.
   */
  app.post("/api/admin/model-constants/:key/regenerate", requireAdmin, async (req, res) => {
    try {
      const key = String(req.params.key ?? "");
      if (!MODEL_CONSTANTS_REGISTRY[key]) {
        return res.status(404).json({ error: `Unknown constant key: ${key}` });
      }

      const parsed = localityQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { country, subdivision } = normaliseLocality(parsed.data.country, parsed.data.subdivision);

      const localityCheck = validateLocality(key, country, subdivision);
      if (!localityCheck.ok) {
        return res.status(400).json({ error: localityCheck.error });
      }

      // The proposer needs the full overrides list to resolve the current
      // effective value at the requested locality (without an extra DB hit).
      const overrides = await storage.listModelConstantOverrides();

      const proposal = await proposeConstantRegeneration({
        key,
        country,
        subdivision,
        overrides,
      });

      res.json(proposal);
    } catch (error: unknown) {
      logAndSendError(res, "Analyst regeneration failed", error);
    }
  });

  /**
   * Persist a confirmed Analyst proposal as an override. Mirrors the manual
   * PUT path but with source='analyst' and citation fields filled from the
   * proposal payload (not user free-text). The factory-equality invariant
   * applies — applying a value equal to factory deletes the row instead.
   */
  app.post("/api/admin/model-constants/:key/apply-research", requireAdmin, async (req, res) => {
    try {
      const key = String(req.params.key ?? "");
      if (!MODEL_CONSTANTS_REGISTRY[key]) {
        return res.status(404).json({ error: `Unknown constant key: ${key}` });
      }

      const parsed = applyResearchBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const { country, subdivision } = normaliseLocality(parsed.data.country, parsed.data.countrySubdivision);

      const localityCheck = validateLocality(key, country, subdivision);
      if (!localityCheck.ok) {
        return res.status(400).json({ error: localityCheck.error });
      }

      const userId = (req as { user?: { id?: number } }).user?.id ?? null;

      const result = await storage.upsertModelConstantOverride({
        constantKey: key,
        country,
        countrySubdivision: subdivision,
        value: parsed.data.value,
        source: "analyst",
        authority: parsed.data.authority,
        referenceUrl: parsed.data.referenceUrl ?? null,
        // Analyst regenerations do not (yet) create a research_runs row —
        // the reasoning/authority is stored inline. Phase 5 wires this into
        // the scheduler and will set researchRunId.
        researchRunId: null,
        // Preserve the analyst's reasoning in the override row so the audit
        // trail can show *why* the value moved when the override is later
        // listed in Admin.
        overrideNote: parsed.data.reasoning,
        createdBy: userId,
      });

      logActivity(
        req,
        "analyst-override-model-constant",
        "model-constant",
        0,
        result === null
          ? `Analyst regeneration of ${key} (${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}) matched factory — no override stored.`
          : `Analyst regenerated ${key} (${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}). Authority: ${parsed.data.authority}.`,
      );

      res.json({
        wasFactoryEqual: result === null,
        override: result,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to apply analyst regeneration", error);
    }
  });
}
