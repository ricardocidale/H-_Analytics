---
title: "Admin-Editable Scheduler Cadence — Cadence-as-Data Pattern with Self-Rescheduling setTimeout"
date: 2026-05-09
category: architecture-patterns
module: scheduler-infrastructure
problem_type: architecture_pattern
component: background_job
severity: medium
applies_when:
  - Designing a new in-app agent or background job that runs on a recurring cycle
  - Adding a periodic health-probe, data-sanity, or maintenance scheduler to api-server
  - Any cadence value an admin (not just a developer) should be able to tune at runtime without a deploy
  - Migrating an existing setInterval-based scheduler to a runtime-tunable cycle
  - Wiring Phase 3 startup hooks for new schedulers in `artifacts/api-server/src/index.ts`
tags:
  - scheduler
  - cadence
  - admin-resources
  - agent-native
  - settimeout-chain
  - runtime-tunable
  - costantino
  - data-not-code
---

# Admin-Editable Scheduler Cadence — Cadence-as-Data Pattern with Self-Rescheduling setTimeout

## Context

Costantino — Data Custodian (Step 0 of the data-custody agent roster) needed a periodic cycle to run health probes against every `admin_resources` row. The naive choice — a TypeScript constant + `setInterval` — kept reappearing in plan drafts and kept failing the agent-native architecture review for two reasons:

1. **The cadence is a behavior knob, not a fact about the system.** An admin operating Costantino in production must be able to dial it up (every 30 minutes during an incident) or down (once a week during quiet periods) without waiting for a code change, PR, CI run, and Railway redeploy. Burying the cadence in code makes it invisible to the people who need to tune it.
2. **`setInterval` cannot honor a cadence change without a process restart.** Even if the constant is replaced by a DB lookup, `setInterval` reads the period once at registration. Any subsequent admin edit is silently ignored until the next deploy.

The Vito compliance scheduler (peer reference at `artifacts/api-server/src/jobs/vito-compliance-scheduler.ts`) had the same shape and the same trap. Costantino's plan therefore established this pattern as the canonical template for every future scheduler in the data-custody roster (Step 1–6 agents) and for any new periodic job in api-server.

## Guidance

Two rules together make the cadence first-class data:

### Rule 1 — Cadence lives in `admin_resources`, not in code

Seed a row with `kind='parameter'` and a slug like `<agent>-health-cycle-interval-ms` (Costantino: `costantino-health-cycle-interval-ms`). Store the value at `config_json.value_ms`. The TypeScript constant exists only as a fallback if the row is missing or unreadable, and it must be named `DEFAULT_<AGENT>_CYCLE_INTERVAL_MS` so the "default" suffix makes its role obvious to readers.

```ts
// lib/shared/src/constants-scheduler.ts (or co-located with the agent)
// FALLBACK ONLY. Authoritative cadence is admin_resources slug=
// 'costantino-health-cycle-interval-ms', config_json.value_ms.
export const DEFAULT_COSTANTINO_CYCLE_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
export const MIN_COSTANTINO_CYCLE_INTERVAL_MS = 60 * 1000;                    // 1 min clamp
export const MAX_COSTANTINO_CYCLE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;     // 30 day clamp
```

Migration seeds the row at install time:

```sql
INSERT INTO admin_resources (kind, slug, label, config_json, ...)
VALUES (
  'parameter',
  'costantino-health-cycle-interval-ms',
  'Costantino health cycle interval (ms)',
  jsonb_build_object('value_ms', 432000000),  -- 5 days
  ...
)
ON CONFLICT (slug) DO NOTHING;
```

### Rule 2 — Self-rescheduling `setTimeout` chain, not `setInterval`

Each cycle re-reads the cadence from `admin_resources` immediately before scheduling the *next* cycle. An admin edit takes effect at most one cycle later — without a restart.

```ts
// artifacts/api-server/src/jobs/costantino-scheduler.ts
let timer: NodeJS.Timeout | null = null;
let stopping = false;

async function readCadenceMs(): Promise<number> {
  try {
    const row = await db.query.adminResources.findFirst({
      where: eq(adminResources.slug, 'costantino-health-cycle-interval-ms'),
    });
    const raw = row?.configJson?.value_ms;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return DEFAULT_COSTANTINO_CYCLE_INTERVAL_MS;
    }
    return Math.min(
      MAX_COSTANTINO_CYCLE_INTERVAL_MS,
      Math.max(MIN_COSTANTINO_CYCLE_INTERVAL_MS, raw),
    );
  } catch (err) {
    logger.warn({ err }, 'costantino: cadence read failed, using default');
    return DEFAULT_COSTANTINO_CYCLE_INTERVAL_MS;
  }
}

async function tick() {
  if (stopping) return;
  const startedAt = Date.now();
  try {
    await runCostantinoCycle();
  } catch (err) {
    logger.error({ err }, 'costantino: cycle threw');
  } finally {
    const cadenceMs = await readCadenceMs();
    logger.info({ cadenceMs, durationMs: Date.now() - startedAt }, 'costantino: cycle complete');
    if (!stopping) {
      timer = setTimeout(tick, cadenceMs);
    }
  }
}

export function startCostantinoScheduler() {
  stopping = false;
  timer = setTimeout(tick, DEFAULT_COSTANTINO_STARTUP_DELAY_MS);
}

export function stopCostantinoScheduler() {
  stopping = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
```

Critical ordering: read cadence in the `finally` block *after* the cycle runs but *before* scheduling the next `setTimeout`. Reading at the top of `tick` works too but loses one cycle's worth of responsiveness to admin edits. The `finally` placement also guarantees rescheduling even if the cycle throws.

## Why This Matters

- **Admins own the dial.** The same screen that surfaces Costantino's findings also exposes the cadence parameter. An incident response loop ("we just changed an integration, run probes every 5 minutes for the next hour, then restore") becomes a 2-click operation, not a hotfix PR.
- **No magic numbers in code.** The `no-magic-numbers` skill and the project's `check:magic-numbers` workflow flag any business-meaningful number embedded in source. A cadence is exactly that — a business behavior, not a constant of nature. Putting it in `admin_resources` removes the lint smell and the lint exception.
- **Survives restart and process changes.** Because cadence is read each cycle, a restart picks up the latest value automatically. There is no "scheduler thinks it's still on the old period" failure mode.
- **`setInterval` would lock in the cadence at registration.** Any admin change would silently no-op until the next deploy — exactly the kind of invisible drift that erodes trust in the admin surface. The self-rescheduling chain eliminates that class of bug at the design level.
- **Bounded responsiveness, by design.** Worst-case staleness is one full cycle. With a 5-day default, that's 5 days; with the MIN clamp at 1 min, an emergency dial-down propagates within 1 min. The clamps also prevent footgun edits (a typo of `1` for `1000` ms would not turn the scheduler into a tight loop).
- **Composes with the agent-native principle "behavior in data, not code."** Every Step 1–6 agent in the data-custody roster will reuse this pattern; the parameter slug is the only thing that changes per agent. This is how a primitive becomes a roster.

## When to Apply

- The job runs on a recurring cycle longer than ~30 seconds (anything faster doesn't benefit from runtime tuning).
- An operator persona — admin, on-call, or an Analyst-style agent — has a legitimate reason to change the cadence without a deploy.
- The job is idempotent within one cycle (so a missed or extra tick is harmless).
- The job is registered through a Phase 3 startup hook in `artifacts/api-server/src/index.ts`.

Do **not** apply for:

- Per-request work, queue consumers, or anything driven by external events. Those have their own concurrency models.
- Schedulers whose period must be known to other systems statically (e.g. published rate-limit windows). The runtime-mutability is precisely the wrong property there.
- One-shot jobs. Use a plain `setTimeout` and exit.

## Examples

### Before — `setInterval` with a code-level constant

```ts
// Anti-pattern: cadence is invisible to admins, change requires a deploy,
// setInterval ignores any future cadence change.
const COSTANTINO_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000;

export function startCostantinoScheduler() {
  setInterval(runCostantinoCycle, COSTANTINO_INTERVAL_MS);
}
```

### After — `admin_resources` parameter + self-rescheduling chain

See the full Rule 2 snippet above. Three properties this version has and the anti-pattern does not:

1. The cadence is queryable, editable, and auditable from the admin UI.
2. An admin edit propagates within one cycle, no restart required.
3. The clamps and the read-with-fallback make the scheduler resilient to a missing row, a malformed `value_ms`, or a transient DB read failure.

### Verification recipe (from the Costantino plan)

To prove the loop honors cadence changes end-to-end during dev or prod verification:

1. `UPDATE admin_resources SET config_json = jsonb_set(config_json, '{value_ms}', '60000') WHERE slug = 'costantino-health-cycle-interval-ms';`
2. Wait for the next cycle (≤ current cadence).
3. Tail the api-server log for `costantino: cycle complete` lines and confirm the next two are spaced ~60 s apart and report `cadenceMs: 60000`.
4. Restore: `UPDATE … SET '{value_ms}', '432000000' …` and confirm the following `cycle complete` log shows `cadenceMs: 432000000`.
5. Cross-check `scheduler_run_tracker` rows for `key='costantino-data-custodian'`: the `notes->>'cadence_ms_used'` values should reflect the temporary 60000 then the restored 432000000.

This verification is the same shape used by every future data-custody agent in Steps 1–6.

## Related

- Plan: `docs/plans/2026-05-09-007-feat-costantino-data-custodian-step0-plan.md` — Step 0 of the 7-step data-custody roster, where this pattern is first applied.
- Peer scheduler: `artifacts/api-server/src/jobs/vito-compliance-scheduler.ts` — older scheduler that motivated the pattern; a future PR should retrofit it onto the same cadence-as-data shape.
- `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-09.md` — the broader agent-native principle that "behavior lives in data, not in TS conditionals" — this doc is the scheduler-specific instance of that principle.
- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — companion principle for tool/agent design.
- `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md` — same family ("identifiers/parameters live in `admin_resources`, not in code"), applied to integration slugs and LLM model names rather than scheduler cadences.
- Skill: `.agents/skills/no-magic-numbers/SKILL.md` — the lint policy this pattern satisfies for cadence values.
- Skill: `.agents/skills/inflation-cascade/SKILL.md` — different domain, same shape (an admin-tunable parameter that calc/engine reads at runtime, with a documented fallback).
