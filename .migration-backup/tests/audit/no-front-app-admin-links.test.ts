/**
 * No front-of-app → Admin jumps.
 *
 * Hard product rule: the front of the app NEVER navigates the user to the
 * Admin section. Admin users reach Admin only through the sidebar's "Admin"
 * menu item. Front-of-app components are not allowed to import the admin
 * navigation helper.
 *
 * Plain-text mentions of admin paths inside informational copy (e.g.
 * "Company name and start date are required — set them in Admin → Model
 * Defaults.") are NOT policed by this test. They tell users where the
 * setting lives without performing navigation. Only an actual jump
 * (import of `setAdminSection` or `@/lib/admin-nav`) is forbidden.
 *
 * Whitelist (the only files allowed to touch admin nav):
 *   - client/src/lib/admin-nav.ts                     (the helper itself)
 *   - client/src/components/admin/**                  (admin shell)
 *   - client/src/pages/admin/**                       (admin pages)
 *   - client/src/pages/Admin.tsx                      (admin entry page)
 *   - client/src/components/Layout.tsx                (the sidebar that
 *                                                     renders the single
 *                                                     allowed Admin menu
 *                                                     item)
 *   - client/src/lib/analyst-mount-points.ts          (Analyst deep-link
 *                                                     resolver — verdict
 *                                                     hrefs only, no
 *                                                     user-visible chrome)
 *
 * Extending the whitelist is a product decision. If you genuinely need a
 * new entry, add it here AND document the reason in
 * `.agents/skills/front-of-app-admin-isolation/SKILL.md`.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CLIENT_ROOT = "client/src";

const WHITELIST = [
  "client/src/lib/admin-nav.ts",
  "client/src/components/Layout.tsx",
  "client/src/lib/analyst-mount-points.ts",
  "client/src/pages/Admin.tsx",
];

const WHITELIST_PREFIXES = [
  "client/src/components/admin/",
  "client/src/pages/admin/",
];

function isWhitelisted(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (WHITELIST.includes(normalized)) return true;
  return WHITELIST_PREFIXES.some((p) => normalized.startsWith(p));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.includes(".test.")
    ) {
      out.push(full);
    }
  }
  return out;
}

const allFiles = walk(CLIENT_ROOT);

describe("Front-of-app must not jump into Admin", () => {
  it("no non-whitelisted file imports `setAdminSection` or `@/lib/admin-nav`", () => {
    const offenders: string[] = [];
    for (const file of allFiles) {
      if (isWhitelisted(file)) continue;
      const src = fs.readFileSync(file, "utf-8");
      if (
        /from\s+["']@\/lib\/admin-nav["']/.test(src) ||
        /\bsetAdminSection\s*\(/.test(src)
      ) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `Front-of-app files cannot navigate to Admin. Offenders:\n${offenders.join(
        "\n",
      )}`,
    ).toEqual([]);
  });
});
