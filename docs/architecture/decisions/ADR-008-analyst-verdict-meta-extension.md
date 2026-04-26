# ADR-008: AnalystVerdict.meta extension — fallbackReason, vendorsUsed, cacheState

**Status:** Accepted (2026-04-26 — Ricardo accepted "follow recommendations" after CC walked through trade-offs per field)
**Date:** 2026-04-26 (proposed) → 2026-04-26 (accepted)
**Deciders:** Ricardo (product directive: "make Specialists super smart" → necessitates surfaced provenance), Claude Code (proposer + research/intelligence lane owner per `claude-replit-split.md` 2026-04-26)
**Tags:** analyst, contract, verdict-meta, additive, tier-0-fallback, vendor-breadth, cache-provenance

---

## Context

ADR-003 froze the `AnalystVerdict` shape on 2026-04-19. The frozen `AnalystVerdictMetaSchema` declares three keys: `tier`, `durationMs`, `cognitiveRunId?`. That set was sufficient for Phase 3b's two watchdog-wrapping Specialists (Tier-0 by design) and for the initial Tier-1 lab work.

ADR-007 (accepted 2026-04-26) graduates Specialists to Tier-1. Three observable signals that did not exist in Phase 3b are now needed by callers and verification packets:

1. **`fallbackReason`** — when a Tier-1-graduated Specialist falls back to Tier-0 (Tier-1 unavailable, deps not wired, cognitive timeout), the Specialist must declare *why* so the UI badge ("Tier-1 unavailable") has data and so the Surface Router's downgrade logic can route correctly. ADR-007 §6 ("wiring matters; data quality follows") and the Intelligence Bar both assume this signal exists; Phase 3b's Tier-0 Specialists never needed it because they never *attempted* Tier-1.
2. **`vendorsUsed`** — `.claude/rules/llm-vendor-roster.md` requirement #7 (vendor-breadth N+1 routing) requires ≥2 distinct vendors per cognitive run. Without surfacing the vendor list, the rule is unverifiable from the verdict and the per-Specialist fixture asserted in `tests/proof/specialist-intelligence-bar.test.ts` (planned) cannot run.
3. **`cacheState`** — Phase 5B v2 (commit `24853904`) added the verdict-reconstruction seam under ADR-004. Operators need to see whether a verdict came from cache HIT or fresh MISS to triage cost-economics issues and to verify the cache is actually warming. Without `cacheState`, ADR-004's success criteria are unobservable in production.

The G1 Funding graduation packet's verification spec (lines 159–166) asked Replit to verify all four signals (`cognitiveRunId`, `fallbackReason`, `vendorsUsed`, `cacheState`). Replit's BLOCKED report (`adr-007-g1-funding-graduation.BLOCKED.md`, commit `64701f7b`) traced the failure: only `cognitiveRunId` is declared in the contract; the other three are not allowed by the Zod schema and would be dropped by the Surface Router even if a Specialist emitted them. **The packet author (CC) wrote a verification spec against a contract that does not yet exist.**

This ADR closes the doctrine gap before the corresponding code packet (G1.5a) is authored. Per `.claude/rules/claude-replit-split.md` §"Doctrine Freeze Gate," a phase pauses while doctrine is unstable; this ADR is the unblock.

---

## Decision

Extend `AnalystVerdictMetaSchema` in `engine/analyst/contracts/verdict.ts` with three optional fields, plus one new top-level invariant:

```ts
export const FALLBACK_REASONS = [
  "tier1_unavailable",      // Specialist attempted Tier-1, deps undefined / orchestrator unreachable
  "tier1_timeout",          // Cognitive run exceeded the role's latency ceiling
  "tier1_disabled",         // Specialist config has `tier1Enabled: false`
  "cache_corrupted",        // Reconstructor found cache row but reconstruction failed validation
] as const;

export const AnalystVerdictMetaSchema = z.object({
  tier: z.union([z.literal(0), z.literal(1)]),
  durationMs: z.number().min(0).finite(),
  cognitiveRunId: z.string().optional(),
  fallbackReason: z.enum(FALLBACK_REASONS).optional(),
  vendorsUsed: z.array(z.string().min(1)).optional(),
  cacheState: z.enum(["hit", "miss"]).optional(),
});
```

### New invariants (added to `AnalystVerdictSchema.refine` chain)

1. **`fallbackReason` is exclusively a Tier-0 signal.** When present, `tier` MUST be `0`. (`tier === 1 && fallbackReason !== undefined` is invalid — a successful Tier-1 run does not "fall back.")
2. **`vendorsUsed` is exclusively a Tier-1 signal.** When present, `tier` MUST be `1` and `vendorsUsed.length >= 2` (per `llm-vendor-roster.md` requirement #7).
3. **`cacheState` is exclusively a Tier-1 signal.** When present, `tier` MUST be `1`.

### What is NOT decided here

- **`fallbackReason` is NOT required when `tier === 0`.** Born-Tier-0 Specialists (`mgmt-co.revenue` until G2 graduates it, `mgmt-co.compensation`, etc.) emit Tier-0 verdicts as their normal mode — they are not "falling back." Only Tier-1-graduated Specialists are expected to emit `fallbackReason` when they hit the Tier-0 branch. This is enforced per-Specialist in the Specialist's own implementation and asserted in the persona-keyed golden bench, not at the contract level.
- **`vendorsUsed` and `cacheState` are NOT required when `tier === 1`.** Tier-1 verdicts may legitimately omit them when the cognitive run is single-vendor (rare; allowed for cost-bounded fallback) or when the cache reader is not wired (Phase 5C still pending). Future ADR may tighten this.
- **No new fields beyond these three.** Provenance signals like `costUsd`, `evidenceFreshness`, `regressCount`, `promptEngineerRunId` are real Intelligence Bar requirements but defer to follow-up ADRs as they land. This ADR is the minimum unblock for G1.5a.
- **Existing data does not migrate.** Three fields are optional; existing serialized verdicts continue to validate. No backfill.

### Canonical fallbackReason vocabulary

The four strings in `FALLBACK_REASONS` are the closed set. Specialists MUST NOT invent new strings. New reasons require an ADR amendment listing the new string, its semantic meaning, and which Specialist emits it.

---

## Consequences

### Positive

- **Closes the G1.5a packet contract gap.** With this ADR accepted, G1.5a can extend `verdict.ts`, route the new fields through `surface-router.ts`, and emit `fallbackReason: "tier1_unavailable"` from `funding-specialist.ts` Tier-0 path — three small edits, all mechanical.
- **Makes Intelligence Bar requirement #7 (vendor breadth) verifiable.** Once Specialists emit `vendorsUsed`, the planned `tests/proof/specialist-intelligence-bar.test.ts` proof gate becomes implementable.
- **Makes ADR-004 cache observability real.** Operators see HIT vs MISS in the verdict; cache warm-up is no longer an inferred metric.
- **Strict additive — no breaking change.** Existing verdicts (Phase 3b, golden bench fixtures, persona test bench) continue to validate. Only new fields are added; no existing field is renamed, removed, or made required.
- **Closes doctrine before code.** Honors the Doctrine Freeze Gate. Future Tier-1 graduations (G2-G6) inherit the contract and don't repeat the packet-author error that triggered Replit's BLOCKED report.

### Negative

- **Three more fields means three more refinements in the Zod chain.** Marginal cost; one-line additions each.
- **Specialists that emit `fallbackReason` must be updated to use the canonical enum, not free-form strings.** The Funding Specialist is the only consumer today (G1); follow-up Specialists inherit the constraint at construction time.
- **`vendorsUsed` ships as plain `string[]`, not a canonical vendor enum.** Vendor ID drift (`"anthropic"` vs `"Anthropic"`) is a known tax. A follow-up ADR will lock down a `VENDOR_IDS` enum aligned with `.claude/rules/llm-vendor-roster.md` once Tier-1 vendor-emission code stabilizes (target: before G3, or earlier if drift is observed). Until then, Specialists MUST use the canonical lowercase form documented in their vendor-emission code.
- **The `meta` object will grow.** This ADR adds 3 fields (going from 3 → 6). Follow-up ADRs (cost, evidence freshness, regress count, prompt-engineer run id) will likely push it toward ~10 fields, half of which are Tier-1-only. We accept this and flag a future one-time normalization ADR (likely a `tier1Provenance: {...}` sub-object) when meta reaches ~8 fields. Doing it now would break existing consumers of `meta.cognitiveRunId`; doing it later in one batch is cheaper than incremental nesting.
- **The persona-keyed golden bench (`tests/analyst/personas/lb.test.ts`) needs an additional fixture exercising the `fallbackReason: "tier1_unavailable"` path** to lock in the new contract behavior. One more fixture, ~30 LOC.
- **Future ADRs that add provenance fields (cost, freshness, regress count) will follow this ADR's pattern**, which is fine, but it sets a precedent: the meta object will grow over time rather than being aggressively normalized into a sub-object. Callable consensus that this is acceptable.

### Neutral / Notable

- **`cognitiveRunId` already lives at the same layer.** This ADR keeps the meta object flat rather than nesting `tier1Provenance: { cognitiveRunId, vendorsUsed, cacheState }`. Flat is simpler for consumers and matches the existing pattern.
- **The cancelled approach was "amend ADR-003 in place."** Rejected: ADRs are immutable once accepted; extensions get new ADR numbers. This is consistent with how ADR-006 followed ADR-002 without modifying ADR-002.
- **The four `FALLBACK_REASONS` are deliberately enumerated, not free-form.** Free-form strings would let Specialists invent semantically inconsistent reasons (`"oops"`, `"didn't work"`); the closed set forces a documentation gate when a new reason is needed.

---

## Implementation phases

This ADR is a doctrine document; the code change lands in packet **G1.5a** under
`.claude/replit-handoffs/adr-008-g1.5a-meta-extension.md`. Live status: see `.claude/phases.md`.

The packet covers:
1. Schema extension in `engine/analyst/contracts/verdict.ts`
2. Router forwarding in `engine/analyst/router/surface-router.ts`
3. Specialist Tier-0 emission in `engine/analyst/surface/mgmt-co/funding-specialist.ts`
4. Test updates in `tests/analyst/specialists/funding-tier1.test.ts` and `tests/analyst/verdict-shape.test.ts`
5. Persona-keyed golden bench fixture for the Tier-0 fallback path
6. Architecture spec sync at `docs/architecture/analyst/verdict-contract.md`
7. Reconciliation of the parent G1 packet's verification checklist

G1.5a does NOT cover:
- The Defaults vs Assumptions cascade gap for the 5 Funding fields (separate packet — G1.5b, mostly Replit's lane per `claude-replit-split.md`)
- Tier-1 deps wiring at the registration site (Replit-owned route-handler slice, downstream of G1.5a)

---

## References

- ADR-003 — `AnalystVerdict` contract + Surface Router + Voice Renderer + Quality Scorer (the contract this extends)
- ADR-004 — Verdict cache + reconstruction (the source of `cacheState`)
- ADR-007 — Specialist Tier-1 Graduation (the why)
- `.claude/rules/llm-vendor-roster.md` — vendor-breadth N+1 (the source of `vendorsUsed`)
- `.claude/rules/specialist-intelligence-bar.md` — Intelligence Bar requirements
- `.claude/rules/analyst-verdict-contract.md` — change-control for the contract
- `.claude/rules/claude-replit-split.md` — Doctrine Freeze Gate (why this ADR exists before the code packet)
- `.claude/replit-handoffs/adr-007-g1-funding-graduation.BLOCKED.md` — the empirical trigger
