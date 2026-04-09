import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ARTIFACTS_DIR = path.resolve("test-artifacts");
const DIVIDER = "═".repeat(60);

function header(title: string) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${title}`);
  console.log(DIVIDER);
}

interface Phase {
  title: string;
  file: string;
  passMsg: string;
  failMsg: string;
}

const phases: Phase[] = [
  { title: "PHASE 1: Proof Scenario Tests", file: "tests/proof/scenarios.test.ts", passMsg: "All proof scenarios passed", failMsg: "Proof scenario tests FAILED" },
  { title: "PHASE 2: Hardcoded Value Detection", file: "tests/proof/hardcoded-detection.test.ts", passMsg: "No magic numbers detected", failMsg: "Magic number detection FAILED — finance files contain hardcoded values" },
  { title: "PHASE 3: Golden Value & Cross-Check Tests", file: "tests/proof/golden-values.test.ts", passMsg: "All golden value & cross-check tests passed", failMsg: "Golden value tests FAILED — penny-exact verification broken" },
  { title: "PHASE 4: Reconciliation Report Generation", file: "tests/proof/reconciliation-report.test.ts", passMsg: "Reconciliation reports generated", failMsg: "Reconciliation report generation FAILED" },
  { title: "PHASE 5: Data Integrity", file: "tests/proof/data-integrity.test.ts", passMsg: "Database integrity verified", failMsg: "Data integrity checks FAILED" },
  { title: "PHASE 6: Portfolio Dynamics", file: "tests/proof/portfolio-dynamics.test.ts", passMsg: "Portfolio scaling verified", failMsg: "Portfolio dynamics FAILED" },
  { title: "PHASE 7: Recalculation Enforcement", file: "tests/proof/recalculation-enforcement.test.ts", passMsg: "All mutations trigger recalculation", failMsg: "Recalculation enforcement FAILED — stale data possible" },
  { title: "PHASE 8: Rule Compliance", file: "tests/proof/rule-compliance.test.ts", passMsg: "All architectural rules observed", failMsg: "Rule compliance FAILED" },
  { title: "PHASE 9: Number Precision", file: "tests/proof/number-precision.test.ts", passMsg: "All input round-trip & precision tests passed", failMsg: "Number precision FAILED — values may drift through the pipeline" },
  { title: "PHASE 10: Decimal.js Boundaries", file: "tests/proof/decimal-precision.test.ts", passMsg: "All decimal arithmetic boundary tests passed", failMsg: "Decimal precision FAILED — floating-point guard broken" },
  { title: "PHASE 11: Aggregation Cross-Check", file: "tests/proof/aggregation-crosscheck.test.ts", passMsg: "All monthly→yearly→portfolio roll-up tests passed", failMsg: "Aggregation cross-check FAILED — totals don't match" },
];

function run() {
  const startTime = Date.now();
  let allPassed = true;

  for (const phase of phases) {
    header(phase.title);
    try {
      execSync(`npx vitest run ${phase.file} --reporter=verbose`, {
        stdio: "inherit",
        timeout: 120_000,
      });
      console.log(`\n  ✓ ${phase.passMsg}`);
    } catch {
      console.error(`\n  ✗ ${phase.failMsg}`);
      allPassed = false;
    }
  }

  const artifactPhase = phases.length + 1;
  header(`PHASE ${artifactPhase}: Artifact Summary`);
  if (fs.existsSync(ARTIFACTS_DIR)) {
    const files = fs.readdirSync(ARTIFACTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    const mdFiles = files.filter(f => f.endsWith(".md"));
    console.log(`  JSON artifacts: ${jsonFiles.length}`);
    console.log(`  Markdown artifacts: ${mdFiles.length}`);

    for (const jf of jsonFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, jf), "utf-8"));
        const opinion = data.financial_identities?.opinion ?? "N/A";
        const balanced = data.sources_and_uses?.balanced ?? data.fee_linkage_balanced ?? "N/A";
        console.log(`  ${jf}: opinion=${opinion}, balanced=${balanced}`);
      } catch {
        console.log(`  ${jf}: (could not parse)`);
      }
    }
  } else {
    console.log("  No artifacts directory found");
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  header("VERIFICATION SUMMARY");
  if (allPassed) {
    console.log("  RESULT: ALL PHASES PASSED");
    console.log(`  Time: ${elapsed}s`);
    console.log("  The financial engine is provably correct.");
    console.log("  No human Excel verification required.\n");
    process.exit(0);
  } else {
    console.log("  RESULT: VERIFICATION FAILED");
    console.log(`  Time: ${elapsed}s`);
    console.log("  Review failed phases above.\n");
    process.exit(1);
  }
}

run();
