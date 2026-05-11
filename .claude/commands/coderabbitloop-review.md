---
description: Run a CodeRabbit review on the current work (auto-picks scope)
---

If the loop is OFF, first run `pnpm coderabbit:on`.

Then pick the scope:
- If there are uncommitted changes (`git status --short` non-empty): run `pnpm review:uncommitted`.
- Otherwise, if the branch is ahead of `origin/main`: run `pnpm review:branch`.
- Otherwise, ask the user which directory to scope to and run `pnpm review:scoped <dir>`.

Surface the review findings to the user. Do not auto-fix unless they ask.
