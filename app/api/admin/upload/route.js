// POST /api/admin/upload — put a banner on the board by hand.
//
// The boards (fresh wall, hero highlight) could only show banners
// generated inside the app, which made the showcase hostage to what
// happened to have been made recently. An admin can now upload any
// banner — a hand-picked favourite, a commissioned piece, an old one
// worth resurfacing — and it lands in the same generations collection
// with the same flags, so the existing feature/hide toggles apply to
// it with zero special-casing anywhere downstream.
//
// The upload is normalised through the exact pipeline generated
// banners go through (760px-wide jpeg), so a 4MB PNG straight from a
// design tool weighs the same on the homepage as everything else.
import sharp from "sharp";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { putBanner } from "@/lib/archive";
import { BANNER_W, BANNER_H } from "@/lib/templates";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Firestore not configured." }, { status: 501 });

  const form = await req.formData();
  const file = form.get("image");
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "An image is required." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "PNG, JPEG or WebP only." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (8MB max)." }, { status: 400 });
  }

  let thumb;
  let full;
  try {
    const raw = Buffer.from(await file.arrayBuffer());
    thumb = await sharp(raw).resize(760).jpeg({ quality: 74 }).toBuffer();
    // ══ KEEP WHAT WAS UPLOADED, NOT ONLY THE THUMBNAIL ══
    //
    // A hand-placed banner arrives at full quality and was being
    // reduced to a 760px JPEG on the way in, with the original
    // discarded — so the one banner on the board we definitely HAD in
    // full was the one we could never get back. Normalised to the
    // banner canvas so it matches everything else in the archive.
    full = await sharp(raw)
      .resize(BANNER_W, BANNER_H, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "That file couldn't be read as an image." }, { status: 400 });
  }

  // Under "admin" rather than an account, because there is no account
  // — this banner did not come from anyone's run. Failure is fine: the
  // board still works from the thumbnail, exactly as it did before.
  const path = await putBanner("admin", full).catch(() => null);

  const doc = {
    ...(path ? { path } : {}),
    src: `data:image/jpeg;base64,${thumb.toString("base64")}`,
    ticker: String(form.get("ticker") || "").slice(0, 24),
    // Shown as the style label on the cards. "Upload" when not given,
    // so a hand-placed banner is never mistaken for engine output when
    // reviewing the board.
    template: String(form.get("label") || "").slice(0, 40) || "Upload",
    ts: Date.now(),
    uploaded: true,
    featuredWall: false,
    featuredHero: false,
    hidden: false,
  };

  const ref = await db.collection("generations").add(doc);
  return NextResponse.json({ ok: true, item: { id: ref.id, ...doc } });
}
