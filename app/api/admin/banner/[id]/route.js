// ============================================================
// GET /api/admin/banner/{id} — the real file behind a board card.
//
// The Generations board shows a 900×300 JPEG at quality 0.7, because
// that is what a card needs and what fits inside a Firestore document.
// Fine for curating, useless for looking at properly or re-posting
// somewhere, and it was the only thing an admin could reach.
//
// Every card fed by a download now carries a `path` to the archived
// 1500×500 PNG — the featuring pool and the archive are written by the
// same click and stamped with the same image-derived sig, so they can
// be joined. Hand-uploaded banners carry one too, kept on the way in.
//
// ══ ADMIN, NOT OWNER ══
//
// /api/archive/{id} resolves a card under the SESSION'S OWN account,
// which is what makes it safe for anyone to call. This one deliberately
// does not: an admin looking at the board is looking at other people's
// banners, and that is the job. requireAdmin is the whole check, and it
// is a stronger one — a verified Google identity matched against a
// single address, re-checked on every call.
//
// 404 rather than an error when there is no file. Most older cards
// have none and never will; nothing full-resolution was kept before
// the archive existed, and a broken-looking failure would suggest
// otherwise.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminDb, getAdminBucket } from "@/lib/firebaseAdmin";
import { isArchivePath } from "@/lib/archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  if (!(await requireAdmin(req))) return new NextResponse(null, { status: 401 });

  const db = getAdminDb();
  const bucket = getAdminBucket();
  if (!db || !bucket) return new NextResponse(null, { status: 404 });

  const id = String(params?.id || "").trim();
  if (!id) return new NextResponse(null, { status: 400 });

  const snap = await db.collection("generations").doc(id).get().catch(() => null);
  if (!snap?.exists) return new NextResponse(null, { status: 404 });

  const path = snap.data().path;
  // Shape-checked before it reaches the bucket. It comes out of a
  // document, and a document is only as trustworthy as everything that
  // has ever written to it.
  if (!isArchivePath(path)) return new NextResponse(null, { status: 404 });

  let buf;
  try {
    [buf] = await bucket.file(path).download();
  } catch (e) {
    console.error("[admin/banner] MISSING OBJECT", path, e.message);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="banner-${id}.png"`,
    },
  });
}
