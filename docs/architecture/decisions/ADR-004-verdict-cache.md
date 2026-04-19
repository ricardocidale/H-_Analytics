# ADR-004: Verdict Cache

**Status:** Proposed
**Date:** 2026-04-20
**Deciders:** Claude Code (proposer), human steward, Replit Agent (implementer)
**Tags:** analyst, cognitive-engine, performance, cost

---

## Context

Every Tier-1 Analyst consult runs the full N+1 pipeline (`server/ai/research-orchestrator.ts`): two parallel panel calls (Gemini 2.5 Flash + Claude Sonnet 4.5) plus an Opus 4.6 synthesis. Per-call marginal cost ≈ **$0.70** at current (April 2026) Vercel AI Gateway BYOK pricing, with latency **30–60s end-to-end** for the streaming phase.

**The problem is that this cost/latency is paid on every user interaction, even when the answer cannot change.** The pipeline has no memoization layer. Four clicks on "Ask the Analyst" for the same property + same field group = four full orchestrations = ~$2.80 and 2–4 minutes of Opus time for an answer that is definitionally identical.

Real usage multiplies this. The staleness detector (`server/ai/staleness-detector.ts`) runs a 30-day TTL against `assumption_guidance`, meaning any field untouched for a month re-runs Tier-1. A portfolio dashboard with 15 properties × ~12 Tier-1 fields × one user click/day = ~180 Tier-1 calls/day = **~$125/day / ~$45K/year** at steady state. The cache opportunity is bigger than the raw compute cost because it also unblocks aggressive UX patterns we currently avoid — ambient background refreshes, cross-portfolio consistency checks, "what if I change this input" live previews — all of which would be cost-prohibitive today.

A partial cache exists. `assumption_guidance` (`shared/schema/intelligence-v2.ts`) already stores per-(scenarioId, entityType, entityId, assumptionKey) rows with a unique index and `dataQuality` / `researchRunId` metadata. The Phase 5 notes in `.claude/skills/analyst/cognitive-engine.md` §Open questions flag this gap:

> **Orchestrator-level cache** — ten clicks on the same property = ten full pipeline runs. Needs `(propertyId, fieldGroup, contextHash)` memo with TTL.

This ADR proposes the concrete shape. It must land **before** Phase 5 Specialist expansion because every new Tier-1 Specialist compounds the uncached cost.

---

## Decision

We add a content-addressed verdict cache layered over `assumption_guidance` + `research_runs`, keyed by property state rather than clock time. Specifically:

### 1. Cache key shape

The cache key is a SHA-256 hash of a canonical JSON of:

```ts
type VerdictCacheKey = {
  scenarioId: number | null;          // null = shared workspace
  entityType: "property" | "company";
  entityId: number;
  fieldGroup: string[];                // sorted, deduplicated canonical field keys
  personaHash: string;                 // hash of resolved AnalystPersona
  inputContextHash: string;            // hash of the property inputs that affect this field group
  engineVersion: string;               // bumped when orchestrator semantics change
};
```

Canonicalization: fields sorted alphabetically, JSON.stringify with stable key order, trim whitespace. The resulting hash is stored as `cache_key` (text, indexed) on `research_runs`, **not** on `assumption_guidance` — because `research_runs` is the unit that produces the evidence, and one run populates many `assumption_guidance` rows.

### 2. Storage — reuse `research_runs` + `assumption_guidance`

**No new table.** Add two columns to `research_runs`:
- `cache_key` (text, indexed) — the hash above.
- `cache_inputs_hash` (text) — the raw `inputContextHash` piece, stored separately so we can diagnose why a cache missed without rehashing.

Add one column to `assumption_guidance`:
- `superseded_at` (timestamp, nullable) — set when a later run replaces this row's value. Retains audit trail without deleting.

Cache lookup path:

```
for each requested (entityType, entityId, fieldGroup, persona):
  compute key
  SELECT from research_runs WHERE cache_key = $key AND status = 'complete'
    AND created_at > now() - TTL
    ORDER BY created_at DESC LIMIT 1
  if hit:
    JOIN to assumption_guidance rows with matching researchRunId
    return as AnalystVerdict reconstructed via buildAnalystVerdict()
  else:
    invoke orchestrator, persist on completion with cache_key set
```

### 3. TTL policy — two-axis

A cache entry is **fresh** iff BOTH:

- **Time-based:** `now() - created_at < TTL`, where TTL comes from `global_assumptions.verdictCacheTtlDays` (default 30, same as staleness detector) with optional per-surface override.
- **Content-based:** the current `inputContextHash` for the requested entity/fieldGroup matches the stored `cache_inputs_hash`. Any property input change that the field group depends on flips this.

**Either axis failing = miss.** Time-based alone is not sufficient (user changes property.tier → old range is wrong even if 1 minute old); content-based alone is not sufficient (market conditions drift even when inputs are static).

### 4. Invalidation triggers

Explicit invalidation (beyond natural TTL expiry):

1. **Property input mutation** — post-save hook in `server/routes/properties.ts` computes the new `inputContextHash` for the property's field groups; if changed, sets `superseded_at` on affected `assumption_guidance` rows. (No delete — audit trail preserved.)
2. **Global assumption mutation** — same pattern, scoped to global-field groups.
3. **Admin reindex of pgvector namespaces** — marks all Tier-1 `research_runs` with `superseded_at = now()` because peer-retrieval context changed.
4. **Engine version bump** — changing orchestrator semantics (new panel model, new synthesis prompt, FIELD_DEFINITIONS update) bumps `engineVersion`, which is part of the key → cold cache for affected runs. Handled automatically.
5. **User explicitly clicks "Ask the Analyst"** — bypasses cache for that call (power-user escape hatch). Does not invalidate siblings.

### 5. Miss path — stream-through with write-after

On cache miss the engine-client façade invokes `orchestrateResearch()` unchanged. When the stream completes successfully, a finalization step persists `research_runs` (with `cache_key` + `cache_inputs_hash`) and the flattened `assumption_guidance` rows in a single transaction. If the run fails or is cancelled, nothing is persisted and the miss remains a miss.

### 6. Read API via the engine-client façade

All cache interaction lives behind the Phase 2 stub → Phase 3 façade `engine/analyst/cognitive/engine-client.ts`. Specialists see one call: `consult(req) → AnalystVerdict`. Hit vs miss is invisible to the caller. Phase 2 stub does NOT short-circuit to cache; the cache lookup is a Phase 5 landing that swaps the stub body.

### 7. Cache metrics

Three metrics surface in admin observability (Phase 5 extends the existing health route):

- `cache_hit_rate` — % of façade calls served from cache in the last 24h.
- `cache_miss_reason_breakdown` — pie chart of `fresh_miss` / `ttl_expired` / `inputs_changed` / `explicit_bypass` / `engine_version_drift` / `superseded`.
- `cache_cost_saved_usd` — estimated dollars saved based on hit count × typical pipeline cost.

These feed the PostHog handoff (N5) and Sentry financial-contexts handoff (N4) without duplicate instrumentation.

---

## Consequences

### Positive

- **~80% cost reduction at steady state** based on observed access patterns in session replays (same property viewed multiple times per session). $125/day → ~$25/day at 15 properties.
- **Latency collapses to < 100ms** on hits (single indexed lookup). Opens UX patterns (ambient refresh, cross-portfolio scan) that are cost-prohibitive today.
- **Zero new tables.** Extends existing `research_runs` and `assumption_guidance` — one migration, no new storage domain to reason about.
- **Audit trail preserved.** `superseded_at` means nothing is deleted; regulators / LPs can always see what The Analyst said on a given date.
- **Invalidation is automatic for the common case** (input mutation). No admin action needed unless a pipeline-level change happens.
- **Cache staleness and field staleness share one concept.** The staleness detector already uses 30-day TTL from `global_assumptions`; the cache reuses the same knob. No divergence risk.

### Negative

- **Two-axis TTL is harder to reason about than time-only.** Contributors must remember "fresh" means both time AND content. Mitigation: `MissReason` enum in telemetry names the exact axis that failed, plus skill doc.
- **Canonical JSON hashing is fragile.** Adding an ignored-by-display field to a property could change `inputContextHash` and cold-cache everything if the field-group dependency list isn't kept tight. Mitigation: the dependency map lives in code (`FIELD_GROUP_INPUT_DEPENDENCIES`), tested, and reviewed per field-group addition.
- **`engineVersion` has to be bumped carefully.** Forgetting to bump after a synthesis prompt change means serving stale reasoning as "fresh." Mitigation: a test compares a hash of the synthesis-schema.ts + prompt builder against the declared engineVersion — test fails on drift.
- **Additional migration risk.** Adding columns to populated tables is low-risk but not zero. Mitigation: Replit owns migrations; dry-run on dev Neon first.
- **No cross-user cache sharing in this design.** Two users asking about the same property run twice if they don't share `scenarioId`. Sharing would require personal-persona hashing separation, which we aren't ready to specify. Deferred to a follow-up ADR if needed.

### Neutral / Notable

- **The cache is advisory, not authoritative.** The façade can choose to bypass on specific conditions (admin override, explicit user click). Consumers see `AnalystVerdict`; they do not need to know the cache exists.
- **`superseded_at` populates over time.** The table grows. A Phase 6 archival job can move `superseded_at IS NOT NULL AND created_at < now() - 365d` rows to a cold table. Not urgent.
- **Multi-tenant persona resolution (N3 in SYSTEM-MODEL.md) is a key input.** The cache key's `personaHash` assumes a resolved persona. Until N3 lands, `personaHash = hash("{L+B, luxury, US}")` (current single-tenant hardcode). The cache shape does not change when N3 lands — only the hash input does. **This is the reason the cache should land before N3: the key format is persona-shape-agnostic.**

---

## Alternatives considered

### Alternative A: New `verdict_cache` table

A dedicated table keyed on `cache_key` storing the serialized `AnalystVerdict` as JSONB. Simpler lookup (no join), separates cache concerns cleanly.

**Reject.** Duplicates data that already lives in `assumption_guidance` (ranges, conviction, sources, reasoning). Invalidation would have to keep two tables in sync. The audit story (who asked The Analyst what, when) is weaker because evidence lives in `assumption_guidance` but the final rendered verdict lives in cache. One table = one truth.

### Alternative B: In-memory LRU cache in-process

Use a Map with LRU eviction in the Node process. Zero DB changes.

**Reject.** Replit Deployments use autoscale — multiple instances serve the same users. Per-process cache has a ~25% hit rate at best under autoscale. Also lost on deploy. The savings justify DB-backed persistence.

### Alternative C: Redis (managed)

A real cache tier, sub-ms reads, cross-instance coherency.

**Reject for now.** Adds a third infrastructure dependency (Neon + Object Storage + Redis). The access pattern here is not latency-critical (we're comparing 50ms DB lookup to 60s Opus call). A Postgres-backed cache is 30× faster than the miss path — that's all we need. Redis may come later if read pressure becomes the bottleneck, which would be a good problem.

### Alternative D: Time-only TTL, no input-context hashing

Simpler implementation. Matches what many systems do.

**Reject.** The primary bug pattern is "user changes property.tier, old range shown as fresh for 29 more days." Input-based invalidation is the point, not an optimization.

### Alternative E: Cache the Opus synthesis output, re-run panels

Save the final synthesized JSON only; when an input changes, re-run panels but reuse part of the prompt cache.

**Reject.** Vercel AI Gateway + Anthropic native prompt caching (OT-A.1) already handles prompt-level reuse. The verdict cache sits at a higher layer — it answers "can we skip the whole call?" — and is compatible with, not redundant to, prompt caching.

---

## Implementation notes

### Phase 5A — Migrations + metadata (Replit, 1 commit)

1. Add `cache_key` (text, indexed), `cache_inputs_hash` (text) to `research_runs`.
2. Add `superseded_at` (timestamp) to `assumption_guidance`.
3. Drizzle migration + dev/prod runbook.
4. `FIELD_GROUP_INPUT_DEPENDENCIES` map in `server/ai/synthesis-schema.ts` — declares which property inputs each canonical field depends on. Tested against `CANONICAL_RESEARCH_FIELDS`.
5. `computeCacheKey()` + `computeInputContextHash()` utilities in `engine/analyst/cognitive/cache-keys.ts`.

### Phase 5B — Façade read path (Claude Code, 1 commit)

1. Implement `engine/analyst/cognitive/engine-client.ts` — the Phase 2 stub becomes real. `consult(req)` does cache lookup; on hit, reconstructs `AnalystVerdict` from `research_runs` + `assumption_guidance`; on miss, invokes `orchestrateResearch()`.
2. `MissReason` enum + telemetry emit.
3. Unit tests covering hit / ttl_expired / inputs_changed / engine_version_drift / superseded paths.

### Phase 5C — Write-after + invalidation hooks (Replit, 1–2 commits)

1. Orchestrator completion → write `research_runs` row with `cache_key` + `cache_inputs_hash` then persist `assumption_guidance` rows under one transaction.
2. Property mutation post-save: recompute affected `inputContextHash`s, set `superseded_at` on stale rows.
3. Global-assumption mutation: same pattern.
4. pgvector reindex: bulk-set `superseded_at` on Tier-1 rows.

### Phase 5D — Observability + admin (Replit, 1 commit)

1. Extend admin health endpoint with hit rate + miss breakdown + estimated savings.
2. PostHog events (pairs with N5): `verdict_cache.hit`, `verdict_cache.miss`, tagged by reason.
3. Admin manual-evict button (power user), gated on admin role, writes audit log entry.

### `engineVersion` drift guard

Add `tests/proof/engine-version-drift.test.ts`: hashes the concatenation of `synthesis-schema.ts` + `research-prompt-builders.ts` + model version constants; fails if hash doesn't match the declared `ENGINE_VERSION` export. This catches "forgot to bump version after a synthesis change."

### Multi-tenant persona forward compatibility

The key shape includes `personaHash` as a string. N3 (multi-tenant persona resolution) changes how the persona is resolved but not how it hashes. When N3 lands, the `personaHash` input changes from `hash("{L+B, luxury, US}")` to `hash(resolvedPersona)` — all existing cache entries naturally cold-miss for different personas, as intended.

### Bench before ship

Before Phase 5D, measure hit rate on a replay of one session's real requests (captured via access logs). Accept cache if hit rate > 40%. Roll back if > 5% incorrect-hit (stale data served as fresh) — this is what the engineVersion drift test prevents but bench empirically.

---

## References

- ADR-001 — two-tier Analyst architecture (why Specialists, not one big Engine)
- ADR-002 — `engine/analyst/` skeleton + façade plan
- ADR-003 — `AnalystVerdict` contract (what the cache serves)
- `docs/architecture/SYSTEM-MODEL.md` §9 N2 — this ADR answers the "ship verdict-cache ADR" next-step
- `docs/architecture/analyst/cognitive-engine.md` §Open questions #1 — the gap this closes
- `.claude/skills/analyst/cognitive-engine.md` — Cognitive Engine usage rules (cache is a Phase 5 addition)
- `.claude/skills/analyst/contracts.md` — contract shapes the cache stores
- `.claude/rules/analyst-verdict-contract.md` — verdict invariants (cached verdicts must still pass)
- `server/ai/research-orchestrator.ts` — orchestrator we memoize
- `server/ai/staleness-detector.ts` — 30-day TTL we reuse
- `shared/schema/intelligence-v2.ts` — `assumption_guidance` + `research_runs` tables we extend
