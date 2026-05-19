# Open TODOs — CC

<!-- Check off when done · Add when identified · Prune [x] rows at next session start -->
<!-- Discipline: agent-memory-files skill → "TODO Lists" section -->

Full Claude Code TODO list. CLAUDE.md carries a 1-line pointer to this file so the always-loaded context stays bounded; this file is the canonical record.

| | Item | Scope |
|---|---|---|
| [x] | Session 17 (2026-05-18): 11 `DEFAULT_*` constants retired — `MAX_STALENESS_HOURS`, `REINVESTMENT_RATE`, `OCCUPANCY_GROWTH_STEP`, `AR_DAYS`+`AP_DAYS`, `PROPERTY_INFLATION_RATE`+`COMPANY_INFLATION_RATE`, `OFFICE_LEASE_START`+`PROFESSIONAL_SERVICES_START`+`TECH_INFRA_START`+`BUSINESS_INSURANCE_START`. Commits `b981c4e66`, `5f0c73402`, `5d02e7e18`, `ccb3efdcb`, `fe730c7c9`, `b34b8d20a`. | T1-4 Phase 2 |
| [x] | Session 17: Category 5 — Starter-Portfolio Seeds carve-out shipped (CLAUDE.md §2 + checker carve-out + 4 doc files harmonized + conventions doc). Commits `ab1924923` + `fd4636223`. | Rule extension |
| [x] | Session 19 (2026-05-18): 3 more `DEFAULT_*` retired — `ALERT_COOLDOWN_MINUTES`, `MARKETING_RATE`, `MISC_OPS_RATE` (commit `0ad1ae1d1`, parallel with Replit's `6a228a142`). Five others confirmed already gone in prior sessions: `OCCUPANCY_RAMP_MONTHS`, `START_OCCUPANCY`, `MAX_OCCUPANCY`, `START_ADR`, `ROOM_COUNT`. | T1-4 Phase 2 |
| [x] | Session 20 brainstorm: §2 campaign PAUSED. `DEFAULT_ADR_GROWTH_RATE` retirement attempted but reverted (broke typecheck + regressed ratchet; inline 0.03 appeared in engine/calc — wrong surface). Architecture requirements doc at `docs/brainstorms/numeric-architecture-requirements.md`. Full three-pillar model documented; campaign stays paused until Phase 2 (Analyst research → model_defaults wiring) is designed. | Architecture |
| [x] | **COMPLETE — `DEFAULT_ADR_GROWTH_RATE` retirement** (session 22, 2026-05-19): constant removed from both constants files; `SEED_ADR_GROWTH_RATE = 0.03` (Cat 5) added; UI wired in PR #167; schema column `.default(0.03)` + migration `0075_adr_growth_rate_default` added. §14 pre-conditions both satisfied. | T1-4 incremental |
| [x] | **COMPLETE — `DEFAULT_TRAVEL_COST_PER_CLIENT` + `DEFAULT_IT_LICENSE_PER_CLIENT`** (session 23, 2026-05-19): git archaeology confirmed stale values (5000/3600 in constants.ts; correct AHLA/HFTP 2024 values are 12000/3000). Retired both; added `SEED_TRAVEL_PER_CLIENT`/`SEED_IT_LICENSE_PER_CLIENT` (Cat 5) in `lib/shared/src/constants.ts`; schema defaults corrected; migration `0076_travel_it_defaults` added; all consumers updated. Commits `90ab4bfc4` + `131c686b0`. | T1-4 incremental |
| [ ] | §14 enforcement: before ANY retirement PR (constants, integration IDs, UI canonical, future campaigns), the plan unit MUST list both §14 pre-conditions in Verification. Plans missing them are incomplete. | §14 enforcement |
| [x] | **COMPLETE — `DEFAULT_PROPERTY_INCOME_TAX_RATE` + `DEFAULT_LAND_VALUE_PERCENT`** (session 24, 2026-05-19): Commit A (SHA 7f8c6fd) rewired all ~16 consumers; Commit B (SHA 8c133659c) deleted definitions. RESEARCH_TAX_RATE_25_PCT added for research surface; hold-vs-sell land_value_pct tightened to required; PropertyAuditInput tightened; all ?? chains removed. | T1-4 cross-cutting |
