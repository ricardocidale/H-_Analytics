import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./types";

/**
 * S3-compatible storage provider.
 *
 * Works with AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, and any
 * other S3-API-compatible backend. Set `S3_ENDPOINT` to point at non-AWS
 * providers (R2, MinIO, etc.); leave it unset for native AWS S3.
 *
 * Required env vars (S3 mode):
 *   S3_BUCKET                 – bucket name
 *   S3_REGION                 – e.g. us-east-1 (use "auto" for R2)
 *   AWS_ACCESS_KEY_ID         – or use IAM role on AWS
 *   AWS_SECRET_ACCESS_KEY     – or use IAM role on AWS
 *
 * Optional env vars:
 *   S3_ENDPOINT               – custom endpoint URL (R2 / MinIO / Spaces)
 *   S3_PUBLIC_URL_BASE        – CDN / custom domain for public URLs
 *   S3_FORCE_PATH_STYLE       – "true" to use path-style addressing (MinIO)
 *
 * Cloudflare R2 shortcut (when STORAGE_PROVIDER=r2):
 *   R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID
 *   The endpoint is auto-derived as https://<account>.r2.cloudflarestorage.com
 *   and region defaults to "auto". R2_PUBLIC_URL_BASE may be supplied for a
 *   custom or r2.dev public hostname.
 */

const DEFAULT_PRESIGN_TTL_SEC = 15 * 60; // 15 minutes — matches Replit semantics

function requireEnv(name: string, alts: string[] = []): string {
  const v = process.env[name];
  if (v) return v;
  for (const alt of alts) {
    const av = process.env[alt];
    if (av) return av;
  }
  const all = [name, ...alts].join(" / ");
  throw new Error(
    `S3 storage requires ${all}. Set it in the environment or use STORAGE_PROVIDER=replit.`,
  );
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string | null;
  /** Effective endpoint (explicit S3_ENDPOINT or derived R2 host); null for native AWS S3. */
  private readonly endpoint: string | null;

  constructor() {
    // R2 shortcut is opt-in via STORAGE_PROVIDER=r2. We never silently change
    // S3 behavior just because R2_* happen to be present in the env — that
    // would break vanilla AWS / MinIO deployments that share the same secret
    // store with an R2 staging environment.
    const isR2 = process.env.STORAGE_PROVIDER === "r2";

    // Bucket: prefer S3_BUCKET; only fall back to R2_BUCKET in r2 mode.
    this.bucket = isR2
      ? requireEnv("S3_BUCKET", ["R2_BUCKET"])
      : requireEnv("S3_BUCKET");

    const region = process.env.S3_REGION || (isR2 ? "auto" : "us-east-1");

    // Endpoint: explicit S3_ENDPOINT always wins (works for any provider).
    // Otherwise derive `https://<account>.r2.cloudflarestorage.com` only in
    // r2 mode and only if R2_ACCOUNT_ID is set.
    let endpoint: string | null = null;
    if (process.env.S3_ENDPOINT) {
      endpoint = process.env.S3_ENDPOINT;
    } else if (isR2 && process.env.R2_ACCOUNT_ID) {
      endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    }
    this.endpoint = endpoint;

    const config: S3ClientConfig = { region };
    if (endpoint) config.endpoint = endpoint;
    if (process.env.S3_FORCE_PATH_STYLE === "true") {
      config.forcePathStyle = true;
    }

    // Credentials: load from a single namespace at a time so we never mix an
    // AWS access key with an R2 secret (or vice-versa). AWS_* wins when both
    // are complete; otherwise R2_* is used in r2 mode.
    const awsKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;
    const r2Key = process.env.R2_ACCESS_KEY_ID;
    const r2Secret = process.env.R2_SECRET_ACCESS_KEY;
    if (awsKey && awsSecret) {
      config.credentials = { accessKeyId: awsKey, secretAccessKey: awsSecret };
    } else if (isR2 && r2Key && r2Secret) {
      config.credentials = { accessKeyId: r2Key, secretAccessKey: r2Secret };
    }
    // else: rely on default AWS credential chain (IAM role, ~/.aws/credentials, etc.)

    this.client = new S3Client(config);
    this.publicUrlBase =
      process.env.S3_PUBLIC_URL_BASE ||
      (isR2 ? process.env.R2_PUBLIC_URL_BASE || null : null);
  }

  // ------------------------------------------------------------------ upload
  /**
   * Generate a presigned PUT URL.
   *
   * Mirrors `ReplitStorageProvider`: the caller's `key` is treated as a
   * filename hint only. We always generate a UUID-scoped object key so two
   * uploads with the same `name` cannot collide / overwrite each other.
   */
  async getUploadUrl(
    key: string,
    contentType?: string,
    ttlSec?: number,
  ): Promise<{ url: string; objectPath: string }> {
    const objectKey = this.generateObjectKey(key);
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, cmd, {
      expiresIn: ttlSec ?? DEFAULT_PRESIGN_TTL_SEC,
    });
    return { url, objectPath: `/objects/${objectKey}` };
  }

  // --------------------------------------------------------------- download
  async downloadBuffer(rawKey: string): Promise<{ buffer: Buffer; contentType: string }> {
    const key = this.toKey(rawKey);
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!out.Body) {
      throw new Error(`S3 object ${key} returned empty body`);
    }
    const bytes = await out.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: out.ContentType || "application/octet-stream",
    };
  }

  async getDownloadStream(rawKey: string): Promise<NodeJS.ReadableStream> {
    const key = this.toKey(rawKey);
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!out.Body) {
      throw new Error(`S3 object ${key} returned empty body`);
    }
    // AWS SDK v3 in Node returns a Readable stream; cast for type safety.
    return out.Body as Readable;
  }

  async downloadToResponse(rawKey: string, res: Response): Promise<void> {
    const key = this.toKey(rawKey);
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!out.Body) {
      throw new Error(`S3 object ${key} returned empty body`);
    }

    const contentType = out.ContentType || "application/octet-stream";
    const isPrivate = key.includes(".private") || key.includes("private/");
    const cacheControl = isPrivate ? "private, no-store" : "public, max-age=3600";

    const headers: Record<string, string | number> = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    };
    if (typeof out.ContentLength === "number") {
      headers["Content-Length"] = out.ContentLength;
    }
    res.set(headers);

    (out.Body as Readable).pipe(res);
  }

  // ----------------------------------------------------------------- exists
  async exists(rawKey: string): Promise<boolean> {
    const key = this.toKey(rawKey);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err: unknown) {
      if (isNotFoundError(err)) return false;
      throw err;
    }
  }

  // ----------------------------------------------------------------- delete
  async delete(rawKey: string): Promise<void> {
    const key = this.toKey(rawKey);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  // ---------------------------------------------------------- direct upload
  async uploadBuffer(
    rawKey: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<string> {
    const key = this.toKey(rawKey);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      }),
    );
    return `/objects/${key}`;
  }

  // ------------------------------------------------------------- public URL
  getPublicUrl(key: string): string | null {
    if (this.publicUrlBase) {
      const base = this.publicUrlBase.replace(/\/$/, "");
      return `${base}/${key}`;
    }
    if (process.env.S3_ENDPOINT) {
      // Custom endpoint (R2/MinIO/Spaces) — caller should set S3_PUBLIC_URL_BASE
      // for a stable public URL; we don't guess.
      return null;
    }
    // Native AWS virtual-hosted–style URL
    const region = process.env.S3_REGION || "us-east-1";
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  // ----------------------------------------------------------- path helpers
  /**
   * Convert an inbound path/URL into a bare S3 object key.
   *
   * Inputs we accept (because consumers pass any of them):
   *   - `/objects/private/abc123/photo.jpg`  → `private/abc123/photo.jpg`
   *   - `https://bucket.s3.region.amazonaws.com/key`  → `key`
   *   - `https://cdn.example.com/key`  (S3_PUBLIC_URL_BASE) → `key`
   *   - `https://endpoint/bucket/key`  (custom endpoint) → `key`
   *   - `bare/key.txt`  → `bare/key.txt`
   *
   * All read/delete/exists methods funnel through here so callers that pass
   * the `/objects/...` form returned by `uploadBuffer` / `getUploadUrl`
   * round-trip correctly.
   */
  private toKey(rawPath: string): string {
    return this.normalizePath(rawPath);
  }

  /**
   * Generate a UUID-scoped object key from a caller-supplied filename.
   * Mirrors `ReplitStorageProvider.getUploadUrl()` which generates a UUID
   * inside the configured private dir — collisions on `name` are impossible.
   */
  private generateObjectKey(filenameHint?: string): string {
    const id = randomUUID();
    const safeName = (filenameHint || "")
      .replace(/^.*[\\/]/, "")     // strip any path
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    return safeName ? `private/${id}/${safeName}` : `private/${id}`;
  }

  normalizePath(rawPath: string): string {
    if (!rawPath) return rawPath;

    // Strip /objects/ prefix used by the app's serving route
    if (rawPath.startsWith("/objects/")) {
      return rawPath.slice("/objects/".length);
    }

    // Strip native AWS virtual-hosted URL: https://{bucket}.s3.{region}.amazonaws.com/{key}
    const awsHost = `${this.bucket}.s3.`;
    const awsMatch = rawPath.match(
      new RegExp(`^https?://${escapeRegex(awsHost)}[^/]+/(.+)$`),
    );
    if (awsMatch) return awsMatch[1];

    // Strip configured public URL base
    if (this.publicUrlBase && rawPath.startsWith(this.publicUrlBase)) {
      return rawPath.slice(this.publicUrlBase.length).replace(/^\//, "");
    }

    // Strip custom endpoint host (R2/MinIO): https://endpoint/bucket/key  or  https://endpoint/key
    // Uses the *effective* endpoint resolved at construction time (handles the
    // R2 shortcut where the endpoint is derived from R2_ACCOUNT_ID and never
    // appears in S3_ENDPOINT).
    if (this.endpoint) {
      try {
        const url = new URL(rawPath);
        let path = url.pathname.replace(/^\//, "");
        if (path.startsWith(`${this.bucket}/`)) {
          path = path.slice(this.bucket.length + 1);
        }
        if (path) return path;
      } catch {
        // not a URL — fall through
      }
    }

    // Already a key
    return rawPath.replace(/^\//, "");
  }

  async searchPublicObject(filePath: string): Promise<string | null> {
    // Mirror the Replit provider: search a configured set of public
    // prefixes for an object whose key ends with `filePath`.
    const searchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
      .split(",")
      .map((p) => p.trim().replace(/^\//, "").replace(/\/$/, ""))
      .filter((p) => p.length > 0);

    if (searchPaths.length === 0) {
      // Fall back to bucket-root search by exact key
      return (await this.exists(filePath)) ? `/${this.bucket}/${filePath}` : null;
    }

    const trimmed = filePath.replace(/^\//, "");
    for (const prefix of searchPaths) {
      const key = `${prefix}/${trimmed}`;
      if (await this.exists(key)) {
        return `/${this.bucket}/${key}`;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------- private helpers

function isNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; Code?: string };
  return (
    e.name === "NotFound" ||
    e.name === "NoSuchKey" ||
    e.Code === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
