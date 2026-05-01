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
import deepEqual from "fast-deep-equal";
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
import { isAdminRole } from "@shared/constants";
import {
  getSpecialistForConstant,
  getRefreshCadenceDaysForConstant,
} from "../../../engine/analyst/registry/specialist-catalog";
import {
  verifyRefreshAction,
  type RefreshActionVerifyResult,
} from "../../notifications/constants-action-token";
import { CONSTANTS_TAB_PATH } from "../../notifications/constants-overdue-digest";

/**
 * In-memory in-flight set for the email-action `refresh-from-email`
 * route. Tokens carry an `issuedAt` timestamp that the route compares
 * against the latest successful research run for the row, so true
 * "I clicked yesterday and a run completed" idempotency comes from the
 * DB. This Set is the narrower race guard: when two tabs (or a curious
 * admin double-click) hit the same link within a few seconds, the
 * second call sees the first still in flight and short-circuits to a
 * "refresh already in progress" page instead of double-firing the
 * specialist before the run row lands.
 *
 * Keys are `${key}|${country ?? ""}|${subdivision ?? ""}` — the same
 * tuple shape the storage layer scopes runs by.
 */
const inflightRefreshFromEmail = new Set<string>();
function inflightKey(key: string, country: string | null, subdivision: string | null): string {
  return `${key}|${country ?? ""}|${subdivision ?? ""}`;
}

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
 *
 * Doctrine note (Task #388 — apply-research bypass close): `researchRunId`
 * is REQUIRED. The route loads the persisted `research_runs` row and
 * verifies that `value`, `authority`, `referenceUrl`, and `reasoning` all
 * match the proposal the Specialist actually returned. The override is
 * written from the run's persisted proposal — the request body fields are
 * only used as a tamper-detection cross-check. An admin can no longer
 * skip the Specialist regenerate step, type any value, label it
 * "analyst," and write it through.
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
   * produced it. REQUIRED — the route refuses to write an analyst-sourced
   * override that is not provably traceable to a server-issued proposal
   * (see Task #388 — close the apply-research doctrine bypass).
   */
  researchRunId: z.number().int().positive(),
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

      const [allOverrides, allCanonicals, cadenceOverrides] = await Promise.all([
        storage.listModelConstantOverrides(),
        storage.listCanonicals(),
        storage.getRefreshCadenceOverrides(),
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
        // second round-trip to the catalog. The admin override (if any)
        // lives on `specialist_configs.refresh_cadence_days` and shadows
        // the catalog default.
        const overrideCadence = owner ? cadenceOverrides.get(owner.id) : undefined;
        const refreshCadenceDays = overrideCadence ?? getRefreshCadenceDaysForConstant(key);
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

      const userId = (req.user as { id?: number } | undefined)?.id ?? null;

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
   *
   * Doctrine guard (Task #388 — close the apply-research bypass):
   *
   * Before Phase 3 closed the manual edit path, an admin could bypass the
   * Specialist by calling this route directly with any client-supplied
   * `value` / `authority` / `reasoning`. The route now requires a
   * `researchRunId`, loads that `research_runs` row scoped to (key, country,
   * subdivision), and refuses to write unless the body's value/authority/
   * referenceUrl/reasoning all match what the Specialist actually returned.
   * The override is then written from the *persisted* proposal — the body
   * fields are tamper-detection only. Mismatches log a `logger.warn` audit
   * trail and return 422 so we can surface bypass attempts in monitoring.
   */
  app.post("/api/admin/model-constants/:key/apply-research", requireAdmin, async (req, res) => {
    try {
      const key = String(req.params.key ?? "");
      if (!MODEL_CONSTANTS_REGISTRY[key]) {
        return res.status(404).json({ error: `Unknown constant key: ${key}` });
      }

      const userIdForLog = (req as { user?: { id?: number } }).user?.id ?? null;

      // Doctrine pre-check (Task #388): the apply path is reserved for
      // server-issued Specialist proposals, so a missing or malformed
      // `researchRunId` is a doctrine violation, not a malformed request.
      // It returns 422 (the doctrine code) rather than 400 (schema fail)
      // so monitoring can distinguish bypass attempts from typos. We do
      // this BEFORE the rest of the body parse so the response is the
      // same whether the caller omitted the id, sent null, or sent a
      // non-positive integer — every shape that means "no run id" is one
      // doctrine error, surfaced uniformly.
      const rawRunId = (req.body as { researchRunId?: unknown } | null)?.researchRunId;
      if (
        typeof rawRunId !== "number" ||
        !Number.isFinite(rawRunId) ||
        !Number.isInteger(rawRunId) ||
        rawRunId <= 0
      ) {
        logger.warn(
          `apply-research rejected: missing or invalid researchRunId for ${key}. ` +
            `userId=${userIdForLog ?? "anonymous"}. raw=${JSON.stringify(rawRunId)}.`,
          "model-constants",
        );
        return res.status(422).json({
          error:
            `Apply requires a researchRunId returned by POST /api/admin/model-constants/${key}/regenerate. ` +
            `Only AI Intelligence Specialists may set Constants — re-run /regenerate or /refresh and apply the result unchanged.`,
          code: "RESEARCH_RUN_ID_REQUIRED",
        });
      }

      const parsed = applyResearchBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const { country, subdivision } = normaliseLocality(parsed.data.country, parsed.data.countrySubdivision);

      const localityCheck = validateLocality(key, country, subdivision);
      if (!localityCheck.ok) {
        return res.status(400).json({ error: localityCheck.error });
      }

      const loc = `${country ?? "universal"}${subdivision ? `/${subdivision}` : ""}`;

      // Doctrine: the run id MUST resolve to a real research_runs row
      // whose recorded constant key/country/subdivision match the request.
      // We use a direct unbounded lookup by primary key (not a windowed
      // list+find) so a months-old run isn't silently 404'd just because
      // it fell outside a recency window — that would weaken the
      // traceability contract by accidentally rejecting valid replays.
      // After the row is loaded we still enforce key + locality scoping
      // against `metadata.constant`, so a run for a different tuple
      // cannot be replayed cross-row.
      const run = (await storage.getResearchRunById(parsed.data.researchRunId)) ?? null;
      if (!run) {
        logger.warn(
          `apply-research tamper attempt: researchRunId=${parsed.data.researchRunId} ` +
            `does not exist (requested for ${key} (${loc})). userId=${userIdForLog ?? "anonymous"}.`,
          "model-constants",
        );
        return res.status(422).json({
          error:
            `research_run ${parsed.data.researchRunId} does not exist. ` +
            `Apply requires a researchRunId returned by POST /api/admin/model-constants/${key}/regenerate ` +
            `for this same key and locality.`,
          code: "RESEARCH_RUN_NOT_FOUND",
        });
      }

      const meta = (run.metadata ?? {}) as {
        constant?: {
          key?: string;
          country?: string | null;
          subdivision?: string | null;
        };
        proposal?: {
          value?: unknown;
          authority?: string;
          referenceUrl?: string | null;
          reasoning?: string;
        };
      };

      // Cross-row replay guard. The persisted run's metadata.constant
      // tuple must equal the request's (key, country, subdivision). This
      // closes the bypass shape where an admin grabs a researchRunId
      // produced for one (key, locality) and applies it against a
      // different one — without this check, a direct-by-id lookup would
      // happily return that row.
      const persistedConstant = meta.constant ?? {};
      const persistedCountry = persistedConstant.country ?? null;
      const persistedSubdivision = persistedConstant.subdivision ?? null;
      if (
        persistedConstant.key !== key ||
        persistedCountry !== country ||
        persistedSubdivision !== subdivision
      ) {
        const persistedLoc = `${persistedCountry ?? "universal"}${persistedSubdivision ? `/${persistedSubdivision}` : ""}`;
        logger.warn(
          `apply-research tamper attempt: researchRunId=${parsed.data.researchRunId} ` +
            `belongs to ${persistedConstant.key ?? "(unknown)"} (${persistedLoc}) ` +
            `but apply requested ${key} (${loc}). userId=${userIdForLog ?? "anonymous"}.`,
          "model-constants",
        );
        return res.status(422).json({
          error:
            `research_run ${parsed.data.researchRunId} belongs to ${persistedConstant.key ?? "(unknown)"} ` +
            `(${persistedLoc}), not ${key} (${loc}). ` +
            `Only AI Intelligence Specialists may set Constants — re-run /regenerate or /refresh for this row.`,
          code: "RESEARCH_RUN_LOCALITY_MISMATCH",
          expected: { key, country, subdivision },
          actual: {
            key: persistedConstant.key ?? null,
            country: persistedCountry,
            subdivision: persistedSubdivision,
          },
        });
      }
      const persisted = meta.proposal;
      if (!persisted || persisted.value === undefined || !persisted.authority) {
        logger.warn(
          `apply-research rejected: research_run ${run.id} for ${key} (${loc}) ` +
            `does not carry a complete Specialist proposal. userId=${userIdForLog ?? "anonymous"}.`,
          "model-constants",
        );
        return res.status(422).json({
          error:
            `research_run ${run.id} does not carry a complete Specialist proposal — ` +
            `cannot apply.`,
          code: "RESEARCH_RUN_INCOMPLETE",
        });
      }

      // Tamper check — every proposer-controlled field in the body must
      // match the persisted proposal byte-for-byte. We check value with a
      // deep-equal (the proposer's value is JSON-typed: number / string /
      // object / array). authority/reasoning are strict string equality.
      // referenceUrl tolerates the null/missing equivalence (the proposer
      // can return `null` when no canonical URL exists).
      const persistedReferenceUrl = persisted.referenceUrl ?? null;
      const bodyReferenceUrl = parsed.data.referenceUrl ?? null;
      const tamperedFields: string[] = [];
      if (!deepEqual(parsed.data.value, persisted.value)) tamperedFields.push("value");
      if (parsed.data.authority !== persisted.authority) tamperedFields.push("authority");
      if (bodyReferenceUrl !== persistedReferenceUrl) tamperedFields.push("referenceUrl");
      if (parsed.data.reasoning !== (persisted.reasoning ?? "")) tamperedFields.push("reasoning");

      if (tamperedFields.length > 0) {
        logger.warn(
          `apply-research tamper attempt: ${tamperedFields.join(", ")} ` +
            `do not match research_run ${run.id} for ${key} (${loc}). ` +
            `userId=${userIdForLog ?? "anonymous"}. ` +
            `body=${JSON.stringify({
              value: parsed.data.value,
              authority: parsed.data.authority,
              referenceUrl: bodyReferenceUrl,
              reasoning: parsed.data.reasoning,
            })} persisted=${JSON.stringify({
              value: persisted.value,
              authority: persisted.authority,
              referenceUrl: persistedReferenceUrl,
              reasoning: persisted.reasoning,
            })}`,
          "model-constants",
        );
        return res.status(422).json({
          error:
            `Apply payload does not match the persisted Specialist proposal for research_run ${run.id}. ` +
            `Mismatched fields: ${tamperedFields.join(", ")}. ` +
            `Only AI Intelligence Specialists may set Constants — re-run /regenerate or /refresh and apply the result unchanged.`,
          code: "RESEARCH_RUN_TAMPERED",
          mismatchedFields: tamperedFields,
        });
      }

      const userId = (req as { user?: { id?: number } }).user?.id ?? null;

      // Write the override from the *persisted* proposal — the request
      // body has been verified to match, but we use the run as the
      // canonical source of truth so future audits can re-derive the
      // override from the FK-linked research_run alone.
      const result = await storage.upsertModelConstantOverride({
        constantKey: key,
        country,
        countrySubdivision: subdivision,
        value: persisted.value,
        source: "analyst",
        authority: persisted.authority,
        referenceUrl: persistedReferenceUrl,
        // Phase 2: every analyst regeneration writes a `research_runs` row
        // (see `proposeConstantRegeneration` in server/ai/regenerate-
        // constants.ts) and the proposal carries that id back to the Apply
        // call so the override is traceable to the run that produced it.
        researchRunId: run.id,
        // Preserve the analyst's reasoning in the override row so the audit
        // trail can show *why* the value moved when the override is later
        // listed in Admin.
        overrideNote: persisted.reasoning ?? null,
        createdBy: userId,
      });

      logActivity(
        req,
        "analyst-override-model-constant",
        "model-constant",
        0,
        result === null
          ? `Analyst regeneration of ${key} (${loc}) matched factory — no override stored.`
          : `Analyst regenerated ${key} (${loc}). Authority: ${persisted.authority}.`,
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
  /**
   * Banner data: scheduled-refresh failures the admin hasn't seen yet.
   *
   * GET → returns failed scheduled Constants refreshes whose `completedAt`
   * is newer than the admin's last visit to the `admin-constants-failures`
   * page-visit key (or the last 30d on first visit). The Constants tab
   * renders a dismissible banner when `count > 0`.
   *
   * POST `.../dismiss` → records a fresh visit so subsequent loads see no
   * failures (until the next failure occurs after the dismissal time).
   */
  const FAILURES_PAGE_KEY = "admin-constants-failures";
  const FAILURES_DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

  app.get("/api/admin/model-constants/scheduled-failures", requireAdmin, async (req, res) => {
    try {
      const userId = (req as { user?: { id?: number } }).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      // "Since admin's last visit" semantics: read the previous visit
      // timestamp, then immediately record a new visit for next time.
      // This way the banner naturally clears across reloads — failures
      // only re-surface when fresh ones land after the most recent view.
      // The explicit dismiss endpoint stays as a UX shortcut for users
      // who want to acknowledge & clear without leaving the tab.
      const prior = await storage.getPageVisit(userId, FAILURES_PAGE_KEY);
      const lastVisitedAt = prior?.lastVisitedAt ?? null;
      const since = lastVisitedAt
        ? new Date(lastVisitedAt)
        : new Date(Date.now() - FAILURES_DEFAULT_LOOKBACK_MS);

      const runs = await storage.getFailedScheduledConstantsRefreshes(since, 200);
      const failures = runs.map((run) => {
        const meta = (run.metadata ?? {}) as {
          constant?: { key?: string; country?: string | null; subdivision?: string | null };
          specialistLetter?: string | null;
        };
        return {
          id: run.id,
          key: meta.constant?.key ?? "(unknown)",
          country: meta.constant?.country ?? null,
          subdivision: meta.constant?.subdivision ?? null,
          specialistLetter: meta.specialistLetter ?? null,
          completedAt: run.completedAt?.toISOString() ?? null,
          error: run.error ?? null,
        };
      });

      // Record the visit AFTER computing the failure list so the next
      // call uses this load's timestamp as the "since" boundary.
      await storage.recordVisit(userId, FAILURES_PAGE_KEY);

      res.json({
        count: failures.length,
        since: since.toISOString(),
        lastVisitedAt: lastVisitedAt ? new Date(lastVisitedAt).toISOString() : null,
        failures,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load scheduled-refresh failures", error);
    }
  });

  app.post("/api/admin/model-constants/scheduled-failures/dismiss", requireAdmin, async (req, res) => {
    try {
      const userId = (req as { user?: { id?: number } }).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const visit = await storage.recordVisit(userId, FAILURES_PAGE_KEY);
      res.json({ dismissedAt: visit.lastVisitedAt });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to dismiss scheduled-refresh failures", error);
    }
  });

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

  /**
   * Email-action: one-click "Re-fetch from authority" from the
   * overdue-digest email (Task #602).
   *
   * Why this is GET (not POST):
   *   The link lives inside an email body. Mail clients render `<a href>`
   *   as plain GET clicks; some preview-fetch them but only with GET.
   *   We accept the slightly-unusual "GET that has side effects" because
   *   the alternative — a JS-driven landing page with a confirmation
   *   button — defeats the "one-click" requirement, and because every
   *   safety property a POST would buy us is recovered by:
   *     - HMAC-signed token bound to (key, country, subdivision, issuedAt)
   *       with a 14-day TTL — opaque deep-links cannot fire arbitrary rows
   *     - `requireAdmin` (handler-side, after token verify so we can
   *       render an HTML "log in to continue" page rather than JSON 401)
   *     - Idempotency via a DB check ("most recent successful run for
   *       this row newer than the token's issuedAt → already refreshed")
   *       plus an in-memory in-flight guard for back-to-back clicks
   *
   * What it does NOT do:
   *   It triggers `proposeConstantRegeneration` (which persists a
   *   `research_runs` row) but it does NOT write `model_constant_overrides`.
   *   The admin still applies (or discards) the proposal from the
   *   Constants tab using the existing `/apply-proposal` flow. This
   *   matches the doctrine that ONLY the Constants tab Apply button can
   *   commit a Specialist proposal — the email link merely re-fires the
   *   silent specialist so an apply candidate exists.
   */
  app.get("/api/admin/model-constants/refresh-from-email", async (req, res) => {
    const k = typeof req.query.k === "string" ? req.query.k : "";
    const c = typeof req.query.c === "string" && req.query.c.length > 0 ? req.query.c : null;
    const s = typeof req.query.s === "string" && req.query.s.length > 0 ? req.query.s : null;
    const t = typeof req.query.t === "string" ? req.query.t : "";

    // 1. Verify the signed token first so we know the URL is one we
    //    actually issued. We do this BEFORE auth checks so an unauth'd
    //    visitor with a forged URL cannot be tricked into logging in
    //    just to receive a "bad signature" page.
    const verified: RefreshActionVerifyResult = verifyRefreshAction(t);
    if (!verified.ok) {
      const reason = verified.reason;
      const status = reason === "expired" ? 410 : 400;
      return res
        .status(status)
        .type("html")
        .send(
          renderActionPage({
            heading: reason === "expired" ? "Link expired" : "Invalid link",
            body:
              reason === "expired"
                ? "This refresh link has passed its 14-day expiration window. Open the Constants tab and click 'Refresh research' on the row instead."
                : "This refresh link is malformed or has been tampered with. Open the Constants tab and click 'Refresh research' on the row instead.",
            tabUrl: CONSTANTS_TAB_PATH,
          }),
        );
    }

    // 2. Cross-check: query-string parameters must match the signed
    //    payload byte-for-byte. The HMAC already covers the payload, so
    //    a query-string mismatch means the URL is a stitched-together
    //    forgery (token from one URL, params from another). Reject.
    if (
      verified.payload.key !== k ||
      verified.payload.country !== c ||
      verified.payload.subdivision !== s
    ) {
      return res
        .status(400)
        .type("html")
        .send(
          renderActionPage({
            heading: "Invalid link",
            body: "This refresh link's parameters do not match its signature. Open the Constants tab manually instead.",
            tabUrl: CONSTANTS_TAB_PATH,
          }),
        );
    }

    // 3. Constant must still exist in the registry. A retired key in a
    //    long-tail email link should fail with a clear message.
    if (!MODEL_CONSTANTS_REGISTRY[k]) {
      return res
        .status(404)
        .type("html")
        .send(
          renderActionPage({
            heading: "Constant not found",
            body: `'${k}' is no longer a registered constant. The registry may have changed since this email was sent.`,
            tabUrl: CONSTANTS_TAB_PATH,
          }),
        );
    }

    // 4. Auth — handler-side so we can render HTML rather than the
    //    JSON 401 the `requireAdmin` middleware emits. We deliberately
    //    do NOT redirect to `/login?returnTo=...` (no such flow exists
    //    in this app); the page tells the user to log in and click the
    //    link again, which works because the token TTL is 14 days.
    const user = (req as { user?: { id?: number; role?: string } }).user;
    if (!user) {
      return res
        .status(401)
        .type("html")
        .send(
          renderActionPage({
            heading: "Sign in required",
            body: "Sign in to your admin account, then click the refresh link in your email again.",
            tabUrl: "/login",
            tabUrlLabel: "Sign in",
          }),
        );
    }
    if (!isAdminRole(user.role ?? "")) {
      return res
        .status(403)
        .type("html")
        .send(
          renderActionPage({
            heading: "Admin access required",
            body: "Only admin accounts can re-fire a Constants source. Ask an admin to click the link in their copy of the digest.",
          }),
        );
    }

    const loc = `${c ?? "universal"}${s ? `/${s}` : ""}`;

    // 5. Locality validation matches the rest of this file's routes.
    //    The token signs whatever the digest emitted, but the registry
    //    rules still apply — e.g. a token for a universal constant
    //    minted before the constant was demoted to country-scope must
    //    not silently produce a dead row.
    const localityCheck = validateLocality(k, c, s);
    if (!localityCheck.ok) {
      return res
        .status(400)
        .type("html")
        .send(
          renderActionPage({
            heading: "Invalid locality",
            body: localityCheck.error,
            tabUrl: CONSTANTS_TAB_PATH,
          }),
        );
    }

    // 6. Idempotency: if a successful run for this row has already
    //    completed AFTER the token was issued, the digest's request
    //    has already been satisfied. Re-clicking the link is a no-op.
    try {
      const latest = await storage.getLatestSuccessfulRunForConstant(k, c, s);
      const issuedAtDate = new Date(verified.payload.issuedAt);
      if (latest?.completedAt && latest.completedAt > issuedAtDate) {
        return res
          .status(200)
          .type("html")
          .send(
            renderActionPage({
              heading: "Already refreshed",
              body:
                `${k} (${loc}) has already been refreshed at ${latest.completedAt.toISOString()} — ` +
                `after this email was sent. No action taken.`,
              tabUrl: CONSTANTS_TAB_PATH,
            }),
          );
      }
    } catch (err: unknown) {
      // A storage hiccup on the idempotency check is non-fatal — fall
      // through to the in-flight guard + refresh attempt rather than
      // refusing the action and leaving the row stuck.
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `refresh-from-email: idempotency check failed for ${k} (${loc}); proceeding: ${msg}`,
        "model-constants",
      );
    }

    // 7. In-flight race guard. Two clicks within seconds (e.g. tabbed
    //    open from email preview + clicked from Reading pane) must not
    //    both fire `proposeConstantRegeneration`.
    const lockKey = inflightKey(k, c, s);
    if (inflightRefreshFromEmail.has(lockKey)) {
      return res
        .status(202)
        .type("html")
        .send(
          renderActionPage({
            heading: "Refresh already in progress",
            body:
              `Another refresh request for ${k} (${loc}) is currently running. ` +
              `It will appear on the Constants tab as soon as it completes.`,
            tabUrl: CONSTANTS_TAB_PATH,
          }),
        );
    }
    inflightRefreshFromEmail.add(lockKey);

    try {
      const overrides = await storage.listModelConstantOverrides();
      const proposal = await proposeConstantRegeneration({
        key: k,
        country: c,
        subdivision: s,
        overrides,
      });

      logActivity(
        req,
        "refresh-from-email-model-constant",
        "model-constant",
        0,
        `Email-action refresh for ${k} (${loc}). Authority: ${proposal.authority}. ${
          proposal.isDifferentFromCurrent ? "Differs from current — admin must Apply on the Constants tab." : "Confirmed current."
        }`,
      );

      return res
        .status(200)
        .type("html")
        .send(
          renderActionPage({
            heading: proposal.isDifferentFromCurrent
              ? "Refresh complete — review on the Constants tab"
              : "Refresh complete — value confirmed",
            body: proposal.isDifferentFromCurrent
              ? `${proposal.label} (${loc}) was re-fetched from ${proposal.authority}. The new value differs from the current one — open the Constants tab to review and Apply.`
              : `${proposal.label} (${loc}) was re-fetched from ${proposal.authority}. The current value is still correct; no Apply is needed.`,
            tabUrl: CONSTANTS_TAB_PATH,
          }),
        );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `refresh-from-email: proposeConstantRegeneration failed for ${k} (${loc}): ${msg}`,
        "model-constants",
      );
      return res
        .status(502)
        .type("html")
        .send(
          renderActionPage({
            heading: "Refresh failed",
            body:
              `The Specialist could not refresh ${k} (${loc}): ${msg}. ` +
              `Open the Constants tab to retry manually.`,
            tabUrl: CONSTANTS_TAB_PATH,
          }),
        );
    } finally {
      inflightRefreshFromEmail.delete(lockKey);
    }
  });
}

/**
 * Render a small self-contained HTML page for the email-action route.
 * No SPA dependency — the admin clicks a link in their email client and
 * lands on a static page that summarises the result and offers a link
 * back to the Constants tab. Inline styles only so the page renders
 * the same way regardless of CSS bundle availability.
 */
function renderActionPage(args: {
  heading: string;
  body: string;
  tabUrl?: string;
  tabUrlLabel?: string;
}): string {
  const escape = (s: string): string =>
    s.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const linkHtml = args.tabUrl
    ? `<p style="margin-top:1.5rem"><a href="${escape(args.tabUrl)}" style="color:#2563eb;text-decoration:underline">${escape(args.tabUrlLabel ?? "Open the Constants tab")}</a></p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escape(args.heading)} — Constants refresh</title>
</head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#f8fafc;margin:0;padding:2rem">
  <main style="max-width:42rem;margin:2rem auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:0.75rem;padding:2rem;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
    <h1 style="font-size:1.25rem;margin:0 0 0.75rem 0;color:#0f172a">${escape(args.heading)}</h1>
    <p style="margin:0;line-height:1.5;color:#334155">${escape(args.body)}</p>
    ${linkHtml}
  </main>
</body>
</html>`;
}

/**
 * Test seam — clear the in-flight set between unit tests so they don't
 * pollute one another. Not used by production code.
 */
export function _resetRefreshFromEmailInflight(): void {
  inflightRefreshFromEmail.clear();
}
