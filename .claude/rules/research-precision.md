# Research Precision & Deterministic Tools

## Rule

Research skills must be focused and minimal. Any calculation expressible as a formula MUST use a deterministic tool in `calc/research/` — never LLM arithmetic.

## Four Principles

1. **One skill = one dimension** (ADR, occupancy, costs, etc.) — no boilerplate; asset context is injected by `aiResearch.ts`
2. **Math is deterministic** — LLM calls the tool, gets exact numbers, then interprets. LLM handles market knowledge, not arithmetic.
3. **Helpers prevent duplication** — parsing logic, confidence scoring centralized in `server/aiResearch.ts`
4. **New tools must be registered** — schema in `.claude/tools/research/`, implementation in `calc/research/`, registered in `calc/dispatch.ts`

## Deterministic Tools (10)

`compute_property_metrics`, `compute_depreciation_basis`, `compute_debt_capacity`, `compute_occupancy_ramp`, `compute_adr_projection`, `compute_cap_rate_valuation`, `compute_cost_benchmarks`, `compute_service_fee`, `compute_markup_waterfall`, `compute_make_vs_buy`

Reference: `.claude/skills/research/SKILL.md` for full input/output specs.

## Admin-Configurable Research Behavior

Admins can configure per-event research behavior via Admin → Research tab:
- Enable/disable each research type (property/company/global)
- Inject focus areas, regions, time horizon, custom instructions, custom questions
- Restrict which of the 10 tools are active per event type

Config stored in `global_assumptions.researchConfig` (JSONB). Loaded in `server/routes/research.ts` and threaded into `generateResearchWithToolsStream()`. The `eventConfig` field on `ResearchParams` carries these overrides into `research-prompt-builders.ts`.

## Post-LLM Validation

`validateResearchValues()` in `calc/research/validate-research.ts` runs bounds checks + cross-validation after extraction. Attaches `_validation` summary to content. Warnings don't block storage.

## When Adding Research Skills

- Keep skill under 60 lines; include `confidence` field on every recommended value
- Output schema must match `SynthesisOutputSchema` in `server/ai/synthesis-schema.ts` (retired `extractResearchValues()` in OT-A.4, `7da9f25a`)
- Add unit tests in `tests/calc/`
