// ============================================================
// GET /api/history/{id}/thumb — one card's picture.
//
// The list at /api/history used to carry every thumbnail inline, which
// made it the size of the pictures in it and pushed it past what the
// platform will send once somebody had kept ~45 banners. The list now
// carries this URL instead, and the browser fetches each picture on
// its own, caches it, and only for the cards it actually draws.
//
// Same rules as /api/archive/{id}: the path scopes the read to the
// session's own account, and the cache is PRIVATE, so no shared cache
// ever holds one person's banner.
// ============================================================
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const session = requireUser(req);
  if (!session) return new NextResponse(null, { status: 401 });

  const db = getAdminDb();
  if (!db) return new NextResponse(null, { status: 404 });

  const id = String(params?.id || "").trim();
  if (!id || id.includes("/")) return new NextResponse(null, { status: 400 });

  const snap = await db
    .collection("users").doc(session.accountId)
    .collection("history").doc(id)
    .get()
    .catch(() => null);
  if (!snap?.exists) return new NextResponse(null, { status: 404 });

  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(String(snap.data().thumb || ""));
  if (!m) return new NextResponse(null, { status: 404 });

  const body = Buffer.from(m[2], "base64");
  return new NextResponse(body, {
    headers: {
      "Content-Type": m[1].toLowerCase(),
      "Content-Length": String(body.length),
      // A card's thumbnail never changes — a new banner is a new card.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
