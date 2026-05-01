#!/usr/bin/env bash
# db-push-force.sh — non-interactive schema push for environments without a TTY
# (Replit Agent loops, CI, scripted contexts).
#
# WHY THIS EXISTS
# ---------------
# `drizzle-kit push` (interactive) prompts on rename detection. In any non-TTY
# context the prompt blocks the process, the agent kills it, and the schema
# change has to be reapplied as raw SQL by hand. This recurring failure is
# tracked as W1 in `replit_waste.md` (~$240–$640/month in agent waste before
# this script existed).
#
# WHAT IT DOES
# ------------
#   npx drizzle-kit push --force --verbose
#
# `--force`   auto-approves data-loss statements (the rename prompt is one of
#             these). This is unsafe in two cases:
#               (a) you really did rename a column and want the data preserved
#                   (drizzle would otherwise prompt to confirm the rename); or
#               (b) you mis-edited the schema and a column would be DROPPED.
#             To mitigate both, this wrapper REQUIRES you to first run a diff
#             review (printed below) and acknowledge with --i-have-reviewed.
#
# `--verbose` prints every SQL statement before executing, so the failure mode
#             "I didn't know it would drop X" is visible in the log.
#
# SAFE USAGE
# ----------
#   1. git diff shared/schema/   # see what schema you actually changed
#   2. bash script/db-push-force.sh --i-have-reviewed
#
# Override for true emergency (skip the ack): set DB_PUSH_FORCE_ACK=1.

set -euo pipefail

usage_and_exit() {
  cat <<'WARN' >&2
db-push-force.sh: refusing to run without an explicit ack.

This wrapper passes --force to drizzle-kit, which auto-approves data-loss
statements (column drops, table drops, type changes that require recreate).
Before invoking this, REVIEW the schema diff:

  git diff shared/schema/

Then re-run with the ack flag:

  bash script/db-push-force.sh --i-have-reviewed

For non-interactive contexts that have already verified upstream:

  DB_PUSH_FORCE_ACK=1 bash script/db-push-force.sh
WARN
  exit 1
}

# Strict arg parsing — accept exactly one of:
#   (no args, but DB_PUSH_FORCE_ACK=1 must be set)
#   --i-have-reviewed (alone)
# Anything else is a hard fail. A wrapper around `--force` is not the place to
# silently swallow unknown flags; e.g. `--i-have-reviewed --dry-run` would not
# do a dry run (drizzle-kit push has no --dry-run) and would still execute the
# destructive push, which is exactly the foot-gun we are trying to prevent.
case "$#" in
  0)
    if [ "${DB_PUSH_FORCE_ACK:-}" != "1" ]; then
      usage_and_exit
    fi
    ;;
  1)
    if [ "$1" != "--i-have-reviewed" ]; then
      echo "db-push-force.sh: unknown argument: '$1'" >&2
      echo "  This wrapper accepts only '--i-have-reviewed' (or no args with DB_PUSH_FORCE_ACK=1)." >&2
      echo "  It deliberately does NOT forward extra flags to drizzle-kit." >&2
      exit 2
    fi
    ;;
  *)
    echo "db-push-force.sh: too many arguments ($#)." >&2
    echo "  This wrapper accepts only '--i-have-reviewed' (or no args with DB_PUSH_FORCE_ACK=1)." >&2
    echo "  It deliberately does NOT forward extra flags to drizzle-kit." >&2
    exit 2
    ;;
esac

echo "▶ db-push-force.sh — running: npx drizzle-kit push --force --verbose"
exec npx drizzle-kit push --force --verbose
