---
description: Show the CodeRabbit loop toggle state, active session, CLI version, and auth
---

Run `~/.local/share/coderabbit-loop/coderabbit-loop.sh status` and report what it printed.

The status output includes:
- Toggle state (ON/OFF), trigger source, and armed-at timestamp
- Active loop session (if `.local/coderabbit-loop/run.json` exists): mode, iteration, started-at
- CodeRabbit CLI version and install path
- CLI authentication status

After reporting, offer the appropriate next step:
- If OFF: suggest `/coderabbit-loop-on` to arm
- If ON with no active session: suggest `/coderabbit-loop-review` or `/coderabbit-loop-autofix`
- If ON with an active/stale session: explain what the status means

If the helper script is not found at `~/.local/share/coderabbit-loop/`, instruct the user to run `pnpm coderabbit-loop:install` from the H+ Analytics repo first.
