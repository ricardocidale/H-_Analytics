/**
 * check-canonical-schema.ts
 *
 * Integrity ratchet for the canonical L+B 6-slide deck schema files.
 *
 * These files are derived from the single canonical PDF
 * (L+B_Property_6-Slide_Cannonical_1777859377769.pdf) and are the
 * authoritative source of truth for the renderer, bbox layout, and
 * design-contract values. They MUST NOT be edited in place — if the
 * PDF changes, a full re-derivation is required and the hashes must
 * be re-locked via --init.
 *
 * MODES
 *   (default)  — ratchet mode: compare SHA-256 of each file against
 *                the locked-in baseline. Exits 1 on any mismatch.
 *   --init     — write the current hashes as the new baseline (use
 *                only after a deliberate, reviewed re-derivation).
 *   --show     — print current hashes without checking the baseline.
 *
 * Run via:
 *   pnpm --filter @workspace/scripts run check:canonical-schema
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.resolve(__dirname, "_canonical-schema-baseline.json");

// ── Protected files ────────────────────────────────────────────────────────
// Each entry is the path relative to WORKSPACE_ROOT and a human-readable
// description used in error messages.

interface CanonicalFile {
  relPath: string;
  description: string;
}

const CANONICAL_FILES: CanonicalFile[] = [
  {
    relPath: "docs/slide-system/canonical/spec_skeleton_v4.json",
    description: "Element-level bbox layout spec (source of truth for renderer rewrite)",
  },
  {
    relPath: "docs/slide-system/canonical/design-contract.json",
    description: "Slide design contract (palette, typography, canvas dimensions)",
  },
  {
    relPath: "docs/slide-system/canonical/r2-manifest.json",
    description: "R2 asset manifest (canonical PDF + per-slide PNG keys)",
  },
];

// ── Hash helper ────────────────────────────────────────────────────────────

function sha256File(absPath: string): string {
  const contents = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

// ── Baseline shape ─────────────────────────────────────────────────────────

interface BaselineEntry {
  sha256: string;
  description: string;
  lockedAt: string;
}

type Baseline = Record<string, BaselineEntry>;

function readBaseline(): Baseline {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

function writeBaseline(baseline: Baseline): void {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
}

// ── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE_INIT = args.includes("--init");
const MODE_SHOW = args.includes("--show");

const current: Baseline = {};
let anyMissing = false;

for (const f of CANONICAL_FILES) {
  const absPath = path.join(WORKSPACE_ROOT, f.relPath);
  if (!fs.existsSync(absPath)) {
    console.error(`  MISSING  ${f.relPath}`);
    console.error(`           ${f.description}`);
    anyMissing = true;
    continue;
  }
  current[f.relPath] = {
    sha256: sha256File(absPath),
    description: f.description,
    lockedAt: new Date().toISOString(),
  };
}

if (anyMissing) {
  console.error(
    "\ncheck:canonical-schema  FAIL — one or more protected files are missing.\n" +
    "These files must not be deleted. They are derived from the canonical PDF:\n" +
    "  L+B_Property_6-Slide_Cannonical_1777859377769.pdf\n",
  );
  process.exit(1);
}

if (MODE_SHOW) {
  console.log("\ncheck:canonical-schema  CURRENT HASHES\n");
  for (const [relPath, entry] of Object.entries(current)) {
    console.log(`  ${entry.sha256.slice(0, 16)}…  ${relPath}`);
    console.log(`                    ${entry.description}`);
  }
  process.exit(0);
}

if (MODE_INIT) {
  writeBaseline(current);
  console.log(`check:canonical-schema  INIT — baseline locked for ${Object.keys(current).length} file(s).`);
  for (const [relPath, entry] of Object.entries(current)) {
    console.log(`  ${entry.sha256.slice(0, 16)}…  ${relPath}`);
  }
  process.exit(0);
}

// ── Ratchet mode ───────────────────────────────────────────────────────────

const baseline = readBaseline();

if (Object.keys(baseline).length === 0) {
  console.error(
    "check:canonical-schema  FAIL — no baseline found.\n" +
    "Run with --init to lock in the current canonical files.",
  );
  process.exit(1);
}

const violations: string[] = [];

for (const f of CANONICAL_FILES) {
  const locked = baseline[f.relPath];
  const live = current[f.relPath];
  if (!live) continue; // missing case handled above

  if (!locked) {
    violations.push(
      `  NEW (unregistered): ${f.relPath}\n` +
      `    Run with --init to register this file in the baseline.`,
    );
    continue;
  }

  if (live.sha256 !== locked.sha256) {
    violations.push(
      `  MODIFIED: ${f.relPath}\n` +
      `    ${f.description}\n` +
      `    locked  : ${locked.sha256}\n` +
      `    current : ${live.sha256}\n` +
      `    These files must not be edited in-place. They are derived from the\n` +
      `    canonical PDF (L+B_Property_6-Slide_Cannonical_1777859377769.pdf).\n` +
      `    If the PDF changed, run a full re-derivation and re-lock with --init.`,
    );
  }
}

if (violations.length > 0) {
  console.error(`\ncheck:canonical-schema  FAIL — ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(v + "\n");
  process.exit(1);
}

console.log(`check:canonical-schema  PASS — all ${CANONICAL_FILES.length} canonical files intact.`);
process.exit(0);
