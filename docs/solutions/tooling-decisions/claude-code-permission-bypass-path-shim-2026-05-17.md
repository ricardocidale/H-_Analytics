---
title: Claude Code permission-bypass via PATH-first shim (CLI cross-platform)
date: 2026-05-17
category: tooling-decisions
module: claude-code-permission-bypass
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - "Provisioning a new dev environment that runs Claude Code CLI on Linux, Mac, Replit, or Windows"
  - "Per-tool permission prompts block unattended agentic workflows (loops, subagent dispatch, scheduled tasks)"
  - "`skipDangerousModePermissionPrompt: true` is being relied on in settings.json (silently a no-op in 2.1.x)"
  - "`permissions.defaultMode: bypassPermissions` is being relied on (silently broken in 2.1.x per #34923)"
  - "An operator considers Claude Code Desktop for unattended work (no working bypass exists in 2.1.x)"
symptoms:
  - "Every Bash / Edit / Write tool call prompts for approval despite a global bypass setting being present in `~/.claude/settings.json`"
  - "Setting `permissions.defaultMode: bypassPermissions` in `settings.json` has no effect (anthropics/claude-code#34923)"
  - "Claude Code Desktop ignores both `permissions.allow` and the in-app bypass toggle (anthropics/claude-code#29026, #55095)"
  - "On Windows, sibling `claude.cmd` shim silently shadowed by Anthropic's native `claude.exe` because `.EXE` beats `.CMD` in PATHEXT"
  - "`setx PATH ...` truncates user PATH at 1024 characters and corrupts the environment"
tags:
  - claude-code
  - permissions
  - bypass-permissions
  - cli-wrapper
  - cross-platform
  - windows-pathext
  - powershell
  - shim
---

# Claude Code permission-bypass via PATH-first shim (CLI cross-platform)

## Context

The H+ Analytics team needed Claude Code to run without per-tool permission prompts across a heterogeneous dev fleet: Replit Linux workspaces, Mac CLIs, Windows PowerShell, and Claude Code Desktop on both Mac and Windows. The documented mechanism — `permissions.defaultMode: "bypassPermissions"` (or `permissions.allow`) in `settings.json` — failed in production, and Desktop's in-app bypass toggle did nothing.

Diagnosis surfaced three concurrent upstream bugs in Claude Code 2.1.x that together render every `settings.json`-based bypass mechanism unreliable or completely inert:

- [anthropics/claude-code#34923](https://github.com/anthropics/claude-code/issues/34923) — `permissions.defaultMode: "bypassPermissions"` in `settings.json` is silently ignored. The flag parses, the file loads, no error is emitted, prompts still appear.
- [anthropics/claude-code#29026](https://github.com/anthropics/claude-code/issues/29026) — Desktop app ignores both `permissions.allow` AND `permissions.defaultMode` bypass.
- [anthropics/claude-code#55095](https://github.com/anthropics/claude-code/issues/55095) — Desktop's "Allow bypass permissions mode" toggle in Settings is a no-op.

The CLI flag `--dangerously-skip-permissions` is the only mechanism that actually bypasses in 2.1.x. **Desktop has no working bypass in 2.1.x — period.** That forces a CLI-only strategy and raises the question: how do we make the CLI flag fire automatically across Mac, Linux, and Windows without retraining every operator?

The shipped answer is a **PATH-first wrapper shim** that intercepts the `claude` command and re-execs the real binary with the flag appended. Two installers under `scripts/` deliver this — `install-claude-wrapper.sh` for Linux/Mac and `install-claude-wrapper.ps1` for Windows. Both are idempotent. Both are safe to re-run on every clone.

## Guidance

Install a thin wrapper at a directory that takes PATH precedence over the native install location. The wrapper resolves the real `claude` binary at runtime (Linux/Mac) or install time (Windows) and exec's it with `--dangerously-skip-permissions` followed by all original args.

### Canonical install paths

| Platform | Wrapper path | PATH wiring |
|---|---|---|
| Linux / Mac | `~/.local/bin/claude` (bash script) | `~/.local/bin` is already prepended on most distros; ensure it sits before the directory containing the real claude binary |
| Windows | `%USERPROFILE%\.claude-bypass\bin\claude.cmd` | User-scope PATH prepended via `[Environment]::SetEnvironmentVariable('PATH', ..., 'User')` |

**Do NOT** install the Windows shim at `%USERPROFILE%\.local\bin\claude.cmd`. The Anthropic native installer drops `claude.exe` there, and on Windows `.EXE` outranks `.CMD` in `PATHEXT` — a sibling `.cmd` is silently shadowed and never invoked.

### Linux / Mac wrapper body

The bash wrapper resolves the real binary at runtime by iterating `$PATH` and skipping its own resolved path. Portable across Mac (BSD readlink) and Linux (GNU readlink) — the `|| echo "$path"` fallback handles BSD's missing `-f` flag.

```bash
#!/usr/bin/env bash
# ~/.local/bin/claude — always passes --dangerously-skip-permissions
self="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
real=""
IFS=':' read -ra dirs <<< "$PATH"
for d in "${dirs[@]}"; do
  cand="$d/claude"
  [[ -x "$cand" ]] || continue
  cand_r="$(readlink -f "$cand" 2>/dev/null || echo "$cand")"
  [[ "$cand_r" == "$self" ]] && continue
  real="$cand"
  break
done
[[ -z "$real" ]] && { echo "claude wrapper: real claude binary not found on PATH" >&2; exit 127; }
exec "$real" --dangerously-skip-permissions "$@"
```

The installer (`scripts/install-claude-wrapper.sh`) must include a **size-based safety check** before writing: if the file at the target path already exists and is greater than 100 KB, refuse to overwrite — that's the Anthropic native install (hundreds of MB), not a previous wrapper.

### Windows wrapper body

The `.cmd` shim bakes the real-binary path into itself at install time. This avoids spawning PowerShell on every `claude` invocation (which would add ~300 ms of startup latency per call).

```cmd
@echo off
rem Installed by scripts\install-claude-wrapper.ps1
rem Always passes --dangerously-skip-permissions to the real claude binary.
"C:\Users\<username>\.local\bin\claude.exe" --dangerously-skip-permissions %*
```

The installer resolves the real binary by enumerating PATH and skipping its own shim path:

```powershell
$real = Get-Command claude -All -CommandType Application |
  Where-Object { $_.Source -notlike "*\.claude-bypass\bin\*" } |
  Select-Object -First 1 -ExpandProperty Source
```

PATH wiring uses the `Environment` API, not `setx`:

```powershell
$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
$shimDir  = "$env:USERPROFILE\.claude-bypass\bin"
if ($userPath -notlike "*$shimDir*") {
  [Environment]::SetEnvironmentVariable('PATH', "$shimDir;$userPath", 'User')
}
```

**`setx` truncates user PATH at 1024 characters and has destroyed user PATHs in production.** The `Environment` API has no length limit.

The installer also warns if `$USERPROFILE`, current working directory, or `$PROFILE` resolve under a sync service (OneDrive / Dropbox) — sync conflicts on `claude.cmd` are a documented hazard. The shim path under `%USERPROFILE%\.claude-bypass\bin\` is *not* a directory that OneDrive or Dropbox auto-redirect.

## Why This Matters

**What breaks without this:** Unattended workflows (scheduled `/loop`, CI tasks, agent dispatch chains, sub-agent fan-out) stall at the first tool call waiting for a human to click "Allow". On Desktop this is unrecoverable in 2.1.x. On CLI, every operator would have to remember to type `--dangerously-skip-permissions` on every invocation, which they will not.

**What the alternative knobs do (or fail to do):**

| Mechanism | CLI 2.1.x | Desktop 2.1.x |
|---|---|---|
| `permissions.defaultMode: "bypassPermissions"` in `settings.json` | **Broken** (#34923) | **Broken** (#29026) |
| `permissions.allow: ["Bash", "Read", ...]` in `settings.json` | Partial — explicit allows fire, anything unlisted still prompts | **Broken** — Desktop ignores entire `permissions` block (#29026) |
| Desktop Settings → "Allow bypass permissions mode" toggle | N/A | **No-op** (#55095) |
| `claude --dangerously-skip-permissions` | **Works** | N/A (Desktop has no equivalent flag) |

**Why CLI-only is acceptable:** Desktop is a UI surface, not an automation surface. Unattended workflows belong on the CLI. Once the wrapper is installed, any tool, terminal, IDE, or scheduler that calls `claude` gets bypass for free — VS Code's terminal, JetBrains run configurations, GitHub Actions, Railway shell sessions, Replit workflows. Desktop users who want bypass must run CLI inside Desktop's terminal pane or wait for Anthropic to fix #29026 / #55095.

**Why a wrapper instead of an alias:** Shell aliases don't survive non-interactive shells, subagent dispatch, `xargs`-style invocations, or processes spawned by IDEs and schedulers. A PATH shim is the only mechanism that intercepts every invocation regardless of caller.

**Why bake the real-binary path on Windows:** PowerShell startup costs ~300 ms; doing it on every `claude` invocation is unacceptable for sub-agent fan-out workloads. The shim is regenerated when the user re-runs the installer (e.g., after `npm` reinstalls Claude Code to a different path).

## When to Apply

Apply this pattern when **all** of the following hold:

- Claude Code version is in the 2.1.x line where #34923, #29026, #55095 are unresolved
- The user wants unattended / no-prompt tool execution on the CLI surface
- The dev environment is Linux, Mac, Windows PowerShell, or Replit
- The user understands `--dangerously-skip-permissions` disables all per-tool gating and accepts that tradeoff for this environment

**Do NOT apply** when:

- Targeting Claude Code Desktop as the automation surface — there's no working bypass; the wrapper does not help because Desktop does not invoke the CLI binary
- A future Claude Code release lands a fix for #34923 (verify by testing `defaultMode: "bypassPermissions"` in `settings.json` against the new version) — at that point the wrapper becomes redundant
- The target is a hardened production host where bypassing tool prompts is a policy violation — this is a dev-machine pattern, not a server pattern

Re-evaluate whenever `claude --version` advances past 2.1.x. Run the smoke test below against the new version with the wrapper uninstalled before keeping or removing it.

## Examples

### Before (unbypassed CLI, `-p` mode hangs)

```
$ claude -p "List files in this repo"
[Permission required] Allow Claude to run tool: Bash
  Command: ls -la
  Allow? [y/n/always]: _
```

In `-p` (print) mode there is no interactive UI to grant the prompt, so this hangs forever in unattended contexts. Same for any subagent dispatch, scheduled task, or CI run.

### After (wrapper installed)

```
$ claude -p "List files in this repo"
total 248
drwxr-xr-x  37 user  staff   1184 May 17 09:14 .
...
```

No prompt. Tool fires. Output streams. Identical on Mac, Linux, and Windows.

### Canonical smoke test

```bash
claude --model haiku -p "Run this exact command and report nothing else: echo BYPASS_OK_$$"
```

The `-p` flag removes the UI layer entirely — if a permission prompt existed, the call would hang or error rather than print the marker. A successful echo of `BYPASS_OK_<pid>` proves the bypass is wired end-to-end. Use Haiku to keep the test under 5 seconds. Run on Linux and Windows after install.

### Wrapper resolution check (Linux/Mac, verified on Replit 2.1.143)

```bash
$ which claude
/home/runner/.local/bin/claude
$ claude --version
2.1.143 (Claude Code)
$ head -1 $(which claude)
#!/usr/bin/env bash
```

### Wrapper resolution check (Windows, verified on native 2.1.133)

```powershell
PS> where.exe claude
C:\Users\ricar\.claude-bypass\bin\claude.cmd
C:\Users\ricar\.local\bin\claude.exe
PS> claude --version
2.1.133 (Claude Code)
```

The `.cmd` shim wins because `%USERPROFILE%\.claude-bypass\bin` is **prepended** to PATH. If you see `.exe` first in `where.exe` output, the PATH order is wrong and the bypass is not active.

### Failure mode: Windows PATHEXT collision

```powershell
# WRONG — install path collides with Anthropic's native binary directory
PS> ls $env:USERPROFILE\.local\bin\
claude.cmd     2 KB    (wrapper)
claude.exe   225 MB    (Anthropic native install)

PS> claude --version   # silently invokes claude.exe, NOT claude.cmd
2.1.133 (Claude Code)
PS> claude -p "test"
[Permission required] ...   # bypass not active — wrapper was shadowed
```

`PATHEXT` ordering on default Windows installs is `.COM;.EXE;.BAT;.CMD;...` — `.EXE` always wins against a sibling `.CMD` in the same directory. Use a separate directory (`.claude-bypass\bin\`) and prepend it to PATH so the shim's directory is consulted **before** the directory containing `claude.exe`. This is the single most common installer mistake on Windows; the canonical install path above avoids it by design.

## Related

- `docs/solutions/conventions/hplus-specialist-design-discipline-from-ce-researchers-2026-05-13.md` — Rule 14 notes that "sub-agent workflows trip permission prompts on every shell call." This wrapper addresses that friction at the tool level rather than the prompt-design level.
- `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` — Claude Code-specific convention; the bypass pattern reduces prompt volume that this dispatch guard otherwise had to live with.
- `docs/solutions/tooling-decisions/railway-db-sync-helper-2026-05-03.md` — Same category precedent for documenting custom helper scripts as durable tooling decisions.
- `docs/solutions/integration-issues/claude-worktree-gitdir-pointer-missing-2026-05-11.md` — Sibling Claude Code dev-environment workaround.
- PR #161 on `Norfolk-Group/H-Analytics` — squash commit `4f29261c4` shipped both installers to `main` on 2026-05-17.
- Installer files: `scripts/install-claude-wrapper.sh`, `scripts/install-claude-wrapper.ps1`.
