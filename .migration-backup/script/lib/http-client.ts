/**
 * Shared HTTP client utilities wrapping curl for diagnostic scripts.
 */
import { execSync } from "child_process";

/** Execute a curl request, returning only HTTP status code. */
export function curl(url: string, method = "GET", body?: string): { status: number; body: string } {
  try {
    const args = ["-s", "-o", "/dev/null", "-w", "%{http_code}|||%{size_download}", "-X", method];
    if (body) {
      args.push("-H", "Content-Type: application/x-www-form-urlencoded", "-d", body);
    }
    const raw = execSync(`curl ${args.map(a => `'${a}'`).join(" ")} '${url}'`, { timeout: 10000 }).toString();
    const [status] = raw.split("|||");
    return { status: parseInt(status), body: "" };
  } catch {
    return { status: 0, body: "" };
  }
}

/** Execute a curl request, returning both HTTP status and response body. */
export function curlBody(url: string, method = "GET", body?: string, contentType?: string): { status: number; body: string } {
  try {
    const args = ["-s", "-w", "\n%{http_code}", "-X", method];
    if (body && contentType) {
      args.push("-H", `Content-Type: ${contentType}`, "-d", body);
    } else if (body) {
      args.push("-H", "Content-Type: application/x-www-form-urlencoded", "-d", body);
    }
    const raw = execSync(`curl ${args.map(a => `'${a}'`).join(" ")} '${url}'`, { timeout: 15000 }).toString();
    const lines = raw.trim().split("\n");
    const status = parseInt(lines[lines.length - 1]);
    const responseBody = lines.slice(0, -1).join("\n");
    return { status, body: responseBody };
  } catch {
    return { status: 0, body: "" };
  }
}

/** Execute a JSON API call with optional auth cookie. */
export function apiCall(method: string, path: string, body?: unknown, cookie?: string): { status: number; body: string } {
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
    const args = ["-s", "-w", "\n%{http_code}", "-X", method];
    if (cookie) args.push("-H", `Cookie: ${cookie}`);
    if (body) {
      args.push("-H", "Content-Type: application/json", "-d", JSON.stringify(body));
    }
    const raw = execSync(`curl ${args.map(a => `'${a}'`).join(" ")} '${baseUrl}${path}'`, { timeout: 10000 }).toString();
    const lines = raw.trim().split("\n");
    const status = parseInt(lines[lines.length - 1]);
    const responseBody = lines.slice(0, -1).join("\n");
    return { status, body: responseBody };
  } catch {
    return { status: 0, body: "" };
  }
}

/** Login as admin and return the session cookie, or null on failure. */
export function adminLogin(baseUrl: string, password: string): string | null {
  try {
    const raw = execSync(
      `curl -s -D - -X POST -H 'Content-Type: application/json' -d '{"email":"admin","password":"${password}"}' '${baseUrl}/api/auth/admin-login'`,
      { timeout: 10000 }
    ).toString();
    const setCookie = raw.match(/set-cookie:\s*([^\r\n]+)/i);
    if (setCookie) {
      const sid = setCookie[1].split(";")[0];
      return sid;
    }
    return null;
  } catch {
    return null;
  }
}
