/**
 * upload-canonical-pngs.ts
 *
 * Uploads the six pre-rendered canonical slide PNGs directly to R2.
 *
 * Source files (attached_assets/):
 *   L+B_Property_6-Slide_Cannonical_Page_{1..6}_*.png
 *
 * R2 destination keys (per r2-manifest.json):
 *   canonical/lb-6-slide/slides/slide-{1..6}.png
 *
 * These PNGs are the pixel-authoritative reference images for the renderer.
 * Every generated slide is compared against its corresponding canonical PNG
 * to verify layout fidelity before shipping.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run upload:canonical-pngs
 *
 * Requires: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID
 */

import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ── R2 client ──────────────────────────────────────────────────────────────

const bucket = process.env.R2_BUCKET;
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
  console.error("Missing R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

// ── File map: local source → canonical R2 key ──────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname, "../../");

/**
 * Each entry maps a slide number to its source filename in attached_assets/.
 * The filenames include a timestamp suffix that uniquely identifies the upload
 * batch — keeping them verbatim preserves provenance.
 */
const SLIDE_FILES: { slideNum: number; filename: string }[] = [
  { slideNum: 1, filename: "L+B_Property_6-Slide_Cannonical_Page_1_1777868023135.png" },
  { slideNum: 2, filename: "L+B_Property_6-Slide_Cannonical_Page_2_1777868023137.png" },
  { slideNum: 3, filename: "L+B_Property_6-Slide_Cannonical_Page_3_1777868023137.png" },
  { slideNum: 4, filename: "L+B_Property_6-Slide_Cannonical_Page_4_1777868023136.png" },
  { slideNum: 5, filename: "L+B_Property_6-Slide_Cannonical_Page_5_1777868023136.png" },
  { slideNum: 6, filename: "L+B_Property_6-Slide_Cannonical_Page_6_1777868023136.png" },
];

const R2_PREFIX = "canonical/lb-6-slide/slides";

// ── Upload helper ──────────────────────────────────────────────────────────

async function upload(key: string, filePath: string): Promise<void> {
  const body = fs.readFileSync(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/png",
    }),
  );
  console.log(`  ✓ ${path.basename(filePath)}  →  ${key}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Uploading canonical slide PNGs to R2…\n");

  let uploaded = 0;
  let failed = 0;

  for (const { slideNum, filename } of SLIDE_FILES) {
    const localPath = path.join(REPO_ROOT, "attached_assets", filename);
    const r2Key = `${R2_PREFIX}/slide-${slideNum}.png`;

    if (!fs.existsSync(localPath)) {
      console.error(`  ✗ MISSING: ${localPath}`);
      failed++;
      continue;
    }

    try {
      await upload(r2Key, localPath);
      uploaded++;
    } catch (err) {
      console.error(`  ✗ FAILED slide ${slideNum}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Uploaded: ${uploaded}/${SLIDE_FILES.length}  |  Failed: ${failed}`);

  if (failed > 0) {
    console.error("\nSome uploads failed — fix errors above and re-run.");
    process.exit(1);
  }

  console.log("\nAll canonical slide PNGs are live in R2.");
  console.log("R2 keys registered in docs/slide-system/canonical/r2-manifest.json");
}

main().catch((err) => {
  console.error("Upload script failed:", err);
  process.exit(1);
});
