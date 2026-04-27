# Cleanup: Pre-Deploy Storage Reconcile workflow missing GitHub Actions secrets

> **Owner:** Repo maintainer (Ricardo) — secrets must be set via GitHub UI; CC cannot configure repo secrets.
> **Discovered:** 2026-04-27 during v1 CI investigation. Pre-existing — pre-dates G1 saga.
> **Severity:** Medium — workflow fails on every push but isn't a deployment blocker IF the storage reconcile is intentionally a manual-only operation.

## What's failing

`.github/workflows/predeploy-storage-reconcile.yml > reconcile job > step "Verify required secrets are configured"` fails on every CI run.

The workflow is triggered on push to main + manual dispatch. Its purpose: reconcile storage state (R2 / object storage) before deployment to ensure no orphan blobs or missing assets. It needs cloud credentials.

## Root cause

The workflow references one or more GitHub Actions secrets via `${{ secrets.R2_BUCKET }}`, `${{ secrets.R2_ENDPOINT }}`, `${{ secrets.R2_ACCESS_KEY_ID }}`, `${{ secrets.R2_SECRET_ACCESS_KEY }}` (per the workflow file's expected names — Replit's note in the file mentions these). The repo doesn't have the secrets configured (or they expired / were rotated and not re-added).

## Three viable fixes

| Option | Approach | Effort |
|---|---|---|
| **A** | Set the missing secrets via GitHub Settings → Secrets and variables → Actions | 2 min — requires admin access to the repo |
| **B** | Disable the workflow on push if it's only meaningful pre-deployment (change `on: [push, workflow_dispatch]` → `on: [workflow_dispatch]` only) | 5 min — code change |
| **C** | Make the secrets-check step conditional and skip the workflow gracefully when secrets aren't present (workflow continues but as a no-op) | 15 min — code change |

**Recommendation: A or B depending on intent.** If storage reconcile is a real pre-deployment safety net, **A** (configure the secrets). If it's only relevant when actually deploying via specific paths, **B** (drop push trigger). Don't C — silent no-op is misleading.

## Tasks (depends on choice)

### If A:
1. Open repo Settings → Secrets and variables → Actions → New repository secret
2. Add the secrets the workflow needs (read `.github/workflows/predeploy-storage-reconcile.yml` for the exact names and current expected values — they may be R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, plus any sentinel like LEGACY_PRIVATE_OBJECT_DIR per the storage-reconcile-remediate.yml comments)
3. Re-run the workflow manually to verify
4. Acceptance: workflow goes green on next push

### If B:
1. Edit `.github/workflows/predeploy-storage-reconcile.yml`
2. Remove the `push:` trigger from the `on:` block; keep `workflow_dispatch:` only
3. Add a comment explaining why
4. Acceptance: workflow no longer runs on push; can still be manually invoked from Actions tab

## Verification

For **A**: push a no-op commit, watch the workflow finish green.
For **B**: push a no-op commit, confirm the workflow is NOT triggered (only `CI` runs).

## Out of scope

- Re-architecting the storage reconcile workflow itself (e.g., to use OIDC instead of long-lived secrets) — that's a security-improvement packet, not a CI-cleanup one.
- The `storage-reconcile-remediate.yml` workflow has the same secret pattern; if you want to fix both at once, it's the same secret list.

## Estimated effort

A: 2-5 minutes (UI work; you do it).
B: 10-15 minutes (CC change to YAML + verification on next push).
