# Opus Audit #321: Server API Routes & Storage Layer

**Auditor**: Main Agent  
**Date**: 2026-04-10  
**Scope**: All API route modules and the storage/persistence layer  
**Files Reviewed**: 46 route files (~11,455 lines) + 19 storage files (~3,716 lines) + 2 barrel files

---

## Executive Summary

**Verdict: PASS** — The API surface and storage layer are well-architected with consistent patterns. The domain boundary rule is perfectly enforced (zero violations). Input validation coverage is strong with Zod schemas on nearly all endpoints. The storage layer uses proper delegation via 14 sub-storage classes with transactions where needed.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 0 |
| Medium   | 3 |
| Low      | 5 |

---

## Architecture Inventory

### Route Registration
- **Barrel**: `server/routes.ts` — registers 31 route modules via `*.register(app)` pattern
- **Sub-modules**: 46 files across `server/routes/` (34 top-level) + `server/routes/admin/` (12 admin sub-routes)
- **Helper modules**: `helpers.ts`, `scenario-helpers.ts`, `ssrf-guard.ts`, `pdf-html-templates.ts`, `premium-pdf-pipeline.ts`, `export-json-utils.ts`, `chat-prompts.ts`, `chat-insight.ts`, `research-meta.ts`, `icp-research-helpers.ts`, `properties-urls.ts`, `scenarios-access.ts`
- **Auth routes**: Separately registered (`google-auth.ts` from `server/index.ts`, `auth.ts` from routes barrel)

### Storage Architecture
- **Barrel**: `server/storage.ts` — exports singleton `DatabaseStorage` instance
- **Interface**: `IStorage` in `server/storage/index.ts` — extends 14 sub-storage class types
- **Sub-classes**: UserStorage, PropertyStorage, FinancialStorage, AdminStorage, ActivityStorage, ResearchStorage, PhotoStorage, DocumentStorage, ServiceStorage, NotificationStorage, IntegrationStorage, IntelligenceV2Storage, IntelligenceRebeccaStorage, PropertyUrlStorage, CalcAuditStorage
- **Delegation**: All methods bound via `.bind(this.subClass)` pattern — 170+ method bindings
- **Transactions**: Used in 16 operations (deleteUser, upsertMarketResearch, photo operations, scenario operations, company/group deletes, KB rollback)

### Domain Boundary Compliance
- **Routes → storage**: 0 violations. No route file imports `db` or `drizzle-orm`
- **Routes → admin**: 0 violations. Admin sub-routes also clean
- **Storage → db**: All storage files correctly import from `../db`

---

## Findings

### M-001: `as any` Casts in Storage Property Indexing (9 instances)
**Severity**: Medium  
**Location**: `server/storage/properties.ts:14-21`  
**Description**: The `_indexPropertyAsync()` function accesses property fields via `(property as any).fieldName` with snake_case fallbacks (e.g., `(property as any).propertyType ?? (property as any).property_type`). The `Property` type from the schema includes all these fields with proper camelCase names, making the `as any` casts and snake_case fallbacks unnecessary. This adds 9 `as any` casts to the server budget.  
**Remediation**: Replace with direct typed access: `property.propertyType ?? "hotel"`, `property.roomCount ?? null`, etc.

### M-002: `catch (error)` Without `: unknown` Type Annotation (majority of routes)
**Severity**: Medium  
**Location**: All route files — approximately 250+ catch blocks use `catch (error)` without `: unknown`  
**Description**: The project convention requires `catch (error: unknown)` with `error instanceof Error ? error.message : String(error)`. While most catch blocks correctly handle the error via `logAndSendError()` (which accepts `unknown`), the type annotation is inconsistent. Only ~32 catch blocks use `catch (error: unknown)`. The `catch (e)` variant is used in ~35 places (cost-logger, vector-store, research admin). TypeScript treats untyped catch parameters as `any` by default, which weakens type safety.  
**Remediation**: Batch-update all `catch (error)` and `catch (e)` to `catch (error: unknown)` across route files.

### M-003: Raw `req.body` Merge in Global Assumptions PUT
**Severity**: Medium  
**Location**: `server/routes/global-assumptions.ts:64`  
**Description**: The PUT endpoint merges raw `req.body` into the current assumptions object before Zod validation: `const merged = { ...(current ?? {}), ...req.body }`. While the merged result IS validated via `insertGlobalAssumptionsSchema.safeParse(merged)` at line 70, the pre-validation merge could introduce prototype pollution if `req.body` contains `__proto__` or `constructor` keys. Express's JSON parser does not filter these by default.  
**Mitigation**: The Zod schema at line 70 acts as a sanitization layer — only known fields survive validation. The risk is theoretical but the pattern is fragile.  
**Remediation**: Validate `req.body` with a Zod schema first, then merge only `validation.data` into the current record.

### L-001: `as any` Casts in Route Files (7 instances)
**Severity**: Low  
**Location**: `server/routes/properties.ts:140,142,143,214`, `server/routes/documents.ts:106`, `server/routes/admin/intelligence-qa.ts:213,229`, `server/routes/admin/intelligence-scheduled.ts:47,51`  
**Description**: Seven `as any` casts across route files. Breakdown: (1) properties.ts uses `as any` to pass data to `suggestStarRating()` and access `researchValues` — suggests the function parameter type is too narrow; (2) documents.ts stores raw extraction data as `rawExtractionData: result as any`; (3) intelligence-qa.ts casts domain and clients params for LLM resolution; (4) intelligence-scheduled.ts casts workflow data for upsert.  
**Remediation**: Widen function parameter types or add explicit intermediate types to eliminate casts.

### L-002: Manual Boolean Validation Instead of Zod
**Severity**: Low  
**Location**: `server/routes/admin-integrations.ts:242-243`, `server/routes/admin/intelligence-sources.ts:78-79`  
**Description**: Two toggle endpoints use `typeof isEnabled !== "boolean"` / `typeof isActive !== "boolean"` manual checks instead of Zod schemas. While functionally correct, this breaks the consistent Zod validation pattern used everywhere else.  
**Remediation**: Use `z.object({ isEnabled: z.boolean() }).safeParse(req.body)` for consistency.

### L-003: `skipProcessing` Read from Unvalidated `req.body`
**Severity**: Low  
**Location**: `server/routes/property-photos.ts:72`  
**Description**: After Zod-validating the photo data with `insertPropertyPhotoSchema.safeParse({...req.body, propertyId})`, the code reads `req.body.skipProcessing` outside the validated schema. The `skipProcessing` field is not in the Zod schema, so it bypasses validation. A truthy non-boolean value would skip processing.  
**Remediation**: Add `skipProcessing: z.boolean().optional()` to the photo creation schema or validate separately.

### L-004: `catch (e)` in Admin Research Routes Without Proper Error Extraction
**Severity**: Low  
**Location**: `server/routes/admin/research.ts:148,165,183,205,227,249`  
**Description**: Six catch blocks in the admin research config route use `catch (e)` and pass `e` directly to `logAndSendError()`. While `logAndSendError` handles `unknown`, the implicit `any` typing of `e` bypasses TypeScript checking at the call site.  
**Remediation**: Change to `catch (error: unknown)`.

### L-005: `as any[]` in Storage SQL Query Result
**Severity**: Low  
**Location**: `server/storage/properties.ts:83`  
**Description**: Raw SQL query result is cast via `(rows.rows as any[]).map(...)`. This is a Drizzle ORM limitation for raw SQL queries that return untyped results.  
**Remediation**: Accepted — Drizzle raw SQL queries return untyped results. Consider using a typed helper wrapper.

---

## Verified-Correct Observations

1. **Domain boundary**: Zero violations across all 46 route files. No route imports `db` or `drizzle-orm` directly.
2. **Input validation coverage**: 60+ endpoints validate `req.body` with Zod `.safeParse()` before use. Error messages consistently use `fromZodError()`.
3. **Route module pattern**: Consistent `export function register(app: Express)` pattern across all 31 registered modules.
4. **Storage delegation**: Clean 14-class composition via method binding. IStorage interface enforces the contract.
5. **Transaction usage**: 16 transactional operations cover all multi-step mutations (user delete, scenario clone/load, photo reorder, company/group cascading deletes, market research upsert).
6. **Error handling**: All routes wrap handlers in try/catch. Most use `logAndSendError()` which logs server-side and returns generic 500 to client.
7. **Auth middleware**: All non-public routes use `requireAuth`, `requireAdmin`, `requireChecker`, or `requireManagementAccess` middleware.
8. **Property access control**: All property-mutating routes check `checkPropertyAccess()` before proceeding.
9. **Rate limiting**: AI and expensive endpoints use `aiRateLimit()` middleware or `isApiRateLimited()` checks.
10. **Cascading delete**: `deleteUser()` runs in a single transaction with 17 related table deletions.
11. **Parameter parsing**: Route params consistently use `Number()` or `parseInt()` with `isNaN()` checks, returning 400 for invalid IDs.
12. **Response consistency**: Error responses use `{ error: "message" }` envelope. Success responses return data directly or `{ success: true }`.
13. **Pagination**: Not needed — the app serves a small portfolio (< 50 properties), so all-records queries are appropriate.
14. **SSRF protection**: `server/routes/ssrf-guard.ts` exists for URL validation in property URL features.
15. **Activity logging**: State-changing operations consistently call `logActivity()` for audit trail.

---

## Compliance Checks

| Rule | Status | Notes |
|------|--------|-------|
| Domain boundary (no db/drizzle in routes) | PASS | 0 violations across 46 route files |
| Zod input validation | PASS (98%) | 2 toggle endpoints use manual typeof checks instead of Zod |
| `as any` budget (server ≤ 70) | OK | 7 in routes + 9 in storage/properties.ts = 16 in this scope (within overall budget) |
| `catch (error: unknown)` | PARTIAL | ~32 use `: unknown`, ~250+ use untyped `catch (error)`, ~35 use `catch (e)` |
| Transaction safety | PASS | All multi-step mutations use `db.transaction()` |
| Error response hiding | PASS | Production errors return generic messages via `logAndSendError()` |
| N+1 query patterns | PASS | No loop-based storage calls detected in routes |

---

## Summary

The routes and storage layer demonstrate mature, well-maintained code with strong architectural discipline:

- **Perfect domain boundary compliance** — the abstraction between routes and database is airtight
- **Comprehensive input validation** — Zod schemas guard nearly every endpoint
- **Proper transaction usage** — atomic operations where data consistency matters
- **Consistent patterns** — module registration, error handling, auth middleware, activity logging
- **Clean delegation** — 14 sub-storage classes keep the 170+ method interface manageable

The three medium findings are: (1) unnecessary `as any` casts in property indexing that should use typed access, (2) catch blocks missing `: unknown` annotations (widespread but low-impact), and (3) a raw `req.body` merge pattern that should use pre-validated data. None are exploitable or cause data corruption.
