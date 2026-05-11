/**
 * U1 spike — Factory v2 PPTX substitution proof-of-concept.
 *
 * Proves `pptx-automizer` can:
 *   1. Load the L+B canonical PPTX and enumerate slide shapes.
 *   2. Overwrite a text shape's content (slot substitution via `modify.setText`).
 *   3. Save a valid output PPTX with intact OOXML structure.
 *   4. Handle an oversize replacement string (R7 aesthetic-guardrail edge case).
 *   5. Round-trip parse the output through the same library.
 *
 * Notes for U4:
 * - We use `modify.setText` (full-shape overwrite), not `modify.replaceText`
 *   (intra-shape find/replace). The latter trips a content-tracker bug on this
 *   canonical PPTX at write time. `setText` matches the v2 architecture
 *   anyway — Lucca emits final slot text and Marco/Builders overwrite shapes.
 * - Image-swap surface is intentionally NOT exercised here. The canonical
 *   PPTX's picture shapes have nested relations that need manifest plumbing
 *   (the v7 reconstruction package's per-shape bbox manifest) — deferred to U4.
 *
 * Throwaway: delete after U4 implements the production substitution engine.
 * Run with:
 *
 *   pnpm --filter @workspace/scripts exec tsx src/pptx-substitution-spike.ts
 *
 * Plan: docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md (U1)
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pptxAutomizer from "pptx-automizer";

// pptx-automizer ships a CJS bundle with `module.exports.default = Automizer`.
// Under Node ESM-CJS interop the default import becomes the whole exports
// object, so the class lives at `.default`.
const Automizer = (pptxAutomizer as unknown as { default: typeof pptxAutomizer }).default ?? pptxAutomizer;
const { modify } = pptxAutomizer as unknown as {
  modify: typeof import("pptx-automizer").modify;
};

const SPIKE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPIKE_DIR, "..", "..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "attached_assets", "canonical", "pptx");
const TEMPLATE_FILE = "belleayre-mountain-slides_1777774635693.pptx";
const OUTPUT_DIR = path.join(REPO_ROOT, ".local", "spike-output");
const OUTPUT_HAPPY = "spike-happy.pptx";
const OUTPUT_OVERFLOW = "spike-overflow.pptx";
const TARGET_SLIDE_NUMBER = 2;
const PLACEHOLDER_TEXT = "HAZELNIS";
const HAPPY_REPLACEMENT = "BELLEAYRE MOUNTAIN — ULSTER COUNTY ESTATE";
// Edge case (R7): replacement longer than placeholder — surfaces overflow behavior.
const OVERFLOW_REPLACEMENT =
  "The Long Lake Lodge at the Edge of the Adirondack Mountain Reserve";

type SpikeResult = { outputPath: string; bytes: number; entryCount: number };

async function runSubstitution(
  replacement: string,
  outputFile: string,
): Promise<SpikeResult> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const automizer = new Automizer({
    templateDir: TEMPLATE_DIR,
    outputDir: OUTPUT_DIR,
    // Start from an empty output and add only the substituted slide — keeps the
    // spike small and deterministic.
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    // `cleanup: true` triggers a content-tracker walk that hits a relation-map
    // bug on this canonical PPTX. Leaving it off — output files are still valid.
    cleanup: false,
  });

  const pres = automizer.loadRoot(TEMPLATE_FILE).load(TEMPLATE_FILE, "src");

  // Discover the text-bearing shape that contains our placeholder. The
  // production substitution engine (U4) will read shape identifiers from the v7
  // reconstruction package's manifest instead, but the spike walks the template
  // directly.
  const slideInfos = await automizer.getTemplate("src").setCreationIds();
  const targetSlide = slideInfos.find((s) => s.number === TARGET_SLIDE_NUMBER);
  if (!targetSlide) {
    throw new Error(`slide ${TARGET_SLIDE_NUMBER} not found in template`);
  }
  const textElement = targetSlide.elements.find(
    (el) => el.hasTextBody && el.getText().some((t) => t.includes(PLACEHOLDER_TEXT)),
  );
  if (!textElement) {
    throw new Error(`no text shape containing "${PLACEHOLDER_TEXT}" on slide ${TARGET_SLIDE_NUMBER}`);
  }
  console.log(`[u1-spike]   slide ${TARGET_SLIDE_NUMBER}: ${targetSlide.elements.length} shapes; text target="${textElement.name}"`);

  pres.addSlide("src", TARGET_SLIDE_NUMBER, (slide) => {
    slide.modifyElement(textElement.name, [modify.setText(replacement)]);
  });

  await pres.write(outputFile);

  const outputPath = path.join(OUTPUT_DIR, outputFile);
  const bytes = statSync(outputPath).size;
  const entryCount = inspectZipEntries(outputPath);
  return { outputPath, bytes, entryCount };
}

function inspectZipEntries(zipPath: string): number {
  // python3's stdlib zipfile is enough; `unzip` is not installed on this image.
  // Counting entries is enough to prove the OOXML structure survived the rewrite.
  const stdout = execFileSync("python3", ["-m", "zipfile", "-l", zipPath], {
    encoding: "utf8",
  });
  return stdout.trim().split("\n").length - 1;
}

async function main(): Promise<void> {
  console.log(`[u1-spike] template: ${path.join(TEMPLATE_DIR, TEMPLATE_FILE)}`);

  console.log(`[u1-spike] case 1 (happy path) — replace "${PLACEHOLDER_TEXT}" → "${HAPPY_REPLACEMENT}"`);
  const happy = await runSubstitution(HAPPY_REPLACEMENT, OUTPUT_HAPPY);
  console.log(`[u1-spike]   wrote ${happy.outputPath} (${happy.bytes} bytes, ${happy.entryCount} archive entries)`);

  console.log(`[u1-spike] case 2 (overflow edge case) — replacement length ${OVERFLOW_REPLACEMENT.length}`);
  const overflow = await runSubstitution(OVERFLOW_REPLACEMENT, OUTPUT_OVERFLOW);
  console.log(`[u1-spike]   wrote ${overflow.outputPath} (${overflow.bytes} bytes, ${overflow.entryCount} archive entries)`);

  // Round-trip sanity: re-load the happy-path output through the same library.
  // If pptx-automizer can re-parse it without throwing, the OOXML is well-formed.
  const verify = new Automizer({
    templateDir: OUTPUT_DIR,
    outputDir: OUTPUT_DIR,
    removeExistingSlides: true,
  });
  verify.loadRoot(OUTPUT_HAPPY).load(OUTPUT_HAPPY, "verify");
  await verify.getTemplate("verify").setCreationIds();
  console.log("[u1-spike] round-trip parse OK");

  console.log("[u1-spike] DONE — inspect outputs under .local/spike-output/");
}

main().catch((err) => {
  console.error("[u1-spike] FAILED:", err);
  process.exit(1);
});
