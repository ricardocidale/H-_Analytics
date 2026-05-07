/**
 * upload-brand-assets.ts
 *
 * Uploads the three canonical H+ / L+B brand assets to R2.
 *
 * Source files (attached_assets/canonical/brand/):
 *   h_logo_enhanced_1775405767509.png
 *   H_Logo_Glass_No_Backgrond_Enhanced_Square_1775582100563.png
 *   og-banner.png
 *
 * R2 destination keys (per lib/shared/src/constants-brand.ts):
 *   canonical/brand/logos/h_logo_enhanced_1775405767509.png
 *   canonical/brand/logos/H_Logo_Glass_No_Backgrond_Enhanced_Square_1775582100563.png
 *   canonical/brand/og/og-banner.png
 *
 * Idempotent — safe to re-run. PutObject always overwrites with the same bytes.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run upload:brand-assets
 *
 * Requires: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID
 */

import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
// R2 keys mirror lib/shared/src/constants-brand.ts — keep in sync.
const R2_BRAND_KEY_H_PLUS_ENHANCED =
  "canonical/brand/logos/h_logo_enhanced_1775405767509.png";
const R2_BRAND_KEY_H_PLUS_GLASS =
  "canonical/brand/logos/H_Logo_Glass_No_Backgrond_Enhanced_Square_1775582100563.png";
const R2_BRAND_KEY_OG_BANNER = "canonical/brand/og/og-banner.png";

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
const BRAND_SOURCE_DIR = path.join(REPO_ROOT, "attached_assets", "canonical", "brand");

const BRAND_FILES: { filename: string; r2Key: string; contentType: string }[] = [
  {
    filename: "h_logo_enhanced_1775405767509.png",
    r2Key: R2_BRAND_KEY_H_PLUS_ENHANCED,
    contentType: "image/png",
  },
  {
    filename: "H_Logo_Glass_No_Backgrond_Enhanced_Square_1775582100563.png",
    r2Key: R2_BRAND_KEY_H_PLUS_GLASS,
    contentType: "image/png",
  },
  {
    filename: "og-banner.png",
    r2Key: R2_BRAND_KEY_OG_BANNER,
    contentType: "image/png",
  },
];

// ── Upload helper ──────────────────────────────────────────────────────────

async function upload(r2Key: string, filePath: string, contentType: string): Promise<void> {
  const body = fs.readFileSync(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: body,
      ContentType: contentType,
    }),
  );
  console.log(`  ✓ ${path.basename(filePath)}  →  ${r2Key}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Uploading canonical brand assets to R2…\n");

  let uploaded = 0;
  let failed = 0;

  for (const { filename, r2Key, contentType } of BRAND_FILES) {
    const localPath = path.join(BRAND_SOURCE_DIR, filename);

    if (!fs.existsSync(localPath)) {
      console.error(`  ✗ MISSING: ${localPath}`);
      failed++;
      continue;
    }

    try {
      await upload(r2Key, localPath, contentType);
      uploaded++;
    } catch (err) {
      console.error(`  ✗ FAILED ${filename}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Uploaded: ${uploaded}/${BRAND_FILES.length}  |  Failed: ${failed}`);

  if (failed > 0) {
    console.error("\nSome uploads failed — fix errors above and re-run.");
    process.exit(1);
  }

  console.log("\nAll canonical brand assets are live in R2.");
  console.log("R2 keys are defined in lib/shared/src/constants-brand.ts");
}

main().catch((err) => {
  console.error("Upload script failed:", err);
  process.exit(1);
});
