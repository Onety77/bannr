// GET /api/admin/generations — generations for moderation.
// Admin-only: verified via requireAdmin on every call, not just at
// page load, so a stolen/expired client session can't linger.
//
// ?filter=all|wall|hero|hidden
//
// The default list is the 60 most recent, which was fine for review
// and quietly broken for management: a banner featured a while ago
// falls off the end, and once it is off the end there is no way to
// reach it and un-feature it. The filtered views ask "what is live
// right now" rather than "what happened recently", so nothing featured
// can become unreachable no matter how much gets generated after it.
//
// The filtered queries deliberately carry NO orderBy. A where() on one
// field plus an orderBy on another needs a composite index, and a
// missing one throws at runtime — which is exactly how the homepage
// spotlight silently emptied itself once. These lists are capped;
// sorting them in memory costs nothing and cannot fail.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 60;
const FILTER_LIMIT = 200;

const FIELD = { wall: "featuredWall", hero: "featuredHero", hidden: "hidden" };

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Firestore not configured." }, { status: 501 });

  const col = db.collection("generations");
  const filter = new URL(req.url).searchParams.get("filter") || "all";

  let items;
  if (FIELD[filter]) {
    const snap = await col.where(FIELD[filter], "==", true).limit(FILTER_LIMIT).get();
    items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  } else {
    const snap = await col.orderBy("ts", "desc").limit(LIST_LIMIT).get();
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // Counts for the filter chips, so the board says how many banners are
  // live without needing to open each view. count() is an aggregation —
  // it does not read the documents it counts.
  let counts = {};
  try {
    const [wall, hero, hidden] = await Promise.all([
      col.where("featuredWall", "==", true).count().get(),
      col.where("featuredHero", "==", true).count().get(),
      col.where("hidden", "==", true).count().get(),
    ]);
    counts = {
      wall: wall.data().count,
      hero: hero.data().count,
      hidden: hidden.data().count,
    };
  } catch {
    // Counts are decoration; the list is the point.
  }

  return NextResponse.json({ items, counts, filter });
}
