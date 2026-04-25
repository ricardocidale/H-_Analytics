/**
 * Pre-Vercel-cutover reconciliation (Task #519, April 25, 2026 — Watchlist W7).
 *
 * The R2 cutover (`STORAGE_PROVIDER=r2`) flipped the runtime adapter, but it
 * did NOT migrate any object content. This script proves — for every URL the
 * database still references — that the byte source the URL resolves to is
 * present *somewhere we serve from after Vercel cutover*. There are exactly
 * three valid sinks post-cutover:
 *
 *   1. `/objects/<key>`  → must exist in R2 (`h-analysis` bucket).
 *   2. `/api/media/<filename>`  → must exist as a `media_assets` row in Neon.
 *   3. `/api/property-photos/<id>/image`  → must exist as a `property_photos`
 *      row whose `image_data` is non-null OR whose `image_url` resolves to
 *      one of the other two sinks.
 *
 * Anything that points at the legacy Replit Object Storage sidecar
 * (`storage.googleapis.com`, `*.replit.dev/objects/...`, `*.repl.co/objects/...`,
 * `*.replit.app/objects/...`, or `objectstorage.replit.com`) is a 404 risk
 * the moment we cut traffic to Vercel — the sidecar is unreachable from there.
 *
 * Behaviour
 * ---------
 *   Default (read-only):
 *     - Scan every text/varchar/jsonb column in `public` for URL-shaped values.
 *     - For each matching URL, verify the byte source above.
 *     - Print a summary; exit 1 if anything is missing or hosted on the legacy
 *       sidecar.
 *
 *   With `--copy-from-replit-bucket`:
 *     - For every `/objects/<key>` URL that is missing from R2, fetch the
 *       object from the legacy Replit bucket via the existing
 *       `ReplitStorageProvider`, upload to R2 at the same key, and re-verify.
 *     - Useful only if the legacy sidecar is still reachable in the current
 *       environment AND the DB still has `/objects/...` URLs (it currently
 *       does not — this branch is forward-defence).
 *
 *   With `--rewrite-legacy-hosts`:
 *     - For any URL of the form `https://<replit-host>/objects/<key>`,
 *       rewrite the DB cell to the relative `/objects/<key>` form so the
 *       storage adapter resolves it via R2. Idempotent.
 *
 * Re-runnable. Read-only by default.
 */
import { pool } from "../server/db";
import { S3StorageProvider } from "../server/providers/storage/s3-storage";

type ColumnRef = { table: string; column: string; dataType: string };
type UrlRef = {
  table: string;
  column: string;
  dataType: string;
  pk: string | number;
  url: string;
};
type PhotoServeRecord = { hasData: boolean; imageUrl: string | null };

// Replit-hosted URLs use multi-label hostnames in the wild
// (e.g. `workspace.user.repl.co`, `<repl>.<user>.replit.dev`,
// `<deployment-id>--<user>.replit.app`), so the subdomain portion must allow
// one OR MORE dot-separated labels — `(?:[a-z0-9-]+\.)+` — not a single label.
const REPLIT_HOST_RE =
  /(storage\.googleapis\.com|objectstorage\.replit\.com|(?:[a-z0-9-]+\.)+(?:replit\.dev|repl\.co|replit\.app))/i;
const URL_RE =
  /(\/objects\/[^"'\s)<>]+|\/api\/media\/[^"'\s)<>]+|\/api\/property-photos\/[0-9]+\/image|https?:\/\/[^"'\s)<>]*?\/objects\/[^"'\s)<>]+|https?:\/\/storage\.googleapis\.com\/[^"'\s)<>]+)/g;

function log(msg: string) {
  process.stdout.write(msg + "\n");
}

function unique<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

async function listCandidateColumns(): Promise<ColumnRef[]> {
  const { rows } = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying', 'jsonb')`,
  );
  return rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    dataType: r.data_type,
  }));
}

async function getPrimaryKeyColumn(table: string): Promise<string | null> {
  const { rows } = await pool.query<{ attname: string }>(
    `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = $1::regclass
        AND i.indisprimary
      LIMIT 1`,
    [`public."${table}"`],
  );
  return rows[0]?.attname ?? null;
}

async function scanColumn(col: ColumnRef): Promise<UrlRef[]> {
  const pk = await getPrimaryKeyColumn(col.table);
  if (!pk) return []; // tables without a single-column PK are extremely rare here

  // Cast jsonb → text so the regex applies uniformly.
  const valueExpr =
    col.dataType === "jsonb" ? `("${col.column}")::text` : `"${col.column}"`;

  const filter = `(${valueExpr} ~ '/objects/'
              OR ${valueExpr} ~ '/api/media/'
              OR ${valueExpr} ~ '/api/property-photos/[0-9]+/image'
              OR ${valueExpr} ~ 'storage\\.googleapis\\.com'
              OR ${valueExpr} ~ '\\.(replit\\.dev|repl\\.co|replit\\.app)/'
              OR ${valueExpr} ~ 'objectstorage\\.replit\\.com')`;

  let rows: Array<{ pk: string | number; v: string }> = [];
  try {
    const result = await pool.query<{ pk: string | number; v: string }>(
      `SELECT "${pk}" AS pk, ${valueExpr} AS v
         FROM "${col.table}"
        WHERE ${valueExpr} IS NOT NULL AND ${filter}`,
    );
    rows = result.rows;
  } catch (err) {
    // Some tables have weird permissions or computed columns; skip noisily.
    log(
      `  ! skip ${col.table}.${col.column}: ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }

  const refs: UrlRef[] = [];
  for (const row of rows) {
    const matches = row.v?.matchAll(URL_RE);
    if (!matches) continue;
    for (const m of matches) {
      refs.push({
        table: col.table,
        column: col.column,
        dataType: col.dataType,
        pk: row.pk,
        url: m[0],
      });
    }
  }
  return refs;
}

type Verdict = "ok" | "missing-r2" | "missing-media" | "missing-photo-row" | "legacy-host";

async function verifyUrl(
  url: string,
  r2: S3StorageProvider,
  mediaAssetSet: Set<string>,
  propertyPhotos: Map<number, PhotoServeRecord>,
  depth = 0,
): Promise<Verdict> {
  if (REPLIT_HOST_RE.test(url) && /\/objects\//.test(url)) {
    return "legacy-host";
  }
  if (url.startsWith("/api/media/")) {
    const filename = url.slice("/api/media/".length).split(/[?#]/)[0];
    return mediaAssetSet.has(filename) ? "ok" : "missing-media";
  }
  if (/^\/api\/property-photos\/\d+\/image/.test(url)) {
    const id = Number(url.match(/property-photos\/(\d+)/)?.[1]);
    const photo = propertyPhotos.get(id);
    if (!photo) return "missing-photo-row";
    // The endpoint streams bytes only when imageData is non-null OR imageUrl
    // resolves to a serveable sink. Mirror that policy here so we don't report
    // OK for a photo row whose image_url has rotted.
    if (photo.hasData) return "ok";
    if (!photo.imageUrl) return "missing-photo-row";
    if (depth >= 3) return "missing-photo-row"; // belt-and-braces against cycles
    return verifyUrl(photo.imageUrl, r2, mediaAssetSet, propertyPhotos, depth + 1);
  }
  if (url.startsWith("/objects/")) {
    // Mirror the serving endpoint policy (property-photos.ts L103): only
    // relative `/objects/<key>` URLs are valid R2-served references. Strip
    // any query string / fragment before hitting R2 so URLs like
    // `/objects/foo.png?v=2` resolve to the underlying key.
    const key = url.slice("/objects/".length).split(/[?#]/)[0];
    try {
      const exists = await r2.exists(key);
      return exists ? "ok" : "missing-r2";
    } catch {
      return "missing-r2";
    }
  }
  if (REPLIT_HOST_RE.test(url)) {
    return "legacy-host";
  }
  // Absolute http(s) URL containing /objects/ on some other host: not a
  // Vercel-served sink, but we can't verify it from here either. Treat as
  // legacy-host so it surfaces in the report rather than silently passing.
  if (/^https?:\/\/.+\/objects\//.test(url)) {
    return "legacy-host";
  }
  return "ok"; // unknown but not a sink-breaking pattern
}

async function loadMediaAssetSet(): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>(
    `SELECT filename FROM media_assets`,
  );
  return new Set(rows.map((r) => r.filename));
}

async function loadPropertyPhotoIndex(): Promise<Map<number, PhotoServeRecord>> {
  const { rows } = await pool.query<{
    id: number;
    has_data: boolean;
    image_url: string | null;
  }>(
    `SELECT id,
            (image_data IS NOT NULL) AS has_data,
            image_url
       FROM property_photos`,
  );
  const out = new Map<number, PhotoServeRecord>();
  for (const r of rows) {
    out.set(Number(r.id), { hasData: r.has_data, imageUrl: r.image_url });
  }
  return out;
}

async function copyLegacyToR2(
  refs: UrlRef[],
  r2: S3StorageProvider,
): Promise<Array<{ ref: UrlRef; ok: boolean; reason: string }>> {
  // Lazy import — only load the legacy adapter if we actually need it.
  const { ReplitStorageProvider } = await import(
    "../server/providers/storage/replit-storage"
  );
  const legacy = new ReplitStorageProvider();

  const out: Array<{ ref: UrlRef; ok: boolean; reason: string }> = [];
  for (const ref of refs) {
    // Strip protocol/host and the `/objects/` prefix, then drop any query
    // string or fragment so the legacy fetch and the R2 put both target the
    // same canonical key (parity with verifyUrl()).
    const key = ref.url
      .replace(/^https?:\/\/[^/]+/, "")
      .replace(/^\/objects\//, "")
      .split(/[?#]/)[0];
    try {
      log(`  copy: ${ref.table}.${ref.column}#${ref.pk}  /objects/${key}`);
      const { buffer, contentType } = await legacy.downloadBuffer(`/objects/${key}`);
      await r2.uploadBuffer(key, buffer, contentType);
      const verified = await r2.exists(key);
      out.push({
        ref,
        ok: verified,
        reason: verified ? "copied" : "uploaded but exists() returned false",
      });
    } catch (err) {
      out.push({
        ref,
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

// Strictly recognise the only legacy URL shape we know how to rewrite safely:
// a Replit-hosted absolute URL whose path begins with `/objects/`. Anything
// else (e.g. `storage.googleapis.com/<bucket>/<key>` GCS-direct URLs, or
// third-party absolute `/objects/` URLs) cannot be mechanically rewritten —
// the key on the R2 side would have to be derived through a host-specific
// mapping the script does not have. Returns the rewrite target when the URL
// matches the Replit-host + `/objects/` shape, or `null` otherwise.
// Matches the same Replit-host shape as REPLIT_HOST_RE (one OR MORE
// dot-separated subdomain labels) followed by a `/objects/<key>` path. Capture
// group 1 is the bare key (everything after `/objects/`), preserving any
// query string / fragment so the relative form keeps the exact byte address.
const REWRITABLE_LEGACY_RE =
  /^https?:\/\/(?:[a-z0-9-]+\.)+(?:replit\.dev|repl\.co|replit\.app)\/objects\/(.+)$/i;

function tryRelativeObjectsUrl(url: string): string | null {
  const m = url.match(REWRITABLE_LEGACY_RE);
  if (!m) return null;
  // Preserve any query string / fragment as-is so the relative form keeps the
  // exact same byte address; only the host/scheme are dropped.
  return "/objects/" + m[1];
}

async function rewriteLegacyHostUrl(ref: UrlRef): Promise<"rewritten" | "skipped"> {
  const newUrl = tryRelativeObjectsUrl(ref.url);
  if (newUrl === null) return "skipped";
  const pkCol = await getPrimaryKeyColumn(ref.table);
  if (!pkCol) return "skipped";
  // REPLACE() returns text. For text/varchar columns we assign it back
  // directly; for jsonb columns we must cast back to jsonb so the assignment
  // type-checks and the resulting structure remains valid JSON. (REPLACE on
  // the serialised text form preserves JSON validity here because both the
  // old and new values are valid JSON strings of the same shape.)
  const cast = ref.dataType === "jsonb" ? "::jsonb" : "";
  await pool.query(
    `UPDATE "${ref.table}"
        SET "${ref.column}" = REPLACE("${ref.column}"::text, $1, $2)${cast}
      WHERE "${pkCol}" = $3`,
    [ref.url, newUrl, ref.pk],
  );
  return "rewritten";
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const doCopy = args.has("--copy-from-replit-bucket");
  const doRewrite = args.has("--rewrite-legacy-hosts");

  log("=== R2 cutover reconciliation (Task #519, W7) ===");
  log(`STORAGE_PROVIDER: ${process.env.STORAGE_PROVIDER || "(unset)"}`);
  log(`R2_BUCKET:        ${process.env.R2_BUCKET || process.env.S3_BUCKET || "(unset)"}`);
  log(`mode:             ${doCopy ? "COPY-FROM-LEGACY " : ""}${doRewrite ? "REWRITE-LEGACY-HOSTS " : ""}${!doCopy && !doRewrite ? "READ-ONLY" : ""}`);
  log("");

  const r2 = new S3StorageProvider();

  log("[1/4] Loading content-source indexes...");
  const [mediaAssets, photos] = await Promise.all([
    loadMediaAssetSet(),
    loadPropertyPhotoIndex(),
  ]);
  log(`      media_assets:    ${mediaAssets.size} filenames`);
  log(`      property_photos: ${photos.size} rows`);

  const verifyOnce = async (
    label: string,
    mediaAssetsArg: Set<string>,
    photosArg: Map<number, PhotoServeRecord>,
    verbose: boolean,
  ): Promise<Record<Verdict, UrlRef[]>> => {
    if (verbose) {
      log(`${label} Scanning all text/varchar/jsonb columns for URL refs...`);
    } else {
      log(`${label} Re-scanning DB and re-verifying after mutations...`);
    }
    const cols = await listCandidateColumns();
    if (verbose) log(`      ${cols.length} candidate columns`);

    const allRefs: UrlRef[] = [];
    for (const col of cols) {
      const refs = await scanColumn(col);
      if (refs.length) {
        if (verbose) log(`      ${col.table}.${col.column}: ${refs.length} URL ref(s)`);
        allRefs.push(...refs);
      }
    }
    const distinctRefs = unique(allRefs, (r) => `${r.table}|${r.column}|${r.pk}|${r.url}`);
    if (verbose) {
      log(`      total: ${allRefs.length} (${distinctRefs.length} distinct row/url pairs)`);
    }

    const buckets: Record<Verdict, UrlRef[]> = {
      ok: [],
      "missing-r2": [],
      "missing-media": [],
      "missing-photo-row": [],
      "legacy-host": [],
    };
    for (const ref of distinctRefs) {
      const verdict = await verifyUrl(ref.url, r2, mediaAssetsArg, photosArg);
      buckets[verdict].push(ref);
    }

    log("");
    log(`      OK                : ${buckets.ok.length}`);
    log(`      MISSING in R2     : ${buckets["missing-r2"].length}`);
    log(`      MISSING media row : ${buckets["missing-media"].length}`);
    log(`      MISSING photo row : ${buckets["missing-photo-row"].length}`);
    log(`      LEGACY host (404 after cutover): ${buckets["legacy-host"].length}`);

    for (const v of ["missing-r2", "missing-media", "missing-photo-row", "legacy-host"] as const) {
      if (!buckets[v].length) continue;
      log(`\n  ── ${v.toUpperCase()} ──`);
      for (const ref of buckets[v].slice(0, 50)) {
        log(`    ${ref.table}.${ref.column}#${ref.pk}  →  ${ref.url}`);
      }
      if (buckets[v].length > 50) log(`    ... and ${buckets[v].length - 50} more`);
    }
    return buckets;
  };

  let buckets = await verifyOnce("[2/4]", mediaAssets, photos, true);

  let exitCode = 0;
  let mutated = false;

  if (doRewrite && buckets["legacy-host"].length) {
    log("\n[REWRITE] Rewriting legacy-host URLs to relative /objects/<key> form...");
    let rewroteCount = 0;
    let skippedCount = 0;
    for (const ref of buckets["legacy-host"]) {
      try {
        const result = await rewriteLegacyHostUrl(ref);
        if (result === "rewritten") {
          mutated = true;
          rewroteCount += 1;
          log(`  rewrote ${ref.table}.${ref.column}#${ref.pk}`);
        } else {
          // Non-rewritable shape (e.g. storage.googleapis.com/<bucket>/<key>
          // GCS-direct URL, or absolute non-Replit /objects/ URL). The
          // post-cutover key would have to be derived through a host-specific
          // mapping the script does not have, so refuse to mutate. The
          // operator must inspect and remediate manually; the re-verify pass
          // will keep this in `legacy-host` and exit non-zero.
          skippedCount += 1;
          log(`  SKIPPED (non-rewritable shape) ${ref.table}.${ref.column}#${ref.pk}: ${ref.url}`);
        }
      } catch (err) {
        log(`  FAILED ${ref.table}.${ref.column}#${ref.pk}: ${err instanceof Error ? err.message : err}`);
        exitCode = 1;
      }
    }
    log(`  ${rewroteCount} rewritten, ${skippedCount} skipped (require manual remediation)`);
  }

  // If we just rewrote any legacy-host URLs to relative `/objects/<key>`
  // form, those keys MAY themselves be missing in R2 (the host was the only
  // thing wrong; the underlying object never made it across). Re-classify
  // before copy so a single invocation with both flags is fully self-healing
  // — otherwise the operator would have to re-run to sweep the newly-exposed
  // missing-r2 keys. (The final post-mutation re-verify below is unaffected.)
  if (doCopy && doRewrite && mutated) {
    log("\n[RE-CLASSIFY] Re-scanning post-rewrite so COPY sees the fresh missing-r2 bucket...");
    const [mediaAssetsMid, photosMid] = await Promise.all([
      loadMediaAssetSet(),
      loadPropertyPhotoIndex(),
    ]);
    buckets = await verifyOnce("[RE-CLASSIFY]", mediaAssetsMid, photosMid, false);
  }

  if (doCopy && buckets["missing-r2"].length) {
    log("\n[COPY] Copying missing keys from legacy Replit bucket to R2...");
    const results = await copyLegacyToR2(buckets["missing-r2"], r2);
    const failed = results.filter((r) => !r.ok);
    if (results.length - failed.length > 0) mutated = true;
    log(`  ${results.length - failed.length} copied, ${failed.length} failed`);
    for (const f of failed) {
      log(`    FAIL ${f.ref.table}.${f.ref.column}#${f.ref.pk} ${f.ref.url}: ${f.reason}`);
    }
    if (failed.length) exitCode = 1;
  }

  // Re-verify after any mutations so a single invocation is self-validating
  // and the final exit code reflects whether the post-cutover sinks resolve
  // *now*, not what they looked like before remediation.
  if (mutated) {
    log("\n[RE-VERIFY] Re-scanning DB + R2 after mutations...");
    // Reload indexes — rewrites may have changed property_photos.image_url.
    const [mediaAssets2, photos2] = await Promise.all([
      loadMediaAssetSet(),
      loadPropertyPhotoIndex(),
    ]);
    buckets = await verifyOnce("[RE-VERIFY]", mediaAssets2, photos2, false);
  }

  log("\n[4/4] Done.");
  log("");
  const totalProblems =
    buckets["missing-r2"].length +
    buckets["missing-media"].length +
    buckets["missing-photo-row"].length +
    buckets["legacy-host"].length;
  if (totalProblems === 0 && exitCode === 0) {
    log("ALL CLEAR — every DB-referenced object resolves post-cutover.");
  } else {
    log(
      `${totalProblems} unresolved reference(s) remain` +
        (doCopy || doRewrite ? " after remediation." : ". Re-run with --copy-from-replit-bucket and/or --rewrite-legacy-hosts to remediate."),
    );
    // Any unresolved reference — in any mode — is a non-zero exit. This is
    // what the pre-deploy gate keys off of.
    if (totalProblems > 0) exitCode = 1;
  }

  await pool.end();
  process.exit(exitCode);
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
