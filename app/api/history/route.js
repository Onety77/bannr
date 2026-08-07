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
// What is stored HERE is the CARD: the brief, the style, and a ~75KB
// thumbnail, comfortably inside Firestore's 1MiB document limit.
//
// The banner itself lives in Storage and is reached through
// /api/archive/{id} — see lib/archive.js. This document holds the
// `path` to it, which is never sent to a browser.
//
// Firestore rules stay deny-all: every read and write here goes
// through the Admin SDK. No rule change is needed for any of this.
// ============================================================
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { removeBanner } from "@/lib/archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 50, up from 24. The old number was set by what a card COSTS: each
// one carries a ~100KB base64 thumbnail inline, so the collection was
// the size of the pictures in it. That is still true, and the reason
// this can move is that the expensive half — the full-resolution file
// — now lives in Storage rather than being impossible.
const MAX_ITEMS = 50;
const MAX_THUMB = 200_000;   // base64 chars — a 900x300 jpeg is ~75-110k
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
    // Kept so a banner posted to the feed from here still carries
    // the thinking behind it, exactly as it would from /create.
    concept: str(body.concept, 900),
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

  // ══ A FLAG, NOT A URL ══
  //
  // This returned a signed Storage URL at first. Two things were wrong
  // with it: a signed URL is cross-origin, so the download `fetch`
  // that is the entire point of the feature is refused by CORS; and it
  // is a world-reachable handle to somebody's banner sitting in the
  // browser where any log or referrer can pick it up.
  //
  // The browser gets a boolean and asks /api/archive/{id} when it
  // wants the file, which is same-origin and re-checks ownership on
  // every request rather than once when this list was drawn.
  //
  // `path` is never returned for the same reason it never was.
  const items = snap.docs.map((d) => {
    const { path, ...rest } = d.data();
    return { id: d.id, ...rest, hasFile: Boolean(path) };
  });

  return NextResponse.json({ ok: true, items });
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
    // The id travels even on a dedupe. Re-downloading the same banner
    // is exactly when a first archive attempt that failed — offline,
    // a dropped connection — gets a second chance, and returning
    // nothing here would make that impossible.
    if (!dup.empty) return NextResponse.json({ ok: true, deduped: true, id: dup.docs[0].id });
  }

  const ref = await col.add(entry);

  // Cap enforced at write time so the collection can never grow
  // unboundedly — the oldest cards fall off, like the localStorage
  // version before it.
  const all = await col.orderBy("ts", "desc").get();
  if (all.size > MAX_ITEMS) {
    const stale = all.docs.slice(MAX_ITEMS);
    const batch = db.batch();
    stale.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    // The stored file goes with the card. Without this, every banner
    // that ever fell off the end of the list would stay in the bucket
    // forever with nothing left pointing at it — a bill that only ever
    // grows, made of objects nobody can find.
    await Promise.all(stale.map((d) => removeBanner(d.data().path).catch(() => {})));
  }

  return NextResponse.json({ ok: true, id: ref.id });
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
  const ref = db.collection("users").doc(session.accountId).collection("history").doc(id);
  // Read before deleting, because after it there is nothing left
  // saying which object belonged to this card.
  const snap = await ref.get().catch(() => null);
  await ref.delete();
  // Deliberately AFTER the document is gone, and deliberately not
  // awaited into the response's success. A card the user asked to
  // remove staying on screen is a visible broken promise; an orphaned
  // object is a cost nobody can see, and it is logged loudly enough to
  // be found later.
  if (snap?.exists) await removeBanner(snap.data().path).catch(() => {});
  return NextResponse.json({ ok: true });
}
