---
title: CSRF Coverage Gap on Admin Write Surface — Report-Then-Enforce Rollout
date: 2026-05-11
category: security-issues
module: csrf-coverage
problem_type: security_issue
component: authentication
symptoms:
  - "51 of ~52 admin write routes (POST/PUT/PATCH/DELETE on /api/admin/*) accepted requests with no x-csrf-token header"
  - "Only the analyst-tables refresh route enforced CSRF via csrfTokenGuard; other admin mutations had no guard"
  - "52 raw fetch() callsites across ~30 frontend files bypassed the centralized apiRequest helper that auto-attaches x-csrf-token"
  - "Token infrastructure (HMAC-SHA256 derived from session id, double-submit cookie) was already implemented but unused on most routes"
  - "No structural mechanism prevented future admin routes from shipping without CSRF coverage — every new route inherited the gap by default"
root_cause: missing_validation
resolution_type: code_fix
severity: high
tags:
  - csrf
  - admin-routes
  - middleware
  - double-submit-cookie
  - rollout-gate
  - apirequest-helper
---

# CSRF Coverage Gap on Admin Write Surface — Report-Then-Enforce Rollout

## Problem

H+ Analytics had CSRF protection machinery (HMAC-SHA256 double-submit cookie pattern) but enforced it on only **one** admin route out of ~50. Roughly 30 frontend files bypassed the centralized `apiRequest` helper with raw `fetch()` calls, making any naive global enforcement a guaranteed production outage.

## Symptoms

- HMAC token cookie (`csrf_token`) was being issued on every session, but only `POST /api/admin/analyst-tables/:id/refresh` validated it.
- The other ~50 admin write routes (POST/PUT/PATCH/DELETE under `/api/admin/*`) accepted any authenticated request with no origin check — vulnerable to CSRF from any logged-in admin's browser.
- Frontend was split: `apiRequest` in `artifacts/hospitality-business-portal/src/lib/queryClient.ts` auto-attached `x-csrf-token`, but 52 raw-fetch callsites across ~30 admin components silently bypassed it.
- No CI signal would catch a new admin write being added without CSRF — every new route inherited the gap by default.
- Flipping enforcement on naively would have 403'd every admin tab (Users, Scenarios, Database, Intelligence) on the next deploy.

## What Didn't Work

**Big-bang enforce.** First instinct was to ship the global middleware in enforce mode in a single PR. A static grep of the frontend turned up ~30 raw-fetch admin-write callsites that don't auto-attach `x-csrf-token`. Flipping straight to enforce would have 403'd every admin surface simultaneously. Discarded in favor of a report-mode → migrate-callsites → flip rollout.

**Sub-router refactor.** Considered `app.use('/api/admin', adminRouter)` and attaching the CSRF middleware to the sub-router. But existing admin routes register directly on the Express app via `registerXxxRoutes(app)` across ~30 files — converting them to a sub-router would have been an independent large refactor with its own risk surface. Used a path-matched global middleware instead (single mount point, automatic coverage for future routes).

**CodeRabbit's `/api/admin/...` literal warnings.** CodeRabbit repeatedly flagged internal route literals like `'/api/admin/users'` in `apiRequest(...)` calls as CLAUDE.md §1 violations. Misapplied — §1 targets **external** integration endpoints stored in `admin_resources` rows (LLM providers, third-party APIs), not internal SPA-to-Express routes. Declined consistently across PRs #104, #106, #107, #108.

## Solution

A seven-PR rollout: ship the middleware in observability-only "report" mode, migrate every raw-fetch admin write callsite to the centralized helper while watching logs, then flip a single constant to "enforce".

### 1. Middleware in report mode (PR #100)

`artifacts/api-server/src/middleware/csrf.ts`:

```ts
export type CsrfMode = "report" | "enforce";

export function csrfGuardForAdminWrites({ mode }: { mode: CsrfMode }) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!req.path.startsWith("/api/admin/")) return next();

    const result = validateCsrfToken(req);
    if (result.ok) return next();

    if (mode === "report") {
      logger.warn("[csrf] admin write missing/invalid token", {
        reason: result.reason,
        path: req.path,
        method: req.method,
        userId: req.user?.id ?? null,
      });
      return next();
    }
    return res.status(HTTP_STATUS_FORBIDDEN).json({ error: "csrf_invalid" });
  };
}
```

Mounted globally in `artifacts/api-server/src/index.ts` after `authMiddleware`:

```ts
const CSRF_MODE: CsrfMode = "report";
app.use(csrfGuardForAdminWrites({ mode: CSRF_MODE }));
```

`csrfTokenGuard` (the per-route hard-rejecting variant) was extracted into the same module; `analyst-refresh-guards.ts` re-exports it for back-compat with existing tests. 11 unit tests cover both modes, all method/path combinations, and HMAC/cookie tampering. `HTTP_STATUS_FORBIDDEN = 403` was promoted into `@shared/constants` to satisfy the magic-numbers ratchet.

### 2. Callsite migrations (PRs #104–#108)

Mechanical transform across 52 callsites in ~30 files. Pattern:

```ts
// Before — bypasses CSRF, custom error handling
const res = await fetch("/api/admin/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(payload),
});
if (!res.ok) throw new Error("Failed to create user");

// After — auto-attaches x-csrf-token, centralized error handling
await apiRequest("POST", "/api/admin/users", payload, {
  fallbackMessage: "Failed to create user",
});
```

Sequenced for blast-radius control:

- **#104** — `lib/api/admin.ts` + `lib/api/scenarios.ts` shared helpers (7 callsites, cascades to ~10 components).
- **#105** — Users + Activity (7).
- **#106** — Scenarios components (7).
- **#107** — Database + Intelligence (9).
- **#108** — Model defaults / Verification / Iris / Specialists / Services / LLM workflows / Design themes (22).

PR #108 caught one real bug surfaced by CodeRabbit during the migration: `PropertyUnderwritingTab.savePlatformFee` did `parseFloat(platformFeeDraft) / 100` with no NaN guard, and a try/catch swallowed the resulting failure silently. Added `Number.isFinite(parsed) && parsed >= 0 && parsed <= 100` validation before the PATCH.

After each PR shipped, report-mode logs were checked for residual `[csrf]` warnings to confirm coverage was actually complete before the next batch.

### 3. The flip (PR #109)

One line:

```diff
- const CSRF_MODE: CsrfMode = "report";
+ const CSRF_MODE: CsrfMode = "enforce";
```

No middleware code change. Same code path, different terminal action.

## Why This Works

**Root cause:** the CSRF check was per-route opt-in, and the frontend had two parallel networking conventions (the centralized helper that handled CSRF and ad-hoc `fetch()` calls that didn't). A vulnerability of this shape can't be closed safely with a single-PR fix — the asymmetry between server enforcement and client coverage guarantees a production break.

**The fix addresses it on both axes:**

1. **Server side:** moved from per-route opt-in to global path-matched middleware. New `/api/admin/*` routes inherit CSRF automatically with no per-route plumbing — the failure mode flips from "easy to forget" to "have to actively bypass."
2. **Client side:** consolidated all admin writes onto `apiRequest`, eliminating the second networking convention. The remaining single path always attaches the token.
3. **Rollout safety:** report mode let us observe real production traffic against the new middleware without breaking anything, turning a risky cutover into a measured migration. The two-character `"report"` ↔ `"enforce"` toggle provides an instant rollback if a missed callsite surfaces post-deploy.

## Prevention

**1. Always use `apiRequest` for admin writes.** New admin actions call the helper, never raw `fetch()`:

```ts
// Correct
import { apiRequest } from "@/lib/queryClient";
await apiRequest("PATCH", `/api/admin/users/${userId}`, { role: "admin" }, {
  fallbackMessage: "Failed to update user role",
});

// Violation — global middleware will 403 this
await fetch(`/api/admin/users/${userId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "admin" }),
});
```

**2. New `/api/admin/*` routes inherit CSRF automatically.** The path-matched global mount in `index.ts` covers every POST/PUT/PATCH/DELETE under `/api/admin/`. No per-route `csrfTokenGuard` needed for new routes — adding one is harmless but redundant.

**3. CI guard against raw-fetch regressions.** Add a test that greps the frontend tree for non-safe `fetch()` calls against admin routes and fails the build:

```ts
// artifacts/hospitality-business-portal/src/tests/no-raw-admin-fetch.test.ts
const offenders = await grepFiles(
  "src/**/*.{ts,tsx}",
  /fetch\(\s*[`'"][^`'"]*\/api\/admin\/[^`'"]*[`'"][\s\S]*?method:\s*[`'"](?:POST|PUT|PATCH|DELETE)/,
);
expect(offenders).toEqual([]);
```

This catches both genuine regressions and copy-pasted patterns from older code before they reach review.

**4. Rollback escape hatch is documented and tested.** The `CSRF_MODE` constant is the documented kill switch. If a missed callsite surfaces post-deploy as 403s, the revert is a two-character change to `index.ts` — no middleware logic touched, identical code paths, only the terminal action changes. Both modes are covered by unit tests so the rollback target is known-good.

## Key Files

- `artifacts/api-server/src/middleware/csrf.ts` — new middleware module (both `csrfTokenGuard` and `csrfGuardForAdminWrites`).
- `artifacts/api-server/src/index.ts` — global mount point + `CSRF_MODE` flag.
- `artifacts/api-server/src/middleware/analyst-refresh-guards.ts` — refactored to re-export `csrfTokenGuard` from the new module.
- `artifacts/api-server/src/tests/middleware/csrf.test.ts` — 11 unit tests covering both modes.
- `artifacts/hospitality-business-portal/src/lib/queryClient.ts` — `apiRequest` helper (pre-existing, unchanged).
- `lib/shared/src/constants*.ts` — `HTTP_STATUS_FORBIDDEN = 403` promoted here.

## Related

- `docs/solutions/conventions/react-query-apiRequest-querykey-convention-2026-05-05.md` — establishes that admin mutations must go through `apiRequest`. As of 2026-05-11 that requirement is also a **security gate** (CSRF enforcement), not just a type/convention preference. The two docs are complementary: this one is the security/rollout pattern; the conventions doc is the type-safety/query-caching motivation.
- PRs: #100 (foundation), #104, #105, #106, #107, #108 (migrations), #109 (flip).
