---
name: ce-setup
description: "On Replit Agent, the compound-engineering bundle is already vendored — no install step needed. This skill explains the layout and points at the bundle index and tool-mapping doc."
disable-model-invocation: true
---
> **Replit Agent users:** see [`.agents/ce-agents/REPLIT-ADAPTATION.md`](../../ce-agents/REPLIT-ADAPTATION.md) for tool-name and path mappings (AskUserQuestion → user_query, Task → delegation skill, etc.).

# Compound Engineering Setup (Replit Agent)

## You are already set up.

On Replit Agent, the Compound Engineering plugin is **vendored into this repo** — there is nothing to install, no `bun install`, no `codex plugin install`, no `/plugin install`, and no per-host config dir to populate.

Concretely:

- All CE skills live at `.agents/skills/ce-*/SKILL.md` and are auto-discovered by the agent's skill index alongside the project's existing skills.
- All CE sub-agent personas live at `.agents/ce-agents/<name>.agent.md`.
- The bundle index, upstream version, and pinned commit are recorded in `.agents/skills/COMPOUND-ENGINEERING.md`.
- The mapping from upstream tool names (`AskUserQuestion`, `Task`, `Bash`, `Read`, `Grep`, `Glob`, `Write`, `Edit`, etc.) to Replit Agent tools (`user_query`, the `delegation` skill, `bash`, `read`, `rg` via `bash`, `glob`, `write`, `edit`) is in `.agents/ce-agents/REPLIT-ADAPTATION.md`.

## What to do instead of "setup"

If you want to use a CE skill, just invoke it. For example:
- "let's brainstorm a feature" → triggers `ce-brainstorm`
- "plan this work" → triggers `ce-plan`
- "review my code" → triggers `ce-code-review`
- "/ce-debug" or "debug this" → triggers `ce-debug`

When a CE skill tells you to "use the Task tool" or "spawn the X reviewer agent", follow the mapping in `.agents/ce-agents/REPLIT-ADAPTATION.md` — concretely, read the persona file at `.agents/ce-agents/<name>.agent.md` and hand it off via the `delegation` skill.

## Refreshing the bundle

To update to a newer upstream release:

1. Re-download the upstream tarball from `https://github.com/EveryInc/compound-engineering-plugin` (replace the SHA in `vendor/compound-engineering-plugin/.PINNED_SHA`).
2. Re-copy each `plugins/compound-engineering/skills/*` directory into `.agents/skills/` (keeping the `ce-` prefix; rename `lfg` → `ce-lfg` and patch its frontmatter `name:`).
3. Re-copy each `plugins/compound-engineering/agents/*.agent.md` into `.agents/ce-agents/`.
4. Re-prepend the Replit-Agent compatibility note (one-line link to `REPLIT-ADAPTATION.md`) directly under the YAML frontmatter of every adapted `SKILL.md`.
5. Re-overwrite this file (`ce-setup`) with the Replit-aware stub.
6. Update the version, pinned SHA, and skill/agent inventory in `.agents/skills/COMPOUND-ENGINEERING.md`.

## What this skill does NOT do on Replit

The original `ce-setup` (preserved at `vendor/compound-engineering-plugin/plugins/compound-engineering/skills/ce-setup/SKILL.md`) ran a multi-phase interactive diagnose-and-install flow that asked the user about Bun, the upstream `compound-plugin` CLI, Codex / Cursor / Gemini / Pi configurations, and review-agent selection. None of that applies on Replit:

- No CLI to install — the skills are markdown files already in the repo.
- No host-specific config — there is no `.claude/`, `.codex/`, or `~/.codex/` directory to populate.
- Review-agent selection is handled inline by `ce-code-review`.
- Project-specific review guidance lives in `replit.md` (or whatever the project uses as its agent-memory file).
