// ============================================================
// RATE LIMITS THAT SURVIVE A DEPLOY.
//
// ══ WHAT WAS THERE ══
//
// Three copies of the same eight lines, each with its own `new Map()`
// living in the module. That map is per serverless INSTANCE, which
// means:
//
//   it resets on every deploy, so a limit is forgotten the moment
//   anything ships;
//
//   it is not shared between instances, so the real ceiling is the
//   written limit multiplied by however many Vercel happens to be
//   running — and it scales up under exactly the load a limit exists
//   to survive;
//
//   and a cold start begins at zero, which is free to trigger.
//
// It counted. It did not limit. On a route where each call costs about
// three cents of image generation, that gap is money.
//
// ══ WHAT THIS IS ══
//
// The same sliding window, in Firestore, so every instance reads and
// writes the same tally. One transaction per call, which is negligible
// against a route that then spends cents — and this is only used on
// routes that expensive.
//
// ══ AND WHY IT FAILS OPEN ══
//
// If Firestore cannot be reached, the request is ALLOWED. A limiter
// that turns an outage in one dependency into a dead site has done
// more damage than the abuse it was guarding against. The routes that
// matter most already need Firestore to read a balance, so they refuse
// on their own a moment later — this is not the only door.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

const COLLECTION = "rateLimits";

// A Firestore document id may not contain "/" and has a length limit.
// Keys here are account ids and IP addresses, but sanitising is the
// difference between a bad key being refused and it writing somewhere
// it should not.
function docId(scope, key) {
  const safe = String(key || "anon").replace(/[^A-Za-z0-9_:.-]/g, "_").slice(0, 120);
  return `${scope}:${safe}`;
}

/**
 * Count this call and say whether it is over the line.
 *
 * Returns { ok, remaining, retryAfter } — retryAfter in seconds, for
 * the header a 429 should carry.
 */
export async function rateLimit(scope, key, { limit = 10, windowMs = 60_000 } = {}) {
  const db = getAdminDb();
  if (!db) return { ok: true, remaining: limit, retryAfter: 0 };

  const ref = db.collection(COLLECTION).doc(docId(scope, key));
  try {
    return await db.runTransaction(async (tx) => {
      const now = Date.now();
      const snap = await tx.get(ref);
      // Timestamps rather than a counter with a window start: a fixed
      // window lets someone spend the whole allowance at the end of one
      // and again at the start of the next, which is twice the limit in
      // a moment. These arrays hold at most a dozen numbers.
      const recent = ((snap.exists ? snap.data()?.hits : null) || []).filter(
        (t) => typeof t === "number" && now - t < windowMs
      );

      if (recent.length >= limit) {
        const oldest = Math.min(...recent);
        return {
          ok: false,
          remaining: 0,
          retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
        };
      }

      recent.push(now);
      // expireAt is for a TTL policy on the collection, so old keys are
      // swept rather than accumulating one document per visitor
      // forever. Harmless if no policy is configured.
      tx.set(ref, { hits: recent, expireAt: new Date(now + windowMs * 4) }, { merge: false });
      return { ok: true, remaining: Math.max(0, limit - recent.length), retryAfter: 0 };
    });
  } catch (e) {
    console.error("[rateLimit]", scope, e.message);
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

/**
 * Best guess at who is calling, for routes with no session.
 *
 * x-forwarded-for is a list, and only the LAST entries are added by
 * infrastructure we control — but on Vercel the first is the client
 * and the header cannot be spoofed past the edge, so the first is
 * right here. x-real-ip is the fallback.
 */
export function callerIp(req) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0].trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}
