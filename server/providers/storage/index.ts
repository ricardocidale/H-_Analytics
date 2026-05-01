import type { StorageProvider } from "./types";

let _instance: StorageProvider | null = null;
let _initPromise: Promise<StorageProvider> | null = null;

async function createProvider(): Promise<StorageProvider> {
  const provider = process.env.STORAGE_PROVIDER || "replit";
  switch (provider) {
    case "replit": {
      const { ReplitStorageProvider } = await import("./replit-storage");
      return new ReplitStorageProvider();
    }
    case "s3":
    case "r2": {
      // "r2" is an alias for the S3 adapter; it auto-derives the endpoint
      // from R2_ACCOUNT_ID and falls back to R2_* credentials.
      const { S3StorageProvider } = await import("./s3-storage");
      return new S3StorageProvider();
    }
    case "local": {
      const { LocalStorageProvider } = await import("./local-storage");
      return new LocalStorageProvider();
    }
    default:
      throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`);
  }
}

export async function getStorageProviderAsync(): Promise<StorageProvider> {
  if (_instance) return _instance;
  if (!_initPromise) {
    _initPromise = createProvider().then((p) => {
      _instance = p;
      return p;
    });
  }
  return _initPromise;
}

export function getStorageProvider(): StorageProvider {
  if (!_instance) {
    throw new Error(
      "StorageProvider not initialized. Call getStorageProviderAsync() first or await initStorageProvider().",
    );
  }
  return _instance;
}

export async function initStorageProvider(): Promise<void> {
  await getStorageProviderAsync();
}

export type { StorageProvider } from "./types";
