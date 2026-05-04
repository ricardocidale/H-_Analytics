# Compound Engineering on Replit Agent — Tool & Path Mapping

> **⚠️ THIS IS REPLIT AGENT — NOT Claude Code, Cursor, Codex, or any local IDE agent.**
>
> The CE skills were vendored from upstream and were authored against Claude Code, Codex, and Cursor. Many of their instructions reference tools, workflows, git patterns, and directory structures that **do not exist** on Replit Agent. When a CE skill tells you to do something that conflicts with this document, **this document wins**. Always.

The CE skills and agent personas under `.agents/skills/ce-*` and `.agents/ce-agents/` were vendored verbatim from the upstream [`EveryInc/compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin) (v3.2.0, MIT). They were authored against Claude Code, Codex, and Cursor. This document maps the tool names and paths they reference to their Replit Agent equivalents.

When following any CE skill on Replit Agent, mentally substitute the right column for the left.

## Critical environment differences (READ FIRST)

These are the things that will break you if you follow CE skills literally:

1. **No git worktrees.** `ce-worktree` does not work. Replit Agent works on a single `main` branch. Do not run `git worktree add`, `git checkout -b`, or `git branch -m`. The platform manages version control via checkpoints and auto-commits.

2. **No destructive git commands.** `git commit`, `git push`, `git reset`, `git rebase`, `git checkout`, `git clean`, `git init`, `git rm` are all **blocked** by the sandbox. The platform handles commits automatically when tasks complete. If a CE skill tells you to commit, stage, or push — skip that step.

3. **No pre-commit hooks.** The `pre-commit-gates` skill's hook-installation steps do not apply. Instead, run verification commands (typecheck, lint, tests) manually via `bash` before completing work. The platform runs configured validation commands at task completion.

4. **No `.claude/`, `.codex/`, `.cursor/` directories.** Session memory lives in `replit.md` (always loaded into context). There is no `.claude/session-memory.md` or equivalent. When a skill says "write to session memory", update `.local/session_plan.md` for task-scoped notes or `replit.md` for persistent project memory.

5. **Dev servers are managed workflows, not manual processes.** Never run `npm run dev`, `pnpm dev`, or start servers from the shell. Use `restart_workflow` to start/restart services. Use `refresh_all_logs` to read their output. Dev servers bind to the `PORT` environment variable set by the workflow system.

6. **No GitHub CLI (`gh`).** PR creation via `gh pr create` does not work. If a CE skill asks you to create a PR, inform the user and suggest they do it manually or propose a project task.

7. **No `bun`.** This project uses `pnpm` workspaces. Replace any `bun install`, `bun run`, `bun test` with the pnpm equivalent.

8. **No `Task` / `Agent` tool for isolated parallel environments.** CE skills reference spawning sub-agents via a "Task" tool with `isolation: "worktree"`. On Replit, use the `delegation` skill for local sub-agents (they share your working directory) or the `project_tasks` skill for background tasks that run in isolated environments (but only the user or planner controls those — not you as build-mode agent).

9. **No `TodoWrite` / `TaskCreate` / `TaskUpdate` task tracker.** Use `.local/session_plan.md` for your own work decomposition. Do not attempt to call `TodoWrite` or similar — it does not exist.

10. **Screenshots and previews use Replit tools.** Use `screenshot` with `type='app_preview'` to see the running app. Do not attempt to open a browser via bash or use Playwright for visual verification of the app preview.

## Tool name mapping

| Upstream tool name (Claude Code / Codex / Cursor)              | Replit Agent equivalent                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `AskUserQuestion`, `request_user_input`, `ask_user`, `ask`     | `user_query` (see top-level system prompt)                                  |
| Spawning a sub-agent via the **Task** tool                     | `delegation` skill (see `.local/skills/delegation/SKILL.md`)                 |
| `Bash` / `bash`                                                | `bash`                                                                      |
| `Read` / `read_file`                                           | `read`                                                                      |
| `Grep` / `grep`                                                | `bash` invoking `rg` (ripgrep is preinstalled and preferred)                |
| `Glob`                                                         | `glob`                                                                      |
| `Write` / `create_file`                                        | `write`                                                                     |
| `Edit` / `apply_patch`                                         | `edit`                                                                      |
| `WebFetch`                                                     | `bash` with `curl`, or the `web-search` skill in `.local/skills/`           |
| `WebSearch`                                                    | `web-search` skill in `.local/skills/`                                      |
| `TodoWrite`                                                    | The session-plan workflow (`.local/session_plan.md`) — see system prompt    |
| `BashOutput` / streaming bash                                  | Workflow logs via `refresh_all_logs` (workflows are managed, not ad-hoc)    |

## Path mapping

| Upstream path                                                    | Replit Agent equivalent                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `.claude/`, `.codex/`, `.cursor/`, `~/.codex/skills/`            | N/A — Replit Agent has no per-host config dir                        |
| `~/.claude/agents/` or upstream `agents/<name>.agent.md`         | `.agents/ce-agents/<name>.agent.md` (this folder)                    |
| Upstream `skills/<name>/SKILL.md`                                | `.agents/skills/<name>/SKILL.md`                                     |
| `bun install`, `codex plugin install`, `/plugin install`         | N/A — the plugin is already vendored, see `ce-setup` skill           |
| Plan files in `docs/plans/`                                      | Same — repo-relative `docs/plans/` (created on demand)               |
| Solution / learning docs in `docs/solutions/`                    | Same — repo-relative `docs/solutions/`                               |

## Sub-agent delegation

Whenever a CE skill asks you to "spawn the X reviewer agent" or "invoke the Task tool with the Y persona":
1. Open the persona file at `.agents/ce-agents/<persona-name>.agent.md`.
2. Read its system prompt and instructions.
3. Use the `delegation` skill (`.local/skills/delegation/SKILL.md`) to start a sub-agent with that persona's instructions as the initial system prompt / message.

The CE personas under `.agents/ce-agents/` are plain markdown — they are not auto-discovered as Replit Agent sub-agents, so you must hand them off via the `delegation` skill explicitly.

## Skill discovery

CE skills live under `.agents/skills/ce-*/` and are picked up by the same skill index that surfaces other project skills. The `ce-` prefix prevents collisions with existing project skills like `brainstorming`, `frontend-design`, and `code_review`.

## Refreshing this bundle

See `.agents/skills/COMPOUND-ENGINEERING.md` for the upstream version, pinned commit, and refresh procedure.
