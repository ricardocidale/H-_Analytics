/**
 * URL validation shared across Iris (ingest guard) and the resource probe
 * runner (SSRF_BLOCKED_URL finding).
 *
 * The same rules apply in both contexts:
 *   - Only http / https schemes are permitted.
 *   - Private, loopback, and link-local host ranges are blocked.
 *
 * IPv6 hostnames in URLs are bracket-wrapped by the Node.js URL parser
 * (e.g. [fe80::1]), so patterns must match that bracketed form.
 * IPv4-mapped IPv6 addresses (::ffff:…) are decoded back to dotted-decimal
 * so the IPv4 patterns can be reused without opaque hex equivalents.
 */

const ALLOWED_URL_SCHEMES = new Set(["https:", "http:"]);

/** Patterns that match private / loopback / link-local addresses. */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  // ── IPv4 loopback / private / link-local ──────────────────────────────────
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  // ── IPv6 loopback (::1) ───────────────────────────────────────────────────
  /^::1$/, // bare form
  /^\[::1\]$/, // bracket-wrapped form produced by URL parser
  // ── IPv6 link-local (fe80::/10) ───────────────────────────────────────────
  /^\[fe8[0-9a-f]:/i,
  /^\[fe9[0-9a-f]:/i,
  /^\[fea[0-9a-f]:/i,
  /^\[feb[0-9a-f]:/i,
  // ── IPv6 ULA (fc00::/7 — covers fc and fd prefixes) ──────────────────────
  /^\[f[cd][0-9a-f]/i,
];

/**
 * Node.js normalises IPv4-mapped IPv6 addresses to compressed hex notation,
 * e.g. `http://[::ffff:169.254.169.254]/` → hostname `[::ffff:a9fe:a9fe]`.
 *
 * Decodes the two 4-hex-digit groups back to dotted-decimal IPv4 so the
 * existing IPv4 patterns in BLOCKED_HOST_PATTERNS can be reused.
 *
 * Returns the dotted-decimal string when `hostname` matches the
 * `[::ffff:HHHH:HHHH]` shape, or `null` otherwise.
 */
function extractIpv4FromMappedIpv6(hostname: string): string | null {
  const match = hostname.match(/^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/i);
  if (!match) return null;
  const hiStr = match[1].padStart(4, "0");
  const loStr = match[2].padStart(4, "0");
  const b0 = Number("0x" + hiStr.slice(0, 2));
  const b1 = Number("0x" + hiStr.slice(2, 4));
  const b2 = Number("0x" + loStr.slice(0, 2));
  const b3 = Number("0x" + loStr.slice(2, 4));
  return `${b0}.${b1}.${b2}.${b3}`;
}

/**
 * Returns an error message if the URL is disallowed, or null if it is safe.
 * Blocks non-http(s) schemes and private/internal host ranges.
 */
export function validateIngestUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "Invalid URL format";
  }
  if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
    return `Unsupported URL scheme '${parsed.protocol}' — only http and https are allowed`;
  }
  const hostname = parsed.hostname;
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return `Host '${hostname}' is a private or internal address and cannot be fetched`;
    }
  }
  // IPv4-mapped IPv6 (e.g. ::ffff:169.254.x.x) decoded and re-checked.
  const mappedIpv4 = extractIpv4FromMappedIpv6(hostname);
  if (mappedIpv4 !== null) {
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(mappedIpv4)) {
        return `Host '${hostname}' (IPv4-mapped: ${mappedIpv4}) is a private or internal address and cannot be fetched`;
      }
    }
  }
  return null;
}
