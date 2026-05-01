/**
 * processNotificationEvent forwards the event's `link` to the email
 * sender as `actionUrl`, but email clients can't resolve relative
 * paths — so the engine must rewrite any relative `/foo` link to an
 * absolute URL against the configured app URL. Absolute http(s) URLs
 * (e.g., the specialist deep links built by the quality recomputer)
 * must pass through untouched.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmail = vi.fn();
vi.mock("../../server/integrations/resend", () => ({
  sendNotificationEmail: (args: unknown) => sendEmail(args),
}));

const getNotificationSetting = vi.fn();
const createNotificationLog = vi.fn();
vi.mock("../../server/storage", () => ({
  storage: {
    getNotificationSetting: (k: string) => getNotificationSetting(k),
    createNotificationLog: (row: unknown) => createNotificationLog(row),
  },
}));

vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://example.test",
}));

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import { processNotificationEvent } from "../../server/notifications/engine";
import { createEvent } from "../../server/notifications/events";

beforeEach(() => {
  sendEmail.mockReset();
  getNotificationSetting.mockReset();
  createNotificationLog.mockReset();
  // Resend on so emails are dispatched and we can inspect the payload.
  getNotificationSetting.mockResolvedValue("true");
  createNotificationLog.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue(undefined);
});

describe("processNotificationEvent action URL normalization", () => {
  it("rewrites a relative path against the app URL", async () => {
    const event = createEvent("PROPERTY_CREATED", {
      message: "x",
      link: "/property/42",
      metadata: { recipientEmail: "user@example.com" },
    });
    await processNotificationEvent(event);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      actionUrl: "https://example.test/property/42",
    });
  });

  it("passes an absolute http(s) URL through unchanged", async () => {
    const event = createEvent("SPECIALIST_QUALITY_BAND_CHANGED", {
      message: "x",
      link: "https://example.test/ai-intelligence?section=specialist-alpha",
      metadata: { recipientEmail: "admin@example.com" },
    });
    await processNotificationEvent(event);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      actionUrl: "https://example.test/ai-intelligence?section=specialist-alpha",
    });
  });

  it("emits no actionUrl when the event carries no link", async () => {
    const event = createEvent("PROPERTY_CREATED", {
      message: "x",
      metadata: { recipientEmail: "user@example.com" },
    });
    await processNotificationEvent(event);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].actionUrl).toBeUndefined();
  });

  it("strips a trailing slash on the app URL when joining a relative path", async () => {
    // Re-mock getAppUrl to return a trailing-slash form for this case.
    vi.doMock("../../server/providers/config", () => ({
      getAppUrl: () => "https://example.test/",
    }));
    vi.resetModules();
    const { processNotificationEvent: fresh } = await import(
      "../../server/notifications/engine"
    );
    const { createEvent: freshCreate } = await import(
      "../../server/notifications/events"
    );
    const event = freshCreate("PROPERTY_CREATED", {
      message: "x",
      link: "/property/7",
      metadata: { recipientEmail: "user@example.com" },
    });
    await fresh(event);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      actionUrl: "https://example.test/property/7",
    });
  });
});
