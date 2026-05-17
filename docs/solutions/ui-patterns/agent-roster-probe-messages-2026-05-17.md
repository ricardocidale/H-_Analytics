# Agent Roster Probe: Terminology & Human-Readable Messages

**Date:** 2026-05-17  
**Applies to:** `AgentRosterAccordion.tsx`, `runtime.ts` probe handler

---

## Problem

When an admin pressed the Analyst button on a roster row, three things went wrong:

1. **Wrong taxonomy** — Gustavo is an Orchestrator/Agent. The probe endpoint returned `"Specialist not found"` because it uses the specialist catalog route (`/api/admin/specialists/:id/probe`). The error message called him a "Specialist", which is incorrect.

2. **Technical language shown to admin** — The raw server error `"404 Specialist not found [ASRT-005]"` was displayed verbatim, including the HTTP status code and the internal error code.

3. **Probe actually failed** — `gaspar` (Gustavo's ID) is intentionally absent from `SPECIALIST_CATALOG`. The probe handler called `getSpecialistById("gaspar")`, got `undefined`, and returned 404.

---

## Root Cause

Gustavo (`ORCHESTRATOR_SPECIALIST_ID = "gaspar"`) is the Analyst Orchestrator. He is:
- Hardcoded in `AGENT_DESCRIPTORS` in `agent-roster.ts` (class: `"agent"`)
- Intentionally **not** in `SPECIALIST_CATALOG` (filtered out in `getSpecialistsRoster`)
- Probed via the specialist endpoint because he has no dedicated agent probe route

The probe handler in `runtime.ts` used `getSpecialistById(id)` with no special-case for the orchestrator.

---

## Fix

### Server (`artifacts/api-server/src/routes/admin/specialists/runtime.ts`)

Added an early-return before `getSpecialistById` for `ORCHESTRATOR_SPECIALIST_ID`:

```ts
if (id === ORCHESTRATOR_SPECIALIST_ID) {
  return res.json({
    specialistId: id,
    ranAt: new Date().toISOString(),
    steps: [{ name: "Orchestrator availability", ..., status: "pass", message: "Orchestrator is reachable." }],
  });
}
```

Rationale: Gustavo is in-process. If the server responds, he is reachable by definition.

### Client (`AgentRosterAccordion.tsx`)

Added `humanizeProbeMessage(message, entryClass)` that:
- Strips HTTP status code prefixes (`"404 "`)
- Strips internal error codes (`"[ASRT-005]"`)
- Translates technical phrases into plain language using the correct class label (`"Agent"` / `"Specialist"` / `"Helper"`)
- Applied to: inline status message display, toast title ("probe failed" → "check failed"), and toast description

---

## Rules Going Forward

1. **Probe messages must use the entity's class label** — never say "Specialist" for an Agent or Minion.
2. **Never show raw HTTP codes or internal error codes** (`[ASRT-NNN]`) in admin-facing UI.
3. **The orchestrator (`gaspar`) routes through the specialist probe endpoint** — this is intentional and the early-return in `runtime.ts` handles it.
4. **Any new agent that isn't in `SPECIALIST_CATALOG`** needs either its own probe endpoint or a similar early-return special-case in `runtime.ts`.
