/**
 * tests/server/s3-storage.test.ts — S3StorageProvider unit tests (Task #402)
 *
 * Mocks the AWS SDK clients/commands so the test suite runs without
 * network access or live credentials. Covers the happy paths plus the
 * error-mapping (NoSuchKey → exists()=false) the consuming code relies on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();

class FakeReadable {
  constructor(private readonly chunk: Buffer) {}
  async transformToByteArray(): Promise<Uint8Array> {
    return new Uint8Array(this.chunk);
  }
  pipe<T>(target: T): T {
    return target;
  }
}

class FakeCommand {
  constructor(public readonly input: Record<string, unknown>) {}
}

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class {
      send = sendMock;
    },
    PutObjectCommand: class extends FakeCommand {
      readonly _kind = "PutObject";
    },
    GetObjectCommand: class extends FakeCommand {
      readonly _kind = "GetObject";
    },
    HeadObjectCommand: class extends FakeCommand {
      readonly _kind = "HeadObject";
    },
    DeleteObjectCommand: class extends FakeCommand {
      readonly _kind = "DeleteObject";
    },
    ListObjectsV2Command: class extends FakeCommand {
      readonly _kind = "ListObjectsV2";
    },
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => {
  return {
    getSignedUrl: getSignedUrlMock,
  };
});

const ENV_KEYS = [
  "STORAGE_PROVIDER",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_PUBLIC_URL_BASE",
  "S3_FORCE_PATH_STYLE",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "PUBLIC_OBJECT_SEARCH_PATHS",
  // R2 shortcut env vars — must be cleared so they don't bleed across tests
  // and silently satisfy the S3_BUCKET / credential requirements.
  "R2_BUCKET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL_BASE",
];

function setEnv(vars: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v;
  }
}

async function loadProvider() {
  vi.resetModules();
  const mod = await import("../../server/providers/storage/s3-storage");
  return new mod.S3StorageProvider();
}

beforeEach(() => {
  sendMock.mockReset();
  getSignedUrlMock.mockReset();
  setEnv({
    S3_BUCKET: "test-bucket",
    S3_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "AKIA-TEST",
    AWS_SECRET_ACCESS_KEY: "secret",
  });
});

afterEach(() => {
  setEnv({});
});

describe("S3StorageProvider", () => {
  it("throws if neither S3_BUCKET nor R2_BUCKET is set", async () => {
    // setEnv({}) clears both S3_BUCKET and R2_BUCKET (see ENV_KEYS) so the
    // provider has no source for the bucket name and must reject.
    setEnv({});
    const mod = await import("../../server/providers/storage/s3-storage");
    expect(() => new mod.S3StorageProvider()).toThrow(/S3_BUCKET/);
  });

  it("falls back to R2_* env vars (R2 shortcut) and derives the endpoint from R2_ACCOUNT_ID", async () => {
    // Clears S3_/AWS_ vars, leaving only R2_* + STORAGE_PROVIDER=r2.
    // Provider must construct successfully and route requests to the derived
    // R2 endpoint+bucket.
    setEnv({
      STORAGE_PROVIDER: "r2",
      R2_BUCKET: "r2-bucket",
      R2_ACCOUNT_ID: "myacct",
      R2_ACCESS_KEY_ID: "r2-key",
      R2_SECRET_ACCESS_KEY: "r2-secret",
    });
    sendMock.mockResolvedValueOnce({});
    const mod = await import("../../server/providers/storage/s3-storage");
    const provider = new mod.S3StorageProvider();
    await provider.delete("foo/bar");
    const cmd = sendMock.mock.calls[0][0] as { input: { Bucket: string; Key: string } };
    expect(cmd.input.Bucket).toBe("r2-bucket");
    expect(cmd.input.Key).toBe("foo/bar");
    // normalizePath must strip the derived R2 endpoint URL even though
    // S3_ENDPOINT was never set (proves the instance tracks the effective
    // endpoint, not just process.env.S3_ENDPOINT).
    expect(
      provider.normalizePath(
        "https://myacct.r2.cloudflarestorage.com/r2-bucket/folder/x.txt",
      ),
    ).toBe("folder/x.txt");
  });

  it("R2 fallback is gated on STORAGE_PROVIDER=r2 — does not silently take effect in s3 mode", async () => {
    // R2_* env vars present but STORAGE_PROVIDER is not "r2" — the provider
    // must NOT borrow R2_BUCKET / R2_ACCESS_KEY_ID. This protects vanilla
    // AWS / MinIO deployments that share a secret store with an R2 setup.
    setEnv({
      STORAGE_PROVIDER: "s3",
      R2_BUCKET: "leaky-r2-bucket",
      R2_ACCOUNT_ID: "leaky",
      R2_ACCESS_KEY_ID: "leaky-key",
      R2_SECRET_ACCESS_KEY: "leaky-secret",
    });
    const mod = await import("../../server/providers/storage/s3-storage");
    expect(() => new mod.S3StorageProvider()).toThrow(/S3_BUCKET/);
  });

  it("does not mix credentials across AWS_* and R2_* namespaces", async () => {
    // Only an AWS access key (no AWS secret) plus a complete R2 pair —
    // the provider must NOT pair the AWS key with the R2 secret. In r2
    // mode it should fall through to the R2 pair; the test asserts the
    // request still goes through (no auth crash on construction).
    setEnv({
      STORAGE_PROVIDER: "r2",
      R2_BUCKET: "b",
      R2_ACCOUNT_ID: "acct",
      AWS_ACCESS_KEY_ID: "AKIA-AWS-ONLY",
      R2_ACCESS_KEY_ID: "r2key",
      R2_SECRET_ACCESS_KEY: "r2secret",
    });
    sendMock.mockResolvedValueOnce({});
    const mod = await import("../../server/providers/storage/s3-storage");
    const provider = new mod.S3StorageProvider();
    await provider.delete("k");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("getUploadUrl returns a presigned URL with 15-min default TTL and a UUID-scoped key", async () => {
    getSignedUrlMock.mockResolvedValueOnce("https://signed/put-url");
    const provider = await loadProvider();

    const result = await provider.getUploadUrl("photos/abc.jpg", "image/jpeg");

    // Mirrors ReplitStorageProvider: filename hint is sanitised, scoped under a
    // UUID inside `private/`, never reuses the caller's path verbatim.
    expect(result.url).toBe("https://signed/put-url");
    expect(result.objectPath).toMatch(
      /^\/objects\/private\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/abc\.jpg$/,
    );
    const [, cmd, opts] = getSignedUrlMock.mock.calls[0];
    const input = (cmd as { input: { Bucket: string; Key: string; ContentType?: string } }).input;
    expect(input.Bucket).toBe("test-bucket");
    expect(input.ContentType).toBe("image/jpeg");
    expect(input.Key).toMatch(
      /^private\/[0-9a-f-]{36}\/abc\.jpg$/,
    );
    // objectPath round-trips back through the provider's read methods.
    expect(`/objects/${input.Key}`).toBe(result.objectPath);
    expect(opts).toEqual({ expiresIn: 15 * 60 });
  });

  it("getUploadUrl honours an explicit ttlSec", async () => {
    getSignedUrlMock.mockResolvedValueOnce("https://signed/put");
    const provider = await loadProvider();
    await provider.getUploadUrl("k", "text/plain", 60);
    expect(getSignedUrlMock.mock.calls[0][2]).toEqual({ expiresIn: 60 });
  });

  it("downloadBuffer returns bytes and contentType", async () => {
    sendMock.mockResolvedValueOnce({
      Body: new FakeReadable(Buffer.from("hello world")),
      ContentType: "text/plain",
    });
    const provider = await loadProvider();
    const { buffer, contentType } = await provider.downloadBuffer("a/b.txt");
    expect(buffer.toString()).toBe("hello world");
    expect(contentType).toBe("text/plain");
  });

  it("exists returns true when HeadObject succeeds", async () => {
    sendMock.mockResolvedValueOnce({});
    const provider = await loadProvider();
    expect(await provider.exists("ok-key")).toBe(true);
  });

  it("exists returns false on 404 / NoSuchKey", async () => {
    const err = Object.assign(new Error("not found"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    sendMock.mockRejectedValueOnce(err);
    const provider = await loadProvider();
    expect(await provider.exists("missing")).toBe(false);
  });

  it("exists rethrows non-404 errors", async () => {
    const err = Object.assign(new Error("denied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    sendMock.mockRejectedValueOnce(err);
    const provider = await loadProvider();
    await expect(provider.exists("k")).rejects.toThrow(/denied/);
  });

  it("exists rethrows SignatureDoesNotMatch with permission semantics (403)", async () => {
    // SignatureDoesNotMatch indicates a credential/permission problem, NOT a
    // missing object. The provider must surface it (rethrow), never silently
    // map it to exists()=false the way it maps NotFound/NoSuchKey.
    const err = Object.assign(new Error("The request signature we calculated does not match"), {
      name: "SignatureDoesNotMatch",
      $metadata: { httpStatusCode: 403 },
    });
    sendMock.mockRejectedValueOnce(err);
    const provider = await loadProvider();
    await expect(provider.exists("k")).rejects.toThrow(/signature/i);
  });

  it("delete sends a DeleteObjectCommand for the bucket+key", async () => {
    sendMock.mockResolvedValueOnce({});
    const provider = await loadProvider();
    await provider.delete("a/b");
    const cmd = sendMock.mock.calls[0][0] as { input: { Bucket: string; Key: string } };
    expect(cmd.input).toEqual({ Bucket: "test-bucket", Key: "a/b" });
  });

  it("uploadBuffer puts the body and returns /objects/{key}", async () => {
    sendMock.mockResolvedValueOnce({});
    const provider = await loadProvider();
    const result = await provider.uploadBuffer(
      "docs/x.pdf",
      Buffer.from("PDF"),
      "application/pdf",
    );
    expect(result).toBe("/objects/docs/x.pdf");
    const cmd = sendMock.mock.calls[0][0] as {
      input: { Bucket: string; Key: string; Body: Buffer; ContentType: string };
    };
    expect(cmd.input.Bucket).toBe("test-bucket");
    expect(cmd.input.Key).toBe("docs/x.pdf");
    expect(cmd.input.ContentType).toBe("application/pdf");
    expect(Buffer.isBuffer(cmd.input.Body)).toBe(true);
  });

  it("getPublicUrl uses S3_PUBLIC_URL_BASE when set", async () => {
    setEnv({
      S3_BUCKET: "b",
      S3_REGION: "auto",
      S3_PUBLIC_URL_BASE: "https://cdn.example.com/assets",
    });
    const provider = await loadProvider();
    expect(provider.getPublicUrl("photos/1.jpg")).toBe(
      "https://cdn.example.com/assets/photos/1.jpg",
    );
  });

  it("getPublicUrl falls back to native AWS URL", async () => {
    const provider = await loadProvider();
    expect(provider.getPublicUrl("k")).toBe(
      "https://test-bucket.s3.us-east-1.amazonaws.com/k",
    );
  });

  it("getPublicUrl returns null for custom endpoint without public base", async () => {
    setEnv({
      S3_BUCKET: "b",
      S3_REGION: "auto",
      S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
    });
    const provider = await loadProvider();
    expect(provider.getPublicUrl("k")).toBeNull();
  });

  it("normalizePath strips /objects/ prefix", async () => {
    const provider = await loadProvider();
    expect(provider.normalizePath("/objects/photos/1.jpg")).toBe("photos/1.jpg");
  });

  it("normalizePath strips a native AWS virtual-hosted URL", async () => {
    const provider = await loadProvider();
    expect(
      provider.normalizePath(
        "https://test-bucket.s3.us-east-1.amazonaws.com/folder/file.txt",
      ),
    ).toBe("folder/file.txt");
  });

  it("normalizePath strips a configured public URL base", async () => {
    setEnv({
      S3_BUCKET: "test-bucket",
      S3_REGION: "us-east-1",
      S3_PUBLIC_URL_BASE: "https://cdn.example.com",
    });
    const provider = await loadProvider();
    expect(provider.normalizePath("https://cdn.example.com/a/b.png")).toBe(
      "a/b.png",
    );
  });

  it("searchPublicObject scans configured prefixes", async () => {
    setEnv({
      S3_BUCKET: "test-bucket",
      S3_REGION: "us-east-1",
      PUBLIC_OBJECT_SEARCH_PATHS: "public,assets/static",
    });
    // First HEAD (public/logo.png) → 404, second HEAD (assets/static/logo.png) → 200
    const notFound = Object.assign(new Error("nf"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    sendMock.mockRejectedValueOnce(notFound).mockResolvedValueOnce({});

    const provider = await loadProvider();
    const result = await provider.searchPublicObject("logo.png");
    expect(result).toBe("/test-bucket/assets/static/logo.png");
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("searchPublicObject returns null when nothing matches", async () => {
    setEnv({
      S3_BUCKET: "test-bucket",
      S3_REGION: "us-east-1",
      PUBLIC_OBJECT_SEARCH_PATHS: "public",
    });
    const notFound = Object.assign(new Error("nf"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    sendMock.mockRejectedValueOnce(notFound);
    const provider = await loadProvider();
    expect(await provider.searchPublicObject("nope.png")).toBeNull();
  });
});
