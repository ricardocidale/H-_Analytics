/**
 * smoke-producer.ts
 *
 * Data-path smoke test for the U10 slide-factory deck producer. Exercises
 * U1 (build-factory-payload), U2 (factory-token), and U4
 * (buildLbPayloadFromFactoryRun) in-process against the real Neon database,
 * without HTTP, Playwright, or R2.
 *
 * What it does:
 *   1. Inserts a synthetic `slide_factory_runs` row with status='complete',
 *      4 real property IDs assigned, and a fully populated `luccaDraft`
 *      covering every slide's slot keys.
 *   2. Reads the run back via `getSlideFactoryRunById`.
 *   3. Calls `buildFactoryPayload(run)` and asserts the DeckPayloadV2 shape
 *      (schemaVersion + slide1..slide6 sub-objects).
 *   4. Calls `buildLbPayloadFromFactoryRun(run)` and asserts an LbSlidePayload
 *      with 6 slides whose `deckPayloadV2` is the same V2 reference.
 *   5. Round-trips a factory token via `signFactoryDeckToken` /
 *      `verifyFactoryDeckToken` to confirm signature + runId integrity.
 *   6. Deletes the synthetic run.
 *
 * What it does NOT cover:
 *   - Franco's Playwright render (needs portal vite + shared port-80 proxy).
 *   - R2 upload (covered by Franco-only paths; off-the-shelf S3 client).
 *   - Marco's tool-loop dispatch (orchestration, not data path).
 *
 * Run:
 *   cd artifacts/api-server && ./node_modules/.bin/tsx \
 *     --tsconfig tsconfig.json src/scripts/smoke-producer.ts
 */

import { db, slideFactoryRuns, type LuccaSlotDraft } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildFactoryPayload } from "../slides/build-factory-payload";
import { buildLbPayloadFromFactoryRun } from "../slides/build-lb-payload";
import {
  signFactoryDeckToken,
  verifyFactoryDeckToken,
} from "../slides/factory-token";
import { getSlideFactoryRunById } from "../storage/slide-factory-runs";

const SMOKE_USER_ID = 1; // admin
const SMOKE_PROPERTY_IDS = {
  slide1: 65,
  slide2: 66,
  slide3: 67,
  slide5: 68,
};

/** Total slides in one L+B deck — used to assert buildLbPayloadFromFactoryRun output. */
const SMOKE_TOTAL_SLIDES = 6;

/** Synthetic pixel-diff percentages for the approved agentResults fixture. */
const SMOKE_PIXEL_DIFFS = {
  slide1: 0.5,
  slide2: 0.6,
  slide3: 0.4,
  slide4: 0.3,
  slide5: 0.7,
  slide6: 0.4,
};

const ISO_NOW = new Date().toISOString();
const draft = (value: string): LuccaSlotDraft => ({
  value,
  approved: true,
  approvedAt: ISO_NOW,
  source: "lucca",
});

const SMOKE_LUCCA_DRAFT: Record<string, LuccaSlotDraft> = {
  // Slide 1 — header + vision bullets
  "slide1.headerSubtitle": draft("U10 producer smoke — synthetic run"),
  "slide1.visionBullets": draft(
    "• Wholesale repositioning toward US wellness retreat\n" +
      "• Vertically-integrated F&B program\n" +
      "• Brand-led demand pipeline through partnered creators",
  ),
  // Slide 2 — operational + revenue + programming
  "slide2.operationalModelText": draft(
    "Owner-operator model with a thin GM layer; central marketing.",
  ),
  "slide2.revenueBullet": draft("Mixed-use ADR uplift via guided programming"),
  "slide2.programmingBullet": draft("4 immersive guest tracks per quarter"),
  // Slide 3 — concept + rationale + reasons + closing
  "slide3.conceptParagraph": draft(
    "A modern wellness lodge anchored on craft food and forest immersion.",
  ),
  "slide3.marketRationale": draft(
    "Catskills demand exceeds supply for sub-$600 wellness stays.",
  ),
  "slide3.reasons": draft(
    JSON.stringify([
      { label: "Demand", detail: "Two-hour drive from NYC; $200B+ wellness TAM" },
      { label: "Supply", detail: "Less than 1.5K boutique keys in 90-min radius" },
      { label: "Operator fit", detail: "Aligned with Norfolk wellness portfolio" },
    ]),
  ),
  "slide3.closingLine": draft("A repeat-stay engine, not a one-night stop."),
  // Slide 4 — section subtitle (portfolio rollup)
  "slide4.sectionSubtitle": draft("Belleayre + Loch Sheldrake assemblage"),
  // Slide 5 — transformation
  "slide5.transformationDescription": draft(
    "Re-skin the existing 1980s motor-lodge into a contemporary wellness retreat.",
  ),
  "slide5.transformationRows": draft(
    JSON.stringify([
      { feature: "Lobby", existing: "Drop ceiling + carpet", proposed: "Vaulted timber + flagstone" },
      { feature: "F&B", existing: "Vending + microwave", proposed: "Open kitchen + tasting menu" },
      { feature: "Spa", existing: "—", proposed: "Two treatment rooms + sauna ring" },
      { feature: "Rooms", existing: "Twin double, dated furnishings", proposed: "King + private balcony" },
    ]),
  ),
  // Slide 6 — disclaimer
  "slide6.disclaimer": draft(
    "Projections are illustrative; actuals depend on entitlement and cost cycles.",
  ),
};

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

async function main() {
  const checks: CheckResult[] = [];
  let createdRunId: number | null = null;

  try {
    console.log("─".repeat(72));
    console.log("U10 deck-producer data-path smoke");
    console.log("─".repeat(72));

    // 1. Insert synthetic run ───────────────────────────────────────────────
    const [inserted] = await db
      .insert(slideFactoryRuns)
      .values({
        userId: SMOKE_USER_ID,
        status: "complete",
        slide1PropertyId: SMOKE_PROPERTY_IDS.slide1,
        slide2PropertyId: SMOKE_PROPERTY_IDS.slide2,
        slide3PropertyId: SMOKE_PROPERTY_IDS.slide3,
        slide5PropertyId: SMOKE_PROPERTY_IDS.slide5,
        luccaDraft: SMOKE_LUCCA_DRAFT,
        agentResults: {
          slide1: { status: "approved", pixelDiffPct: SMOKE_PIXEL_DIFFS.slide1, mayaVerdict: "ok", mayaNotes: null, approvedAt: ISO_NOW, errorMessage: null },
          slide2: { status: "approved", pixelDiffPct: SMOKE_PIXEL_DIFFS.slide2, mayaVerdict: "ok", mayaNotes: null, approvedAt: ISO_NOW, errorMessage: null },
          slide3: { status: "approved", pixelDiffPct: SMOKE_PIXEL_DIFFS.slide3, mayaVerdict: "ok", mayaNotes: null, approvedAt: ISO_NOW, errorMessage: null },
          slide4: { status: "approved", pixelDiffPct: SMOKE_PIXEL_DIFFS.slide4, mayaVerdict: "ok", mayaNotes: null, approvedAt: ISO_NOW, errorMessage: null },
          slide5: { status: "approved", pixelDiffPct: SMOKE_PIXEL_DIFFS.slide5, mayaVerdict: "ok", mayaNotes: null, approvedAt: ISO_NOW, errorMessage: null },
          slide6: { status: "approved", pixelDiffPct: SMOKE_PIXEL_DIFFS.slide6, mayaVerdict: "ok", mayaNotes: null, approvedAt: ISO_NOW, errorMessage: null },
        },
      })
      .returning({ id: slideFactoryRuns.id });

    createdRunId = inserted.id;
    console.log(`[1/5] Inserted synthetic run id=${createdRunId}`);

    // 2. Read it back ───────────────────────────────────────────────────────
    const run = await getSlideFactoryRunById(createdRunId);
    if (!run) throw new Error(`getSlideFactoryRunById(${createdRunId}) returned null`);
    checks.push({
      name: "getSlideFactoryRunById round-trip",
      pass: run.status === "complete" && run.id === createdRunId,
      detail: `status=${run.status}`,
    });
    console.log(`[2/5] Read back: status=${run.status}, slide1..5=[${run.slide1PropertyId}, ${run.slide2PropertyId}, ${run.slide3PropertyId}, ${run.slide5PropertyId}]`);

    // 3. buildFactoryPayload ────────────────────────────────────────────────
    const v2 = buildFactoryPayload(run);
    const slide1Ok = !!v2.slide1?.headerSubtitle && (v2.slide1?.visionBullets?.length ?? 0) === 3;
    const slide3Ok = (v2.slide3?.reasons?.length ?? 0) === 3;
    const slide5Ok = (v2.slide5?.transformationRows?.length ?? 0) === 4;
    checks.push({
      name: "buildFactoryPayload schema",
      pass: typeof v2.schemaVersion === "string" && slide1Ok && slide3Ok && slide5Ok,
      detail: `schemaVersion=${v2.schemaVersion}, bullets=${v2.slide1?.visionBullets?.length}, reasons=${v2.slide3?.reasons?.length}, rows=${v2.slide5?.transformationRows?.length}`,
    });
    console.log(`[3/5] buildFactoryPayload — schemaVersion=${v2.schemaVersion}`);

    // 4. buildLbPayloadFromFactoryRun (U4 — full composite payload) ─────────
    const lb = await buildLbPayloadFromFactoryRun(run);
    const allSlidesShareSameV2 = lb.slides.every((s) => s.deckPayloadV2 === lb.slides[0].deckPayloadV2);
    checks.push({
      name: "buildLbPayloadFromFactoryRun shape",
      pass:
        lb.slides.length === SMOKE_TOTAL_SLIDES &&
        allSlidesShareSameV2 &&
        lb.config.slide1PropertyId === SMOKE_PROPERTY_IDS.slide1,
      detail: `slides=${lb.slides.length}, sharedV2=${allSlidesShareSameV2}, propertyIds=${JSON.stringify(lb.config)}`,
    });
    console.log(`[4/5] buildLbPayloadFromFactoryRun — ${lb.slides.length} slides composed`);

    // 5. Token round-trip ───────────────────────────────────────────────────
    process.env.TOKEN_ENCRYPTION_KEY ??= "smoke-test-fallback-key-not-used-in-prod";
    const { token, expiresAtMs } = signFactoryDeckToken(createdRunId);
    const verified = verifyFactoryDeckToken(token);
    const tokenOk = verified.ok && verified.runId === createdRunId && verified.expiresAtMs === expiresAtMs;
    checks.push({
      name: "factory-token sign/verify round-trip",
      pass: tokenOk,
      detail: tokenOk
        ? `runId=${(verified as { runId: number }).runId}, ttl=${expiresAtMs - Date.now()}ms`
        : `verifier reason=${(verified as { reason?: string }).reason}`,
    });
    console.log(`[5/5] Token round-trip — ${tokenOk ? "OK" : "FAIL"}`);

    // Wrong-runId rejection
    const tamperedToken = token.replace(/^factory\.\d+\./, `factory.${createdRunId + 1}.`);
    const tampered = verifyFactoryDeckToken(tamperedToken);
    checks.push({
      name: "factory-token rejects wrong runId",
      pass: !tampered.ok && (tampered as { reason?: string }).reason === "invalid-signature",
      detail: tampered.ok ? "ACCEPTED tampered token (BUG)" : `rejected reason=${(tampered as { reason?: string }).reason}`,
    });
  } catch (err) {
    console.error("\nSMOKE FAILED with thrown error:");
    console.error(err);
    checks.push({
      name: "no thrown errors",
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    // Cleanup
    if (createdRunId !== null) {
      try {
        await db.delete(slideFactoryRuns).where(eq(slideFactoryRuns.id, createdRunId));
        console.log(`\nCleaned up synthetic run id=${createdRunId}`);
      } catch (cleanupErr) {
        console.error(`Cleanup FAILED for run id=${createdRunId}:`, cleanupErr);
      }
    }
  }

  // Summary ─────────────────────────────────────────────────────────────────
  console.log("\n─ Summary ".padEnd(72, "─"));
  let pass = 0;
  for (const c of checks) {
    const tag = c.pass ? "PASS" : "FAIL";
    console.log(`  [${tag}] ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    if (c.pass) pass += 1;
  }
  const total = checks.length;
  console.log("─".repeat(72));
  console.log(`${pass}/${total} checks passed`);
  process.exit(pass === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Top-level rejection:", err);
  process.exit(2);
});
