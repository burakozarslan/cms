import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Rejects a webhook target that resolves to a private, loopback, or
 * link-local address, so delivery cannot be used to reach internal services
 * (webhook-delivery capability, "Delivery targets outside the public
 * internet are rejected").
 *
 * Checked both at creation (fast-fail UX) and immediately before every
 * delivery attempt (design.md — DNS is not pinned, so a hostname's
 * resolution can change between the two).
 */

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified
  if (normalized.startsWith("fe80:")) return true; // link-local
  // fc00::/7 unique local addresses (fc00:: through fdff::).
  const firstGroup = normalized.split(":")[0] ?? "";
  if (/^f[cd][0-9a-f]{2}$/.test(firstGroup)) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPrivateIpv4(mapped[1]!.split(".").map(Number));
  return false;
}

function isDisallowedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address.split(".").map(Number));
  if (version === 6) return isPrivateIpv6(address);
  return true; // not a recognizable IP at all — refuse rather than guess
}

export type TargetCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Parses and resolves `rawUrl`, rejecting non-HTTP(S) schemes and any
 * resolved address in a private/loopback/link-local range.
 */
export async function checkWebhookTarget(
  rawUrl: string,
): Promise<TargetCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "Target URL is not well-formed." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: "Target URL must use http or https." };
  }

  // `URL#hostname` keeps the brackets around an IPv6 literal (`[::1]`),
  // which `net.isIP` does not recognize — strip them before checking.
  const hostname =
    url.hostname.startsWith("[") && url.hostname.endsWith("]")
      ? url.hostname.slice(1, -1)
      : url.hostname;

  if (isIP(hostname)) {
    if (isDisallowedAddress(hostname)) {
      return {
        allowed: false,
        reason: "Target address is not a public address.",
      };
    }
    return { allowed: true };
  }

  if (hostname === "localhost") {
    return { allowed: false, reason: "Target address is not a public address." };
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { allowed: false, reason: "Target hostname could not be resolved." };
  }

  if (resolved.length === 0) {
    return { allowed: false, reason: "Target hostname could not be resolved." };
  }

  if (resolved.some((entry) => isDisallowedAddress(entry.address))) {
    return {
      allowed: false,
      reason: "Target hostname resolves to a non-public address.",
    };
  }

  return { allowed: true };
}
