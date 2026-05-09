#!/usr/bin/env bash
# Apply remaining CodeRabbit fixes for PR #39 (feat/reit-minions-rapidapi-edgar).
# Run from the workspace root:
#   bash scripts/apply-pr39-coderabbit-fixes.sh
set -euo pipefail

BRANCH="feat/reit-minions-rapidapi-edgar"
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

cleanup() {
  git checkout "$ORIGINAL_BRANCH" 2>/dev/null || true
}
trap cleanup EXIT

echo "→ Checking out $BRANCH …"
git checkout "$BRANCH"

# ── Fix 1: daloopa-reit.ts balanceSheetEntries filter ────────────────────────
# 10-K filings carry fp="FY", so "e.fp.startsWith('Q')" incorrectly drops them.
# Correct logic: quarterly entries must have fp starting with Q; annual 10-Ks pass always.
FILE1="artifacts/api-server/src/ai/ambient/minions/daloopa-reit.ts"
echo "→ Fixing balanceSheetEntries filter in $FILE1 …"
sed -i 's/.filter(e => (e\.form === "10-Q" || e\.form === "10-K") && e\.fp\.startsWith("Q"))/.filter(e => (e.form === "10-Q" \&\& e.fp.startsWith("Q")) || e.form === "10-K")/' "$FILE1"

# ── Fix 2: fmp-reit.ts NOT_SUBSCRIBED should break, not return ────────────────
# Returning early discards any rows successfully upserted for prior tickers.
# Since NOT_SUBSCRIBED is a key-level error (all tickers fail equally), break
# exits the loop and falls through to the normal return with accumulated results.
FILE2="artifacts/api-server/src/ai/ambient/minions/fmp-reit.ts"
echo "→ Fixing NOT_SUBSCRIBED early return in $FILE2 …"
# Replace the return inside the NOT_SUBSCRIBED block with break.
# The return statement spans one line; use a targeted replacement.
python3 - <<'PYEOF'
import re, pathlib

path = pathlib.Path("artifacts/api-server/src/ai/ambient/minions/fmp-reit.ts")
src = path.read_text()

# Match the return inside the NOT_SUBSCRIBED block inside the for loop.
old = (
    '        if (msg === "NOT_SUBSCRIBED") {\n'
    '        logger.info(`${TAG} RapidAPI Yahoo Finance not subscribed — skipping (subscribe at rapidapi.com/apidojo/api/yahoo-finance1)`);\n'
    '        return { source: "fmp-reit", rowsUpserted: 0, rowsFailed: 0, errors: [], durationMs: Date.now() - t0 };\n'
    '      }'
)
new = (
    '        if (msg === "NOT_SUBSCRIBED") {\n'
    '        logger.info(`${TAG} RapidAPI Yahoo Finance not subscribed — skipping (subscribe at rapidapi.com/apidojo/api/yahoo-finance1)`);\n'
    '        break;\n'
    '      }'
)
if old in src:
    path.write_text(src.replace(old, new))
    print("  Replaced return → break (exact match)")
else:
    # Fallback: regex approach for whitespace variance
    pattern = re.compile(
        r'(if \(msg === "NOT_SUBSCRIBED"\) \{[^}]*?)return \{ source: "fmp-reit", rowsUpserted: 0, rowsFailed: 0, errors: \[\], durationMs: Date\.now\(\) - t0 \};',
        re.DOTALL
    )
    result, n = pattern.subn(r'\1break;', src)
    if n:
        path.write_text(result)
        print(f"  Replaced return → break (regex, {n} occurrence(s))")
    else:
        print("  WARNING: pattern not found — manual edit required")
PYEOF

echo "→ Typechecking …"
(cd artifacts/api-server && npx tsc --noEmit)

echo "→ Committing …"
git add artifacts/api-server/src/ai/ambient/minions/daloopa-reit.ts \
        artifacts/api-server/src/ai/ambient/minions/fmp-reit.ts
git commit -m "fix(coderabbit): correct balanceSheetEntries filter and NOT_SUBSCRIBED handling

- daloopa-reit.ts: fix balanceSheetEntries filter — 10-K filings carry
  fp='FY' so the previous '&& e.fp.startsWith(\"Q\")' condition incorrectly
  excluded them. New logic: 10-Q entries require fp.startsWith('Q');
  10-K entries always pass (annual data is always valid).
- fmp-reit.ts: replace early return with break for NOT_SUBSCRIBED.
  Returning from inside the for-loop discards any rows already upserted
  for prior tickers. Breaking exits the loop and falls through to the
  normal accumulated return, preserving previously upserted data."

echo "→ Pushing to origin/$BRANCH …"
git push origin "$BRANCH"

echo ""
echo "✓ PR #39 CodeRabbit fixes applied and pushed."
