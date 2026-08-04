// ============================================================
// IDENTITIES — the ways of proving you are an account.
//
// The account used to BE the wallet: `users/{walletAddress}`, one
// wallet, forever. That coupled three unrelated things together —
// who you are, how you sign in, and how you pay — so changing wallet
// meant losing your credits, and buying credits meant connecting a
// wallet just to see the site.
//
// Now an account is its own thing, and an identity is a pointer at
// it. `identities/{type}:{id}` -> { accountId }. A direct document
// read, so no composite index and no query cost. Google, wallet, and
// anything added later all sit in the same namespace.
// ============================================================
import "server-only";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const IDENTITY_TYPES = ["wallet", "google"];

// Dev fallback, mirroring lib/users.js — the app has to run before
// Firebase is configured.
const mem = new Map();

export function identityKey(type, id) {
  if (!IDENTITY_TYPES.includes(type)) throw new Error(`Unknown identity type: ${type}`);
  const clean = String(id || "").trim();
  if (!clean) throw new Error("Identity id is required");
  // Google subs and wallet addresses are both safe as document ids,
  // but a slash would silently create a subcollection path.
  if (clean.includes("/")) throw new Error("Invalid identity id");
  return `${type}:${clean}`;
}

export function newAccountId() {
  // 22 chars of base64url from 16 random bytes. Opaque, URL-safe, and
  // not derived from anything about the person.
  return crypto.randomBytes(16).toString("base64url");
}

// Which account does this identity open? null if it opens none.
export async function resolveIdentity(type, id) {
  const key = identityKey(type, id);
  const db = getAdminDb();
  if (!db) return mem.get(key)?.accountId ?? null;
  const snap = await db.collection("identities").doc(key).get();
  return snap.exists ? snap.data().accountId : null;
}

// Attach an identity to an account.
//
// Transactional and refuses to move an identity that already points
// somewhere else. That single rule is what stops one Google account
// draining another's credits by re-linking, and stops two people
// claiming the same wallet. Returns:
//   { ok: true,  created }         linked, or already linked here
//   { ok: false, accountId }       taken by a different account
export async function linkIdentity(type, id, accountId) {
  const key = identityKey(type, id);
  const db = getAdminDb();

  if (!db) {
    const cur = mem.get(key);
    if (cur && cur.accountId !== accountId) return { ok: false, accountId: cur.accountId };
    mem.set(key, { accountId, ts: Date.now() });
    return { ok: true, created: !cur };
  }

  const ref = db.collection("identities").doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const owner = snap.data().accountId;
      if (owner !== accountId) return { ok: false, accountId: owner };
      return { ok: true, created: false };
    }
    tx.set(ref, { accountId, type, ts: Date.now() });
    return { ok: true, created: true };
  });
}

// Everything currently attached to an account — drives the settings
// page, and tells us whether unlinking would lock someone out.
export async function identitiesFor(accountId) {
  const db = getAdminDb();
  if (!db) {
    return [...mem.entries()]
      .filter(([, v]) => v.accountId === accountId)
      .map(([k, v]) => ({ key: k, type: k.split(":")[0], id: k.slice(k.indexOf(":") + 1), ts: v.ts }));
  }
  const snap = await db.collection("identities").where("accountId", "==", accountId).get();
  return snap.docs.map((d) => ({
    key: d.id,
    type: d.data().type || d.id.split(":")[0],
    id: d.id.slice(d.id.indexOf(":") + 1),
    ts: d.data().ts,
  }));
}

// The wallet addresses this account has PROVEN it controls.
//
// Deliberately not `users/{id}.wallets`, which looks like the same
// list and is not. That array means "payments from here belong to this
// account": /api/pay/claim adds a sender to it with no signature and
// no exclusivity check, so paying the same wallet into two accounts
// puts one address in both — fine for attributing money, useless for
// deciding entitlement.
//
// These come from `identities`, where linkIdentity is transactional
// and REFUSES to re-point an address that already belongs to someone
// else. That is what makes one wallet fund exactly one account's
// holder benefits, and it is the only reason the token gate can sum
// balances across several wallets without being trivially farmed.
export async function linkedWallets(accountId) {
  const all = await identitiesFor(accountId);
  return all.filter((i) => i.type === "wallet").map((i) => i.id);
}

// Detach — but never the last one, because an account with no
// identities is unreachable and its credits are gone for good.
export async function unlinkIdentity(type, id, accountId) {
  const key = identityKey(type, id);
  const all = await identitiesFor(accountId);
  if (all.length <= 1) return { ok: false, reason: "last" };
  if (!all.some((i) => i.key === key)) return { ok: false, reason: "not-linked" };

  const db = getAdminDb();
  if (!db) { mem.delete(key); return { ok: true }; }
  await db.collection("identities").doc(key).delete();
  return { ok: true };
}
