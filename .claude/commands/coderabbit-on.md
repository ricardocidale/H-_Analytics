---
description: Arm the CodeRabbit loop (operating mode for inline code reviews)
---

Run `pnpm coderabbit:on` and report what it printed.

This creates `.local/opmode/active`, which:
- Unlocks the four review commands (`pnpm review:uncommitted`, `pnpm review:branch`, `pnpm review:scoped <dir>`, `pnpm validate:scoped <pkg>`).
- Causes wrapped artifact workflows (api-server, hospitality-business-portal, mockup-sandbox) to print a banner reminder on next start.

After running, remind the user that the loop is now ON and list the four inner-loop commands.
