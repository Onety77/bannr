// ============================================================
// CARRYING YOUR SESSION INTO A WALLET'S BROWSER.
//
// THE BUG THIS EXISTS FOR, because it is not obvious and it silently
// split accounts in two:
//
// On a phone there is no injected wallet in Safari or Chrome, so
// linking one means handing off into Phantom's own in-app browser.
// That browser is a SEPARATE browser. It has none of Safari's cookies,
// so the session does not travel — you arrive signed out, connect your
// wallet, and the wallet is not linked to your Google account at all:
// it CREATES A SECOND ACCOUNT keyed by the wallet.
//
// Two accounts, two credit balances, two histories, and nothing
// anywhere says so. Buy credits in one and they are invisible from the
// other.
//
// So the session has to travel with the handoff. This mints a
// short-lived, single-use token that stands in for it: the deeplink
// points at /link?t=…, and that page exchanges the token for a real
// session cookie in whatever browser opened it — the SAME account —
// before linking anything.
//
// It is a bearer credential and is treated like one:
//   - three minutes, because it is used within seconds of being made
//   - single use, burned inside a transaction so two opens cannot both
//     claim it
//   - 32 random bytes
//   - the page strips it from the URL as soon as it is spent, so it
//     does not sit in history or get shared by accident
//
// Same shape as the sign-in nonces, for the same reasons.
// ============================================================
import "server-only";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";

const TTL_MS = 3 * 60 * 1000;

// Dev fallback, mirroring lib/auth.js.
const mem = new Map();

function sweep() {
  const now = Date.now();
  for (const [k, v] of mem) if (v.expires < now) mem.delete(k);
}

export async function mintHandoff(accountId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = Date.now() + TTL_MS;

  const db = getAdminDb();
  if (!db) {
    sweep();
    mem.set(token, { accountId, expires });
    return token;
  }
  await db.collection("handoffs").doc(token).set({ accountId, expires, used: false });
  return token;
}

// Returns the accountId, or null. Burns the token either way it is
// spent — a second open must not work, and the honest failure is the
// same one an expired token gets.
export async function claimHandoff(token) {
  const clean = String(token || "").trim();
  if (!clean || clean.length > 100) return null;

  const db = getAdminDb();
  if (!db) {
    const rec = mem.get(clean);
    mem.delete(clean);
    return rec && rec.expires > Date.now() ? rec.accountId : null;
  }

  const ref = db.collection("handoffs").doc(clean);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    // Deleted rather than flagged: there is no reason to keep a spent
    // credential, and a TTL policy cannot be relied on to exist.
    tx.delete(ref);
    if (d.used || d.expires < Date.now()) return null;
    return d.accountId || null;
  });
}
