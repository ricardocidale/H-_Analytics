# Compound Engineering on Replit Agent — Tool & Path Mapping

The CE skills and agent personas under `.agents/skills/ce-*` and `.agents/ce-agents/` were vendored verbatim from the upstream [`EveryInc/compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin) (v3.2.0, MIT). They were authored against Claude Code, Codex, and Cursor. This document maps the tool names and paths they reference to their Replit Agent equivalents.

When following any CE skill on Replit Agent, mentally substitute the right column for the left.

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
