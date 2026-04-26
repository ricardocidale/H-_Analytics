# BLOCKED — ADR-007 G1 Funding Tier-1 Graduation: behavioral verification

**Sibling packet:** `.claude/replit-handoffs/adr-007-g1-funding-graduation.md`
**Filed:** 2026-04-26 by Replit (per packet "Out of scope" trailer: *"file a `BLOCKED.md` sibling rather than expanding this packet"*)
**Block scope:** Section "Verification → Behavioral verification (manual, post-merge)" only. All gate commands (TS/lint/tests/verify/parity) PASS.

---

## What was verified

All five gates green on commit `dfb3ce25` (now `a52d9153` after temp-log revert):

- `npm run check` — 0 TS errors
- `npm run lint:summary` — 0 errors
- `npm run test:summary` — PASS
- `npm run verify:summary` — UNQUALIFIED PASS (21 phases)
- `npm run health` — ALL CLEAR
- Quick Audit failure is **pre-existing**, unrelated (`script/backfill-canonical-urls.ts:100,153` — legacy storage URL guard).

Engine wiring confirmed at:
- `engine/analyst/surface/mgmt-co/funding-specialist.ts` (`createFundingSpecialist` + `FundingSpecialistDeps` exported)
- `server/ai/specialists/mgmt-co-funding-orchestrator-adapter.ts` (adapter present)
- `engine/analyst/surface/mgmt-co/index.ts` (`createSurfaceRouter` registers funding)
- `server/routes/global-assumptions.ts:450` (`/api/global-assumptions/save-tab` dispatches `MGMT_CO_FUNDING_ID` via `router.dispatch`)

---

## What was blocked

Manual save flow on **`/company/assumptions` → Funding tab** (capitalRaise1Amount slider bumped, Save clicked) returned a successful verdict to the client but with this `verdict.meta`:

```json
{ "tier": 0, "durationMs": 0 }
```

Captured client-side (browser console temp log, since reverted) and confirmed by server-side dispatch result. Persona resolved (`mgmt-co.funding`), `overallSeverity: "ok"`, dimensions populated with `tier: "db_table"` benchmark evidence — i.e. the Tier-0 fallback ran cleanly.

The packet's behavioral verification spec (lines 159–166) requires **either**:

- Tier-1 success: `verdict.meta.cognitiveRunId` present, plus `meta.vendorsUsed` (≥2), plus `meta.cacheState` (HIT/MISS), **or**
- Tier-0 fallback: `meta.fallbackReason: "tier1_unavailable"`

**Neither key is present in the returned meta.** Verification cannot pass.

---

## Root cause (engine-side, CC's lane)

The Specialist's Tier-0 fallback emits an incomplete `SpecialistOutput`. From `engine/analyst/surface/mgmt-co/funding-specialist.ts`:

```ts
// line 444–447
const tier0 = (inputs: CapitalRaiseInputs): SpecialistOutput => {
  const dimensions = ...;
  return { dimensions, tier: 0 };   // ← no fallbackReason
};
```

The Tier-1 path (lines 481–525) emits `cognitiveRunId`, but the Tier-0 fallback emits no `fallbackReason`. The packet's own "Out of scope" section asserts the opposite contract:

> *"Voice renderer 'Tier-1 unavailable' badge UI. Replit's slice when ready — **the Specialist emits `meta.fallbackReason`** so the badge has data; rendering is downstream."*

The header comment at lines 39–40 acknowledges the gap: *"the 'fallbackReason' detail is a future contract extension."* That extension was assumed to land with G1 but did not.

The gap is wider than just the Specialist function: **the verdict-meta contract itself does not declare `fallbackReason`, `vendorsUsed`, or `cacheState`.** Reviewing `engine/analyst/contracts/verdict.ts:286–291`:

```ts
export const AnalystVerdictMetaSchema = z.object({
  tier: z.union([z.literal(0), z.literal(1)]),
  durationMs: z.number().nonnegative(),
  cognitiveRunId: z.string().optional(),
});
```

Only `tier`, `durationMs`, `cognitiveRunId` are allowed today. The router assembly at `engine/analyst/router/surface-router.ts:210–214` only forwards those same three fields:

```ts
const meta: AnalystVerdictMeta = {
  tier,
  durationMs: Math.max(0, durationMs),
  ...(cognitiveRunId ? { cognitiveRunId } : {}),
};
```

So even if the Specialist emitted `fallbackReason`/`vendorsUsed`/`cacheState`, the router would drop them on the way to the client. Three contract surfaces need extension, not one.

Why no Tier-1 path fires in dev today: the mgmt-co router seam at `engine/analyst/surface/mgmt-co/index.ts:203` instantiates the Specialist without any Tier-1 `deps`:

```ts
createFundingSpecialist(benchmarks.funding, {
  evidenceAsOf: options.evidenceAsOf,
  promptTemplate: options.configs?.funding?.promptTemplate,
  modelResourceId: options.configs?.funding?.modelResourceId ?? null,
})  // ← no FundingSpecialistDeps third arg
```

Consequence: the Tier-0 branch is the only branch that fires in production today, and its verdict carries none of the four signals the verification spec wants.

Per scratchpad rule, no engine fixes were attempted from this side.

---

## What CC needs to ship to unblock

**Minimum to pass the Tier-0 fallback half of the spec:**

1. **Extend the meta contract.** In `engine/analyst/contracts/verdict.ts:286`, add `fallbackReason` (and, if the verification spec is to be honoured in full, `vendorsUsed: z.array(z.string()).optional()` and `cacheState: z.enum(["hit","miss"]).optional()`) to `AnalystVerdictMetaSchema`.
2. **Forward the new fields through the router.** In `engine/analyst/router/surface-router.ts:210–214`, propagate the new keys from `output` to `meta` when present.
3. **Emit `fallbackReason` from the Specialist's Tier-0 path.** In `engine/analyst/surface/mgmt-co/funding-specialist.ts:444` `tier0()`, return `{ dimensions, tier: 0, fallbackReason: "tier1_unavailable" }` (or `"deps_unavailable"` — pick one canonical string, document it).
4. **Test coverage.** Update `tests/analyst/specialists/funding-tier1.test.ts` to assert `meta.fallbackReason === "tier1_unavailable"` on the deps-undefined branch.
5. **Reconcile packet wording.** Update the parent packet's verification checklist (lines 159–166) to match whichever canonical string CC ships, or downgrade the `vendorsUsed`/`cacheState` checks if those are truly out of scope for G1.

**To exercise the Tier-1 path end-to-end (gives real `cognitiveRunId` / `vendorsUsed` / `cacheState`):**

6. **Wire `FundingSpecialistDeps` at the registration seam.** The deps third arg goes to `createFundingSpecialist(...)` in `engine/analyst/surface/mgmt-co/index.ts:203` (NOT at the route-handler `router.dispatch(...)` site — `dispatch` only receives the runtime payload, not constructor deps). The route-handler slice is mine: I'd thread the orchestrator client + cache reader through the `createMgmtCoSurfaceRouter(...)` call site at server bootstrap.

   Per packet "Out of scope" item: *"Real `server/ai/research-orchestrator.ts` integration in production code paths. … Wiring it to the live N+1 orchestrator + threading credentials happens in a Replit-owned route-handler slice, two-track per `claude-replit-split.md` §'two-track ADR execution'."*

   That slice is mine when CC says "go" — but it requires (1)+(2) first so the meta contract can carry the Tier-1 signals back to the UI.

---

## What I did from this side

- Added two temp `console.info("[G1-VERIFY ...]", ...)` instrumentation lines (one in `client/src/hooks/useCompanyAssumptionsForm.ts`, one in `server/routes/global-assumptions.ts`) to capture the verdict payload — both reverted in commit `a52d9153`.
- Confirmed user-visible save path: dirty field → `SaveButton` (bottom of Funding tab, 50% opacity until dirty) → `POST /api/global-assumptions/save-tab` → `router.dispatch({ specialistId: "mgmt-co.funding", ... })` → verdict returned to UI.
- Captured a clean Tier-0 verdict roundtrip (1168ms server time), watchdog modal opened on `overallSeverity !== "ok"` correctly when a value fell outside Analyst range — UI plumbing on this side is healthy.
- Restarted the app workflow after reverts.

---

## Resume condition

When CC ships the `fallbackReason` emission (or wires the Tier-1 deps), reopen the parent packet's behavioral verification checklist. I'll re-run the manual save flow, observe the corrected meta, and on PASS:

- Append the 2-line entry to `.claude/session-memory.md`
- Open a project-task to commit with the packet's required Surfaces + Packet footers and push.

No content from the parent packet has been altered. This BLOCKED file is the only artifact added.
