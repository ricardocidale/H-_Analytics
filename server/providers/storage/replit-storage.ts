import type { Response } from "express";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  objectStorageClient,
} from "../../replit_integrations/object_storage";
import type { StorageProvider } from "./types";

/**
 * Replit Object Storage implementation of the StorageProvider interface.
 *
 * Every method delegates to the existing ObjectStorageService or
 * objectStorageClient — nothing is re-implemented.  The original
 * files under server/replit_integrations/object_storage/ are left
 * completely untouched.
 */
export class ReplitStorageProvider implements StorageProvider {
  private readonly service: ObjectStorageService;

  constructor() {
    this.service = new ObjectStorageService();
  }

  // ------------------------------------------------------------------ upload
  async getUploadUrl(
    _key: string,
    _contentType?: string,
    _ttlSec?: number,
  ): Promise<{ url: string; objectPath: string }> {
    // ObjectStorageService.getObjectEntityUploadURL() generates its own
    // UUID-based key, so the caller's `key` hint is ignored on Replit.
    const url = await this.service.getObjectEntityUploadURL();
    const objectPath = this.service.normalizeObjectEntityPath(url);
    return { url, objectPath };
  }

  // --------------------------------------------------------------- download
  async downloadBuffer(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const file = await this.service.getObjectEntityFile(key);
    const [contents] = await file.download();
    const [metadata] = await file.getMetadata();
    return { buffer: contents, contentType: metadata.contentType || "application/octet-stream" };
  }

  async getDownloadStream(key: string): Promise<NodeJS.ReadableStream> {
    const file = await this.service.getObjectEntityFile(key);
    return file.createReadStream();
  }

  async downloadToResponse(key: string, res: Response): Promise<void> {
    const file = await this.service.getObjectEntityFile(key);
    await this.service.downloadObject(file, res);
  }

  // ----------------------------------------------------------------- exists
  async exists(key: string): Promise<boolean> {
    try {
      await this.service.getObjectEntityFile(key);
      return true;
    } catch (err) {
      if (err instanceof ObjectNotFoundError) return false;
      throw err;
    }
  }

  // ----------------------------------------------------------------- delete
  async delete(key: string): Promise<void> {
    const file = await this.service.getObjectEntityFile(key);
    await file.delete();
  }

  // ---------------------------------------------------------- direct upload
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<string> {
    const privateDir = this.service.getPrivateObjectDir();
    const fullPath = `${privateDir}/${key}`;

    const parts = fullPath.startsWith("/")
      ? fullPath.slice(1).split("/")
      : fullPath.split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(buffer, { contentType: contentType || "application/octet-stream" });

    return `/objects/${key}`;
  }

  // ------------------------------------------------------------- public URL
  getPublicUrl(_key: string): string | null {
    // Replit Object Storage does not expose permanent public URLs;
    // objects are served through the /objects/* route via signed access.
    return null;
  }

  // ----------------------------------------------------------- path helpers
  normalizePath(rawPath: string): string {
    return this.service.normalizeObjectEntityPath(rawPath);
  }

  async searchPublicObject(filePath: string): Promise<string | null> {
    const file = await this.service.searchPublicObject(filePath);
    if (!file) return null;
    // Return the full path that can later be used with getObjectEntityFile
    return `/${file.bucket.name}/${file.name}`;
  }
}
