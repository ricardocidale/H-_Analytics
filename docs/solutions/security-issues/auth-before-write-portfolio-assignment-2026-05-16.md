---
title: "Auth-Before-Write Violation — Property Ownership Not Checked Before updateProperty Mutation"
date: 2026-05-16
category: security-issues
module: portfolio-route-security
problem_type: security_issue
component: assistant
symptoms:
  - "PUT /api/properties/:id/portfolio succeeded for a property the requesting user does not own"
  - "An authenticated user could assign any property (regardless of owner) to their own portfolio"
  - "The same unauthorized write was possible via the Rebecca agent tool (rebecca-tool-impls-portfolio.ts)"
  - "CodeRabbit flagged the route as a security issue: missing authorization check before write"
root_cause: missing_permission
resolution_type: code_fix
severity: high
tags:
  - auth-order
  - ownership-check
  - idor
  - portfolio-routes
  - rebecca-tools
  - express-routes
  - coderabbit
related_components:
  - authentication
---

# Auth-Before-Write Violation — Property Ownership Not Checked Before updateProperty Mutation

## Problem

`PUT /api/properties/:id/portfolio` called `storage.updateProperty(propertyId, { portfolioId })`
without first verifying the requesting user owns that property. Any authenticated user who knew (or
guessed) another user's property ID could reassign it to their own portfolio. The identical bug
existed in the Rebecca agent tool (`rebecca-tool-impls-portfolio.ts`), making it exploitable via
both the UI and AI assistant paths.

## Symptoms

- `PUT /api/properties/999/portfolio` returns 200 even when property 999 belongs to a different user
- No 403 is returned; the write succeeds silently
- `storage.updateProperty(propertyId, fields)` accepts a bare `propertyId` with no userId filter

## What Didn't Work

No failed approaches — the bug was caught by CodeRabbit during PR #158 review before reaching
production. The fix was straightforward once the missing check was identified.

## Solution

Add an ownership check on the property before any write. The target portfolio ownership check is a
separate, independent guard.

**`artifacts/api-server/src/routes/portfolios.ts` — after fix:**

```typescript
app.put("/api/properties/:id/portfolio", requireAuth, async (req, res) => {
  const user = getAuthUser(req);
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PORT-016" });

  // Runtime type validation — must be number or null
  const rawPortfolioId = (req.body as { portfolioId?: unknown })?.portfolioId;
  if (rawPortfolioId !== null && rawPortfolioId !== undefined && typeof rawPortfolioId !== "number") {
    return res.status(HTTP_400_BAD_REQUEST).json({ error: "portfolioId must be a number or null", code: "PORT-020" });
  }
  const portfolioId = rawPortfolioId as number | null | undefined;

  // Ownership check on the PROPERTY before write
  const existing = await storage.getProperty(propertyId);
  if (!existing) return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "PORT-018" });
  if (existing.userId !== user.id) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PORT-019" });

  // Validate target portfolio belongs to user (if assigning)
  if (portfolioId !== null && portfolioId !== undefined) {
    const portfolio = await storage.getPortfolio(portfolioId, user.id);
    if (!portfolio) return res.status(HTTP_404_NOT_FOUND).json({ error: "Portfolio not found", code: "PORT-017" });
  }

  const updated = await storage.updateProperty(propertyId, { portfolioId: portfolioId ?? null });
  res.status(HTTP_200_OK).json(updated);
});
```

**`artifacts/api-server/src/chat/rebecca-tool-impls-portfolio.ts` — same pattern:**

```typescript
// Before any write: verify property exists and belongs to the requesting user
const existing = await storage.getProperty(propertyId);
if (!existing) return { result: { error: "Property not found" } };
if (existing.userId !== ctx.userId) return { result: { error: "Access denied" } };
// ... then proceed with updateProperty
```

## Why This Works

`storage.updateProperty(propertyId, fields)` is intentionally a bare write — it takes an ID and
a patch, with no userId filter. This is correct API design for a storage layer. The responsibility
for authorization belongs at the route/tool boundary, not in storage.

The fix reads the existing property first to confirm two things independently: (1) the property
exists, and (2) it belongs to the requesting user. Only then is the write issued. These are
separate checks because a 404 vs 403 distinction matters for the caller.

The same ownership-check pattern applies to the Rebecca tool path: agents can make the same HTTP
call semantics as the UI, so both code paths must enforce the same authorization invariant.

## Prevention

- **Any route that mutates by bare ID must check ownership before the write.** The pattern:
  `getEntity(id)` → null check (404) → `entity.userId !== user.id` (403) → then write.
- **Do not rely on the storage layer to enforce userId scoping** for mutation calls. Read-side
  helpers (`getPortfolio(id, userId)`) filter by user, but write helpers (`updateProperty`) do not.
- **Apply the check to every exposure of the same action**: if both a UI route and a Rebecca tool
  can perform a mutation, both must enforce the ownership check independently.
- **CodeRabbit "missing authorization check before write" findings are P0.** Do not dismiss them
  as false positives without verifying the storage call's userId scoping.
- **Code review checklist for mutation routes**: confirm the entity's `userId` is checked against
  `req.user.id` BEFORE any `update*`, `delete*`, or `patch*` storage call.

## Related Issues

- `docs/solutions/security-issues/csrf-coverage-rollout-2026-05-11.md` — complementary security
  layer (CSRF token enforcement); auth-before-write and CSRF are independent defenses
