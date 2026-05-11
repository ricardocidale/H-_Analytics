---
description: Report current CodeRabbit loop state and config
---

Run `pnpm coderabbit:status` and surface the output verbatim.

The report includes:
- ON/OFF state and trigger source (marker file vs `OPMODE_LARGE_REPO_SHELL` env var)
- Marker file timestamp (when the loop was armed)
- Repo root
- Banner-wrapped artifacts
- CodeRabbit CLI version, path, and authenticated identity
- Inner-loop commands (when ON) or arm hint (when OFF)

The auth-identity line takes 1–8 seconds because it hits the CodeRabbit API; everything else prints instantly. Do not interpret a brief pause as a hang.
