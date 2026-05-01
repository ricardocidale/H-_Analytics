import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Response } from "express";
import type { StorageProvider } from "./types";

/**
 * Local filesystem storage provider — for local development only.
 *
 * Stores objects under LOCAL_STORAGE_DIR (default: .local/storage).
 * Not suitable for production; use S3/R2 in production.
 *
 * Set STORAGE_PROVIDER=local in .env.local to activate.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor() {
    this.root = resolve(process.env.LOCAL_STORAGE_DIR || ".local/storage");
  }

  private resolvePath(key: string): string {
    const normalized = key.replace(/^\/objects\//, "").replace(/^\//, "");
    return join(this.root, normalized);
  }

  private async ensureDir(filePath: string): Promise<void> {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
  }

  async getUploadUrl(
    key: string,
    _contentType?: string,
    _ttlSec?: number,
  ): Promise<{ url: string; objectPath: string }> {
    const id = randomUUID();
    const filename = (key || "").replace(/^.*[\\/]/, "").replace(/[^\w._-]/g, "_") || "upload";
    const objectKey = `private/${id}/${filename}`;
    const objectPath = `/objects/${objectKey}`;
    // Local provider uses a fake upload URL that the server intercepts
    return { url: `/api/local-upload/${objectKey}`, objectPath };
  }

  async getDownloadStream(key: string): Promise<NodeJS.ReadableStream> {
    const filePath = this.resolvePath(key);
    if (!existsSync(filePath)) {
      throw Object.assign(new Error(`Object not found: ${key}`), { code: "ENOENT" });
    }
    return createReadStream(filePath);
  }

  async downloadBuffer(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const filePath = this.resolvePath(key);
    const buffer = await readFile(filePath);
    return { buffer, contentType: "application/octet-stream" };
  }

  async downloadToResponse(key: string, res: Response): Promise<void> {
    const filePath = this.resolvePath(key);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const info = await stat(filePath);
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "private, no-store",
    });
    createReadStream(filePath).pipe(res);
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (existsSync(filePath)) {
      await rm(filePath, { force: true });
    }
  }

  async uploadBuffer(key: string, buffer: Buffer, _contentType?: string): Promise<string> {
    const filePath = this.resolvePath(key);
    await this.ensureDir(filePath);
    await writeFile(filePath, buffer);
    return `/objects/${key.replace(/^\//, "")}`;
  }

  getPublicUrl(key: string): string | null {
    return `/objects/${key.replace(/^\//, "")}`;
  }

  normalizePath(rawPath: string): string {
    return rawPath
      .replace(/^\/objects\//, "")
      .replace(/^\//, "");
  }

  async searchPublicObject(filePath: string): Promise<string | null> {
    const normalized = filePath.replace(/^\//, "");
    const fullPath = join(this.root, normalized);
    return existsSync(fullPath) ? `/objects/${normalized}` : null;
  }
}
