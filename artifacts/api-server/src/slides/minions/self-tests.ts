/**
 * Minion self-tests (Task #1392).
 *
 * Each minion in the MINIONS catalog has a tiny, deterministic, side-effect-free
 * self-test that exercises its core code path against a known fixture. These
 * are surfaced on the Minions roster page (Intelligence → Agents → Minions)
 * via the Analyst button, so admins can confirm each helper is wired and
 * working without waiting for a real Slide Factory run.
 *
 * Design rules (per task brief):
 *   - Fast: every test runs in well under 5s on a warm container.
 *   - Safe: no DB writes, no R2 writes, no external HTTP, no LLM calls.
 *   - Real: each test executes the actual minion code (or an inlined
 *     equivalent of its core algorithm where the public entry point
 *     requires infra we don't want to spin up — see `dino`).
 *
 * Adding a new minion:
 *   1. Add it to the `MINIONS` catalog in `agent-taxonomy.ts`.
 *   2. Add a `<id>SelfTest()` function below.
 *   3. Register it in `MINION_SELF_TESTS`.
 *   4. The roster route picks it up automatically.
 */

import sharp from "sharp";
import { runAldo } from "./aldo";
import { runCarlo } from "./carlo";
import { computeSlideContentHash } from "./enzo";

export interface MinionSelfTestResult {
  minionId: string;
  status: "pass" | "fail" | "skipped";
  durationMs: number;
  message: string;
}

function fail(minionId: string, start: number, message: string): MinionSelfTestResult {
  return {
    minionId,
    status: "fail",
    durationMs: Math.round(performance.now() - start),
    message,
  };
}

function pass(minionId: string, start: number, message: string): MinionSelfTestResult {
  return {
    minionId,
    status: "pass",
    durationMs: Math.round(performance.now() - start),
    message,
  };
}

// ── Aldo ───────────────────────────────────────────────────────────────────
// Generate a tiny PDF in memory with known text and confirm Aldo extracts
// at least the fixture words back out. Exercises the real `pdftotext -bbox`
// codepath end-to-end.

const ALDO_FIXTURE_TEXT = "Aldo self test fixture page one with enough words for the minimum element count";
const ALDO_FIXTURE_TOKEN = "Aldo";
// jsPDF coordinates (mm). Two lines so we exceed ALDO_MIN_ELEMENT_COUNT.
const ALDO_FIXTURE_X_MM = 10;
const ALDO_FIXTURE_LINE_1_Y_MM = 20;
const ALDO_FIXTURE_LINE_2_Y_MM = 40;

async function aldoSelfTest(): Promise<MinionSelfTestResult> {
  const start = performance.now();
  try {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.text(ALDO_FIXTURE_TEXT, ALDO_FIXTURE_X_MM, ALDO_FIXTURE_LINE_1_Y_MM);
    doc.text(ALDO_FIXTURE_TEXT, ALDO_FIXTURE_X_MM, ALDO_FIXTURE_LINE_2_Y_MM);
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    const result = await runAldo(pdfBuffer);
    const found = result.elements.some((e) => e.text === ALDO_FIXTURE_TOKEN);
    if (!found) {
      return fail(
        "aldo",
        start,
        `Extracted ${result.elements.length} elements but none matched the fixture token "${ALDO_FIXTURE_TOKEN}".`,
      );
    }
    return pass(
      "aldo",
      start,
      `Extracted ${result.elements.length} elements; fixture token "${ALDO_FIXTURE_TOKEN}" present.`,
    );
  } catch (err) {
    return fail("aldo", start, err instanceof Error ? err.message : String(err));
  }
}

// ── Carlo ──────────────────────────────────────────────────────────────────
// Pure function — feed a known-valid block and a known-invalid block, confirm
// the validator distinguishes them. Both shapes exercise the real Zod schema.

// Carlo fixture geometry / typography — values picked to satisfy the Zod
// schema (positive width/height, 100–900 font weight, valid hex color).
const CARLO_FIXTURE_X = 10;
const CARLO_FIXTURE_Y = 20;
const CARLO_FIXTURE_W = 100;
const CARLO_FIXTURE_H = 20;
const CARLO_FIXTURE_FONT_SIZE = 16;
const CARLO_FIXTURE_FONT_WEIGHT = 700;
const CARLO_FIXTURE_TEXT = "Self-test heading";
const CARLO_FIXTURE_CHAR_COUNT = CARLO_FIXTURE_TEXT.length;

function carloSelfTest(): MinionSelfTestResult {
  const start = performance.now();
  try {
    const validBlock = {
      text: CARLO_FIXTURE_TEXT,
      x: CARLO_FIXTURE_X,
      y: CARLO_FIXTURE_Y,
      w: CARLO_FIXTURE_W,
      h: CARLO_FIXTURE_H,
      slideIndex: 0,
      fontName: "Georgia, serif",
      fontSize: CARLO_FIXTURE_FONT_SIZE,
      fontWeight: CARLO_FIXTURE_FONT_WEIGHT,
      color: "#257D41",
      semanticRole: "slide_title",
      variableBinding: null,
      overflowBehavior: null,
      characterCount: CARLO_FIXTURE_CHAR_COUNT,
    };
    const invalidBlock = { ...validBlock, color: "not-a-hex" };

    const validResult = runCarlo([[validBlock]]);
    if (!validResult.valid) {
      return fail("carlo", start, `Valid fixture rejected: ${validResult.blockingErrors.join("; ")}`);
    }

    const invalidResult = runCarlo([[invalidBlock]]);
    if (invalidResult.valid) {
      return fail("carlo", start, "Invalid fixture (bad color) was accepted as valid.");
    }
    if (!invalidResult.blockingErrors.some((e) => e.includes("color"))) {
      return fail(
        "carlo",
        start,
        `Invalid fixture rejected but no color error reported: ${invalidResult.blockingErrors.join("; ")}`,
      );
    }
    return pass(
      "carlo",
      start,
      "Valid fixture accepted; invalid fixture (bad color) correctly rejected.",
    );
  } catch (err) {
    return fail("carlo", start, err instanceof Error ? err.message : String(err));
  }
}

// ── Dino ───────────────────────────────────────────────────────────────────
// `runDino` requires R2 + Playwright, neither of which we want to spin up
// for an on-demand admin check. Instead, exercise the same per-pixel diff
// algorithm against in-memory PNGs:
//   identical white 4×4   → diff = 0
//   white vs solid red 4×4 → diff = 100
// Uses real `sharp` decode so the codec dependency is verified too.

async function dinoSelfTest(): Promise<MinionSelfTestResult> {
  const start = performance.now();
  try {
    const fixtureSize = 4;
    const channelCount = 4;
    const opaque = 255;
    const red = { r: 255, g: 0, b: 0, alpha: opaque };
    const white = { r: 255, g: 255, b: 255, alpha: opaque };

    const [whitePng, redPng] = await Promise.all([
      sharp({ create: { width: fixtureSize, height: fixtureSize, channels: channelCount, background: white } })
        .png().toBuffer(),
      sharp({ create: { width: fixtureSize, height: fixtureSize, channels: channelCount, background: red } })
        .png().toBuffer(),
    ]);

    const identicalDiff = await diffPct(whitePng, whitePng, channelCount);
    if (identicalDiff !== 0) {
      return fail("dino", start, `Identical fixtures reported ${identicalDiff}% diff (expected 0%).`);
    }

    const differentDiff = await diffPct(whitePng, redPng, channelCount);
    const fullyDifferentPct = 100;
    if (differentDiff !== fullyDifferentPct) {
      return fail(
        "dino",
        start,
        `White-vs-red fixtures reported ${differentDiff}% diff (expected ${fullyDifferentPct}%).`,
      );
    }
    return pass(
      "dino",
      start,
      `Identical fixtures = 0% diff; opposing fixtures = ${fullyDifferentPct}% diff.`,
    );
  } catch (err) {
    return fail("dino", start, err instanceof Error ? err.message : String(err));
  }
}

async function diffPct(a: Buffer, b: Buffer, channels: number): Promise<number> {
  const channelTolerance = 1; // matches DINO_CHANNEL_DIFF_TOLERANCE in spirit
  const [imgA, imgB] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const total = imgA.info.width * imgA.info.height;
  let differing = 0;
  const byteLen = total * channels;
  for (let i = 0; i < byteLen; i += channels) {
    if (
      Math.abs(imgA.data[i] - imgB.data[i]) > channelTolerance ||
      Math.abs(imgA.data[i + 1] - imgB.data[i + 1]) > channelTolerance ||
      Math.abs(imgA.data[i + 2] - imgB.data[i + 2]) > channelTolerance
    ) {
      differing += 1;
    }
  }
  const pctScale = 100;
  return (differing / total) * pctScale;
}

// ── Enzo ───────────────────────────────────────────────────────────────────
// Pure function. Two fixtures with the same slot values must hash identically;
// changing one value must change the hash.

function enzoSelfTest(): MinionSelfTestResult {
  const start = performance.now();
  try {
    const draftA = {
      "slide1.title": { value: "Hello" },
      "slide1.subtitle": { value: "World" },
      "slide2.title": { value: "Other" },
    };
    const draftB = {
      "slide1.subtitle": { value: "World" },
      "slide1.title": { value: "Hello" },
      "slide2.title": { value: "Other" },
    };
    const draftC = {
      "slide1.title": { value: "Hello!" },
      "slide1.subtitle": { value: "World" },
      "slide2.title": { value: "Other" },
    };

    const hashA = computeSlideContentHash(draftA, "slide1");
    const hashB = computeSlideContentHash(draftB, "slide1");
    const hashC = computeSlideContentHash(draftC, "slide1");

    if (hashA !== hashB) {
      return fail(
        "enzo",
        start,
        `Hash should be insensitive to key insertion order, got ${JSON.stringify(hashA)} vs ${JSON.stringify(hashB)}.`,
      );
    }
    if (hashA === hashC) {
      return fail("enzo", start, "Hash did not change when a slot value was edited.");
    }
    return pass(
      "enzo",
      start,
      "Hash is order-insensitive and changes when any slot value changes.",
    );
  } catch (err) {
    return fail("enzo", start, err instanceof Error ? err.message : String(err));
  }
}

// ── Bruno ──────────────────────────────────────────────────────────────────
// Bruno is registered in the catalog as a "Pipeline utility" placeholder with
// no executable code yet (see comment in `agent-taxonomy.ts`). The self-test
// reports `skipped` honestly rather than faking a green check.

function brunoSelfTest(): MinionSelfTestResult {
  const start = performance.now();
  return {
    minionId: "bruno",
    status: "skipped",
    durationMs: Math.round(performance.now() - start),
    message: "Bruno is a registered placeholder with no executable code yet — nothing to probe.",
  };
}

// ── Registry ───────────────────────────────────────────────────────────────

type SelfTestFn = () => Promise<MinionSelfTestResult> | MinionSelfTestResult;

export const MINION_SELF_TESTS: Record<string, SelfTestFn> = {
  aldo: aldoSelfTest,
  carlo: carloSelfTest,
  dino: dinoSelfTest,
  enzo: enzoSelfTest,
  bruno: brunoSelfTest,
};

export async function runMinionSelfTest(minionId: string): Promise<MinionSelfTestResult> {
  const fn = MINION_SELF_TESTS[minionId];
  if (!fn) {
    return {
      minionId,
      status: "fail",
      durationMs: 0,
      message: `No self-test registered for minion "${minionId}".`,
    };
  }
  return await fn();
}
