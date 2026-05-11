---
description: Disarm the CodeRabbit loop
---

Run `pnpm coderabbit:off` and report what it printed.

This removes `.local/opmode/active`, after which the four `review:*` / `validate:*` commands short-circuit with a friendly OFF message.

Do NOT restart workflows automatically — the banner just won't appear on the next manual restart.
