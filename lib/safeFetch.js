// ============================================================
// FETCHING A URL WE DID NOT CHOOSE.
//
// ══ WHERE THESE URLS COME FROM ══
//
// /api/lookup reads a token's metadata and downloads its logo. That
// metadata is written by whoever minted the token, which is anybody,
// which means the URL is chosen by a stranger and handed to our server
// to open.
//
// A server fetching an attacker's URL is a server that can be pointed
// inwards: at localhost, at a private address on the same network, at
// a cloud metadata endpoint. It does not have to return anything
// useful to be worth doing — whether it succeeds, and how quickly, is
// already a map of what is reachable from in here.
//
// ══ AND HOW BIG THEY MIGHT BE ══
//
// The old code read the entire response into memory and THEN checked
// whether it was under 5MB, which is the check happening after the
// damage. A reply with no Content-Length, or a lying one, could be any
// size at all. This reads with a running total and gives up the moment
// it goes over.
//
// Neither guard is perfect. DNS can resolve differently between the
// check and the request, and a redirect can land somewhere else — so
// redirects are not followed and the host is re-checked on every hop a
// caller chooses to make. It is a great deal better than nothing,
// which is what was there.
// ============================================================
import "server-only";
import dns from "node:dns/promises";

// Every range that is not the public internet. Written out rather than
// pulled from a package because it is short, and because a dependency
// that silently changes what counts as private is not a thing to have
// on this path.
const V4_PRIVATE = [
  [10, 0, 0, 0, 8],        // RFC1918
  [172, 16, 0, 0, 12],     // RFC1918
  [192, 168, 0, 0, 16],    // RFC1918
  [127, 0, 0, 0, 8],       // loopback
  [169, 254, 0, 0, 16],    // link-local, and the cloud metadata address
  [0, 0, 0, 0, 8],         // "this network"
  [100, 64, 0, 0, 10],     // carrier NAT
  [192, 0, 0, 0, 24],      // IETF protocol assignments
  [192, 0, 2, 0, 24],      // TEST-NET-1
  [198, 18, 0, 0, 15],     // benchmarking
  [198, 51, 100, 0, 24],   // TEST-NET-2
  [203, 0, 113, 0, 24],    // TEST-NET-3
  [224, 0, 0, 0, 4],       // multicast
  [240, 0, 0, 0, 4],       // reserved
];

function v4Private(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const value = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  return V4_PRIVATE.some(([a, b, c, d, bits]) => {
    const base = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (base & mask) >>> 0;
  });
}

function v6Private(ip) {
  const a = ip.toLowerCase();
  if (a === "::1" || a === "::") return true;
  if (a.startsWith("fe80") || a.startsWith("fc") || a.startsWith("fd")) return true;
  // ::ffff:127.0.0.1 and friends — a v4 address wearing a v6 coat.
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  return false;
}

export function privateAddress(ip) {
  return ip.includes(":") ? v6Private(ip) : v4Private(ip);
}

/** True when this URL is safe to open from a server. */
export async function publicUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch { return false; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // A bare IP needs no lookup, and would otherwise be trusted by a DNS
  // resolver that hands back exactly what it was given.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return !privateAddress(host);
  try {
    const records = await dns.lookup(host, { all: true });
    if (!records.length) return false;
    // ALL of them, not the first: a name resolving to one public and
    // one private address is the shape of the attack, not an accident.
    return records.every((r) => !privateAddress(r.address));
  } catch {
    return false;
  }
}

/**
 * GET a URL that somebody else chose, with a size ceiling that is
 * enforced while reading rather than after.
 *
 * Returns a Buffer, or null for anything refused — an unreachable
 * host, a private one, a body over the limit. Callers treat null as
 * "no logo", which is already how a missing image behaves.
 */
export async function fetchPublic(raw, { maxBytes = 5 * 1024 * 1024, timeoutMs = 12_000 } = {}) {
  if (!(await publicUrl(raw))) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(String(raw), {
      signal: ctrl.signal,
      // Not followed: the destination of a redirect is chosen by the
      // same stranger and would skip every check above.
      redirect: "manual",
      headers: { accept: "image/*" },
    });
    if (!res.ok || !res.body) return null;

    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > maxBytes) return null;

    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      // The point of streaming: a body that lies about its length, or
      // never states one, is stopped here rather than after it has
      // already been held in memory.
      if (total > maxBytes) return null;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
