#!/usr/bin/env bash
# Remaining branch cleanup — run once from the workspace root.
# Requires push access to origin.
set -euo pipefail

echo "→ Archiving claude/build-investor-presentation-site-FCWoH as a tag …"
git tag archive/investor-presentation-site-FCWoH origin/claude/build-investor-presentation-site-FCWoH
git push origin archive/investor-presentation-site-FCWoH

echo "→ Deleting the stale branch from remote …"
git push origin --delete claude/build-investor-presentation-site-FCWoH

echo ""
echo "✓ Done. Tag archive/investor-presentation-site-FCWoH preserved on origin."
