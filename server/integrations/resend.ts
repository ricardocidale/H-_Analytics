import { Resend } from "resend";
import { BaseIntegrationService, type IntegrationHealth } from "./base";
import { logApiCost } from "../middleware/cost-logger";
import { resolveThemeColors, adjustHex, esc, type ThemeColorMap } from "../theme-resolver";
import { logger } from "../logger";

interface EmailAttachment {
  content: string;
  filename: string;
  type?: string;
}

class ResendIntegration extends BaseIntegrationService {
  readonly serviceName = "resend";

  private getClient(): Resend {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    return new Resend(key);
  }

  private getFromAddress(): string {
    return "Rebecca at H+ Analytics <noreply@h-analysis.com>";
  }

  async healthCheck(): Promise<IntegrationHealth> {
    const start = Date.now();
    const { lastError, lastErrorAt } = this.getLastError();
    try {
      const resend = this.getClient();
      const { error } = await resend.apiKeys.list();
      const healthy = !error;
      return {
        name: this.serviceName,
        healthy,
        latencyMs: Date.now() - start,
        lastError: healthy ? lastError : (error?.message ?? "Unknown error"),
        lastErrorAt: healthy ? lastErrorAt : Date.now(),
        circuitState: this.getCircuitState(),
      };
    } catch (error: any) {
      return {
        name: this.serviceName,
        healthy: false,
        latencyMs: Date.now() - start,
        lastError: error.message,
        lastErrorAt: Date.now(),
        circuitState: this.getCircuitState(),
      };
    }
  }

  private async sendEmailInternal(params: {
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
  }): Promise<void> {
    return this.execute("sendEmail", async () => {
      const resend = this.getClient();

      const emailPayload: {
        from: string;
        to: string[];
        subject: string;
        html: string;
        attachments?: { content: Buffer; filename: string; contentType: string }[];
      } = {
        from: this.getFromAddress(),
        to: [params.to],
        subject: params.subject,
        html: params.html,
      };

      if (params.attachments?.length) {
        emailPayload.attachments = params.attachments.map((a) => ({
          content: Buffer.from(a.content, "base64"),
          filename: a.filename,
          contentType: a.type || "application/pdf",
        }));
      }

      const startTime = Date.now();
      const { error } = await resend.emails.send(emailPayload);
      if (error) {
        throw new Error(`Resend API error: ${error.message}`);
      }
      try { logApiCost({ timestamp: new Date().toISOString(), service: "resend", operation: "email", estimatedCostUsd: 0.001, durationMs: Date.now() - startTime, route: "resend-integration" }); } catch (e) { logger.warn(`Failed to log API cost: ${(e as Error).message}`, "cost-logger"); }
    });
  }

  async sendReportShareEmail(params: {
    to: string;
    propertyName: string;
    metrics: Record<string, any>;
    message?: string;
    attachmentBase64?: string;
    attachmentFilename?: string;
  }): Promise<void> {
    let metricsTable = "";
    if (Object.keys(params.metrics).length > 0) {
      const rows = Object.entries(params.metrics)
        .map(([k, v]) => `<tr><td style="font-weight:500;">${esc(String(k))}</td><td>${esc(String(v))}</td></tr>`)
        .join("");
      metricsTable = `<table class="metrics"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const messageSection = params.message ? `<div class="callout">${esc(params.message)}</div>` : "";

    const html = brandedTemplate(
      `Financial Report: ${esc(params.propertyName)}`,
      `<p>I've prepared a financial report for <strong>${esc(params.propertyName)}</strong> that's ready for your review.</p>
      ${metricsTable}${messageSection}
      <p style="margin-top:28px;text-align:center;"><a href="#" class="btn">View Full Report in Portal</a></p>`,
      "rebecca"
    );

    const attachments: EmailAttachment[] = [];
    if (params.attachmentBase64 && params.attachmentFilename) {
      const ext = params.attachmentFilename.split(".").pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        pdf: "application/pdf",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };
      attachments.push({
        content: params.attachmentBase64,
        filename: params.attachmentFilename,
        type: mimeTypes[ext || "pdf"] || "application/octet-stream",
      });
    }

    await this.sendEmailInternal({
      to: params.to,
      subject: `Financial Report: ${params.propertyName} — H+ Analytics`,
      html,
      attachments,
    });
  }

  async sendScenarioSummaryEmail(params: {
    to: string;
    scenarios: { name: string; metrics: Record<string, any> }[];
    message?: string;
  }): Promise<void> {
    const headers = ["Metric", ...params.scenarios.map((s) => esc(s.name))];
    const allKeys = Array.from(new Set(params.scenarios.flatMap((s) => Object.keys(s.metrics))));

    const headerRow = headers.map((h) => `<th>${h}</th>`).join("");
    const bodyRows = allKeys
      .map((key) => {
        const cells = params.scenarios.map((s) => `<td>${esc(String(s.metrics[key] ?? "—"))}</td>`).join("");
        return `<tr><td style="font-weight:500;">${esc(key)}</td>${cells}</tr>`;
      })
      .join("");

    const table = `<table class="metrics"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    const messageSection = params.message ? `<div class="callout">${esc(params.message)}</div>` : "";

    const html = brandedTemplate(
      "Scenario Comparison",
      `<p>Here's the scenario comparison you requested. I've laid out the key metrics side-by-side for easy review.</p>${table}${messageSection}`,
      "rebecca"
    );

    await this.sendEmailInternal({
      to: params.to,
      subject: "Scenario Comparison — H+ Analytics",
      html,
    });
  }

  async sendNotificationEmail(params: {
    to: string;
    subject: string;
    title: string;
    body: string;
    actionUrl?: string;
    actionLabel?: string;
  }): Promise<void> {
    const actionBtn = params.actionUrl
      ? `<p style="margin-top:28px;text-align:center;"><a href="${params.actionUrl}" class="btn">${params.actionLabel || "View in Portal"}</a></p>`
      : "";

    const html = brandedTemplate(params.title, `<p>${params.body}</p>${actionBtn}`, "rebecca");

    await this.sendEmailInternal({
      to: params.to,
      subject: params.subject,
      html,
    });
  }

  async sendWelcomeEmail(params: {
    to: string;
    userName: string;
    loginUrl?: string;
  }): Promise<void> {
    const loginLink = params.loginUrl || "#";
    const html = brandedTemplate(
      "Welcome to H+ Analytics",
      `<p>Hi <strong>${esc(params.userName)}</strong>,</p>
      <p>I'm Rebecca, your analytics assistant at H+ Analytics by Norfolk AI. Your account is all set up and ready to go.</p>
      <p>Inside the portal you'll find tools for financial modeling, scenario analysis, and portfolio reporting — all designed to help you make better investment decisions.</p>
      <p>I'm here whenever you need help navigating your data or generating insights. Just open the chat in the portal and ask me anything.</p>
      <p style="margin-top:28px;text-align:center;"><a href="${loginLink}" class="btn">Sign In to Your Account</a></p>
      <p class="hint" style="margin-top:20px;">If you have any questions getting started, feel free to reach out to your account administrator or chat with me directly in the portal.</p>`,
      "rebecca"
    );

    await this.sendEmailInternal({
      to: params.to,
      subject: "Welcome to H+ Analytics — Your account is ready",
      html,
    });
  }

  async sendScenarioShareNotification(params: {
    to: string;
    recipientName: string;
    sharerName: string;
    sharerEmail: string;
    scenarioNames: string[];
    mode: "single" | "all";
    portalUrl?: string;
  }): Promise<void> {
    const count = params.scenarioNames.length;
    const scenarioList = params.scenarioNames
      .map(name => `<li>${esc(name)}</li>`)
      .join("");

    const heading = params.mode === "single"
      ? "A Scenario Has Been Shared With You"
      : `${count} Scenario${count > 1 ? "s" : ""} Shared With You`;

    const portalLink = params.portalUrl || "#";

    const html = brandedTemplate(
      heading,
      `<p>Hi <strong>${esc(params.recipientName)}</strong>,</p>
      <p>I'm writing to let you know that <strong>${esc(params.sharerName)}</strong> has shared ${params.mode === "single" ? "a scenario" : `${count} scenario${count > 1 ? "s" : ""}`} with you on H+ Analytics:</p>
      <div class="scenario-list">
        <div class="scenario-list-header">
          <span class="scenario-icon">&#9670;</span>
          Shared Scenario${count > 1 ? "s" : ""}
        </div>
        <ul>${scenarioList}</ul>
      </div>
      <p>${count > 1 ? "These scenarios are" : "This scenario is"} now available in your Scenarios page. You can load ${count > 1 ? "them" : "it"}, review the financial projections, and compare against your own models.</p>
      <p style="margin-top:28px;text-align:center;"><a href="${portalLink}" class="btn">Open Scenarios</a></p>
      <p class="hint" style="margin-top:20px;">You have view-only access to ${count > 1 ? "these scenarios" : "this scenario"}. The owner can update or revoke access at any time.</p>`,
      "rebecca"
    );

    await this.sendEmailInternal({
      to: params.to,
      subject: `${params.sharerName} shared ${params.mode === "single" ? `"${params.scenarioNames[0]}"` : `${count} scenarios`} with you — H+ Analytics`,
      html,
    });
  }

  async sendAdminShareNotification(params: {
    to: string;
    sharerName: string;
    sharerEmail: string;
    recipientName: string;
    recipientEmail: string;
    scenarioNames: string[];
    mode: "single" | "all";
  }): Promise<void> {
    const count = params.scenarioNames.length;
    const scenarioList = params.scenarioNames
      .map(name => `<li>${esc(name)}</li>`)
      .join("");

    const html = brandedTemplate(
      "Sharing Activity Notice",
      `<p>I wanted to flag a sharing event for your records:</p>
      <div class="info-card">
        <div class="info-row"><span class="info-label">From</span><span class="info-value">${esc(params.sharerName)} (${esc(params.sharerEmail)})</span></div>
        <div class="info-row"><span class="info-label">To</span><span class="info-value">${esc(params.recipientName)} (${esc(params.recipientEmail)})</span></div>
        <div class="info-row"><span class="info-label">Action</span><span class="info-value">Shared ${params.mode === "single" ? "1 scenario" : `${count} scenarios`}</span></div>
      </div>
      <div class="scenario-list">
        <div class="scenario-list-header">
          <span class="scenario-icon">&#9670;</span>
          Scenario${count > 1 ? "s" : ""} Shared
        </div>
        <ul>${scenarioList}</ul>
      </div>
      <p class="hint" style="margin-top:20px;">This is an automated activity notice. You can review all sharing activity in the Admin panel under Activity &rarr; Sharing Log.</p>`,
      "rebecca"
    );

    await this.sendEmailInternal({
      to: params.to,
      subject: `Sharing activity: ${params.sharerName} → ${params.recipientName} — H+ Analytics`,
      html,
    });
  }

  async sendPasswordResetEmail(params: {
    to: string;
    userName: string;
    resetUrl: string;
    expiresInMinutes?: number;
  }): Promise<void> {
    const expiry = params.expiresInMinutes || 60;
    const html = brandedTemplate(
      "Password Reset Request",
      `<p>Hi <strong>${esc(params.userName)}</strong>,</p>
      <p>I received a request to reset your H+ Analytics password. Click the button below to create a new one.</p>
      <p style="margin-top:28px;text-align:center;"><a href="${params.resetUrl}" class="btn">Reset Your Password</a></p>
      <p class="hint" style="margin-top:20px;">This link expires in ${expiry} minutes. If you didn't request a password reset, you can safely ignore this email — your account remains secure.</p>`,
      "rebecca"
    );

    await this.sendEmailInternal({
      to: params.to,
      subject: "Reset Your Password — H+ Analytics",
      html,
    });
  }
}

function brandedTemplate(title: string, body: string, voice: "rebecca" | "system" = "system", themeColors?: ThemeColorMap): string {
  const c = themeColors || resolveThemeColors();
  const navy = `#${c.navy}`;
  const navyLight = `#${adjustHex(c.navy, 30)}`;
  const navyDark = `#${adjustHex(c.navy, -15)}`;
  const sage = `#${c.sage}`;
  const border = `#${c.gray}`;
  const altRow = `#${c.altRow}`;
  const white = `#${c.white}`;
  const darkText = `#${c.darkText}`;
  const lightGray = `#${c.lightGray}`;
  const accent = `#${c.darkGreen}`;
  const accentLight = `#${adjustHex(c.darkGreen, 40)}`;
  const surfaceBg = "#F8F9FA";

  const rebeccaGreeting = voice === "rebecca"
    ? `<div class="rebecca-sig">
        <div class="rebecca-avatar">R</div>
        <div class="rebecca-meta">
          <span class="rebecca-name">Rebecca</span>
          <span class="rebecca-role">Analytics Assistant &middot; H+ Analytics</span>
        </div>
      </div>`
    : "";

  const footerText = voice === "rebecca"
    ? `Sent by Rebecca on behalf of <strong>H+ Analytics</strong> by Norfolk AI`
    : `Sent by <strong>H+ Analytics</strong> by Norfolk AI`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body { margin: 0; padding: 0; background: ${surfaceBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.wrapper { max-width: 640px; margin: 0 auto; padding: 32px 16px; }
.container { background: ${white}; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04); }
.header { background: linear-gradient(135deg, ${navy} 0%, ${navyLight} 50%, ${navyDark} 100%); padding: 40px 48px 36px; position: relative; overflow: hidden; }
.header::before { content: ''; position: absolute; top: -30%; right: -10%; width: 200px; height: 200px; background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%); border-radius: 50%; }
.header::after { content: ''; position: absolute; bottom: -20%; left: -5%; width: 150px; height: 150px; background: radial-gradient(circle, ${accent}15 0%, transparent 70%); border-radius: 50%; }
.brand-mark { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.brand-icon { width: 32px; height: 32px; background: ${accent}; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: ${white}; letter-spacing: -0.5px; }
.brand-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 0.5px; text-transform: uppercase; }
.header h1 { color: ${white}; font-size: 26px; margin: 0; font-weight: 700; line-height: 1.3; letter-spacing: -0.3px; position: relative; z-index: 1; }
.body { padding: 40px 48px 32px; color: ${darkText}; font-size: 15px; line-height: 1.7; }
.body p { margin: 0 0 16px; }
.body strong { color: ${navy}; font-weight: 600; }
.body ul { margin: 8px 0 16px; padding-left: 0; list-style: none; }
.body ul li { padding: 8px 16px 8px 28px; position: relative; font-weight: 500; color: ${darkText}; }
.body ul li::before { content: ''; position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 6px; height: 6px; background: ${accent}; border-radius: 50%; }
table.metrics { width: 100%; border-collapse: separate; border-spacing: 0; margin: 20px 0; border-radius: 10px; overflow: hidden; border: 1px solid ${border}; }
table.metrics th { text-align: left; padding: 10px 16px; background: ${altRow}; border-bottom: 2px solid ${border}; font-size: 12px; font-weight: 600; color: ${sage}; text-transform: uppercase; letter-spacing: 0.5px; }
table.metrics td { padding: 10px 16px; border-bottom: 1px solid ${altRow}; font-size: 14px; color: ${darkText}; }
table.metrics tr:last-child td { border-bottom: none; }
table.metrics tr:hover td { background: ${altRow}; }
.btn { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, ${accent} 0%, ${accentLight} 100%); color: ${white} !important; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; letter-spacing: 0.2px; box-shadow: 0 2px 8px ${accent}40; transition: all 0.2s; }
.callout { background: ${altRow}; border-left: 4px solid ${accent}; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0; font-size: 14px; color: ${sage}; line-height: 1.6; }
.hint { color: ${lightGray}; font-size: 13px; line-height: 1.5; }
.scenario-list { background: ${altRow}; border-radius: 10px; padding: 0; margin: 20px 0; overflow: hidden; border: 1px solid ${border}; }
.scenario-list-header { padding: 12px 20px; font-size: 12px; font-weight: 600; color: ${sage}; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid ${border}; display: flex; align-items: center; gap: 8px; }
.scenario-icon { color: ${accent}; font-size: 8px; }
.scenario-list ul { margin: 0; padding: 0; list-style: none; }
.scenario-list ul li { padding: 12px 20px; font-size: 14px; font-weight: 500; color: ${darkText}; border-bottom: 1px solid ${border}; background: ${white}; }
.scenario-list ul li::before { display: none; }
.scenario-list ul li:last-child { border-bottom: none; }
.info-card { background: ${white}; border: 1px solid ${border}; border-radius: 10px; padding: 0; margin: 20px 0; overflow: hidden; }
.info-row { display: flex; padding: 12px 20px; border-bottom: 1px solid ${altRow}; font-size: 14px; }
.info-row:last-child { border-bottom: none; }
.info-label { width: 70px; font-weight: 600; color: ${sage}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; flex-shrink: 0; padding-top: 1px; }
.info-value { color: ${darkText}; font-weight: 500; }
.rebecca-sig { display: flex; align-items: center; gap: 14px; padding: 24px 0 8px; margin-top: 12px; border-top: 1px solid ${border}; }
.rebecca-avatar { width: 40px; height: 40px; background: linear-gradient(135deg, ${accent} 0%, ${accentLight} 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: ${white}; flex-shrink: 0; }
.rebecca-meta { display: flex; flex-direction: column; gap: 2px; }
.rebecca-name { font-size: 14px; font-weight: 600; color: ${darkText}; }
.rebecca-role { font-size: 12px; color: ${lightGray}; }
.footer { padding: 28px 48px; border-top: 1px solid ${border}; text-align: center; }
.footer-text { color: ${lightGray}; font-size: 12px; line-height: 1.5; }
.footer-text strong { color: ${sage}; font-weight: 600; }
.footer-brand { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.footer-icon { width: 18px; height: 18px; background: ${navy}; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: ${white}; }
.footer-divider { width: 40px; height: 1px; background: ${border}; margin: 12px auto; }
@media (max-width: 600px) {
  .wrapper { padding: 16px 8px; }
  .header { padding: 28px 24px 24px; }
  .header h1 { font-size: 22px; }
  .body { padding: 28px 24px 20px; }
  .footer { padding: 20px 24px; }
  .btn { padding: 12px 28px; font-size: 14px; }
  .info-row { flex-direction: column; gap: 4px; }
  .info-label { width: auto; }
}
</style></head>
<body>
<div class="wrapper">
<div class="container">
<div class="header">
  <div class="brand-mark">
    <div class="brand-icon">H+</div>
    <span class="brand-name">Analytics</span>
  </div>
  <h1>${title}</h1>
</div>
<div class="body">
  ${body}
  ${rebeccaGreeting}
</div>
<div class="footer">
  <div class="footer-brand">
    <span class="footer-icon">H+</span>
  </div>
  <div class="footer-divider"></div>
  <div class="footer-text">${footerText}</div>
</div>
</div>
</div>
</body></html>`;
}

const resendIntegration = new ResendIntegration();

export const sendReportShareEmail = (params: Parameters<typeof resendIntegration.sendReportShareEmail>[0]) =>
  resendIntegration.sendReportShareEmail(params);
export const sendScenarioSummaryEmail = (params: Parameters<typeof resendIntegration.sendScenarioSummaryEmail>[0]) =>
  resendIntegration.sendScenarioSummaryEmail(params);
export const sendNotificationEmail = (params: Parameters<typeof resendIntegration.sendNotificationEmail>[0]) =>
  resendIntegration.sendNotificationEmail(params);
export const sendWelcomeEmail = (params: Parameters<typeof resendIntegration.sendWelcomeEmail>[0]) =>
  resendIntegration.sendWelcomeEmail(params);
export const sendPasswordResetEmail = (params: Parameters<typeof resendIntegration.sendPasswordResetEmail>[0]) =>
  resendIntegration.sendPasswordResetEmail(params);
export const sendScenarioShareNotification = (params: Parameters<typeof resendIntegration.sendScenarioShareNotification>[0]) =>
  resendIntegration.sendScenarioShareNotification(params);
export const sendAdminShareNotification = (params: Parameters<typeof resendIntegration.sendAdminShareNotification>[0]) =>
  resendIntegration.sendAdminShareNotification(params);
export const testResendConnection = () => resendIntegration.healthCheck().then((h) => ({
  success: h.healthy,
  error: h.lastError,
}));
export const getResendHealthCheck = () => resendIntegration.healthCheck();
