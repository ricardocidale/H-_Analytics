import type { Response } from "express";

/**
 * Storage provider abstraction layer.
 *
 * Every method maps 1-to-1 to a capability the app already uses via
 * ObjectStorageService / objectStorageClient.  Implementations must
 * honour the same semantics so consuming code can switch providers
 * by changing the STORAGE_PROVIDER env var.
 */
export interface StorageProvider {
  /** Get a presigned upload URL for the given key */
  getUploadUrl(
    key: string,
    contentType?: string,
    ttlSec?: number,
  ): Promise<{ url: string; objectPath: string }>;

  /** Download an object as a readable stream */
  getDownloadStream(key: string): Promise<NodeJS.ReadableStream>;

  /** Download an object as a Buffer with its content type */
  downloadBuffer(key: string): Promise<{ buffer: Buffer; contentType: string }>;

  /** Download an object to an Express response (with cache headers) */
  downloadToResponse(key: string, res: Response): Promise<void>;

  /** Check if an object exists */
  exists(key: string): Promise<boolean>;

  /** Delete an object */
  delete(key: string): Promise<void>;

  /** Upload a buffer directly */
  uploadBuffer(key: string, buffer: Buffer, contentType?: string): Promise<string>;

  /** Get a public URL for an object (if applicable) */
  getPublicUrl(key: string): string | null;

  /** Normalize a path (URL -> storage key) */
  normalizePath(rawPath: string): string;

  /** Search for an object across public paths */
  searchPublicObject(filePath: string): Promise<string | null>;
}
