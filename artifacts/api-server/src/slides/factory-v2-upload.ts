/**
 * factory-v2-upload.ts — Factory v2 U7
 *
 * R2 upload helper for Factory v2 deck artifacts. Uploads the substituted
 * PPTX and the soffice-produced PDF under a per-run key prefix and returns
 * both R2 keys. The R2 bucket itself is resolved by the configured
 * StorageProvider (see `providers/storage`); no bucket name is hardcoded
 * here, in line with the no-hardcoded-integration-identifiers convention.
 *
 * Surface (per the U7 task spec):
 *
 *   ```ts
 *   uploadFactoryV2Deck(
 *     runId: string,
 *     pptx: Buffer,
 *     pdf: Buffer,
 *   ): Promise<{ pptxR2Key: string; pdfR2Key: string }>;
 *   ```
 *
 * Key layout (named constants — not "integration identifiers", just
 * per-run resource paths under our own bucket):
 *
 *   factory-v2/runs/<runId>/deck.pptx
 *   factory-v2/runs/<runId>/deck.pdf
 *
 * The key prefix `factory-v2/runs` is exported from
 * `./factory-v2-constants.ts` (`FACTORY_V2_DECK_R2_KEY_PREFIX`) so the
 * download route and Rebecca tool can reference the same source of truth.
 *
 * Storage-provider injection: by default, the function resolves the live
 * provider via `getStorageProviderAsync()`. Tests pass a mock provider via
 * the optional `deps.storageProvider` argument (DI per ADR-007).
 */
import { FACTORY_V2_DECK_R2_KEY_PREFIX, PPTX_CONTENT_TYPE } from "./factory-v2-constants";

import { getStorageProviderAsync } from "../providers/storage";
import type { StorageProvider } from "../providers/storage/types";
import { PDF_CONTENT_TYPE } from "./deck-render-constants";
import { sanitiseRunId } from "./soffice-convert";

// ── Constants local to this module ──────────────────────────────────────────

/** Filename suffix used inside the per-run prefix for the PPTX artifact. */
const DECK_PPTX_FILENAME = "deck.pptx";

/** Filename suffix used inside the per-run prefix for the PDF artifact. */
const DECK_PDF_FILENAME = "deck.pdf";

// ── Public types ────────────────────────────────────────────────────────────

export interface FactoryV2UploadResult {
  /** R2 key of the uploaded PPTX. Stable for the lifetime of the run. */
  pptxR2Key: string;
  /** R2 key of the uploaded PDF. Stable for the lifetime of the run. */
  pdfR2Key: string;
}

export interface FactoryV2UploadDeps {
  /**
   * Optional injected storage provider. When omitted, the function calls
   * `getStorageProviderAsync()` to resolve the live provider. Tests use
   * this hook to inject a mock that records the calls.
   */
  storageProvider?: Pick<StorageProvider, "uploadBuffer">;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the R2 key for a given run + filename. Exported so the download
 * route and Rebecca tool can reference the same builder rather than
 * re-deriving the template at the callsite.
 *
 * Slug discipline is delegated to `sanitiseRunId()` in
 * `soffice-convert.ts` — both modules use identical sanitisation so the
 * per-run tmp dir and the R2 key share the same suffix (critical for
 * incident-response grepping).
 */
export function factoryV2DeckR2Key(runId: string, filename: string): string {
  const slug = sanitiseRunId(runId);
  if (slug.length === 0) {
    throw new Error(
      `factory-v2-upload: runId "${runId}" sanitises to an empty slug`,
    );
  }
  return `${FACTORY_V2_DECK_R2_KEY_PREFIX}/${slug}/${filename}`;
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Upload the Factory v2 deck artifacts (PPTX + PDF) to R2 and return their
 * keys. Uses the configured `StorageProvider`; the bucket is whatever that
 * provider is wired to (no bucket name appears in source).
 *
 * Both uploads run sequentially. R2 doesn't offer atomic multi-object
 * upload semantics; the route layer is responsible for cleaning up the
 * partial PPTX if the PDF upload fails (a follow-up concern — for U7 we
 * surface any storage error to the caller unchanged).
 */
export async function uploadFactoryV2Deck(
  runId: string,
  pptx: Buffer,
  pdf: Buffer,
  deps: FactoryV2UploadDeps = {},
): Promise<FactoryV2UploadResult> {
  if (!Buffer.isBuffer(pptx) || pptx.length === 0) {
    throw new Error("factory-v2-upload: pptx buffer is required and must be non-empty");
  }
  if (!Buffer.isBuffer(pdf) || pdf.length === 0) {
    throw new Error("factory-v2-upload: pdf buffer is required and must be non-empty");
  }

  const sp =
    deps.storageProvider ?? (await getStorageProviderAsync());

  const pptxR2Key = factoryV2DeckR2Key(runId, DECK_PPTX_FILENAME);
  const pdfR2Key = factoryV2DeckR2Key(runId, DECK_PDF_FILENAME);

  await sp.uploadBuffer(pptxR2Key, pptx, PPTX_CONTENT_TYPE);
  await sp.uploadBuffer(pdfR2Key, pdf, PDF_CONTENT_TYPE);

  return { pptxR2Key, pdfR2Key };
}
