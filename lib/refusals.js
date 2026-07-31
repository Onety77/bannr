// ============================================================
// REFUSAL LOG — every brief the content filter turns down.
//
// Users now see friendly, brand-voice copy when a brief is
// refused (see lib/errors.js), which is right — but it means a
// refusal is completely invisible from our side. People who hit a
// wall don't file a complaint, they leave. Without this we'd only
// find out from a churn number we couldn't explain.
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
      kind: entry.kind || "generate",         // "generate" | "edit"
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
