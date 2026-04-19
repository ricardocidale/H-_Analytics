# Handoff — Wire up PostHog product analytics

**From:** Claude Code
**To:** Replit Agent
**Date:** 2026-04-19
**Track:** Operational Tooling (independent of OT-A; can run in parallel or sequentially)
**Why this is a handoff:** Touches `client/src/**` (runtime UI) and adds a new client library file. Per `.claude/rules/claude-replit-split.md`, UI-adjacent runtime code is your domain.

---

## Why this is happening

`posthog-js@^1.360.1` is already in `package.json`. The CSP already allows `posthog.com`. But no initialization happens and no events are captured — the package is imported but unused. Per `docs/architecture/DEPENDENCIES.md §13`, this is a "partially wired" integration that costs us zero to finish.

**What we get:** product funnels, verdict-acceptance rates, conviction-floor downgrade frequency, export format usage, research latency distributions — all the signals that would have given us early warning of the drift patterns our audits keep catching.

**Cost:** PostHog Cloud free tier covers 1M events/month. We'll stay under that for a long time. Server-side capture is NOT part of this handoff (would require a new npm dep `posthog-node`); client-side is enough for everything valuable in the first 6 weeks.

---

## Mandatory pre-flight reading

1. `docs/architecture/DEPENDENCIES.md §13 Observability + analytics`
2. `.claude/rules/pre-commit-verification.md` — the five gates
3. `.claude/rules/security.md` — the secrets/PII rules (especially around not logging user-typed content)
4. `.claude/rules/cross-check-invariants.md` — edit → sibling-surface map
5. `client/src/main.tsx` — where initialization lands
6. `client/src/lib/api.ts` + a couple of components that emit analytics-worthy actions (e.g. `components/company-assumptions/TabActions.tsx`, `components/intelligence/AnalystButton.tsx`, `pages/CompanyAssumptions.tsx`'s `handleProceedAnyway`) — to see where capture calls need to go

---

## Prerequisite (user action)

The user needs to:

1. Sign in to PostHog Cloud (free — posthog.com) OR self-host (later decision)
2. Create a project, copy the "Project API Key" (starts with `phc_`)
3. Add to Replit Secrets as **`VITE_POSTHOG_KEY`** (the `VITE_` prefix exposes it to the client bundle per Vite convention; this key is intended to be public — PostHog's design)
4. Optionally add `VITE_POSTHOG_HOST` (defaults to `https://us.i.posthog.com`; EU users set `https://eu.i.posthog.com`)

Wait for the user to confirm `VITE_POSTHOG_KEY` is in Secrets before executing the code changes below. If the user has already added it, proceed.

---

## Deliverables

One new file + five small edits. One commit.

### File 1 (new): `client/src/lib/posthog.ts`

The wrapper + event taxonomy. Must export:

- `initPostHog()` — call once at app boot, after Secrets are available
- `captureEvent(name, properties?)` — wrapper that no-ops when not initialized (never throws)
- `identifyUser(userId, traits?)` — call after auth resolves
- `resetUser()` — call on logout
- Typed event-name constants (see §Event schema below) so call sites can't typo event names

Requirements:

- If `VITE_POSTHOG_KEY` is absent, `initPostHog()` logs `[posthog] disabled — VITE_POSTHOG_KEY not set` and subsequent `captureEvent` calls no-op silently. The app MUST work with PostHog disabled.
- Respect `process.env.NODE_ENV === "production"` — in dev, PostHog can still capture (useful for local testing) but log a `[posthog] dev mode` warning once.
- **Never capture PII in event properties.** User IDs are hashed or opaque; no email, no name, no free-text user input (no Rebecca prompts, no property names the user typed).
- Use PostHog's `opt_out_capturing()` on page load if `Do Not Track` header is set or the user has opted out via `user.rebeccaOptOut` (mirror the consent pattern already used for Rebecca).
- Sessions: use PostHog's built-in session recording **DISABLED** — we don't need it and it raises privacy concerns for financial data.

### File 2 (edit): `client/src/main.tsx`

Call `initPostHog()` at the top of the bootstrap — before React render. Small diff.

### File 3 (edit): auth flow

When the user's session resolves (after `/api/auth/me`), call `identifyUser(user.id, { role: user.role, planTier: ... })`. When logout fires, call `resetUser()`. Find the right auth hook — probably `client/src/lib/auth.tsx` or wherever `useCurrentUser` lives.

### File 4 (edit): `client/src/components/intelligence/AnalystButton.tsx`

When the button fires `ResearchRequested`, capture `ANALYST_CONSULT_CLICKED` with `{ surface, propertyId?, scope }`.

### File 5 (edit): `client/src/components/intelligence/AnalystCheckDialog.tsx`

(This is the post-Phase-3b dialog that renders `AnalystVerdict`.) Capture at three points:

- On mount: `VERDICT_SHOWN` with `{ specialistId, severity, qualityScore, tier }`
- On any action click (including the UI-only "Save Anyway" ghost button): `VERDICT_ACTION_CLICKED` with `{ specialistId, actionKind, field?, severity }`
- On dialog close without action: `VERDICT_DISMISSED` with `{ specialistId, severity, qualityScore }`

### File 6 (edit): `client/src/lib/exports/*` or wherever exports fire

When a PDF/PPTX/DOCX/XLSX/PNG/CSV export is generated, capture `EXPORT_GENERATED` with `{ format, scope (page name), propertyCount?, durationMs }`.

---

## Event schema — start small, grow later

**Only these 10 events in this handoff.** Don't add more without updating this doc. Keep the event catalog disciplined — PostHog noise is as bad as silence.

```typescript
// client/src/lib/posthog.ts
export const POSTHOG_EVENTS = {
  // Session
  SESSION_STARTED: "session_started",
  // Properties: { role, portfolioPropertyCount }

  // Analyst
  ANALYST_CONSULT_CLICKED: "analyst_consult_clicked",
  // Properties: { surface, propertyId?, scope }

  RESEARCH_COMPLETED: "research_completed",
  // Properties: { tier, durationMs, consensusRatio, specialistId, cognitiveRunId }

  VERDICT_SHOWN: "verdict_shown",
  // Properties: { specialistId, severity, qualityScore, tier, dimensionCount }

  VERDICT_ACTION_CLICKED: "verdict_action_clicked",
  // Properties: { specialistId, actionKind, field?, severity, qualityScore }

  VERDICT_DISMISSED: "verdict_dismissed",
  // Properties: { specialistId, severity, qualityScore }

  // Save flow
  TAB_SAVED: "tab_saved",
  // Properties: { surface, tabKey, propertyId?, hadVerdict }

  // Scenarios
  SCENARIO_SAVED: "scenario_saved",
  // Properties: { scenarioId, propertyCount, kind }

  SCENARIO_LOADED: "scenario_loaded",
  // Properties: { scenarioId, propertyCount }

  // Exports
  EXPORT_GENERATED: "export_generated",
  // Properties: { format, scope, propertyCount?, durationMs }
} as const;

export type PosthogEventName = typeof POSTHOG_EVENTS[keyof typeof POSTHOG_EVENTS];
```

### Where each event fires

| Event | Call site |
|---|---|
| `SESSION_STARTED` | `client/src/main.tsx` after first user resolve |
| `ANALYST_CONSULT_CLICKED` | `AnalystButton.tsx` onClick |
| `RESEARCH_COMPLETED` | Wherever the SSE stream finishes (`client/src/components/IndustryResearchTab.tsx` or similar) |
| `VERDICT_SHOWN` | `AnalystCheckDialog.tsx` useEffect on mount |
| `VERDICT_ACTION_CLICKED` | `AnalystCheckDialog.tsx` action button handlers |
| `VERDICT_DISMISSED` | `AnalystCheckDialog.tsx` onClose without action |
| `TAB_SAVED` | `CompanyAssumptions.tsx` / `PropertyEdit.tsx` successful save mutation onSuccess |
| `SCENARIO_SAVED` | Scenario save mutation onSuccess |
| `SCENARIO_LOADED` | Scenario load mutation onSuccess |
| `EXPORT_GENERATED` | Export menu's generate-and-download handler |

---

## Privacy boundaries (mandatory)

The following MUST NOT appear in any event property:

- User's real name
- User email address
- Property names the user typed (use `propertyId` instead)
- Free-text content (Rebecca prompts, user notes, comments)
- Any numeric value the user typed as an assumption (use booleans like `hadVerdict: true` instead of the actual values)
- Any financial data (ADR, occupancy, NOI, etc.)

PostHog session recording is **disabled** for this handoff. Don't enable it.

When in doubt, emit a boolean or an enum, not a raw value.

---

## Boundaries — what NOT to touch

- **`server/**`** — no server-side PostHog. If we want it later, that's a separate handoff + adds `posthog-node` package.
- **`.claude/rules/**`** — no rule changes.
- **`engine/analyst/**`** — no analytics in the engine. The engine is pure; instrumentation lives at the edge (client or routes).
- **`tests/**`** — no test-side instrumentation. If tests import from `posthog.ts`, they should get no-op behavior automatically (the wrapper handles absent API key).
- **Event taxonomy** — don't add events beyond the 10 listed above. Bigger catalog = noisy data. Additions require updating this handoff.

If you find yourself wanting to instrument an engine file or add an 11th event, stop and file `BLOCKED-posthog.md`.

---

## Pre-commit verification (mandatory five gates)

1. `npx tsc --noEmit --skipLibCheck` — exit 0
2. `npm run lint` — exit 0
3. `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass
4. `npm run test:summary` — all pass
5. `npm run verify:summary` — UNQUALIFIED

Commit message footer:

```
Surfaces: S6 (frontend analytics instrumentation), S13 (dependency doc update)
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

### Functional verification

After commit, in dev:

1. Open the app with `VITE_POSTHOG_KEY` set; verify the PostHog debug log shows `[posthog] initialized`.
2. Click "Consult the Analyst" on any property; verify the PostHog dashboard sees `analyst_consult_clicked` within 30s.
3. Trigger a save-tab that produces a verdict; verify `verdict_shown` fires with the right `specialistId` + `severity`.
4. Close the dialog without acting; verify `verdict_dismissed`.
5. Click an action; verify `verdict_action_clicked` with the right `actionKind`.
6. Export a PDF; verify `export_generated` with `{ format: "pdf", scope, durationMs }`.
7. Run the app WITHOUT `VITE_POSTHOG_KEY` set; verify no errors, console shows `[posthog] disabled — VITE_POSTHOG_KEY not set`, app functions normally.

### Privacy verification

Before committing, scan your diff for these words in any capture call property: `email`, `name`, `firstName`, `lastName`, `propertyName`, `notes`, `prompt`, `message`, `content`. If any appear, remove them — they violate the boundary rules.

---

## Update `DEPENDENCIES.md` in the same commit

Change the PostHog row in `docs/architecture/DEPENDENCIES.md §13`:

**Before:**
> | **PostHog** | `posthog-js` (`^1.360.1`) | Product analytics | `POSTHOG_KEY` | **partially wired** — CSP allows `posthog.com` + package installed, but runtime integration incomplete |

**After:**
> | **PostHog** | `posthog-js` (`^1.360.1`) | Product analytics (10 events) | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | core — init in `client/src/lib/posthog.ts`, event catalog in same file |

---

## Rollback

If PostHog adoption surfaces a problem:

- **Env-var level:** unset `VITE_POSTHOG_KEY` in Replit Secrets. The wrapper no-ops; the app continues working. No code revert needed.
- **Full revert:** single commit, one git revert. Only `client/src/lib/posthog.ts` (delete) and 5 small edits (revert).

Rollback is env-var-level (seconds) in the common case. Code revert is a clean single-commit undo.

---

## After this handoff

Append a ≤5-line entry to `.claude/session-memory.md`:

> `PostHog wired up (<commit SHA>): 10 events instrumented, DEPENDENCIES.md updated, privacy boundary checks passed. Server-side capture (posthog-node) deferred. PostHog dashboard: [project URL].`

Reply on this channel when done. Claude Code will then decide next steps — likely: (a) review first week of events, (b) decide if server-side capture is needed, (c) queue OT-B (Promptfoo PR-gate) or continue the operational tooling track.

---

## Conflict check

If any instruction in this brief contradicts `.claude/rules/security.md` (privacy), `.claude/rules/claude-replit-split.md` (domain boundaries), or `.claude/rules/pre-commit-verification.md` (gates), **the `.claude/rules/*` files win**. Flag the contradiction in `BLOCKED-posthog.md` and stop before proceeding.

---

## Addendum — ADR-004 verdict cache integration (April 20, 2026)

Since this handoff was drafted, `docs/architecture/decisions/ADR-004-verdict-cache.md` (Proposed) landed. ADR-004 §7 specifies that the Cognitive Engine verdict cache's observability hooks live **in this PostHog wiring**, not as a separate integration.

### Three events to add to the initial instrumentation

Beyond the 10 product events listed above, include these three Cognitive Engine cache events. They target ADR-004 Phase 5D (observability, Replit-owned) and will be dark/no-ops until Phase 5A–5C migrations ship:

```typescript
// verdict_cache.hit — a consult returned from cache instead of re-running the orchestrator
posthog.capture("verdict_cache.hit", {
  entityType,           // "property" | "company"
  entityId,
  fieldGroupSize,       // number of canonical fields in the query
  cachedAtAgeMinutes,   // how fresh the cached row is
  personaHash,          // redacted persona identifier (hashed, no PII)
});

// verdict_cache.miss — a consult hit the orchestrator; includes a reason
posthog.capture("verdict_cache.miss", {
  entityType, entityId, fieldGroupSize,
  reason: "never_cached" | "ttl_expired" | "inputs_changed" | "explicit_bypass"
        | "engine_version_drift" | "superseded",
  personaHash,
});

// verdict_cache.cost_saved_estimate — on hit, estimated $ avoided
posthog.capture("verdict_cache.cost_saved_estimate", {
  estimatedCentsSaved,  // hit × per-consult pipeline cost (~$0.70 today)
  modelA, modelB, modelSynthesis,  // which models the hit bypassed
});
```

### Why this belongs in PostHog, not Sentry

- **PostHog is for usage + cost observability**; Sentry is for failure observability. Cache hit/miss is usage data.
- The cost-saved dashboard is the business case for ADR-004 — $125/day uncached → ~$25/day cached. We need a product-analytics surface to report on it.
- Cache hit-rate heatmaps by entityType/fieldGroup are a PostHog funnel, not a Sentry alert.

### Dashboard additions for the cache metrics

After ADR-004 Phase 5D ships, add to the PostHog dashboard:
- **Cache hit rate (last 24h):** % of `verdict_cache.hit` / (hits + misses). Target: > 60% after warmup.
- **Miss reason breakdown:** stacked bar by `reason` field. Pie-chart candidates.
- **Cost saved (last 30d):** sum of `estimatedCentsSaved`. This is the ROI number for the cache build.
- **Mean cachedAtAgeMinutes on hit:** proxy for cache freshness — very low = cache isn't old enough to matter; very high = staleness detector misfiring.

### Privacy note for cache events

`personaHash` should be SHA-256 of the resolved persona tuple, truncated to 16 chars. Never log persona strings, userId, orgId, or propertyId in a way that links to a specific LP or investor. Cache events are aggregate-analytics; PII stays in Sentry (where legitimate for debugging a specific user's failure).

### Sequencing with the main handoff

If you're executing this handoff *before* ADR-004 Phase 5A ships:
- Add the three event definitions to `client/src/lib/posthog.ts` as no-op stubs (`if (!CACHE_OBSERVABILITY_ENABLED) return;`).
- Add a feature flag `POSTHOG_CACHE_OBSERVABILITY_ENABLED = false` in `shared/constants.ts` or env.
- When Phase 5A–5C land, Replit flips the flag in the same PR. Zero ceremony.

If executing *after* Phase 5A (unlikely given current status), wire them live.

### Follow-up after this handoff

Claude Code will update `docs/architecture/decisions/ADR-004-verdict-cache.md` §7 with a direct reference to this handoff once it commits, closing the cross-reference loop.
