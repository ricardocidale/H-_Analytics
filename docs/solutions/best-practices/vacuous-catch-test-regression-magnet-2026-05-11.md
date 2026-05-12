---
title: "Vacuous-catch test pattern — caught-error-passes-vacuously regression magnet"
date: 2026-05-11
category: best-practices
module: testing
problem_type: best_practice
component: vitest
severity: medium
symptoms:
  - "Integration test wraps a call in try/catch and asserts inside the catch block (e.g. `expect(err).toBeInstanceOf(Error)`)"
  - "Test passes today because the code throws an expected fragility error"
  - "When the underlying fragility is fixed, the catch block stops firing — the try block succeeds — the test still passes"
  - "A future regression that re-introduces the throw won't be caught either, because the test design accepts both outcomes"
root_cause: test_design
resolution_type: test_rewrite_or_fixme_marker
tags: [testing, vitest, integration-test, regression, anti-pattern]
---

# Vacuous-catch test pattern — caught-error-passes-vacuously regression magnet

## The pattern

A unit ships against an upstream contract that is *currently broken or fragile* but is expected to be hardened later. The unit's integration test wraps the call in a `try/catch`, asserts the happy path inside `try`, and asserts that "if it throws, the throw is at least a structured Error" inside `catch`. Both outcomes pass.

This is fine **today** because the upstream is known-fragile and the test serves as evidence-of-failure. But once the upstream is fixed:

1. The `try` block succeeds — the call returns a valid result.
2. The `catch` block stops firing — no assertions inside it ever run.
3. The test silently passes via the happy-path branch alone.
4. **A future regression that re-introduces the throw will also silently pass**, because the catch-branch assertions are still vacuous.

The test has degraded from "evidence-of-known-failure" to "double-confirms-nothing-broke-OR-broke-the-same-way" — a regression magnet.

## Example (U6 / Factory v2 integration test)

```ts
try {
  const result = await substituteSlots(fixtureBuffer, map);
  expect(Buffer.isBuffer(result.pptx)).toBe(true);
  expect(result.pptx.length).toBeGreaterThan(1000);
} catch (err) {
  expect(err).toBeInstanceOf(Error);
  console.warn(`[expected fragility] ${err.message}`);
}
```

On U4's current fragile image-swap path, the test passes via the `catch` branch. Once U4 is hardened, it'll pass via the `try` branch. A regression in U4 that re-introduces the same throw still passes via the `catch` branch.

## Resolutions (pick one)

### Option A — strict resolves/rejects assertion

When the upstream is hardened, rewrite to:

```ts
await expect(substituteSlots(fixtureBuffer, map)).resolves.toMatchObject({
  pptx: expect.any(Buffer),
});
```

This fails loudly if a regression re-introduces the throw.

### Option B — strict throws assertion (when fragility is deliberately retained)

```ts
await expect(substituteSlots(fixtureBuffer, map)).rejects.toThrow(/sourceElement/);
```

Locks in the fragility as expected behavior. Use only when the fragility is by-design and not slated for removal.

### Option C — FIXME marker for deferred resolution

When neither A nor B is appropriate today (because the upstream is in flux and the test should keep passing through both states), add a grep-findable marker:

```ts
// FIXME(<upstream-hardening-tag>): rewrite this catch-branch to a strict
// rejects/resolves assertion once <upstream> is hardened. Current shape
// is a regression magnet — see docs/solutions/best-practices/vacuous-catch-test-regression-magnet-2026-05-11.md
```

The marker turns the test from a silent regression magnet into a known-debt item that a future developer can grep for and resolve.

## When this pattern is acceptable

- Short-lived "evidence-of-failure" tests that will be deleted (not rewritten) when the failure is fixed. Document the deletion plan in a `// REMOVE when …` comment.
- Tests that genuinely need to tolerate both outcomes by design (rare — usually a smell).

## When this pattern is NOT acceptable

- Long-lived integration tests whose contract is "this call works correctly". Use Option A from the start.
- Any test where future you (or a reviewer 6 months from now) would assume "this test fails when the code breaks" — because that assumption silently fails.

## Encountered

- U6 `slide-6-embed-flow.test.ts` integration test (PR #120). Tagged with `FIXME(u4-image-swap-hardening)` per Option C. Test is intentionally kept through the U4-still-fragile period; rewrite to Option A when U4 hardens.

## Related

- The U6 plan ship contract (`docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md` §U6) explicitly told the subagent to "document, don't paper over" the U4 image-swap fragility. The Option-C catch pattern was the implementation of that instruction. The FIXME marker is the discipline that prevents the pattern from rotting into a regression magnet.
