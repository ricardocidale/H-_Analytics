# Session Startup

## On Session Start

Before ANY work — coding, planning, reviewing, auditing — the agent MUST:

1. Read `.claude/claude.md` (loaded automatically)
2. Read `.claude/session-memory.md` — recent session context
3. Scan rule file names (`ls .claude/rules/`) and load rules relevant to the current task
4. Check if the user's question relates to something already discussed in session memory

## Loading Rules Efficiently

Not every task requires every rule. Load rules based on the work being done:

| Task Type | Always Load | Load If Relevant |
|-----------|-------------|-----------------|
| Financial engine work | `financial-engine`, `no-hardcoded-values`, `mandatory-financial-tests` | `recalculate-on-save`, `portfolio-dynamics` |
| UI/frontend work | `design-standards`, `ui-patterns` | `exports` |
| API/backend work | `architecture`, `domain-boundaries` | `database-seeding` |
| Research/AI work | `research-precision`, `deterministic-tools` | `domain-boundaries` |
| Documentation/refactor | `documentation` | — |
| Audit/review | All rules | — |

For audits and reviews, load all rules — they require full context.

## On Architect Calls

Every architect invocation MUST include all `.claude/rules/*.md` files plus `claude.md` in `relevant_files`. Additionally include relevant skill files based on task context (use `.claude/skills/context-loading/` to identify which).

## Why

Chat history resets between sessions. Rules and session memory are the only persistent instructions. Without them the agent forgets decisions, re-proposes rejected solutions, contradicts prior architecture, and wastes tokens.

## Verification

The agent must be able to answer "How many rule files exist and what are they?" at any time.
