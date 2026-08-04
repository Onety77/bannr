// ============================================================
// HANDLES — the name you post under.
//
// A new identity surface, and the first thing in this app that other
// users see. That makes it the first thing worth taking from someone,
// so it follows the same shape as lib/identities.js: a document whose
// ID *is* the claim, written in a transaction that refuses to move a
// name that already belongs to somebody.
//
//   handles/{handle} -> { accountId, ts }
//
// The handle lives ONLY here, never denormalised onto a post. Feeds
// normally copy the author's name onto every row to save a join, and
// that is exactly how a platform ends up with old posts showing a name
// its owner has since abandoned. Reads resolve through a single
// batched getAll instead — one round trip for a whole page, and never
// stale. See lib/feed.js.
//
// RESERVED NAMES ARE NOT OPTIONAL. The damage from someone posting as
// "bannr" or "dexscreener" is a scam with our credibility attached,
// and it is far cheaper to refuse the name than to clean up after it.
// The list below is the platform surface — impersonation of a specific
// TOKEN cannot be enumerated in advance and is handled by reporting
// plus admin hide.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

// 3-20 characters. Lowercase only, so "Bannr" and "bannr" cannot both
// exist — case-confusable names are the oldest impersonation trick
// there is.
const SHAPE = /^[a-z0-9_]{3,20}$/;

const RESERVED = new Set([
  // us
  "bannr", "bannrapp", "bannrofficial", "team", "official", "staff",
  "admin", "administrator", "mod", "mods", "moderator", "support",
  "help", "helpdesk", "root", "system", "security", "billing",
  // route-shaped, so a handle can never look like a page
  "api", "www", "app", "create", "feed", "credits", "settings",
  "history", "login", "logout", "signin", "signup", "account", "me",
  "about", "terms", "privacy", "null", "undefined", "anonymous",
  // places people would read as authority
  "dexscreener", "dex", "solana", "phantom", "jupiter", "pumpfun",
  "raydium", "birdeye", "coingecko", "coinmarketcap", "binance",
]);

export function handleShape(raw) {
  const h = String(raw || "").trim().toLowerCase().replace(/^@+/, "");
  if (!h) return { ok: false, error: "Pick a handle." };
  if (!SHAPE.test(h)) {
    return {
      ok: false,
      error: "3–20 characters, using letters, numbers and underscores only.",
    };
  }
  if (RESERVED.has(h)) return { ok: false, error: "That handle isn't available." };
  // A name that is only digits reads as an ID and invites confusion
  // with anything else numeric we ever show beside it.
  if (/^\d+$/.test(h)) return { ok: false, error: "Handles need at least one letter." };
  return { ok: true, handle: h };
}

// Claim a handle for an account.
//
// Transactional, and refuses a name already taken by someone else —
// the same single rule that makes identities safe. Re-claiming your
// own is a no-op rather than an error, so a double-tap cannot fail.
//
//   { ok: true, handle }        yours now, or already was
//   { ok: false, error }        taken, malformed or reserved
export async function claimHandle(accountId, raw) {
  const shape = handleShape(raw);
  if (!shape.ok) return shape;
  const handle = shape.handle;

  const db = getAdminDb();
  if (!db) return { ok: false, error: "Not configured." };

  const ref = db.collection("handles").doc(handle);
  const userRef = db.collection("users").doc(accountId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().accountId !== accountId) {
      // Deliberately does not say who holds it.
      return { ok: false, error: "That handle is taken." };
    }
    const userSnap = await tx.get(userRef);
    const previous = userSnap.exists ? userSnap.data().handle : null;

    if (!snap.exists) tx.set(ref, { accountId, handle, ts: Date.now() });
    // The old name is released, so changing your mind does not
    // permanently squat a name nobody is using.
    if (previous && previous !== handle) {
      tx.delete(db.collection("handles").doc(previous));
    }
    tx.set(userRef, { handle }, { merge: true });
    return { ok: true, handle };
  });
}

// The public profile lookup: a handle in a URL to the account
// behind it. A direct document read, so no query and no index.
export async function accountForHandle(raw) {
  const shape = handleShape(raw);
  if (!shape.ok) return null;
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("handles").doc(shape.handle).get();
  return snap.exists ? snap.data().accountId || null : null;
}

export async function handleOf(accountId) {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("users").doc(accountId).get();
  return snap.exists ? snap.data().handle || null : null;
}

// Handles for many accounts in ONE round trip.
//
// This is why posts do not carry a copy of the author's name. getAll
// takes a list of refs and returns them together, so a page of twenty
// posts by fifteen people costs one call, not fifteen — and a handle
// change is reflected everywhere immediately instead of leaving a
// trail of old names on old rows.
// Returns { accountId: { handle, photo } } — both in the same round
// trip, since a feed needs a name and a face together and splitting
// them would double the reads for nothing.
export async function handlesFor(accountIds = []) {
  const out = {};
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (!ids.length) return out;

  const db = getAdminDb();
  if (!db) return out;
  try {
    const refs = ids.map((id) => db.collection("users").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => {
      if (!s.exists) return;
      const d = s.data();
      if (d.handle) out[s.id] = { handle: d.handle, photo: d.photo || null };
    });
  } catch {
    // A feed that cannot resolve names is still a feed. Callers fall
    // back to a neutral label rather than failing the whole page.
  }
  return out;
}
