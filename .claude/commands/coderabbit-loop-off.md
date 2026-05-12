---
description: Disarm the CodeRabbit iterative review loop for this repo
---

Run `~/.local/share/coderabbit-loop/coderabbit-loop.sh off` and report what it printed.

This removes `.local/opmode/active` from the current repo root.

After running, confirm the loop is OFF and tell the user how to re-arm: `/coderabbit-loop-on`.

If the helper script is not found at `~/.local/share/coderabbit-loop/`, instruct the user to run `pnpm coderabbit-loop:install` from the H+ Analytics repo first.
