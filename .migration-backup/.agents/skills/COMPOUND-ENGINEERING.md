# Compound Engineering — vendored bundle inventory

This repo vendors the [Compound Engineering plugin](https://github.com/EveryInc/compound-engineering-plugin) by Every Inc. (MIT-licensed) so the full CE workflow — `ce-brainstorm`, `ce-plan`, `ce-work`, `ce-code-review`, `ce-debug`, `ce-compound`, and friends — is available to Replit Agent the same way it is to Claude Code, Codex, and Cursor users. The upstream plugin only natively installs into other AI coding tools (no `/plugin install` for Replit Agent), so the skills and agent personas are vendored in directly and discovered by the agent skill index.

| Field | Value |
|---|---|
| Upstream repo | https://github.com/EveryInc/compound-engineering-plugin |
| Upstream version | 3.2.0 |
| Pinned commit SHA | `265cb4280f22bbd2fd5cc45e338371442b6c1692` |
| License | MIT (see `vendor/compound-engineering-plugin/LICENSE`) |
| Skills vendored | 37 (under `.agents/skills/ce-*/`) |
| Agent personas vendored | 51 (under `.agents/ce-agents/`) |
| Replit-Agent tool mapping | [`.agents/ce-agents/REPLIT-ADAPTATION.md`](../ce-agents/REPLIT-ADAPTATION.md) |

## How to use

All CE skills live under `.agents/skills/ce-*/` and surface in the same skill index as the project's existing skills. Just describe the work in natural language and the matching CE skill will be picked up — for example:

- "let's brainstorm a feature" → `ce-brainstorm`
- "plan this work" → `ce-plan`
- "go build it" → `ce-work`
- "review my code before I open the PR" → `ce-code-review`
- "debug this failure" → `ce-debug`
- "capture what we just learned" → `ce-compound`

When a CE skill instructs you to invoke a sub-agent ("spawn the X reviewer", "use the Task tool with the Y persona"), open the persona file at `.agents/ce-agents/<persona-name>.agent.md` and hand it off via the project's `delegation` skill. Tool-name substitutions (AskUserQuestion → `user_query`, Bash → `bash`, Grep → `rg` via `bash`, etc.) are documented in [`REPLIT-ADAPTATION.md`](../ce-agents/REPLIT-ADAPTATION.md).

The CE bundle and the project's existing skills (`brainstorming`, `frontend-design`, `code_review`, `debug`, etc.) live side by side. The `ce-` prefix prevents collisions; users and the agent can choose which to invoke per task.

## Vendored skills (37)

- **`ce-agent-native-architecture`** — Build applications where agents are first-class citizens.
- **`ce-agent-native-audit`** — Run comprehensive agent-native architecture review with scored principles
- **`ce-brainstorm`** — Explore requirements and approaches through collaborative dialogue before writing a right-sized requirements document and planning implementation.
- **`ce-clean-gone-branches`** — Clean up local branches whose remote tracking branch is gone.
- **`ce-code-review`** — Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline.
- **`ce-commit`** — Create a git commit with a clear, value-communicating message.
- **`ce-commit-push-pr`** — Commit, push, and open a PR with an adaptive, value-first description.
- **`ce-compound`** — Document a recently solved problem to compound your team's knowledge
- **`ce-compound-refresh`** — Refresh stale learning docs and pattern docs under docs/solutions/ by reviewing them against the current codebase, then updating, consolidating, replacing, or deleting the drifted ones.
- **`ce-debug`** — Systematically find root causes and fix bugs.
- **`ce-demo-reel`** — Capture a visual demo reel (GIF, terminal recording, screenshots) for PR descriptions.
- **`ce-dhh-rails-style`** — This skill should be used when writing Ruby and Rails code in DHH's distinctive 37signals style.
- **`ce-doc-review`** — Review requirements or plan documents using parallel persona agents that surface role-specific issues.
- **`ce-frontend-design`** — Build web interfaces with genuine design quality, not AI slop.
- **`ce-gemini-imagegen`** — This skill should be used when generating and editing images using the Gemini API (Nano Banana Pro).
- **`ce-ideate`** — Generate and critically evaluate grounded ideas about a topic.
- **`ce-lfg`** — Full autonomous engineering workflow
- **`ce-optimize`** — Run metric-driven iterative optimization loops.
- **`ce-plan`** — Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown.
- **`ce-polish-beta`** — [BETA] Start the dev server, open the feature in a browser, and iterate on improvements together.
- **`ce-product-pulse`** — Generate a time-windowed pulse report on what users experienced and how the product performed - usage, quality, errors, signals worth investigating.
- **`ce-proof`** — Create, share, view, comment on, edit, and run human-in-the-loop review loops over markdown documents via Proof, the collaborative markdown editor at proofeditor.ai ("Proof editor").
- **`ce-release-notes`** — Summarize recent compound-engineering plugin releases, or answer a specific question about a past release with a version citation.
- **`ce-report-bug`** — Report a bug in the compound-engineering plugin
- **`ce-resolve-pr-feedback`** — Resolve PR review feedback by evaluating validity and fixing issues in parallel.
- **`ce-session-extract`** — Extract conversation skeleton or error signals from a single session file at a given path.
- **`ce-session-inventory`** — Discover session files for a repo across Claude Code, Codex, and Cursor, and extract session metadata (timestamps, branch, cwd, size, platform).
- **`ce-sessions`** — Search and ask questions about your coding agent session history.
- **`ce-setup`** — On Replit Agent, the compound-engineering bundle is already vendored — no install step needed.
- **`ce-slack-research`** — Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs that shape the current task.
- **`ce-strategy`** — Create or maintain STRATEGY.md - the product's target problem, approach, users, key metrics, and tracks of work.
- **`ce-test-browser`** — Run browser tests on pages affected by current PR or branch
- **`ce-test-xcode`** — Build and test iOS apps on simulator using XcodeBuildMCP.
- **`ce-update`** — Check if the compound-engineering plugin is up to date and recommend the update command if not.
- **`ce-work`** — Execute work efficiently while maintaining quality and finishing features
- **`ce-work-beta`** — [BETA] Execute work with external delegate support.
- **`ce-worktree`** — Create an isolated git worktree for parallel feature work or PR review.

## Vendored agent personas (51)

Sub-agent system prompts. Open with `read` and hand off via the `delegation` skill when a CE skill instructs you to invoke one.

- `ce-adversarial-document-reviewer.agent.md`
- `ce-adversarial-reviewer.agent.md`
- `ce-agent-native-reviewer.agent.md`
- `ce-ankane-readme-writer.agent.md`
- `ce-api-contract-reviewer.agent.md`
- `ce-architecture-strategist.agent.md`
- `ce-best-practices-researcher.agent.md`
- `ce-cli-agent-readiness-reviewer.agent.md`
- `ce-cli-readiness-reviewer.agent.md`
- `ce-code-simplicity-reviewer.agent.md`
- `ce-coherence-reviewer.agent.md`
- `ce-correctness-reviewer.agent.md`
- `ce-data-integrity-guardian.agent.md`
- `ce-data-migration-expert.agent.md`
- `ce-data-migrations-reviewer.agent.md`
- `ce-deployment-verification-agent.agent.md`
- `ce-design-implementation-reviewer.agent.md`
- `ce-design-iterator.agent.md`
- `ce-design-lens-reviewer.agent.md`
- `ce-dhh-rails-reviewer.agent.md`
- `ce-feasibility-reviewer.agent.md`
- `ce-figma-design-sync.agent.md`
- `ce-framework-docs-researcher.agent.md`
- `ce-git-history-analyzer.agent.md`
- `ce-issue-intelligence-analyst.agent.md`
- `ce-julik-frontend-races-reviewer.agent.md`
- `ce-kieran-python-reviewer.agent.md`
- `ce-kieran-rails-reviewer.agent.md`
- `ce-kieran-typescript-reviewer.agent.md`
- `ce-learnings-researcher.agent.md`
- `ce-maintainability-reviewer.agent.md`
- `ce-pattern-recognition-specialist.agent.md`
- `ce-performance-oracle.agent.md`
- `ce-performance-reviewer.agent.md`
- `ce-pr-comment-resolver.agent.md`
- `ce-previous-comments-reviewer.agent.md`
- `ce-product-lens-reviewer.agent.md`
- `ce-project-standards-reviewer.agent.md`
- `ce-reliability-reviewer.agent.md`
- `ce-repo-research-analyst.agent.md`
- `ce-schema-drift-detector.agent.md`
- `ce-scope-guardian-reviewer.agent.md`
- `ce-security-lens-reviewer.agent.md`
- `ce-security-reviewer.agent.md`
- `ce-security-sentinel.agent.md`
- `ce-session-historian.agent.md`
- `ce-slack-researcher.agent.md`
- `ce-spec-flow-analyzer.agent.md`
- `ce-swift-ios-reviewer.agent.md`
- `ce-testing-reviewer.agent.md`
- `ce-web-researcher.agent.md`

## Refreshing the bundle

To update to a newer upstream release:

```bash
# 1. Pin the new SHA
NEW_SHA=$(curl -sS -H "Authorization: token $GITHUB_PAT" \
  https://api.github.com/repos/EveryInc/compound-engineering-plugin/branches/main \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).commit.sha))")

# 2. Re-download the tarball into vendor/
rm -rf vendor/compound-engineering-plugin vendor/_ce_tmp
mkdir -p vendor/_ce_tmp
curl -sSL -H "Authorization: token $GITHUB_PAT" \
  "https://api.github.com/repos/EveryInc/compound-engineering-plugin/tarball/$NEW_SHA" \
  | tar -xz -C vendor/_ce_tmp
mv vendor/_ce_tmp/EveryInc-* vendor/compound-engineering-plugin
echo "$NEW_SHA" > vendor/compound-engineering-plugin/.PINNED_SHA
rm -rf vendor/_ce_tmp

# 3. Re-vendor skills and agents (re-run the install task in .local/tasks/install-compound-engineering-skills.md)
# 4. Re-prepend the REPLIT-ADAPTATION note under each frontmatter
# 5. Update version + SHA + inventory in this file
```

## See also

- [`REPLIT-ADAPTATION.md`](../ce-agents/REPLIT-ADAPTATION.md) — tool and path mapping
- [`vendor/compound-engineering-plugin/README.md`](../../vendor/compound-engineering-plugin/README.md) — original upstream README
- [`vendor/compound-engineering-plugin/LICENSE`](../../vendor/compound-engineering-plugin/LICENSE) — upstream MIT license

## Install verification (recorded at vendor time)

| Check | Result |
|---|---|
| Skills vendored | 37 |
| Agent personas vendored | 51 |
| Skill files total (incl. `references/` sub-trees) | 165 |
| Frontmatter parses on all `ce-*/SKILL.md` | yes (37/37) |
| `name:` matches directory name | yes (37/37) |
| Replit-Agent compatibility note prepended | yes (37/37) |
| Skill-name collisions with `.agents/skills/` or `.local/skills/` | none |
| Renames | `lfg` → `ce-lfg` (frontmatter `name:` patched to match) |
| Skills with `references/` sub-tree | 21 of 37 (the upstream 16 without it ship without one — `ce-agent-native-audit`, `ce-clean-gone-branches`, `ce-commit`, `ce-frontend-design`, `ce-gemini-imagegen`, `ce-release-notes`, `ce-report-bug`, `ce-resolve-pr-feedback`, `ce-session-extract`, `ce-session-inventory`, `ce-sessions`, `ce-slack-research`, `ce-test-browser`, `ce-test-xcode`, `ce-update`, `ce-worktree` — and we mirror upstream exactly rather than fabricate empty directories) |
| Pinned commit SHA recorded | `vendor/compound-engineering-plugin/.PINNED_SHA` |
