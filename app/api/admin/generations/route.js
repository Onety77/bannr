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
// Read by time, filtered in memory. Deep enough to reach the examples
// attached during a launch without pulling the whole collection.
const ATTACHED_SCAN = 500;

const FIELD = { wall: "featuredWall", hero: "featuredHero", x: "featuredX", hidden: "hidden" };

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Firestore not configured." }, { status: 501 });

  const col = db.collection("generations");
  const filter = new URL(req.url).searchParams.get("filter") || "all";

  // The storage path is stripped and replaced by a flag, exactly as
  // /api/history does. The browser has no use for it, and it is the
  // one string that would let a leaked response be replayed against
  // anything that signs paths later. The file is fetched by ID from
  // /api/admin/banner/{id}, which re-checks admin on every request.
  const row = (d) => {
    const { path, ...rest } = d.data();
    return { id: d.id, ...rest, hasFile: Boolean(path) };
  };

  // ══ OLDER THAN THE LAST SIXTY ══
  //
  // The board showed the most recent 60 and stopped, with nothing to
  // press. Anything older than that could not be reached at all — and
  // the banners used as examples on the token page were older than
  // that, so there was no way to find them and no way to take them
  // back off. A list you cannot page is a list that quietly loses
  // everything you might need to undo.
  //
  // `before` is the ts of the oldest row already on screen. Cursored
  // on the same field it is ordered by, so paging cannot skip or
  // repeat a row the way an offset does when things are written while
  // you read.
  const before = Number(new URL(req.url).searchParams.get("before")) || 0;

  let items;
  if (filter === "attached") {
    // ══ THE ONES CLAIMING A TOKEN ══
    //
    // where("ca", "!=", "") plus orderBy("ts") is a composite index,
    // and this codebase does not use them — see CLAUDE.md. So it reads
    // by time and filters in memory, which is also the only way to
    // catch documents where `ca` was never written at all rather than
    // written empty.
    const snap = await col.orderBy("ts", "desc").limit(ATTACHED_SCAN).get();
    items = snap.docs.map(row).filter((r) => typeof r.ca === "string" && r.ca.trim() !== "");
  } else if (FIELD[filter]) {
    const snap = await col.where(FIELD[filter], "==", true).limit(FILTER_LIMIT).get();
    items = snap.docs.map(row).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  } else {
    let q = col.orderBy("ts", "desc");
    if (before > 0) q = q.startAfter(before);
    const snap = await q.limit(LIST_LIMIT).get();
    items = snap.docs.map(row);
  }

  // Whether pressing again would find anything. A full page is the
  // only honest signal available without reading one more document
  // than needed.
  const more = filter === "all" && items.length === LIST_LIMIT;

  // Counts for the filter chips, so the board says how many banners are
  // live without needing to open each view. count() is an aggregation —
  // it does not read the documents it counts.
  let counts = {};
  try {
    const [wall, hero, x, hidden] = await Promise.all([
      col.where("featuredWall", "==", true).count().get(),
      col.where("featuredHero", "==", true).count().get(),
      col.where("featuredX", "==", true).count().get(),
      col.where("hidden", "==", true).count().get(),
    ]);
    counts = {
      wall: wall.data().count,
      hero: hero.data().count,
      x: x.data().count,
      hidden: hidden.data().count,
    };
  } catch {
    // Counts are decoration; the list is the point.
  }

  return NextResponse.json({ items, counts, filter, more });
}
