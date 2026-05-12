---
title: "§9 protected surface must be NAMED in subagent prompts, not just mentioned"
date: 2026-05-11
category: conventions
module: subagent-dispatch/section-9
problem_type: convention
component: prompt-engineering
severity: medium
symptoms:
  - "Subagent dispatch prompt says 'do not touch lib/shared/src/constants.ts (CLAUDE.md §9)' but subagent edits it anyway"
  - "Magic-numbers gate passes because @shared/constants is the natural home for named constants"
  - "Orchestrator has to add a follow-up commit to relocate constants"
root_cause: prompt_underspecification
resolution_type: convention
tags: [claude-code, subagent, section-9, dispatch, prompt, constants]
---

# §9 protected surface must be NAMED in subagent prompts, not just mentioned

## The pattern

When dispatching a subagent that creates named constants, the prompt MUST tell the subagent **where the constants should live** — not just where they should NOT live. Subagents reading CLAUDE.md §9 will honor the letter of the protection ("don't edit `lib/shared/src/constants.ts`") but will still pick that file as the natural home for new project-wide constants because:

1. The magic-numbers gate (CLAUDE.md §1) accepts `lib/shared/src/constants.ts` as the canonical constants location.
2. Other constants in the file (Costantino, Rebecca, etc.) are operational constants of the same shape.
3. Without an alternative file named, the subagent infers "constants go in `@shared/constants`" from the existing codebase pattern.

The §9 file-scope rule says **only shell CC may edit `lib/shared/src/constants.ts`**. Replit Agent and subagent contributions must not land there.

## Required prompt shape

When the subagent will create new named constants, the dispatch prompt MUST include both:

1. **The protected surface exclusion** (as before):
   > "Do NOT edit `lib/engine/`, `lib/calc/`, `lib/shared/src/constants*.ts`, `lib/db/src/constants*.ts`, `artifacts/api-server/src/finance/`, `artifacts/api-server/src/report/`, etc. per CLAUDE.md §9."

2. **The alternative file the constants should land in** (NEW — without this, the prompt is incomplete):
   > "If you create new named constants, place them in `<feature-area-local-constants-file>.ts` next to the consumer (precedent: `artifacts/api-server/src/slides/factory-v2-constants.ts` from U7). Do not extend `lib/shared/src/constants.ts`."

The U7 subagent dispatch hit this exactly: the prompt named §9 protection but didn't name the alternative file. The subagent added `FACTORY_V2_*` constants to `lib/shared/src/constants.ts` despite the §9 reminder. Orchestrator had to add a follow-up commit (`fad18a98` on PR #121) to relocate them to a new `artifacts/api-server/src/slides/factory-v2-constants.ts` file.

The same pattern recurred on the Replit Agent batch (PR #122): the agent added `MINION_SELF_TEST_*` constants to `lib/shared/src/constants.ts`. Orchestrator follow-up commit (`3cd1c4cc`) relocated them to `artifacts/api-server/src/jobs/minion-self-test-constants.ts`.

## The reasoning

§9 is a file-path rule, not a "constants live here" rule. The financial-engine surface includes the constants file because financial constants live there, not because all constants must. When a domain (slide factory, minion scheduler, etc.) has its own named constants, they belong in a domain-local file. Co-location with consumers also gives better cohesion.

## Suggested precedent files for common domains

| Domain | Constants file precedent |
|---|---|
| Slide factory operational | `artifacts/api-server/src/slides/factory-v2-constants.ts` |
| Minion self-test scheduler | `artifacts/api-server/src/jobs/minion-self-test-constants.ts` |
| Other slide-factory features | Create `slides/<feature>-constants.ts` |
| Other jobs/schedulers | Create `jobs/<scheduler>-constants.ts` |

## Detection at PR review time

When reviewing a subagent or Replit-Agent PR, grep the diff for `lib/shared/src/constants.ts`. Any addition to that file by a non-shell-CC author is a §9 violation that needs a relocation follow-up commit before merge.

## Related

- CLAUDE.md §1 (no magic numbers) — the gate that makes `@shared/constants` feel like the natural home.
- CLAUDE.md §9 (financial engine authoring authority) — the protected surface rule.
- `docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md` U7 + PR #121's `fad18a98` follow-up — the precedent.
- PR #122's `3cd1c4cc` follow-up — second occurrence on the Replit Agent batch.
