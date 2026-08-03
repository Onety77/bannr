// GET /api/spotlight — banners for the homepage hero carousel and
// the fresh wall. Both are admin-curated: only generations flagged
// featuredHero / featuredWall from /admin7731 are ever served here.
// Without Firestore configured, falls back to the raw (unmoderated)
// in-memory feed so local/demo dev still shows something.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HERO_LIMIT = 8;
const WALL_LIMIT = 12;
// Three, because the X teaser arranges exactly three cards.
const X_LIMIT = 3;

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
      const [hero, wall, x] = await Promise.all([
        queryFeatured(db, "featuredHero", HERO_LIMIT),
        queryFeatured(db, "featuredWall", WALL_LIMIT),
        queryFeatured(db, "featuredX", X_LIMIT),
      ]);
      // no-store at every layer. An admin un-features a banner and
      // reloads the site expecting it gone; any cache between here and
      // that reload makes the flags look broken.
      return NextResponse.json({ hero, wall, x, curated: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      console.error("[spotlight] Firestore query failed:", e.message);
      // fall through to the unmoderated fallback below
    }
  }

  const items = (globalThis.__bannrSpotlight || []).slice(0, 8);
  return NextResponse.json({ hero: items, wall: items, x: items.slice(0, 3), curated: false }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/spotlight — nominate a downloaded banner for featuring.
//
// The pool used to fill itself with the FIRST variant of every run,
// which meant the admin curated from banners chosen by position while
// the ones people actually downloaded were never candidates. Now the
// download click nominates. Requires a signed-in session (downloads
// only happen signed in), dedupes by image signature so re-downloads
// and the X version do not stack, and lands unlisted exactly like an
// upload — featuring stays a deliberate admin act.
const MAX_SRC = 400_000; // base64 chars; a 900x300 jpeg is ~80-160k

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ ok: true, stored: false });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const src = String(body?.src || "");
  if (!src.startsWith("data:image/") || src.length > MAX_SRC) {
    return NextResponse.json({ error: "Bad image." }, { status: 400 });
  }
  const sig = String(body?.sig || "").slice(0, 80);

  const col = db.collection("generations");
  if (sig) {
    const dup = await col.where("sig", "==", sig).limit(1).get();
    if (!dup.empty) return NextResponse.json({ ok: true, deduped: true });
  }

  await col.add({
    src,
    ticker: String(body?.ticker || "").slice(0, 24),
    template: String(body?.template || "").slice(0, 40),
    sig,
    ts: Date.now(),
    downloaded: true,
    featuredWall: false,
    featuredHero: false,
    hidden: false,
  });
  return NextResponse.json({ ok: true });
}
