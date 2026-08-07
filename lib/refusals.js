// ============================================================
// FAILURE LOG — every run that did not produce what was asked for.
//
// Users now see friendly, brand-voice copy when a brief is
// refused (see lib/errors.js), which is right — but it means a
// refusal is completely invisible from our side. People who hit a
// wall don't file a complaint, they leave. Without this we'd only
// find out from a churn number we couldn't explain.
//
// ══ IT WAS CONTENT REFUSALS ONLY, AND THAT WAS THE HOLE ══
//
// Two PFP runs failed on production and the admin panel showed
// nothing at all, which read as "no failures" and meant "failures we
// chose not to write down". Two reasons, both real:
//
//   1. /api/pfp never called this at all. Banners and edits did.
//   2. Even for banners it was only called inside the `policy` branch,
//      so quota, billing, a dead key and a timeout — every reason that
//      is OUR fault rather than the brief's — left no trace anywhere
//      but the platform log.
//
// The second is the worse one. A content refusal is a prompt problem
// and shows up gradually; a billing failure is a total outage, and it
// was the one class guaranteed to be invisible on the screen someone
// checks when things break.
//
// So everything is recorded, tagged with `reason`. The word-ranking in
// the admin route still reads ONLY the policy rows — an outage must
// not pollute the "what do refused briefs have in common" signal with
// a hundred identical quota errors.
//
// Crypto briefs are exactly the kind of thing filters dislike:
// gambling and drug references, weapons, "1000x" hype language,
// celebrity or brand likenesses, certain mascots. If a meaningful
// share of paying customers is being blocked, that's a product
// problem to fix in the prompt — not something to discover later.
//
// So: every refusal is written here with the exact brief that
// caused it, readable at /admin7731. Admin-only, never exposed
// publicly, and it stores the raw provider message too — that
// detail is useless to a customer but is the whole point for us.
//
// Best-effort by design: a logging failure must never turn into a
// second error on a request that already failed.
// ============================================================

import { getAdminDb } from "@/lib/firebaseAdmin";

export async function recordRefusal(entry) {
  try {
    const db = getAdminDb();
    if (!db) return; // Firestore not configured yet — nothing to do
    await db.collection("refusals").add({
      kind: entry.kind || "generate",         // "generate" | "edit" | "pfp"
      // WHY it failed, from lib/errors.js publicError().reason:
      //   "policy"   the brief tripped content checks — their problem,
      //              fixable, and the only kind worth word-ranking
      //   "timeout"  it took too long
      //   "internal" quota, billing, a dead key, a crash — OUR problem,
      //              and the class that used to be written down nowhere
      reason: entry.reason || "policy",
      ts: Date.now(),
      name: entry.name || "",
      ticker: entry.ticker || "",
      tagline: entry.tagline || "",
      vibe: entry.vibe || "",                 // the About — usual suspect
      instruction: entry.instruction || "",   // edits only
      templateId: entry.templateId || "",
      // "image" | "text" | "unknown" — which input the free moderation
      // probe blamed after the refusal. Feeds the admin word-ranking
      // with something even more useful: whether words are the
      // problem at all.
      diagnosis: entry.diagnosis || "unknown",
      // categories the image API itself named (e.g. "sexual"), parsed
      // from its error — authoritative where the probe is blind
      violations: entry.violations || "",
      detail: String(entry.detail || "").slice(0, 500),
    });
  } catch {}
}
