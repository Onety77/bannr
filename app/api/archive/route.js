// ============================================================
// POST /api/archive — keep the real file.
//
// Called once, immediately after a download succeeds, with the
// 1500×500 PNG the browser already has in memory. That timing is the
// whole policy: the download is what says a banner mattered, so it is
// the only thing that gets stored. Three rejected options from the
// same run are never uploaded at all.
//
// ══ MULTIPART, NOT JSON ══
//
// A 1500×500 PNG is roughly 2MB. As base64 inside a JSON body that
// becomes ~2.7MB, against a platform limit of ~4.5MB for the whole
// request — close enough that a detailed banner would occasionally
// 413, which is exactly the failure we just spent a day removing from
// the PFP maker. Sent as a Blob it stays binary.
//
// ══ IT CANNOT BREAK A DOWNLOAD ══
//
// The file is already saved to disk by the time this is called, and
// the caller does not await it. Every failure path here returns a
// plain ok:false — no bucket, no session, a bad id, an upload that
// died — and the product behaves as it did before the archive
// existed: the banner lives in the tab and the card keeps its
// thumbnail.
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { putBanner, removeBanner } from "@/lib/archive";
import { BANNER_W, BANNER_H } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

// A 1500×500 PNG is ~1.5–2.5MB. 6 leaves room for an unusually busy
// one without accepting something that was never a banner.
const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ ok: false, reason: "no-db" });

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const id = String(form.get("id") || "").trim();
  const file = form.get("image");
  if (!id || !file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, reason: "too-large" }, { status: 413 });

  // The card must exist and must be THIS account's. The path below is
  // scoped to the session, so there is no way to name someone else's
  // document — but the id still has to resolve, or a caller could
  // create objects with nothing pointing at them.
  const ref = db.collection("users").doc(session.accountId).collection("history").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: false, reason: "no-card" }, { status: 404 });

  // Already archived. Not an error — a re-download of the same banner
  // dedupes to the same card and lands here again, and re-uploading
  // would leave the previous object orphaned.
  if (snap.data().path) return NextResponse.json({ ok: true, already: true });

  let png;
  try {
    // Re-encoded rather than trusted. What arrives is whatever the
    // browser put in a Blob, and this is the one place bytes from a
    // client become a stored file — running it through sharp
    // guarantees it is a real image, at the size it claims, in the
    // format the download expects. It also strips any metadata that
    // rode along.
    png = await sharp(Buffer.from(await file.arrayBuffer()))
      .resize(BANNER_W, BANNER_H, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
  } catch {
    return NextResponse.json({ ok: false, reason: "not-an-image" }, { status: 400 });
  }

  const path = await putBanner(session.accountId, png);
  if (!path) return NextResponse.json({ ok: false, reason: "no-bucket" });

  try {
    await ref.update({ path });
  } catch {
    // The document could not be pointed at the object, so nothing will
    // ever find it. Remove it rather than leaving a paid-for orphan.
    await removeBanner(path).catch(() => {});
    return NextResponse.json({ ok: false, reason: "no-link" });
  }

  // ══ AND POINT THE ADMIN BOARD AT THE SAME FILE ══
  //
  // The featuring pool is fed by the download click — the same click
  // that writes this card and stores this file — and both stamp the
  // identical image-derived `sig`. So the record an admin curates from
  // can share the real banner instead of the 900×300 JPEG it keeps for
  // its own thumbnail.
  //
  // Best-effort and last: the person's own archive is the thing that
  // was asked for, and a failure to enrich a board they will never see
  // must not report as a failure to keep their banner.
  const sig = snap.data().sig;
  if (sig) {
    try {
      const gen = await db.collection("generations").where("sig", "==", sig).limit(1).get();
      if (!gen.empty && !gen.docs[0].data().path) {
        await gen.docs[0].ref.update({ path });
      }
    } catch {}
  }

  return NextResponse.json({ ok: true });
}
