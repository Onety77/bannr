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
  // Rows written before `reason` existed are all content refusals,
  // which is what this collection held at the time — so the default
  // is "policy" rather than "unknown". Dating them as unknown would
  // wrongly retire the entire existing word ranking.
  const reasonOf = (i) => i.reason || "policy";

  const stats = {
    total: items.length,
    last24h: items.filter((i) => now - i.ts < DAY).length,
    last7d: items.filter((i) => now - i.ts < 7 * DAY).length,
    generate: items.filter((i) => i.kind !== "edit" && i.kind !== "pfp").length,
    edit: items.filter((i) => i.kind === "edit").length,
    pfp: items.filter((i) => i.kind === "pfp").length,
    // ══ THE BREAKDOWN THAT ANSWERS "IS IT US OR THEM" ══
    //
    // Content refusals are a prompt problem and arrive gradually.
    // `internal` is quota, billing, a dead key or a crash — an outage,
    // and the number to look at first. Reading a total alone cannot
    // tell those apart, which is how two failed runs on production
    // looked identical to no runs at all.
    policy: items.filter((i) => reasonOf(i) === "policy").length,
    timeout: items.filter((i) => reasonOf(i) === "timeout").length,
    internal: items.filter((i) => reasonOf(i) === "internal").length,
    internal24h: items.filter((i) => reasonOf(i) === "internal" && now - i.ts < DAY).length,
  };

  // What do the refused briefs actually have in common?
  //
  // POLICY ROWS ONLY. An outage writes one row per attempt with the
  // same cause, and letting those in would turn the ranking into a
  // list of whatever words happened to be in the briefs people were
  // trying when the billing failed — burying the real signal under
  // noise at exactly the moment the log filled up.
  const counts = new Map();
  for (const i of items.filter((x) => reasonOf(x) === "policy")) {
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
