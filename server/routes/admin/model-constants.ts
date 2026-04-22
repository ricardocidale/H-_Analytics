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
  getConstantUnit,
} from "@shared/model-constants-registry";
import { getEffectiveConstant } from "@shared/get-effective-constant";
import { COUNTRY_DEFAULTS } from "@shared/countryDefaults";
import { proposeConstantRegeneration } from "../../ai/regenerate-constants";
import { logger } from "../../logger";
import {
  getSpecialistForConstant,
  getRefreshCadenceDaysForConstant,
} from "../../../engine/analyst/registry/specialist-catalog";

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
  /**
   * `research_runs.id` returned by the upstream `proposeConstantRegeneration`
   * call. The Constants UI round-trips it from the proposal response into the
   * Apply request so the override row is FK-linked to the exact run that
   * produced it. Optional because legacy admin Apply paths and tests may not
   * have a run id; the column is nullable in the schema either way.
   */
  researchRunId: z.number().int().positive().nullable().optional(),
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

      const [allOverrides, allCanonicals] = await Promise.all([
        storage.listModelConstantOverrides(),
        storage.listCanonicals(),
      ]);

      const items = await Promise.all(REGISTERED_CONSTANT_KEYS.map(async (key) => {
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
          canonicals: allCanonicals,
        });

        // Did the resolved baseline fall back to the US (or to TS) because no
        // direct canonical/TS entry exists for this country? The flag drives
        // a "Using US baseline" badge in the admin UI.
        let factoryWasFallback = false;
        if (entry.locality !== "universal" && localityForKey.country) {
          const def = COUNTRY_DEFAULTS[localityForKey.country];
          const tsHit = def ? (def as unknown as Record<string, unknown>)[key] : undefined;
          const canonicalHit = allCanonicals.find(
            (c) => c.constantKey === key
              && c.country === localityForKey.country
              && c.countrySubdivision === (localityForKey.subdivision ?? null),
          );
          factoryWasFallback = !canonicalHit && tsHit === undefined && localityForKey.country !== "United States";
        }

        // Phase 4 doctrine UI — surface the owning Specialist so the read-
        // only Constants tab can render the H/I/J/K letter badge and label
        // without a second round-trip to the catalog. Resolved at request
        // time (cheap; the catalog is a frozen in-memory list).
        const owner = getSpecialistForConstant(key);

        // Phase 4: pull the most recent *successful* research_run for this
        // row so the card renders an authoritative "as of" date and
        // conviction summary even when the verdict matched factory (no
        // override row exists, but a research run absolutely does). We
        // intentionally exclude failed attempts here — a failed scheduled
        // refresh must not advance the freshness window or replace a
        // good earlier verdict in the UI. Cheap — one indexed read.
        const latest = (await storage.getLatestSuccessfulRunForConstant(
          key,
          localityForKey.country,
          localityForKey.subdivision,
        )) ?? null;
        const latestMeta = (latest?.metadata ?? {}) as {
          proposal?: {
            value?: unknown;
            authority?: string;
            isDifferentFromCurrent?: boolean;
          };
          sources?: { title: string; url: string }[];
        };
        const latestRun = latest
          ? {
              id: latest.id,
              asOf: (latest.completedAt ?? latest.startedAt ?? null) as Date | string | null,
              authority: latestMeta.proposal?.authority ?? null,
              value: latestMeta.proposal?.value ?? null,
              sourcesCount: (latestMeta.sources ?? []).length,
              isDifferentFromCurrent: !!latestMeta.proposal?.isDifferentFromCurrent,
            }
          : null;

        // Last-refreshed timestamp prefers the Specialist's most recent
        // research run (covers no-change confirmations) and falls back
        // to the override row's creation time. Null only if no research
        // has ever been recorded for this row.
        const lastRefreshedAt =
          latestRun?.asOf ?? resolved.override?.createdAt ?? null;

        // Scheduled-refresh cadence + staleness flag (see
        // server/jobs/specialist-constants-refresh.ts). Surfaced here so
        // the Constants tab can render a "Stale" indicator without a
        // second round-trip to the catalog.
        const refreshCadenceDays = getRefreshCadenceDaysForConstant(key);
        let isStale = false;
        if (refreshCadenceDays != null) {
          if (!lastRefreshedAt) {
            isStale = true;
          } else {
            const ageMs = Date.now() - new Date(lastRefreshedAt as string | Date).getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            isStale = ageDays >= refreshCadenceDays;
          }
        }

        // Conviction summary — a one-line provenance statement for the
        // card. Prefers Specialist + authority + sources count when
        // available, otherwise reports factory baseline.
        let convictionSummary: string;
        if (latestRun && latestRun.authority) {
          const who = owner?.displayName ?? "AI Specialist";
          convictionSummary =
            `${who} verified against ${latestRun.authority}` +
            (latestRun.sourcesCount > 0 ? ` (${latestRun.sourcesCount} source${latestRun.sourcesCount === 1 ? "" : "s"})` : "");
        } else if (resolved.source === "factory") {
          convictionSummary = `Factory baseline — ${entry.meta.authority}. No research recorded yet.`;
        } else {
          convictionSummary = `${entry.meta.authority}.`;
        }

        return {
          key,
          label: entry.label,
          locality: entry.locality,
          authority: entry.meta.authority,
          referenceUrl: entry.meta.referenceUrl,
          helperText: entry.meta.helperText,
          requestedAt: localityForKey,
          // Phase 4: explicit per-row scope chip. The country/subdivision
          // a row resolves to is duplicated here so the UI does not have
          // to re-derive it from `requestedAt` + locality.
          scope: {
            locality: entry.locality,
            country: localityForKey.country,
            subdivision: localityForKey.subdivision,
          },
          // Phase 4: rendering unit (percent / years / days / ratio).
          unit: getConstantUnit(key),
          factoryValue: factory,
          factoryWasFallback,
          effectiveValue: resolved.value,
          source: resolved.source,
          resolvedAt: resolved.resolvedAt ?? null,
          override: resolved.override ?? null,
          // Phase 4: Constants doctrine fields. `specialistOwned` gates
          // the read-only UI (no number input, no Override button); the
          // specialist triple powers the per-row letter badge.
          specialistOwned: entry.specialistOwned,
          specialistId: owner?.id ?? null,
          specialistLetter: owner?.letter ?? null,
          specialistName: owner?.displayName ?? null,
          lastRefreshedAt,
          refreshCadenceDays,
          isStale,
          latestResearchRun: latestRun,
          convictionSummary,
        };
      }));

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

      // Phase 3 doctrine guard: Constants owned by an AI Intelligence
      // Specialist (every entry in MODEL_CONSTANTS_REGISTRY today) are
      // authority-sourced and cannot be hand-edited. Reject with 422 and
      // point the caller at the analyst-apply path. The DELETE (reset to
      // factory) route is intentionally NOT guarded — admins always retain
      // the rollback escape hatch.
      if (entry.specialistOwned) {
        return res.status(422).json({
          error:
            `Constant '${key}' is authority-sourced and owned by an AI Intelligence Specialist. ` +
            `Manual overrides are not permitted. Use the "Refresh research" button on the Constants tab ` +
            `(POST /api/admin/model-constants/${key}/regenerate then /apply-research) to update the value.`,
          code: "SPECIALIST_OWNED_CONSTANT",
        });
      }

      const parsed = overrideBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      // Normalise body locality the same way query strings are normalised so
      // whitespace-only values collapse to NULL and never produce dead rows.
      const { country, subdivision } = normaliseLocality(parsed.data.country, parsed.data.countrySubdivision);

      const localityCheck = validateLocality(key, country, subdivision);
      if (!localityCheck.ok) {
        return res.status(400).json({ error: localityCheck.error });
      }

      // Deprecation telemetry for the long tail: any non-specialist-owned
      // key still hitting the manual path is logged so we can track and
      // close out remaining manual usage. Today this branch is unreachable
      // because every registered key is specialistOwned, but Phase 6 may
      // introduce non-owned candidates and we want the trail in place.
      logger.warn(
        `Manual override on non-specialist-owned constant '${key}'. The manual path is deprecated; ` +
          `assign this key to a Specialist via constantsOwned[] and flip specialistOwned to true.`,
        "model-constants",
      );

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
        // Phase 2: every analyst regeneration writes a `research_runs` row
        // (see `proposeConstantRegeneration` in server/ai/regenerate-
        // constants.ts) and the proposal carries that id back to the Apply
        // call so the override is traceable to the run that produced it.
        // Falls back to null only when the upstream persist failed (the
        // proposal logs a warning) or the legacy client omitted the field.
        researchRunId: parsed.data.researchRunId ?? null,
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

  /**
   * Phase 4 (Constants doctrine): **Refresh research — preview only.**
   *
   * Triggers the owning Specialist (via `proposeConstantRegeneration`)
   * to re-fetch the value from its cited authority. **The proposal is
   * NOT applied to the override table by this endpoint.** The Specialist
   * does, however, persist a `research_runs` row carrying its reasoning
   * and sources — that row's id is returned as `researchRunId` and is
   * the only thing the subsequent `/apply-proposal` call needs.
   *
   * The admin sees a results panel with Previous / New values, the
   * Specialist's reasoning, and the source list. They then click Apply
   * (→ `/apply-proposal`) to write or Discard to dismiss. There is no
   * free-form value entry on either side of this transition.
   *
   * Legacy `/regenerate` + `/apply-research` routes above remain for
   * back-compat with the scheduler and scripted callers.
   */
  app.post("/api/admin/model-constants/:key/refresh", requireAdmin, async (req, res) => {
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

      const overrides = await storage.listModelConstantOverrides();
      const proposal = await proposeConstantRegeneration({
        key,
        country,
        subdivision,
        overrides,
      });

      const loc = `${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}`;
      logActivity(
        req,
        "refresh-research-preview-model-constant",
        "model-constant",
        0,
        `Refresh research preview for ${key} (${loc}). Authority: ${proposal.authority}. ${
          proposal.isDifferentFromCurrent ? "Differs from current." : "Confirmed current."
        }`,
      );

      res.json({ proposal });
    } catch (error: unknown) {
      logAndSendError(res, "Refresh research failed", error);
    }
  });

  /**
   * Phase 4 (Constants doctrine): **Apply a Specialist proposal.**
   *
   * The companion to `/refresh`. The admin clicks Apply on the preview
   * panel → the client posts the `researchRunId` returned by `/refresh`
   * → this route loads that research_runs row, validates that the
   * proposal it carries matches the requested constant + locality, and
   * writes `model_constant_overrides` with `source = 'analyst'`. The
   * value, authority, referenceUrl, and reasoning all come from the
   * persisted Specialist run — the admin never supplies them.
   *
   * Doctrine guarantees this maintains:
   *   - Admin cannot inject a value (body has no `value` field).
   *   - The applied value is provably the same value the Specialist
   *     produced (it's read straight out of the research_run).
   *   - factory-equality invariant still holds (storage layer drops
   *     the override row if proposal.value === factoryValue).
   */
  const applyProposalSchema = z.object({
    researchRunId: z.number().int().positive(),
  });

  app.post("/api/admin/model-constants/:key/apply-proposal", requireAdmin, async (req, res) => {
    try {
      const key = String(req.params.key ?? "");
      if (!MODEL_CONSTANTS_REGISTRY[key]) {
        return res.status(404).json({ error: `Unknown constant key: ${key}` });
      }

      const parsedBody = applyProposalSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: parsedBody.error.message });
      }
      const { researchRunId } = parsedBody.data;

      const parsedQuery = localityQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) return res.status(400).json({ error: parsedQuery.error.message });
      const { country, subdivision } = normaliseLocality(parsedQuery.data.country, parsedQuery.data.subdivision);

      const localityCheck = validateLocality(key, country, subdivision);
      if (!localityCheck.ok) {
        return res.status(400).json({ error: localityCheck.error });
      }

      // Load the persisted Specialist verdict. We re-query through the
      // constant-scoped helper so we cannot accidentally apply a run
      // that belongs to a different (key, country, subdivision) tuple.
      const candidates = await storage.getResearchRunsForConstant(key, country, subdivision, 25);
      const run = candidates.find((r) => r.id === researchRunId) ?? null;
      if (!run) {
        return res.status(404).json({
          error: `research_run ${researchRunId} not found for ${key} (${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}).`,
        });
      }

      const meta = (run.metadata ?? {}) as {
        proposal?: { value?: unknown; authority?: string; referenceUrl?: string | null; reasoning?: string };
      };
      const proposal = meta.proposal;
      if (!proposal || proposal.value === undefined || !proposal.authority) {
        return res.status(422).json({
          error: `research_run ${researchRunId} does not carry a complete Specialist proposal.`,
        });
      }

      const userId = (req as { user?: { id?: number } }).user?.id ?? null;

      const result = await storage.upsertModelConstantOverride({
        constantKey: key,
        country,
        countrySubdivision: subdivision,
        value: proposal.value,
        source: "analyst",
        authority: proposal.authority,
        referenceUrl: proposal.referenceUrl ?? null,
        researchRunId,
        overrideNote: proposal.reasoning ?? null,
        createdBy: userId,
      });

      const loc = `${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}`;
      logActivity(
        req,
        "apply-research-model-constant",
        "model-constant",
        0,
        result === null
          ? `Applied Specialist proposal for ${key} (${loc}); matched factory — no override stored. Authority: ${proposal.authority}.`
          : `Applied Specialist proposal for ${key} (${loc}) → ${JSON.stringify(proposal.value)}. Authority: ${proposal.authority}.`,
      );

      res.json({
        wasFactoryEqual: result === null,
        override: result,
        appliedFromResearchRunId: researchRunId,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to apply Specialist proposal", error);
    }
  });

  /**
   * Phase 4 (Constants doctrine): per-row research history.
   *
   * Returns the most recent research_runs rows produced by the Constants
   * regeneration pipeline for this (key, country, subdivision) — powers
   * the "History" affordance on each Constants card so admins can audit
   * the chain of analyst proposals without trawling global logs.
   */
  app.get("/api/admin/model-constants/:key/research-history", requireAdmin, async (req, res) => {
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

      const runs = await storage.getResearchRunsForConstant(key, country, subdivision, 10);
      res.json({ runs });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load research history", error);
    }
  });
}
