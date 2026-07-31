// GET /api/admin/refusals — briefs the content filter turned down.
// Admin-only: verified via requireAdmin on every call, not just at
// page load, so a stolen/expired client session can't linger.
//
// Returns the raw rows plus a word frequency roll-up, since the
// useful question isn't "which brief failed" but "what do the failing
// briefs have in common" — that's what tells you whether to soften
// the prompt or warn people up front.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

// Ignore words that carry no signal about WHY something was refused.
const STOP = new Set(
  ("a an and the of to for in on with is are it its this that our your my we you they " +
   "coin token meme crypto project make made makes making want wants banner " +
   "be been being have has had do does did but or as at by from into about " +
   "more most very just really so than then them their there here what which who").split(/\s+/)
);

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Firestore not configured." }, { status: 501 });

  const snap = await db.collection("refusals").orderBy("ts", "desc").limit(LIST_LIMIT).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const now = Date.now();
  const DAY = 86_400_000;
  const stats = {
    total: items.length,
    last24h: items.filter((i) => now - i.ts < DAY).length,
    last7d: items.filter((i) => now - i.ts < 7 * DAY).length,
    generate: items.filter((i) => i.kind !== "edit").length,
    edit: items.filter((i) => i.kind === "edit").length,
  };

  // What do the refused briefs actually have in common?
  const counts = new Map();
  for (const i of items) {
    const text = `${i.name} ${i.tagline} ${i.vibe} ${i.instruction}`.toLowerCase();
    const seen = new Set(); // count each word once per brief, not per mention
    for (const w of text.match(/[a-z][a-z'-]{2,}/g) || []) {
      if (STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  const commonWords = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  return NextResponse.json({ items, stats, commonWords });
}
