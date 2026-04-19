# Analyst Verdict Contract — Placeholder (Phase 3)

This rule is a placeholder. The real contract — `AnalystVerdict` — lands in Phase 3 at `engine/analyst/contracts/verdict.ts`. Until then, this rule documents the transition policy so nothing drifts in the interim.

---

## What the contract will be (Phase 3)

**Location:** `engine/analyst/contracts/verdict.ts` (TypeScript type).
**Architecture spec:** `docs/architecture/analyst/verdict-contract.md` (reference implementation of the shape; read it before editing any Specialist).
**Governance:** a `tests/proof/analyst-verdict-shape.test.ts` (Phase 3) will assert the invariants for every Specialist's golden test output.
**Decision record:** ADR-002 (Phase 2) will lock the verdict shape.

Every Surface Specialist will return `AnalystVerdict`. The Surface Router will consume it. The Voice Renderer will populate its `voice.*` fields. The Quality Scorer will compute its `qualityScore`.

---

## Transition policy — what's tolerated until Phase 3 lands

Today, four "watchdog-shaped" surfaces return divergent shapes:

| File | Today's return shape |
|---|---|
| `engine/watchdog/capitalRaiseEvaluator.ts` | `{ status, alerts: Alert[] }` |
| `engine/watchdog/revenueEvaluator.ts` | `{ status, alerts: Alert[], info }` |
| `server/ai/analyst-watchdog.ts:computeFieldAlerts` | `FieldAlert[]` |
| `server/ai/analyst-table-refresh.ts` | `AnalystRefreshResult` |

These divergent shapes are tolerated until Phase 3. Editing any of them to match a hypothetical `AnalystVerdict` shape now is **forbidden** — the real contract does not exist yet and any guess will drift.

---

## What you MAY do before Phase 3

- Fix bugs in the existing evaluators returning their current shapes.
- Add evidence, severity refinements, or validation rules, as long as the shape stays compatible with `{ status, alerts }` / `FieldAlert[]` / `AnalystRefreshResult`.
- Refer to `AnalystVerdict` in design docs, comments, and handoffs as "the shape Phase 3 will introduce."

## What you MUST NOT do before Phase 3

- Introduce a new Specialist that returns a different shape than one of the existing four. If you must build a new evaluator, match the closest existing shape (typically `{ status, alerts }` for tab Specialists).
- Import or reference a type called `AnalystVerdict` in code. The type does not exist yet; any stub will conflict with the real contract when it lands.
- Lock in a verdict shape via proof test before ADR-002 is accepted.

---

## After Phase 3 lands

Once `engine/analyst/contracts/verdict.ts` and ADR-002 are merged, every Specialist migrates:

1. A new file under `engine/analyst/surface/<surface>/<name>-specialist.ts` returns `AnalystVerdict`.
2. The old path (e.g., `engine/watchdog/capitalRaiseEvaluator.ts`) becomes a re-export shim with `@deprecated` JSDoc pointing to the new file.
3. Route handlers move through the Surface Router; verdict shape conversion happens in the Router + Voice Renderer.
4. The L+B persona-keyed golden test at `tests/analyst/personas/lb.test.ts` asserts the verdict shape per Specialist.
5. After one release cycle, the shim is deleted.

**Adding a Specialist with a different shape after Phase 3 is a violation.** The `tests/proof/analyst-verdict-shape.test.ts` gate will catch it.

---

## Why this rule is a placeholder today

The contract shape matters. Getting it wrong locks in years of drift; getting it right requires real implementation pressure from the first two backfills (Funding + Revenue). Phase 3 does both backfills in the same PR as contract definition, which forces the contract to meet real needs.

Until then, this file exists to say: **do not guess the shape; do not change evaluator shapes; wait for Phase 3**.

---

## References

- `docs/architecture/analyst/verdict-contract.md` — the proposed shape (spec only, not yet a type)
- `docs/architecture/ANALYST.md` — architecture spine
- `.claude/rules/analyst-team.md` — internal vocabulary
- `.claude/skills/analyst/_index.md` — skill entry point
- ADR-001 — why the two-tier split exists
- ADR-002 (planned Phase 2) — unified verdict shape
