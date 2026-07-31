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

async function queryFeatured(db, field, limit) {
  const snap = await db
    .collection("generations")
    .where(field, "==", true)
    .where("hidden", "==", false)
    .orderBy("ts", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const { src, ticker, template, ts } = d.data();
    return { src, ticker, template, ts };
  });
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
