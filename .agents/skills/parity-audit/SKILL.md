---
name: parity-audit
description: "Audit Rebecca's function-calling tools against the UI action parity map. Use when adding new UI features or checking for tool gaps."
---

# Parity Audit Skill

Check whether every UI action in H+ Analytics has a corresponding Rebecca tool.

## Steps

1. Read `docs/discipline/agent-native-parity-map.md` — the canonical parity map.

2. Read `artifacts/api-server/src/chat/rebecca-tools.ts` — the tool implementations.

3. For each ✅ row in the parity map, verify the tool name appears in `rebecca-tools.ts`.
   Flag any ✅ row where the tool name is NOT found (implementation drift).

4. List all ⚠️ rows — these are documented gaps. Report how many exist and what they cover.

5. Check whether any tool in `rebecca-tools.ts` is NOT listed in the parity map.
   These are undocumented tools — add them to the map.

## Output Format

```
## Parity Audit — [date]

### ✅ Verified (tool exists in rebecca-tools.ts)
- list_properties
- get_property
...

### ⚠️ Documented Gaps (no tool yet)
- Edit global assumptions (Admin → Defaults)

### 🔴 Drift Detected (map says ✅ but tool not found in code)
[list any]

### 📋 Undocumented Tools (in code but not in map)
[list any]

### Summary
[N] tools verified, [N] gaps, [N] drift, [N] undocumented
```
