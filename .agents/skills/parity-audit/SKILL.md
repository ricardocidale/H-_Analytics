---
name: parity-audit
description: "Audit Rebecca's function-calling tools against the UI action parity map and enforce parity as a binding gate. Use when adding new UI features, new HTTP routes, or new Rebecca tools — and as a pre-merge check."
---

# Parity Audit Skill

Check whether every UI action in H+ Analytics has a corresponding Rebecca tool, and whether the parity map is current.

## Binding gate — run this whenever you:

- Add a new HTTP route in `slide-factory.ts`, `lb-deck-pdf.ts`, or any other surface that has a matching entry in the parity map
- Add, rename, or remove a tool in `artifacts/api-server/src/chat/rebecca-tools.ts`
- Add a button, form submission, or other UI action in any `.tsx` page or component
- Are closing a task that touches any of the above

**Do not declare a task done if any ⚠️ row exists in the parity map that was introduced by your changes.** A ⚠️ row added during this session is a blocking gap — add the tool before marking complete.

## Steps

1. Read `docs/discipline/agent-native-parity-map.md` — the canonical parity map.

2. Read `artifacts/api-server/src/chat/rebecca-tools.ts` — the tool implementations and the `REBECCA_TOOLS` array (tool definitions visible to the LLM).

3. **Drift check** — for each ✅ row in the parity map, verify the tool name appears in both the switch dispatch and the tool definitions array in `rebecca-tools.ts`. Flag any ✅ row where either is missing.

4. **Gap check** — list all ⚠️ rows. For each one introduced by the current session's changes, it is a blocking gap that must be resolved before closing.

5. **Undocumented tool check** — check whether any tool in `rebecca-tools.ts` is NOT listed in the parity map. These are undocumented tools — add them.

6. **Tool catalog sync** — when a new Rebecca tool is added, also verify:
   - `artifacts/hospitality-business-portal/src/components/rebecca/ToolCallStepIndicator.tsx` — is the new tool name in the correct Set (`SLIDE_FACTORY_TOOLS`, `IRIS_TOOLS`, `GUSTAVO_TOOLS`, or falls back to `rebecca`)? Is it in `TOOL_FRIENDLY_NAMES` with a human label?
   - If the tool belongs to a new persona category, update the relevant Set.

## Output Format

```
## Parity Audit — [date]

### ✅ Verified (tool exists in rebecca-tools.ts)
- list_properties
- get_property
...

### ⚠️ Documented Gaps (no tool yet)
- [action] — [route] — [status: blocking/pre-existing]

### 🔴 Drift Detected (map says ✅ but tool not found in code)
[list any]

### 📋 Undocumented Tools (in code but not in map)
[list any]

### 🎭 ToolCallStepIndicator sync
[list tools missing from Sets or TOOL_FRIENDLY_NAMES]

### Summary
[N] tools verified, [N] gaps ([N] blocking / [N] pre-existing), [N] drift, [N] undocumented
Verdict: PASS / BLOCKED
```
