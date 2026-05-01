/**
 * Lint Summary — runs tsc --noEmit, outputs 1 compact line.
 * On success: "PASS 0 errors"
 * On failure: "FAIL 12 errors" + first 10 error locations
 *
 * Note: health.ts Phase 1 runs the same check. Use this for quick
 * standalone type-checking without a full health run.
 *
 * Usage: npm run lint:summary
 */
import { runTsc } from "./lib/runners.js";

const result = runTsc();

if (result.passed) {
  console.log("PASS 0 errors");
} else {
  console.log(`FAIL ${result.errorCount} error${result.errorCount !== 1 ? "s" : ""}`);
  if (result.firstError) {
    console.log("  " + result.firstError);
  }
  process.exit(1);
}
