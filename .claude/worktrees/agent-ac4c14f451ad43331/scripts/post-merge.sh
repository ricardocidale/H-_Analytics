#!/bin/bash
set -e

# Install workspace deps from the lockfile.
pnpm install --frozen-lockfile

# NOTE: We intentionally do NOT run `pnpm --filter @workspace/db push` here.
# The H+ Analytics api-server (artifacts/api-server) owns its database
# lifecycle: it bootstraps the consolidated drizzle schema and applies the
# custom migration files in `migrations/` on startup. Running drizzle-kit
# push here would prompt for ambiguous table renames (stdin is closed in
# post-merge), and even with --force could destructively diverge from the
# migration history the api-server is already managing.
