// ============================================================
// GET /api/archive/{id} — hand back the real file.
//
// ══ WHY THIS EXISTS INSTEAD OF A SIGNED URL ══
//
// The first version returned a signed Storage URL and let the browser
// fetch it directly. That fails, and it fails in a way that looks like
// the archive is broken: a signed URL is cross-origin, a bucket has no
// CORS configuration by default, so the <img> loads but `fetch` for
// the download is refused — the one action the feature exists for.
//
// Fixing it with a CORS policy on the bucket would be a setup step
// that has to be remembered on every environment, and it would put a
// permanent, world-reachable handle to somebody's banner into the
// browser where any log or referrer can see it.
//
// Streaming through our own origin removes all of it. No CORS. No URL
// to leak. And ownership is re-checked on EVERY request rather than
// once when the list was drawn — a page left open for an hour cannot
// outlive the session that opened it.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAdminDb, getAdminBucket } from "@/lib/firebaseAdmin";
import { isArchivePath } from "@/lib/archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const session = requireUser(req);
  if (!session) return new NextResponse(null, { status: 401 });

  const db = getAdminDb();
  const bucket = getAdminBucket();
  if (!db || !bucket) return new NextResponse(null, { status: 404 });

  const id = String(params?.id || "").trim();
  if (!id) return new NextResponse(null, { status: 400 });

  // Scoped to the session's own account by the path itself — there is
  // no way to name another account's card from here, which is why the
  // id can be an ordinary Firestore id rather than a secret.
  const snap = await db
    .collection("users").doc(session.accountId)
    .collection("history").doc(id)
    .get()
    .catch(() => null);

  if (!snap?.exists) return new NextResponse(null, { status: 404 });

  const path = snap.data().path;
  // Shape-checked before it reaches the bucket. This string comes out
  // of a document, and a document is only ever as trustworthy as
  // everything that has ever written to it.
  if (!isArchivePath(path)) return new NextResponse(null, { status: 404 });

  let buf;
  try {
    [buf] = await bucket.file(path).download();
  } catch (e) {
    // The card says there is a file and there is not. Loud, because it
    // means an object was lost rather than never written.
    console.error("[archive] MISSING OBJECT", path, e.message);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(buf.length),
      // The bytes at an id never change — a new banner is a new card.
      // PRIVATE, so no shared cache ever holds one person's banner.
      "Cache-Control": "private, max-age=31536000, immutable",
      // Names the file when it is saved, without the client having to.
      "Content-Disposition": `inline; filename="banner-${id}.png"`,
    },
  });
}
