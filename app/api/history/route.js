// ============================================================
// /api/history — banners follow the ACCOUNT, not the browser.
//
// History lived in localStorage, which is per-device: download a
// banner on the phone and the laptop has never heard of it. Worse,
// it looked like a bug — "saving doesn't work" — when it was working
// perfectly on a device you weren't looking at.
//
// Entries live at users/{accountId}/history/{id}. A subcollection
// rather than a top-level collection with a where-clause, because the
// list is ordered by time and a where+orderBy across a top-level
// collection needs a composite index — this shape gets the automatic
// single-field index and cannot silently break the way the spotlight
// query once did.
//
// What is stored is the CARD, not the banner: the brief, the style,
// and a ~20KB thumbnail — comfortably inside Firestore's 1MiB
// document limit. The full-resolution archive (Storage) remains G5b.
//
// Firestore rules stay deny-all: every read and write here goes
// through the Admin SDK. No rule change is needed for any of this.
// ============================================================
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 24;
const MAX_THUMB = 150_000;   // base64 chars — a 450x150 jpeg is ~20-30k
const str = (v, n) => String(v ?? "").slice(0, n);

// Dev fallback, same pattern as lib/users.js.
const mem = new Map();

function cleanEntry(body) {
  const b = body?.brief && typeof body.brief === "object" ? body.brief : {};
  const thumb = String(body?.thumb || "");
  if (!thumb.startsWith("data:image/") || thumb.length > MAX_THUMB) return null;
  return {
    brief: {
      name: str(b.name, 60),
      ticker: str(b.ticker, 16),
      tagline: str(b.tagline, 80),
      vibe: str(b.vibe, 400),
      direction: str(b.direction, 240),
    },
    templateId: str(body.templateId, 120),
    templateName: str(body.templateName, 80),
    sig: str(body.sig, 80),
    thumb,
    ts: Date.now(),
  };
}

export async function GET(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = getAdminDb();
  if (!db) {
    const list = mem.get(session.accountId) || [];
    return NextResponse.json({ ok: true, items: list.slice(0, MAX_ITEMS) });
  }

  const snap = await db
    .collection("users").doc(session.accountId)
    .collection("history")
    .orderBy("ts", "desc")
    .limit(MAX_ITEMS)
    .get();

  return NextResponse.json({
    ok: true,
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const entry = cleanEntry(body);
  if (!entry) return NextResponse.json({ error: "Bad entry." }, { status: 400 });

  const db = getAdminDb();
  if (!db) {
    const list = mem.get(session.accountId) || [];
    if (entry.sig && list.some((h) => h.sig === entry.sig)) return NextResponse.json({ ok: true, deduped: true });
    list.unshift({ id: crypto.randomUUID(), ...entry });
    mem.set(session.accountId, list.slice(0, MAX_ITEMS));
    return NextResponse.json({ ok: true });
  }

  const col = db.collection("users").doc(session.accountId).collection("history");

  // Same-image dedupe, now account-wide: downloading the same banner
  // from two devices still makes one card.
  if (entry.sig) {
    const dup = await col.where("sig", "==", entry.sig).limit(1).get();
    if (!dup.empty) return NextResponse.json({ ok: true, deduped: true });
  }

  await col.add(entry);

  // Cap enforced at write time so the collection can never grow
  // unboundedly — the oldest cards fall off, like the localStorage
  // version before it.
  const all = await col.orderBy("ts", "desc").get();
  if (all.size > MAX_ITEMS) {
    const batch = db.batch();
    all.docs.slice(MAX_ITEMS).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const db = getAdminDb();
  if (!db) {
    mem.set(session.accountId, (mem.get(session.accountId) || []).filter((h) => h.id !== id));
    return NextResponse.json({ ok: true });
  }

  // The path itself scopes the delete to this account — there is no
  // way to name another account's document from here.
  await db.collection("users").doc(session.accountId).collection("history").doc(id).delete();
  return NextResponse.json({ ok: true });
}
