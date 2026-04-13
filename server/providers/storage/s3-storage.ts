import type { Response } from "express";
import type { StorageProvider } from "./types";

/**
 * S3-compatible storage stub.
 *
 * This is a placeholder for when the app migrates off Replit.
 * Each method throws so misconfiguration is caught immediately.
 *
 * Real implementation would use:
 *   @aws-sdk/client-s3          – PutObject, GetObject, HeadObject, DeleteObject
 *   @aws-sdk/s3-request-presigner – getSignedUrl
 *
 * Required env vars (when implemented):
 *   S3_BUCKET        – bucket name
 *   S3_REGION        – e.g. us-east-1
 *   S3_ENDPOINT      – optional, for MinIO / R2 / DigitalOcean Spaces
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (or use IAM roles)
 */
export class S3StorageProvider implements StorageProvider {
  private fail(method: string): never {
    throw new Error(
      `S3 storage not yet configured — ${method}() is a stub. ` +
        `Set STORAGE_PROVIDER=replit or implement the S3 provider.`,
    );
  }

  // TODO: use @aws-sdk/s3-request-presigner getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn })
  async getUploadUrl(
    _key: string,
    _contentType?: string,
    _ttlSec?: number,
  ): Promise<{ url: string; objectPath: string }> {
    this.fail("getUploadUrl");
  }

  // TODO: const { Body, ContentType } = await client.send(new GetObjectCommand({ Bucket, Key })); return { buffer: Buffer.from(await Body.transformToByteArray()), contentType: ContentType };
  async downloadBuffer(_key: string): Promise<{ buffer: Buffer; contentType: string }> {
    this.fail("downloadBuffer");
  }

  // TODO: const { Body } = await client.send(new GetObjectCommand({ Bucket, Key })); return Body as ReadableStream;
  async getDownloadStream(_key: string): Promise<NodeJS.ReadableStream> {
    this.fail("getDownloadStream");
  }

  // TODO: stream GetObject Body to res with Content-Type / Content-Length headers
  async downloadToResponse(_key: string, _res: Response): Promise<void> {
    this.fail("downloadToResponse");
  }

  // TODO: try { await client.send(new HeadObjectCommand({ Bucket, Key })); return true; } catch { return false; }
  async exists(_key: string): Promise<boolean> {
    this.fail("exists");
  }

  // TODO: await client.send(new DeleteObjectCommand({ Bucket, Key }));
  async delete(_key: string): Promise<void> {
    this.fail("delete");
  }

  // TODO: await client.send(new PutObjectCommand({ Bucket, Key, Body: buffer, ContentType }));
  async uploadBuffer(
    _key: string,
    _buffer: Buffer,
    _contentType?: string,
  ): Promise<string> {
    this.fail("uploadBuffer");
  }

  // TODO: return `https://${bucket}.s3.${region}.amazonaws.com/${key}` or CloudFront URL
  getPublicUrl(_key: string): string | null {
    this.fail("getPublicUrl");
  }

  // TODO: strip S3 domain prefix, return the key portion
  normalizePath(_rawPath: string): string {
    this.fail("normalizePath");
  }

  // TODO: iterate prefix search in the S3 bucket
  async searchPublicObject(_filePath: string): Promise<string | null> {
    this.fail("searchPublicObject");
  }
}
