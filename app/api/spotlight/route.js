// GET /api/spotlight — banners for the homepage hero carousel and
// the fresh wall. Both are admin-curated: only generations flagged
// featuredHero / featuredWall from /admin7731 are ever served here.
// Without Firestore configured, falls back to the raw (unmoderated)
// in-memory feed so local/demo dev still shows something.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HERO_LIMIT = 8;
const WALL_LIMIT = 12;

const shape = (d) => {
  const { src, ticker, template, ts } = d.data();
  return { src, ticker, template, ts };
};

// Two equality filters PLUS an orderBy needs a composite index, and
// until someone creates it the query throws FAILED_PRECONDITION —
// which used to be swallowed, leaving a curated homepage stubbornly
// empty with no visible error anywhere.
//
// So: try the indexed query, and if the index isn't there, drop the
// orderBy (two equality filters alone need no composite index) and
// sort in memory instead. The featured set is bounded by how much an
// admin has curated — single digits — so sorting it here costs
// nothing. The site works with or without the index; creating it just
// moves the sort back to Firestore.
async function queryFeatured(db, field, limit) {
  try {
    const snap = await db
      .collection("generations")
      .where(field, "==", true)
      .where("hidden", "==", false)
      .orderBy("ts", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(shape);
  } catch (e) {
    if (e.code !== 9 && !/requires an index/i.test(e.message || "")) throw e;
    console.warn(
      `[spotlight] no composite index for ${field}; sorting in memory. ` +
        `Create it from the link in the Firestore error to push this back to the server.`
    );
    const snap = await db
      .collection("generations")
      .where(field, "==", true)
      .where("hidden", "==", false)
      .get();
    return snap.docs
      .map(shape)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, limit);
  }
}

export async function GET() {
  const db = getAdminDb();

  if (db) {
    try {
      const [hero, wall] = await Promise.all([
        queryFeatured(db, "featuredHero", HERO_LIMIT),
        queryFeatured(db, "featuredWall", WALL_LIMIT),
      ]);
      return NextResponse.json({ hero, wall, curated: true });
    } catch (e) {
      console.error("[spotlight] Firestore query failed:", e.message);
      // fall through to the unmoderated fallback below
    }
  }

  const items = (globalThis.__bannrSpotlight || []).slice(0, 8);
  return NextResponse.json({ hero: items, wall: items, curated: false });
}
