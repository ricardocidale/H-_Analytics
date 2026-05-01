import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  applyPhotoEnhancerPromptTemplate,
  assertSafeBeforeImageUrl,
  PhotoEnhancerInvalidSourceUrlError,
  PHOTO_ENHANCER_SPECIALIST_ID,
  PHOTO_ENHANCER_STYLES,
} from "../../server/services/photo-enhancer-pipeline";

/**
 * Phase 5a — Photo Enhancer pipeline consolidation.
 *
 * Guards the contract that BOTH render routes delegate to the shared
 * `runPhotoEnhancerPipeline`, share one rate-limit bucket, and run every
 * request through the SSRF guard.
 */

const specialistRouteSrc = fs.readFileSync(
  path.resolve(__dirname, "../../server/routes/specialist-photo-enhancer.ts"),
  "utf-8",
);
const legacyRouteSrc = fs.readFileSync(
  path.resolve(__dirname, "../../server/routes/images.ts"),
  "utf-8",
);
const pipelineSrc = fs.readFileSync(
  path.resolve(__dirname, "../../server/services/photo-enhancer-pipeline.ts"),
  "utf-8",
);

describe("Photo Enhancer — shared pipeline module", () => {
  it("exports the canonical specialist id", () => {
    expect(PHOTO_ENHANCER_SPECIALIST_ID).toBe("photos.photo-enhancer");
  });

  it("exposes a stable, validated style list", () => {
    expect(PHOTO_ENHANCER_STYLES).toContain("standard");
    expect(PHOTO_ENHANCER_STYLES).toContain("architectural-exterior");
    expect(PHOTO_ENHANCER_STYLES).toContain("photo-to-render");
  });

  it("creates a research_runs row per attempt tagged with specialistId", () => {
    expect(pipelineSrc).toContain("storage.createResearchRun");
    expect(pipelineSrc).toMatch(/specialistId:\s*PHOTO_ENHANCER_SPECIALIST_ID/);
  });

  it("marks run failed when generation throws (keeps telemetry truthful)", () => {
    expect(pipelineSrc).toMatch(/status:\s*"failed"/);
  });

  it("stamps observed-missing after a successful run (F parity)", () => {
    expect(pipelineSrc).toContain("recordObservedMissingFields(PHOTO_ENHANCER_SPECIALIST_ID");
  });

  it("falls back to OpenAI when a Replicate style fails", () => {
    // The fallback path must exist inside the Replicate try/catch, not as
    // the sole generator, or non-Replicate runs would double-log cost.
    expect(pipelineSrc).toContain("generateImageBuffer(prompt, adminSize)");
    expect(pipelineSrc).toContain('"image-gen-fallback"');
    expect(pipelineSrc).toContain("usedFallback = true");
  });
});

describe("Photo Enhancer — SSRF guard on beforeImageUrl", () => {
  it("rejects non-URL strings", async () => {
    await expect(assertSafeBeforeImageUrl("not a url")).rejects.toBeInstanceOf(
      PhotoEnhancerInvalidSourceUrlError,
    );
  });

  it("rejects file:// scheme", async () => {
    await expect(assertSafeBeforeImageUrl("file:///etc/passwd")).rejects.toBeInstanceOf(
      PhotoEnhancerInvalidSourceUrlError,
    );
  });

  it("rejects gopher:// scheme", async () => {
    await expect(assertSafeBeforeImageUrl("gopher://example.com/")).rejects.toBeInstanceOf(
      PhotoEnhancerInvalidSourceUrlError,
    );
  });

  it("rejects loopback hostnames", async () => {
    await expect(assertSafeBeforeImageUrl("http://localhost/img.png")).rejects.toBeInstanceOf(
      PhotoEnhancerInvalidSourceUrlError,
    );
    await expect(assertSafeBeforeImageUrl("http://127.0.0.1/img.png")).rejects.toBeInstanceOf(
      PhotoEnhancerInvalidSourceUrlError,
    );
  });

  it("rejects RFC1918 private hosts", async () => {
    await expect(assertSafeBeforeImageUrl("http://10.0.0.5/a.png")).rejects.toBeInstanceOf(
      PhotoEnhancerInvalidSourceUrlError,
    );
    await expect(assertSafeBeforeImageUrl("http://192.168.1.1/a.png")).rejects.toBeInstanceOf(
      PhotoEnhancerInvalidSourceUrlError,
    );
  });

  it("rejects the EC2/GCE metadata endpoint", async () => {
    await expect(
      assertSafeBeforeImageUrl("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toBeInstanceOf(PhotoEnhancerInvalidSourceUrlError);
    await expect(
      assertSafeBeforeImageUrl("http://metadata.google.internal/"),
    ).rejects.toBeInstanceOf(PhotoEnhancerInvalidSourceUrlError);
  });

  it("accepts a public https URL with a public-looking host", async () => {
    // 8.8.8.8 is guaranteed public — isBlockedHostResolved must return false
    // so we can reliably assert the positive case without a real DNS lookup.
    await expect(
      assertSafeBeforeImageUrl("https://8.8.8.8/image.png"),
    ).resolves.toBeUndefined();
  });
});

describe("Photo Enhancer — specialist route delegation", () => {
  it("delegates to the shared pipeline", () => {
    expect(specialistRouteSrc).toContain("runPhotoEnhancerPipeline");
    // No duplicated in-line replicate invocation — the code path must be
    // unique to the shared module.
    expect(specialistRouteSrc).not.toMatch(/replicateService\.generateImage/);
    expect(specialistRouteSrc).not.toMatch(/generateImageBuffer\(/);
  });

  it("applies the admin rate limit on the shared 'generate-image' bucket", () => {
    expect(specialistRouteSrc).toContain('isApiRateLimited(userId, "generate-image"');
    expect(specialistRouteSrc).toContain("res.status(429)");
  });

  it("gates the endpoint with requireAdmin", () => {
    expect(specialistRouteSrc).toMatch(
      /app\.post\(\s*"\/api\/specialists\/photo-enhancer\/run"\s*,\s*requireAdmin/,
    );
  });

  it("maps style-disabled and invalid-source errors to HTTP 400", () => {
    expect(specialistRouteSrc).toContain("PhotoEnhancerStyleDisabledError");
    expect(specialistRouteSrc).toContain("PhotoEnhancerInvalidSourceUrlError");
    expect(specialistRouteSrc).toContain("res.status(400)");
  });

  it("exposes the per-specialist call log via storage.getResearchRunsForSpecialist", () => {
    expect(specialistRouteSrc).toContain("storage.getResearchRunsForSpecialist");
  });
});

describe("Photo Enhancer — legacy /api/generate-property-image delegation", () => {
  it("delegates to the shared pipeline (no duplicated generator calls)", () => {
    expect(legacyRouteSrc).toContain("runPhotoEnhancerPipeline");
    // Generator primitives must have moved out of this route — a future
    // regression that re-inlines Replicate/OpenAI calls here would bypass
    // the SSRF guard and the research_runs write.
    expect(legacyRouteSrc.match(/replicateService\.generateImage/g) ?? []).toHaveLength(0);
  });

  it("shares the 'generate-image' rate-limit bucket with the specialist route", () => {
    expect(legacyRouteSrc).toContain('isApiRateLimited(userId, "generate-image"');
  });

  it("maps PhotoEnhancerInvalidSourceUrlError to HTTP 400 (SSRF rejection)", () => {
    expect(legacyRouteSrc).toContain("PhotoEnhancerInvalidSourceUrlError");
    expect(legacyRouteSrc).toContain("res.status(400)");
  });

  it("tags the legacy origin for call-log forensics", () => {
    expect(legacyRouteSrc).toContain('originatedFrom: "legacy"');
  });

  it("preserves the legacy response shape (no specialistRunId leakage)", () => {
    // The legacy client contract never had specialistRunId; leaking it
    // would be harmless but we keep the public surface stable.
    expect(legacyRouteSrc).not.toMatch(/specialistRunId\s*:/);
  });
});

describe("Photo Enhancer — admin promptTemplate substitution (Task #433)", () => {
  it("returns the runtime prompt unchanged when no template is set", () => {
    expect(applyPhotoEnhancerPromptTemplate(null, "exterior", "standard")).toBe("exterior");
    expect(applyPhotoEnhancerPromptTemplate("", "exterior", "standard")).toBe("exterior");
    expect(applyPhotoEnhancerPromptTemplate("   ", "exterior", "standard")).toBe("exterior");
  });

  it("substitutes {{prompt}} and {{style}} tokens", () => {
    expect(
      applyPhotoEnhancerPromptTemplate("Render in {{style}}: {{prompt}}", "wide angle", "interior-design"),
    ).toBe("Render in interior-design: wide angle");
  });

  it("prepends template + space when no token is present", () => {
    expect(
      applyPhotoEnhancerPromptTemplate("Architectural photo,", "warm tones", "standard"),
    ).toBe("Architectural photo, warm tones");
  });

  it("uses the template alone when no runtime prompt is supplied", () => {
    expect(applyPhotoEnhancerPromptTemplate("Hero shot", "", "standard")).toBe("Hero shot");
  });

  it("substitutes tokens even with an empty runtime prompt", () => {
    expect(applyPhotoEnhancerPromptTemplate("Style={{style}};p={{prompt}}", "", "renovation-concept"))
      .toBe("Style=renovation-concept;p=");
  });
});

describe("Photo Enhancer — Task #433 evaluator + scheduler wiring", () => {
  const evaluatorSrc = fs.readFileSync(
    path.resolve(__dirname, "../../engine/analyst/surface/photos/photo-enhancer-evaluator.ts"),
    "utf-8",
  );
  const schedulerSrc = fs.readFileSync(
    path.resolve(__dirname, "../../server/jobs/specialist-photos-batch.ts"),
    "utf-8",
  );
  const indexSrc = fs.readFileSync(
    path.resolve(__dirname, "../../server/index.ts"),
    "utf-8",
  );

  it("evaluator delegates to the shared pipeline (no duplicated generator calls)", () => {
    expect(evaluatorSrc).toContain("runPhotoEnhancerPipeline");
    expect(evaluatorSrc).not.toMatch(/replicateService\.generateImage/);
    expect(evaluatorSrc).not.toMatch(/generateImageBuffer\(/);
  });

  it("evaluator reads admin promptTemplate + modelResourceId from specialist_configs", () => {
    expect(evaluatorSrc).toContain("getSpecialistConfig(PHOTO_ENHANCER_SPECIALIST_ID)");
    expect(evaluatorSrc).toContain("promptTemplate");
    expect(evaluatorSrc).toContain("modelResourceId");
  });

  it("scheduler is registered in SCHEDULER_REGISTRY for Observability", () => {
    const trackerSrc = fs.readFileSync(
      path.resolve(__dirname, "../../server/jobs/scheduler-run-tracker.ts"),
      "utf-8",
    );
    expect(trackerSrc).toContain('"specialist-photos-batch"');
  });

  it("scheduler dispatches via the engine evaluator (not the route layer)", () => {
    expect(schedulerSrc).toContain("evaluatePhotoEnhancerSpecialist");
    expect(schedulerSrc).not.toMatch(/runPhotoEnhancerPipeline/); // dispatch goes through the evaluator
  });

  it("scheduler is hooked from server/index.ts startup + shutdown blocks", () => {
    expect(indexSrc).toContain("startSpecialistPhotosBatchScheduler");
    expect(indexSrc).toContain("stopSpecialistPhotosBatchScheduler");
  });
});
