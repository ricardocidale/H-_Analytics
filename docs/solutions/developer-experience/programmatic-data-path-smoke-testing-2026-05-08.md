---
title: Programmatic data-path smoke testing for hard-to-bring-up pipelines
date: 2026-05-08
category: developer-experience
module: slide-factory-data-path-smoke
problem_type: developer_experience
component: testing_framework
severity: medium
applies_when:
  - "A pipeline's live execution path needs multiple services, browsers, or external credentials that are infeasible to bring up locally"
  - "The pipeline's data-path stages are pure or have explicit DB-only side effects"
  - "Cross-module wiring uses path aliases that tsx + the package's tsconfig resolves"
  - "End-of-session verification is needed before declaring a pipeline change done"
  - "Existing unit tests cover stages individually but the cross-stage chain against real DB is untested"
related_components: [development_workflow, database, tooling]
tags: [smoke-test, tsx-script, drizzle, in-process, data-path, synthetic-fixture, slide-factory]
---

# Programmatic data-path smoke testing for hard-to-bring-up pipelines

## Context

The U10 slide-factory deck producer's live execution path needs:
- api-server running on port 5000
- Portal vite dev server on its port
- Shared port-80 reverse proxy routing `/api/*` → 5000 and `/*` → portal
- Playwright + Chromium
- Cloudflare R2 upload credentials
- A `slide_factory_runs` row at `status='complete'` with full `luccaDraft` and four configured properties

In an end-of-session moment with the api-server not running and the table empty, bringing all of that up reliably was infeasible. Walking the wizard end-to-end would have taken hours and required a brief PDF, configured properties, and a human at the keyboard. Existing unit tests covered each stage in isolation (`buildFactoryPayload`, `factory-token`, `buildLbPayloadFromFactoryRun`), but nothing exercised the full chain against a real Neon row.

The same constraint shows up across the codebase: any time a pipeline change needs verification but the live execution path is gated on infrastructure that isn't running, the engineer either skips smoke entirely or burns hours setting up the world.

## Guidance

Write an in-process **tsx script** under `artifacts/<service>/src/scripts/`. The shape has six steps:

**1. Connect to real Neon via production Drizzle bindings.** Path aliases (`@workspace/db`, `@shared/*`) resolve under tsx + the package's tsconfig. No mocks, no test DB.

```ts
import { db, slideFactoryRuns, type LuccaSlotDraft } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildFactoryPayload } from "../slides/build-factory-payload";
import { buildLbPayloadFromFactoryRun } from "../slides/build-lb-payload";
import {
  signFactoryDeckToken,
  verifyFactoryDeckToken,
} from "../slides/factory-token";
import { getSlideFactoryRunById } from "../storage/slide-factory-runs";
```

Mix path aliases (for cross-package imports) with relative imports (for in-package helpers) — both resolve from the package's `tsconfig.json`.

**2. Insert a synthetic complete row** with Drizzle's `insert(...).returning(...)`:

```ts
const [inserted] = await db
  .insert(slideFactoryRuns)
  .values({
    userId: SMOKE_USER_ID,
    status: "complete",
    slide1PropertyId: 65,
    slide2PropertyId: 66,
    slide3PropertyId: 67,
    slide5PropertyId: 68,
    luccaDraft: SMOKE_LUCCA_DRAFT,
    agentResults: SMOKE_AGENT_RESULTS,
  })
  .returning({ id: slideFactoryRuns.id });

const createdRunId = inserted.id;
```

The fixture must satisfy the schema's actual NOT NULL columns and any downstream parser's expected slot keys. For the slide factory those are slot keys like `slide1.headerSubtitle`, `slide1.visionBullets`, `slide3.reasons` (JSON), `slide5.transformationRows` (JSON), `slide6.disclaimer` — read the `buildFactoryPayload` source to see the exact set rather than guessing.

**3. Read it back via the production storage helper** to verify the storage round-trip:

```ts
const run = await getSlideFactoryRunById(createdRunId);
if (!run) throw new Error(`getSlideFactoryRunById(${createdRunId}) returned null`);
checks.push({
  name: "getSlideFactoryRunById round-trip",
  pass: run.status === "complete" && run.id === createdRunId,
  detail: `status=${run.status}`,
});
```

This catches Drizzle ↔ schema mismatches that pure type-level tests miss.

**4. Drive the data-path functions in-process** in the order the live request would:

```ts
// U1 — slot copy assembly
const v2 = buildFactoryPayload(run);
checks.push({
  name: "buildFactoryPayload schema",
  pass: typeof v2.schemaVersion === "string"
    && (v2.slide1.visionBullets?.length ?? 0) === 3
    && (v2.slide3.reasons?.length ?? 0) === 3
    && (v2.slide5.transformationRows?.length ?? 0) === 4,
});

// U4 — full composite payload (this transitively exercises buildSlidePayload,
// buildSlide4Payload, buildSlide6Payload — all of which fetch property data
// and financials from the real DB)
const lb = await buildLbPayloadFromFactoryRun(run);
const allShareSameV2 = lb.slides.every(
  (s) => s.deckPayloadV2 === lb.slides[0].deckPayloadV2,
);
checks.push({
  name: "buildLbPayloadFromFactoryRun shape",
  pass: lb.slides.length === 6 && allShareSameV2,
});

// U2 — token round-trip
process.env.TOKEN_ENCRYPTION_KEY ??= "smoke-test-fallback-key-not-used-in-prod";
const { token, expiresAtMs } = signFactoryDeckToken(createdRunId);
const verified = verifyFactoryDeckToken(token);
checks.push({
  name: "factory-token sign/verify round-trip",
  pass: verified.ok
    && verified.runId === createdRunId
    && verified.expiresAtMs === expiresAtMs,
});

// Tampered runId — extra invariant beyond U2 unit tests
const tampered = verifyFactoryDeckToken(
  token.replace(/^factory\.\d+\./, `factory.${createdRunId + 1}.`),
);
checks.push({
  name: "factory-token rejects wrong runId",
  pass: !tampered.ok && tampered.reason === "invalid-signature",
});
```

The tampered-runId check verifies the HMAC seals the runId — not just the metadata. Unit tests rarely cover this because the mutation happens *after* signing.

**5. Cleanup in `finally`** so a mid-script crash still removes the synthetic row:

```ts
} finally {
  if (createdRunId !== null) {
    try {
      await db
        .delete(slideFactoryRuns)
        .where(eq(slideFactoryRuns.id, createdRunId));
      console.log(`Cleaned up synthetic run id=${createdRunId}`);
    } catch (cleanupErr) {
      console.error(`Cleanup FAILED for run id=${createdRunId}:`, cleanupErr);
    }
  }
}
```

A leaked synthetic row pollutes the DB and may break subsequent runs (FK collisions, status-based queries hitting the synthetic row).

**6. PASS/FAIL summary + non-zero exit:**

```ts
let pass = 0;
for (const c of checks) {
  console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  if (c.pass) pass += 1;
}
console.log(`${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
```

CI or shell wrappers can branch on the exit code.

### Header pattern — name what's NOT covered

The script's top docstring must enumerate gaps explicitly so reviewers don't infer false coverage:

```ts
/**
 * Data-path smoke for the U10 slide-factory deck producer. Covers:
 *   - Drizzle round-trip via getSlideFactoryRunById
 *   - buildFactoryPayload (DeckPayloadV2 from luccaDraft)
 *   - buildLbPayloadFromFactoryRun (full composite payload)
 *   - factory-token sign/verify + tampered-runId rejection
 *
 * NOT covered (deferred, named explicitly):
 *   - Franco's Playwright PDF render (needs portal vite + shared proxy)
 *   - R2 upload + deckR2Key write (off-the-shelf S3 client)
 *   - Marco's tool-loop dispatch (orchestration, not data path)
 */
```

A "smoke passes" claim without this list is misleading — the doc-string is what makes the smoke honest.

## Why This Matters

**(a) Catches data-path regressions even when full infrastructure isn't reachable.** The chain — schema → storage helper → payload builders → token seal — fails as a unit if any link drifts. Unit tests on isolated functions miss cross-stage breakage like a builder requiring a field the schema doesn't enforce, or a storage helper returning a shape the builder doesn't expect. The U10 smoke caught nothing actually broken — but it also caught the tampered-token rejection as an extra invariant beyond what U2's unit tests covered, which would have masked a future HMAC-bypass regression.

**(b) Honest about what's NOT covered.** Naming Playwright + R2 + orchestration as deferred prevents reviewers from reading "smoke passes" as "the producer is fully verified." The next engineer knows exactly which slice still needs a live workflow run, and can plan that work as a separate unit instead of assuming it's already done.

**(c) Faster feedback than wizard-walking.** A 30-second tsx run replaces a 2+ hour manual session. The pattern is durable — once the harness exists, every future change to the data path can be re-smoked in seconds.

## When to Apply

- Any pipeline whose data-path stages are pure or have explicit DB-only side effects (slide factory, research orchestrator, finance engine, market-rates regen, KB rebuild).
- The live execution path is gated on infrastructure that isn't running — proxy down, headless browser missing, external service credentials absent, dev workflow not booted.
- Existing unit tests cover stages individually but the cross-stage chain against real DB is untested.
- A plan unit declares a feature "wired" but reviewers can't verify without a multi-hour manual walkthrough.

## Examples

**Concrete artifact:** `artifacts/api-server/src/scripts/smoke-producer.ts` (241 lines, commit `6ee30c4b`, PR #32). Key elements:

- **Path-alias imports under tsx** — `@workspace/db` for the production Drizzle bindings + relative imports (`../slides/...`, `../storage/...`) for in-package helpers
- **Synthetic luccaDraft fixture** with all six slides' slot keys populated — slide1.headerSubtitle, slide1.visionBullets, slide2.operationalModelText/revenueBullet/programmingBullet, slide3.conceptParagraph/marketRationale/reasons (JSON)/closingLine, slide4.sectionSubtitle, slide5.transformationDescription/transformationRows (JSON), slide6.disclaimer
- **Tampered-runId test** beyond U2's unit tests — verifies the HMAC seal includes the runId, not just the timestamp
- **Cleanup in `finally`** with `eq(slideFactoryRuns.id, createdRunId)` — survives mid-script crashes
- **Per-check PASS/FAIL summary** with `process.exit(failures > 0 ? 1 : 0)` for CI compatibility

**Run command:**

```bash
cd artifacts/api-server && ./node_modules/.bin/tsx \
  --tsconfig tsconfig.json src/scripts/smoke-producer.ts
```

**Verified result:** 5/5 checks PASS against real Neon + properties 65/66/67/68 (Loch Sheldrake, Belleayre, Scott's House, Lakeview Haven Lodge), synthetic run cleaned up, exit 0.

**Existing peer in the codebase** using the same shape for orphan detection rather than smoke testing: `artifacts/api-server/src/scripts/audit-orphaned-hero-photos.ts` — same `tsx + path aliases + production-bindings + DB round-trip` skeleton.

## Related Issues

- `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md` — establishes the canonical "tsx + `POSTGRES_URL` + real Neon" pattern this generalizes
- `docs/solutions/architecture-patterns/slide-factory-runs-schema-design-2026-05-07.md` — the `slide_factory_runs` schema this smoke exercises
- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — the generation-side architecture; this smoke is its data-path verification counterpart
- `docs/solutions/tooling-decisions/railway-db-sync-helper-2026-05-03.md` — peer tsx-based DB helper using the same shape for a different purpose
- `docs/solutions/workflow-issues/slide-factory-pre-merge-shipping-gates-2026-05-08.md` — the broader pre-merge gate sequence (currently on PR #30, will land when that ships)
