---
title: "Vitest vi.mock Factory TDZ: Use Inline vi.fn() and vi.mocked() Pattern"
date: "2026-05-19"
category: best-practices
module: vitest-mocking
problem_type: best_practice
component: testing_framework
severity: high
applies_when:
  - "Writing Vitest unit tests that mock ES modules with vi.mock()"
  - "Mock factories need to expose callable stubs to test bodies or beforeEach hooks"
  - "Mocking modules with chained APIs (e.g., Drizzle db.select().from())"
  - "Any test file where module-level const declarations and vi.mock() factories coexist"
tags:
  - vitest
  - vi-mock
  - tdz
  - temporal-dead-zone
  - module-mocking
  - vi-mocked
  - hoisting
  - unit-testing
---

# Vitest vi.mock Factory TDZ: Use Inline vi.fn() and vi.mocked() Pattern

## Context

When writing Vitest unit tests for `runValentinaResearch` and `runValentinaModelDefaultsCycle`
(`artifacts/api-server/src/tests/valentina-model-defaults.test.ts`), the first attempt defined
mock functions as module-level constants and referenced them inside `vi.mock()` factories:

```typescript
const mockResolveLlmFor = vi.fn();

vi.mock("../ai/llm-config-resolver", () => ({
  resolveLlmFor: mockResolveLlmFor,  // ← referenced here
}));
```

The entire test file threw immediately on load:

```
ReferenceError: Cannot access 'mockResolveLlmFor' before initialization
  at src/tests/valentina-model-defaults.test.ts:38:18
```

The error cites the line of the `const` declaration — not the `vi.mock()` call — which makes
the root cause non-obvious. This is a structural mismatch between two Vitest behaviours that
cannot be seen in the source code as written.

## Guidance

### The canonical pattern: inline `vi.fn()` in factories, `vi.mocked()` after imports

**Step 1 — factories use only inline `vi.fn()` calls (no external variable references):**

```typescript
vi.mock("../ai/llm-config-resolver", () => ({
  resolveLlmFor: vi.fn(),
}));
vi.mock("../ai/clients", () => ({
  getAnthropicClient: vi.fn(),
  getOpenAIClient: vi.fn(),
}));
vi.mock("../middleware/cost-logger", () => ({
  logApiCost: vi.fn(),
  estimateCost: vi.fn().mockReturnValue(0),  // short chains with no external refs are fine
}));
```

**Step 2 — use `vi.mocked()` after imports to get typed references to the same underlying stubs:**

```typescript
import { resolveLlmFor } from "../ai/llm-config-resolver";
import { getAnthropicClient, getOpenAIClient } from "../ai/clients";

const mockResolveLlmFor = vi.mocked(resolveLlmFor);
const mockGetAnthropicClient = vi.mocked(getAnthropicClient);
const mockGetOpenAIClient = vi.mocked(getOpenAIClient);
```

**Step 3 — configure mock behaviour in `beforeEach` or individual tests:**

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  mockResolveLlmFor.mockResolvedValue({ vendor: "anthropic", modelId: "claude-sonnet-4-6" });
  mockGetAnthropicClient.mockReturnValue({ messages: { create: mockAnthropicCreate } } as never);
});
```

### Extension: chained API mocks (e.g., Drizzle ORM)

The same TDZ constraint applies when mocking modules that expose chained APIs:

```typescript
vi.mock("../db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

import { db } from "../db";
const mockDbSelect = vi.mocked(db.select);
const mockDbUpdate = vi.mocked(db.update);

// Configure the chain per test or in beforeEach:
mockDbSelect.mockReturnValue({ from: vi.fn().mockResolvedValue(rows) } as never);
mockDbUpdate.mockReturnValue({
  set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
} as never);
```

## Why This Matters

`vi.mock()` calls are **hoisted** to the top of the compiled module by Vitest's vite transform —
they run before any other code in the file, including `import` statements and `const` declarations.

`const` declarations are **not** hoisted. They sit in the Temporal Dead Zone (TDZ) from the
start of module scope until the line where they are initialised executes. When a hoisted factory
reads a `const` that has not yet been initialised, JavaScript throws a `ReferenceError`.

The failure mode is maximally disruptive: the error fires at file load time, before any test
runs, and the error message points at the `const` declaration rather than the `vi.mock()` call.
To a developer unfamiliar with hoisting mechanics, the code looks correct.

`vi.mocked()` solves this cleanly: `vi.fn()` inside the factory creates the stub with no
external reference (no TDZ exposure), and `vi.mocked(importedFn)` after the import statement
wraps the same underlying stub with full TypeScript types — same object, safe access order.

## When to Apply

- Any `vi.mock()` factory that needs to expose a stub configurable in `beforeEach` or individual tests
- Any mock that needs `.mockResolvedValue()`, `.mockReturnValue()`, or `.mockImplementation()` called on it at test time
- Chained API mocks (ORM query builders, HTTP client chains) where the mock shape is a nested object of `vi.fn()` stubs

The only exception is a factory that returns a pure static object with no per-test reconfiguration
needed — in that case `vi.mocked()` references are unnecessary.

## Examples

### Before (broken — TDZ violation)

```typescript
// Module level — executed AFTER hoisted vi.mock factories
const mockResolveLlmFor = vi.fn();          // ← NOT YET INITIALIZED when factory runs
const mockGetAnthropicClient = vi.fn();

// Hoisted to top at compile time — runs BEFORE the consts above are initialized
vi.mock("../ai/llm-config-resolver", () => ({
  resolveLlmFor: mockResolveLlmFor,          // ReferenceError thrown here
}));
vi.mock("../ai/clients", () => ({
  getAnthropicClient: mockGetAnthropicClient, // ReferenceError thrown here
}));

// Tests never execute — file throws on load
it("should call resolveLlmFor", async () => { /* ... */ });
```

Runtime error:
```
ReferenceError: Cannot access 'mockResolveLlmFor' before initialization
  at src/tests/valentina-model-defaults.test.ts:38:18
```

### After (correct — inline factories + vi.mocked())

```typescript
// Factories use only inline vi.fn() — no external variable references
vi.mock("../ai/llm-config-resolver", () => ({
  resolveLlmFor: vi.fn(),
}));
vi.mock("../ai/clients", () => ({
  getAnthropicClient: vi.fn(),
  getOpenAIClient: vi.fn(),
}));

// Imports (processed after hoisted mocks — correct order)
import { resolveLlmFor } from "../ai/llm-config-resolver";
import { getAnthropicClient, getOpenAIClient } from "../ai/clients";

// vi.mocked() wraps the same vi.fn() the factory installed — typed, no TDZ risk
const mockResolveLlmFor = vi.mocked(resolveLlmFor);
const mockGetAnthropicClient = vi.mocked(getAnthropicClient);

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveLlmFor.mockResolvedValue({ vendor: "anthropic", modelId: "claude-sonnet-4-6" });
});

it("calls resolveLlmFor with correct args", async () => {
  await runValentinaResearch(input);
  expect(mockResolveLlmFor).toHaveBeenCalled();
});
```

### Chained API (Drizzle ORM) — before and after

**Before (broken):**
```typescript
const mockSelect = vi.fn();               // TDZ violation when factory runs
vi.mock("../db", () => ({
  db: { select: mockSelect },             // ReferenceError
}));
```

**After (correct):**
```typescript
vi.mock("../db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

import { db } from "../db";
const mockDbSelect = vi.mocked(db.select);
const mockDbUpdate = vi.mocked(db.update);

mockDbSelect.mockReturnValue({ from: vi.fn().mockResolvedValue([row]) } as never);
```

## Related

- `docs/solutions/best-practices/vacuous-catch-test-regression-magnet-2026-05-11.md` — related Vitest anti-pattern: silent test pass via vacuous catch block
- Applied in `artifacts/api-server/src/tests/valentina-model-defaults.test.ts` (commit `24ac5dacd`)
- Applied in `artifacts/api-server/src/tests/valentina-model-defaults-scheduler.test.ts` (commit `3f1242c81`)
