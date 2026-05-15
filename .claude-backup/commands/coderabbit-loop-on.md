---
description: Arm the CodeRabbit iterative review loop for this repo
---

Run `~/.local/share/coderabbit-loop/coderabbit-loop.sh on` and report what it printed.

This creates `.local/opmode/active` in the current repo root, which:
- Unlocks `/coderabbit-loop-review` and `/coderabbit-loop-autofix` session commands.
- Causes the banner reminder to print on the next artifact workflow start.

After running, confirm the loop is ON and remind the user of the two session commands: `/coderabbit-loop-review` (working-tree loop) and `/coderabbit-loop-autofix` (open-PR loop with autofix).

If the helper script is not found at `~/.local/share/coderabbit-loop/`, instruct the user to run `pnpm coderabbit-loop:install` from the H+ Analytics repo first.
