---
description: Norfolk starter repo rules for Claude Code and similar agents
alwaysApply: true
---

# Norfolk Starter

Read this before making changes.

## What this repo is

This repo is the main Norfolk starter repo.

It is meant to be:

- a clean application starter
- a Norfolk AI operating layer
- a base for Claude Code and other AI-assisted workflows

## Main rule

Optimize for:

- clarity
- practicality
- reproducibility
- small scoped changes
- long-term maintainability

## Norfolk AI working model

The preferred Norfolk pattern is:

- structured execution by default
- broader orchestration only when the task is ambiguous
- cost-aware behavior by default

In plain English:

- use stronger reasoning for planning and architecture
- use cheaper execution for routine coding
- avoid reprocessing the whole repo every turn

## Norfolk wrapper commands

The Norfolk Claude commands use the `nai-` prefix.

These are wrappers, not raw low-level skills.

They should make decisions easier for the user.

Main commands:

- `nai-help`
- `nai-update`
- `nai-plan`
- `nai-feature`
- `nai-frontend`
- `nai-review`
- `nai-architecture`
- `nai-agent-native-audit`

## Expected wrapper behavior

Each Norfolk wrapper should:

1. classify the task as small, normal, or hard
2. keep the scope tight
3. avoid unnecessary whole-repo analysis
4. use structured execution for clear work
5. use broader orchestration only when ambiguity is high
6. favor planning once, then execution in slices
7. keep review late instead of constant

## Repo structure goals

This repo should contain:

- app starter code
- Norfolk documentation
- Claude Code setup files
- Norfolk wrapper skills
- simple setup instructions for Windows, Mac, and Replit
- simple check and repair guidance

## AI editing rules

1. Do not make the repo more complicated than necessary.
2. Prefer simple names over clever names.
3. Keep setup docs plain enough for a non-technical operator.
4. Prefer one-command workflows over multi-step memory-heavy workflows.
5. Do not require the user to remember when to use every plugin manually.
6. Explain things in plain English.
7. Keep Norfolk files organized and discoverable.
8. Avoid scattering setup logic across too many places.

## Codebase rules

1. Do not change auth, database, or deployment behavior casually.
2. Ask before changing core production assumptions.
3. Keep files reasonably small and split by concern when they grow.
4. Prefer incremental structural improvement over dramatic rewrites.
5. Keep starter templates generic enough to reuse.

## Skill location rules

Claude Code starter skills should live in:

- `claude-code/skills/<skill-name>/SKILL.md`

If Cursor-specific parallels are added later, keep them aligned in purpose.

## Documentation rules

The README must explain:

- what this repo is
- what to do first
- how to set up Claude Code
- what the `nai-` commands do
- where to look when something is broken

## Practical default

If unsure, optimize for the operator:

- fewer commands to remember
- fewer moving parts
- stronger defaults
- clearer docs
