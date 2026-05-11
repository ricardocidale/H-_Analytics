# CodeRabbit + Compound shell workflow — runbook

Operator runbook for the **Large-repo Shell + CodeRabbit + Compound** operating mode (Task #1385 / #1386). Pair with `.agents/operating-modes/large-repo-shell-coderabbit-compound.md`.

---

## Toggle: ON / OFF / current state

The mode is **OFF by default**. A single switch governs everything wired up by Task #1386.

```bash
# Turn ON (marker file — preferred; survives reboots)
mkdir -p .local/opmode && touch .local/opmode/active

# Turn ON (env var — single shell session only)
export OPMODE_LARGE_REPO_SHELL=1

# Check current state
bash scripts/opmode-active.sh && echo ON || echo OFF

# Turn OFF
rm -f .local/opmode/active
unset OPMODE_LARGE_REPO_SHELL
```

The marker file lives under `.local/opmode/`, which is gitignored.

### Reverting to today's behavior

Turning the toggle OFF is sufficient. No code revert needed. With the toggle OFF:

- The three artifact dev workflows (`api-server`, `hospitality-business-portal`, `mockup-sandbox`) print **no banner** at startup — output is identical to pre-task behavior.
- The four `pnpm` scripts (`review:uncommitted`, `review:branch`, `review:scoped`, `validate:scoped`) print a one-line `operating mode is OFF — run \`touch .local/opmode/active\` to enable …` message and exit 0 — no CodeRabbit invocation, no lint, no typecheck.
- No agent gets new bindings.

Restart any of the three artifact workflows after toggling to re-render the banner state in the log pane.

---

## One-time install

The CodeRabbit CLI is **not** installed by default in this container. Install once per fresh container:

```bash
bash scripts/install-coderabbit-cli.sh
```

This pulls the vendor binary from `cli.coderabbit.ai/install.sh`. The installer is idempotent — safe to re-run.

### Authenticate (interactive, USER ACTION)

```bash
coderabbit auth login     # opens a browser, completes OAuth
coderabbit auth status    # verify
```

Auth is interactive on purpose — no `CODERABBIT_API_KEY` secret is required for shell use, and none is provisioned.

---

## The four `pnpm` scripts

All four are toggle-aware. With the toggle OFF they no-op with a one-line message; with the toggle ON they invoke the CLI (or `pnpm --filter`).

| Script | Wraps | When to use |
|---|---|---|
| `pnpm review:uncommitted` | `coderabbit review --type uncommitted` | Before staging a commit. Reviews only the dirty working tree. |
| `pnpm review:branch` | `coderabbit review --base origin/<default>` | Before opening a PR. Reviews the full branch diff vs the auto-detected default branch. |
| `pnpm review:scoped <dir>` | `coderabbit review --type uncommitted` (chdir into `<dir>`) | When a broad review payload is too large — narrow to one directory and re-run. |
| `pnpm validate:scoped <pkg>` | `pnpm --filter <pkg> run typecheck && pnpm --filter <pkg> run lint` | Faster than the full `pnpm run typecheck` when only one workspace package was touched. |

`review:branch` auto-detects the default branch via `git symbolic-ref refs/remotes/origin/HEAD`, falling back to `main` then `master`.

### Decision flow

1. Working on a change → `pnpm review:uncommitted`.
2. Findings list manageable? Resolve via `ce-resolve-pr-feedback`. Otherwise: `pnpm review:scoped <dir>` to narrow.
3. Touched only one workspace package? `pnpm validate:scoped @workspace/<pkg>` instead of `pnpm run typecheck`.
4. About to push / open PR? `pnpm review:branch` for the full branch view.

### Payload-too-large

If `review:uncommitted` returns "payload too large" or comparable, **do not** rerun the broad command. Instead:

```bash
pnpm review:scoped artifacts/api-server/src/routes
```

Narrow until the response succeeds, then iterate per directory.

---

## Expected workflow banner log lines (toggle ON)

Each of the three wrapped artifact workflows starts its dev command with `bash ../../scripts/print-opmode-banner.sh; <existing dev command>`. With the toggle ON, the banner produces these lines at startup (once per restart):

```
------------------------------------------------------------------------
  OPMODE: Large-repo Shell + CodeRabbit + Compound  (toggle ON)
------------------------------------------------------------------------
  Inner-loop commands:
    pnpm review:uncommitted           # CodeRabbit on the working tree
    pnpm review:branch                # CodeRabbit on branch vs default
    pnpm review:scoped <dir>          # CodeRabbit on one directory
    pnpm validate:scoped <pkg>        # typecheck + lint, one workspace pkg

  Runbook:   docs/runbooks/coderabbit-shell-workflow.md
  Mode doc:  .agents/operating-modes/large-repo-shell-coderabbit-compound.md

  Turn it off:  rm -f .local/opmode/active
------------------------------------------------------------------------
```

With the toggle OFF, the banner script exits 0 silently — none of these lines appear. If the banner script is missing entirely (e.g., during a partial revert), the wrapper still exits 0 and the dev command runs.

The 13 `check:*` workflows are intentionally **not** wrapped — they run too often and would spam the log pane.

---

## Worked example: feed findings into `ce-resolve-pr-feedback`

1. `pnpm review:uncommitted` — capture the JSON-ish findings list the CLI prints.
2. Save the findings to a scratch file (e.g., `.local/coderabbit-findings.txt`).
3. Trigger `ce-resolve-pr-feedback` per its SKILL.md, supplying the findings as the source. The skill evaluates each finding's validity, fixes the valid ones in parallel, and leaves a justification trail for any deliberately not-fixed.
4. Re-run `pnpm review:uncommitted` to confirm the resolved findings are gone and no new ones surfaced.

---

## Smoke test (run after any change to the toggle plumbing)

```bash
# Toggle OFF (default)
rm -f .local/opmode/active
bash scripts/opmode-active.sh && echo ON || echo OFF      # → OFF
bash scripts/print-opmode-banner.sh                       # → (silent, exit 0)
pnpm review:uncommitted                                   # → "operating mode is OFF — …"
pnpm validate:scoped @workspace/scripts                   # → "operating mode is OFF — …"

# Toggle ON
mkdir -p .local/opmode && touch .local/opmode/active
bash scripts/opmode-active.sh && echo ON || echo OFF      # → ON
bash scripts/print-opmode-banner.sh                       # → banner block above

# Restart each of the three artifact workflows; verify the banner once each:
#   restart_workflow "artifacts/api-server: API Server"
#   restart_workflow "artifacts/hospitality-business-portal: web"
#   restart_workflow "artifacts/mockup-sandbox: Component Preview Server"

# Cleanup (back to OFF)
rm -f .local/opmode/active
```
