# engine/analyst

The Analyst's internal team. Singular user-facing voice, team-of-specialists internally.

## Layout

```
engine/analyst/
├── contracts/             AnalystVerdict + supporting types          (Phase 3)
├── router/                Surface Router — pure dispatch, no LLM     (Phase 3)
├── voice/                 Voice Renderer — sole producer of UI text  (Phase 3)
├── quality/               Quality Scorer — evidence → conviction     (Phase 3)
└── surface/
    ├── mgmt-co/           Management-Company tab Specialists         (Phase 2 re-exports + Phase 4 incremental)
    ├── property/          Per-property tab Specialists               (Phase 4)
    ├── admin-defaults/    Admin → Model Defaults Specialist          (Phase 4)
    ├── icp/               ICP Specialist                             (Phase 4)
    ├── cross-portfolio/   Portfolio-wide Specialist                  (Phase 4)
    └── staleness/         Staleness lifecycle Specialist             (Phase 4)
```

## What's here today (Phase 2)

Skeleton only. Each `index.ts` is either:
- An empty `export {};` placeholder, or
- A re-export shim pointing at the existing implementation that will be re-homed.

Active re-exports:
- `surface/mgmt-co/` re-exports `evaluateCapitalRaise` and `evaluateRevenue` from `engine/watchdog/`. Callers that want the new path can switch incrementally; the legacy path stays valid until Phase 3 backfill.

## Authoritative references

- Architecture spine: `docs/architecture/ANALYST.md`
- Per-component specs: `docs/architecture/analyst/*.md`
- Decision records: `docs/architecture/decisions/ADR-001-analyst-two-tier.md`, `ADR-002-engine-analyst-skeleton.md`
- Persona contract (user-facing voice): `.claude/rules/the-analyst-persona.md`
- Internal-vocabulary rule: `.claude/rules/analyst-team.md`
- Cognitive Engine deep-dive: `.claude/notes/analyst-architecture.md`
- Skill directory: `.claude/skills/analyst/`

## Conventions

- **No `any`** in `engine/**` — strict types only.
- **No user-facing strings here.** Internal team vocabulary (Surface Specialist, Cognitive Engine, Surface Router, Voice Renderer, Quality Scorer) lives in code, docs, and skills only — never reaches the UI. Voice Renderer (Phase 3) is the sole producer of strings the user sees.
- **One Specialist per file.** Filename matches `<surface>-specialist.ts` (e.g. `compensation-specialist.ts`, `revenue-specialist.ts`) once Phase 3 backfill lands. Phase 2 re-exports use the existing `Evaluator` names until backfill renames them.
- **Specialists never call other Specialists.** Cross-surface data is requested from the Cognitive Engine via scope flags; no peer-to-peer calls.
