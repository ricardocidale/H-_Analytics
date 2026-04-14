import type { StorageProvider } from "./types";

let _instance: StorageProvider | null = null;

/**
 * Return the singleton StorageProvider, lazily created on first call.
 *
 * The provider is chosen by the STORAGE_PROVIDER env var:
 *   "replit" (default) – delegates to server/replit_integrations/object_storage
 *   "s3"               – S3-compatible storage (stub for now)
 *
 * Lazy require() ensures the Replit Google Cloud imports only load
 * when that provider is actually selected.
 */
export function getStorageProvider(): StorageProvider {
  if (!_instance) {
    const provider = process.env.STORAGE_PROVIDER || "replit";
    switch (provider) {
      case "replit": {
         
        const { ReplitStorageProvider } = require("./replit-storage");
        _instance = new ReplitStorageProvider();
        break;
      }
      case "s3": {
         
        const { S3StorageProvider } = require("./s3-storage");
        _instance = new S3StorageProvider();
        break;
      }
      default:
        throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`);
    }
  }
  return _instance!;
}

export type { StorageProvider } from "./types";
