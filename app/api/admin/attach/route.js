// POST /api/admin/attach — tie a generation to a token you have seen
// it on. Body: { id, ca } — an empty ca detaches it.
//
// WHY THIS EXISTS. The directory reads contract addresses off feed
// posts, and most banners are never posted at all: people download
// them and put them straight on DEX Screener. Of the ones that are
// posted, plenty give no address. So the feed alone would show a
// fraction of the projects actually using this — and the ones missing
// are disproportionately the real launches, who are busy launching.
//
// The admin sees every generation. Recognising one on a token's page
// and attaching the address is how those get counted.
//
// ══ THE BAR FOR ATTACHING ══
//
// Only when the banner is ALREADY PUBLIC on that token's page.
// Generations are private — publishing is a deliberate act everywhere
// else in this product — and this is the one path that could put
// somebody's banner on a public page without them choosing to. It is
// not a loophole because the condition is that they published it
// themselves, somewhere more prominent than our feed. Attaching a
// banner nobody has actually shipped would break that, and no code
// here can check it.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CA_SHAPE = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})$/;

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Firestore not configured." }, { status: 501 });

  let body = {};
  try { body = await req.json(); } catch {}
  const id = String(body.id || "").trim();
  const ca = String(body.ca || "").trim();
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  // Empty detaches. Anything else has to be shaped like an address —
  // a free-text field here ends up rendered as a link on a public
  // page, which is somebody else's phishing surface.
  if (ca && !CA_SHAPE.test(ca)) {
    return NextResponse.json({ error: "That doesn't look like a contract address." }, { status: 400 });
  }

  await db.collection("generations").doc(id).update({
    ca: ca || "",
    chain: ca ? (ca.startsWith("0x") ? "ethereum" : "solana") : "",
    caBy: ca ? admin.email || "admin" : "",
    caAt: ca ? Date.now() : 0,
  });

  return NextResponse.json({ ok: true, ca });
}
