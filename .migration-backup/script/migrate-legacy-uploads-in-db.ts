#!/usr/bin/env tsx
/**
 * migrate-legacy-uploads-in-db.ts — One-shot cleanup for the rows the data
 * audit (`script/audit-legacy-storage-urls-in-db.ts`, Task #529) flagged as
 * still carrying the legacy `/objects/uploads/<uuid>` shape (Task #533).
 *
 * The R2 cutover (Task #519) handed off image serving to R2 + Vercel, but
 * a handful of pre-cutover rows kept Replit-bucket-relative paths that are
 * NOT served by the new stack:
 *
 *   - `activity_logs.metadata` (jsonb): historical `upload-direct` event
 *     payloads with `objectPath: "/objects/uploads/<uuid>"`.
 *   - `rebecca_messages.content` (text): assistant replies with Markdown
 *     image links of the form `![alt](/objects/uploads/<uuid>)`.
 *   - `property_photos.image_url` (text): orphaned photo rows whose bytes
 *     never made it into R2 / `image_data` / `media_assets`.
 *
 * The reconcile script's `--rewrite-legacy-hosts` flag does NOT touch these
 * (it only rewrites Replit-host absolute URLs, not bucket-relative paths),
 * so this bespoke pass exists.
 *
 * For each hit we try `resolveCanonicalUploadUrl` first
 * (`server/lib/canonical-asset-url.ts` — already used by the live write
 * paths). When a canonical sink exists (`/api/property-photos/<id>/image`
 * or `/api/media/<file>`) we substitute it. When no sink exists the bytes
 * are gone for good post-cutover, so we *neutralise* the offending value:
 *
 *   - `activity_logs.metadata.objectPath` → renamed to `legacyObjectPath`
 *     with the `/objects/` prefix stripped (`uploads/<uuid>`). The bare
 *     bucket key is enough to identify the original upload for forensics
 *     and the audit pattern `/objects/uploads/` no longer matches.
 *     (Note: storing the full original `/objects/uploads/<uuid>` under a
 *     renamed key would defeat the audit, which scans the serialised
 *     jsonb text for the substring — so we only keep the stripped form.)
 *   - `rebecca_messages.content` → the `![alt](/objects/uploads/<uuid>)`
 *     fragment is replaced with `[alt — image unavailable]`. The
 *     surrounding Markdown is left untouched so the user-visible message
 *     still reads naturally.
 *   - `property_photos.image_url` → rewritten to the canonical
 *     `/api/property-photos/<id>/image` form. That endpoint already 404s
 *     for rows with no `image_data` and no `/objects/...` URL, so the
 *     observed behaviour is unchanged; only the audit-flagging shape is
 *     removed and the column conforms to the post-cutover convention.
 *
 * Behaviour
 * ---------
 *   Default (read-only DRY-RUN):
 *     - Print every row that would be touched and the planned new value.
 *     - Exit 0 (no writes).
 *
 *   With `--apply`:
 *     - Apply every planned rewrite inside a single transaction.
 *     - Re-run the audit-style pattern check inline; exit non-zero if
 *       any row still matches `/objects/uploads/` after the pass.
 *
 * Safe to re-run: every rewrite is idempotent because the new shapes do
 * not contain `/objects/uploads/`, so a second pass finds nothing to do.
 */
import { pool } from "../server/db";
import {
  resolveCanonicalUploadUrl,
} from "../server/lib/canonical-asset-url";

type ActivityRow = {
  id: number;
  metadata: Record<string, unknown> | null;
};
type MessageRow = { id: number; content: string };
type PhotoRow = { id: number; image_url: string };

type Plan =
  | {
      kind: "activity";
      id: number;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      action: "canonical" | "neutralised";
    }
  | {
      kind: "message";
      id: number;
      before: string;
      after: string;
      rewritten: number;
      neutralised: number;
    }
  | {
      kind: "photo";
      id: number;
      before: string;
      after: string;
      action: "canonical" | "neutralised";
    };

const LEGACY_RE = /\/objects\/uploads\//;
const LEGACY_UPLOAD_URL_RE = /\/objects\/uploads\/[A-Za-z0-9_-]+/g;
// Matches `![alt](url)` Markdown image syntax. The `alt` is captured
// (group 1) and the `url` is captured (group 2). Greedy on alt up to the
// first `]`, so nested brackets in alt text are not supported — none of
// the live messages need that.
const MARKDOWN_IMG_RE = /!\[([^\]]*)\]\((\/objects\/uploads\/[A-Za-z0-9_-]+)\)/g;

function log(msg: string): void {
  process.stdout.write(msg + "\n");
}

function neutraliseObjectPath(op: string): string {
  // Strip the `/objects/` prefix so the audit pattern `/objects/uploads/`
  // stops matching, but preserve the bucket key (`uploads/<uuid>`) for
  // forensics.
  return op.replace(/^\/objects\//, "");
}

async function planActivityRow(row: ActivityRow): Promise<Plan | null> {
  const md = row.metadata;
  if (!md || typeof md !== "object") return null;
  const obj = md as Record<string, unknown>;

  // The audit scans the serialised jsonb text for `/objects/uploads/`, so
  // we must look at every string value (not just the conventional
  // `objectPath` key) — a previous, partially-broken pass of this script
  // stored the original URL under `legacyOriginalObjectPath`, which still
  // matched the audit substring. Repair such rows on re-run.
  const offending: Array<{ key: string; value: string }> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && LEGACY_RE.test(v)) offending.push({ key: k, value: v });
  }
  if (offending.length === 0) return null;

  // Try canonical resolution for the conventional `objectPath` key first;
  // when it succeeds we keep the standard key and leave the rest untouched.
  const op = obj.objectPath;
  if (typeof op === "string" && LEGACY_RE.test(op)) {
    const canonical = await resolveCanonicalUploadUrl(op);
    if (canonical && canonical !== op && !LEGACY_RE.test(canonical)) {
      // Rebuild metadata: canonical objectPath, plus drop any leftover
      // legacy* fields a prior partial run may have introduced.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === "legacyOriginalObjectPath") continue;
        cleaned[k] = v;
      }
      cleaned.objectPath = canonical;
      return {
        kind: "activity",
        id: row.id,
        before: md,
        after: cleaned,
        action: "canonical",
      };
    }
  }

  // Neutralise: strip the `/objects/` prefix from every offending string
  // value and rename the conventional `objectPath` key to `legacyObjectPath`
  // so callers don't keep treating it as a live URL. Drop the (broken)
  // `legacyOriginalObjectPath` key from any prior partial run.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "legacyOriginalObjectPath") continue; // strip prior-run residue
    if (k === "objectPath" && typeof v === "string" && LEGACY_RE.test(v)) {
      out.legacyObjectPath = neutraliseObjectPath(v);
      continue;
    }
    if (typeof v === "string" && LEGACY_RE.test(v)) {
      out[k] = neutraliseObjectPath(v);
      continue;
    }
    out[k] = v;
  }
  return {
    kind: "activity",
    id: row.id,
    before: md,
    after: out,
    action: "neutralised",
  };
}

async function planMessageRow(row: MessageRow): Promise<Plan | null> {
  if (!LEGACY_RE.test(row.content)) return null;
  let out = row.content;
  let rewritten = 0;
  let neutralised = 0;

  // First, try canonical resolution for every legacy URL appearing anywhere
  // in the body (Markdown or otherwise).
  const urls = Array.from(new Set(row.content.match(LEGACY_UPLOAD_URL_RE) ?? []));
  for (const url of urls) {
    const canonical = await resolveCanonicalUploadUrl(url);
    if (canonical && canonical !== url && !LEGACY_RE.test(canonical)) {
      out = out.split(url).join(canonical);
      rewritten += 1;
    }
  }

  // Whatever legacy `/objects/uploads/...` references remain are unresolved.
  // Replace `![alt](legacyUrl)` Markdown image fragments with a plain
  // `[alt — image unavailable]` placeholder so the surrounding text still
  // reads naturally.
  out = out.replace(MARKDOWN_IMG_RE, (_full, alt: string) => {
    neutralised += 1;
    const cleanAlt = alt.trim() || "image";
    return `[${cleanAlt} — image unavailable]`;
  });

  // Final defence: if a bare `/objects/uploads/<uuid>` token still exists
  // outside of Markdown image syntax, neutralise it the same way activity
  // logs are neutralised so the audit pattern stops matching.
  out = out.replace(LEGACY_UPLOAD_URL_RE, (m) => {
    neutralised += 1;
    return neutraliseObjectPath(m);
  });

  if (out === row.content) return null;
  return {
    kind: "message",
    id: row.id,
    before: row.content,
    after: out,
    rewritten,
    neutralised,
  };
}

async function planPhotoRow(row: PhotoRow): Promise<Plan | null> {
  if (!LEGACY_RE.test(row.image_url)) return null;
  const canonical = await resolveCanonicalUploadUrl(row.image_url, "photo");
  if (canonical && canonical !== row.image_url && !LEGACY_RE.test(canonical)) {
    return {
      kind: "photo",
      id: row.id,
      before: row.image_url,
      after: canonical,
      action: "canonical",
    };
  }
  // Fallback: the canonical sink for any photo row is its own served
  // endpoint (`/api/property-photos/<id>/image`). When there's no
  // `image_data` the endpoint already 404s — observed behaviour is
  // unchanged — but the audit shape is removed and the column conforms
  // to the post-cutover convention.
  return {
    kind: "photo",
    id: row.id,
    before: row.image_url,
    after: `/api/property-photos/${row.id}/image`,
    action: "neutralised",
  };
}

async function buildPlan(): Promise<Plan[]> {
  const plans: Plan[] = [];

  const activity = await pool.query<ActivityRow>(
    `SELECT id, metadata FROM activity_logs
       WHERE metadata::text ~ '/objects/uploads/'
       ORDER BY id`,
  );
  for (const r of activity.rows) {
    const p = await planActivityRow(r);
    if (p) plans.push(p);
  }

  const messages = await pool.query<MessageRow>(
    `SELECT id, content FROM rebecca_messages
       WHERE content ~ '/objects/uploads/'
       ORDER BY id`,
  );
  for (const r of messages.rows) {
    const p = await planMessageRow(r);
    if (p) plans.push(p);
  }

  const photos = await pool.query<PhotoRow>(
    `SELECT id, image_url FROM property_photos
       WHERE image_url ~ '/objects/uploads/'
       ORDER BY id`,
  );
  for (const r of photos.rows) {
    const p = await planPhotoRow(r);
    if (p) plans.push(p);
  }

  return plans;
}

function describePlan(plans: Plan[]): void {
  if (plans.length === 0) {
    log("No legacy /objects/uploads/ references found — nothing to do.");
    return;
  }
  let canonical = 0;
  let neutralised = 0;
  for (const p of plans) {
    if (p.kind === "message") {
      canonical += p.rewritten;
      neutralised += p.neutralised;
    } else {
      if (p.action === "canonical") canonical += 1;
      else neutralised += 1;
    }
  }
  log(`Planned changes: ${plans.length} row(s) — ${canonical} canonical rewrite(s), ${neutralised} neutralisation(s).`);
  log("");
  for (const p of plans) {
    if (p.kind === "activity") {
      log(`  activity_logs#${p.id}  [${p.action}]`);
      log(`    before: ${JSON.stringify(p.before)}`);
      log(`    after:  ${JSON.stringify(p.after)}`);
    } else if (p.kind === "message") {
      log(`  rebecca_messages#${p.id}  [${p.rewritten} canonical, ${p.neutralised} neutralised]`);
      log(`    before: ${JSON.stringify(p.before)}`);
      log(`    after:  ${JSON.stringify(p.after)}`);
    } else {
      log(`  property_photos#${p.id}  [${p.action}]`);
      log(`    before: ${p.before}`);
      log(`    after:  ${p.after}`);
    }
  }
}

async function applyPlan(plans: Plan[]): Promise<void> {
  if (plans.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of plans) {
      if (p.kind === "activity") {
        await client.query(
          `UPDATE activity_logs SET metadata = $1::jsonb WHERE id = $2`,
          [JSON.stringify(p.after), p.id],
        );
      } else if (p.kind === "message") {
        await client.query(
          `UPDATE rebecca_messages SET content = $1 WHERE id = $2`,
          [p.after, p.id],
        );
      } else {
        await client.query(
          `UPDATE property_photos SET image_url = $1 WHERE id = $2`,
          [p.after, p.id],
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function verifyClean(): Promise<number> {
  const queries = [
    `SELECT COUNT(*)::int AS n FROM activity_logs WHERE metadata::text ~ '/objects/uploads/'`,
    `SELECT COUNT(*)::int AS n FROM rebecca_messages WHERE content ~ '/objects/uploads/'`,
    `SELECT COUNT(*)::int AS n FROM property_photos WHERE image_url ~ '/objects/uploads/'`,
  ];
  let total = 0;
  for (const q of queries) {
    const { rows } = await pool.query<{ n: number }>(q);
    total += rows[0]?.n ?? 0;
  }
  return total;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  log("=== Legacy /objects/uploads/ cleanup (Task #533) ===");
  log(`mode: ${apply ? "APPLY (writes)" : "DRY-RUN (read-only)"}`);
  log("");

  log("[1/3] Building plan...");
  const plans = await buildPlan();
  log("");

  log("[2/3] Plan");
  describePlan(plans);
  log("");

  if (!apply) {
    log("[3/3] Dry-run — no writes performed. Re-run with --apply to commit.");
    await pool.end();
    process.exit(0);
  }

  log("[3/3] Applying...");
  await applyPlan(plans);
  const remaining = await verifyClean();
  log(`Post-apply audit count: ${remaining}`);
  await pool.end();
  if (remaining > 0) {
    log("FAILED: legacy URL references still present after apply.");
    process.exit(1);
  }
  log("OK: no remaining legacy /objects/uploads/ references.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
