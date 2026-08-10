// ============================================================
// PAYMENT INTENTS — how a bare transfer is tied to an account.
//
// ══ WHY THIS HAS TO EXIST ══
//
// Everything that used to identify a payment came from the wallet, and
// the wallet cannot be relied on to send any of it. Read off the chain,
// on real purchases:
//
//   Solflare — memo YES, reference YES
//   Phantom  — memo NO,  reference NO
//
// Phantom takes a Solana Pay transfer request and sends a plain
// transfer, discarding both. So the transaction that arrives says only
// "this wallet paid the treasury this much". Nothing in it names an
// account, and no amount of polling will make it.
//
// ══ SO THE AMOUNT BECOMES THE NAME ══
//
// Before the wallet is opened, the server picks the EXACT number of
// lamports this account will pay — the pack price plus a random tail —
// and writes it down. When a transfer of exactly that many lamports
// lands, it is that account's payment. Nothing needs to survive the
// wallet, because the identifier is the one thing a payment cannot
// arrive without.
//
// The tail costs the payer up to 0.0001 SOL, a fraction of a cent.
//
// ══ WHAT THE TAIL IS AND IS NOT ══
//
// It is chosen by the SERVER, never by the client. If a caller could
// name their own amount they could name someone else's and claim their
// payment. Guessing blind is one in a hundred thousand, inside a short
// window, for a signature that must still be unclaimed — and
// payments/{signature} makes claiming it twice impossible either way.
//
// No composite indexes: one document per account, entries filtered in
// memory. See CLAUDE.md.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

const COLLECTION = "payIntents";

// Long enough that stopping to answer the door does not cost someone
// their money, short enough that a stale intent is not still matching
// tomorrow. A payment found after this can still be claimed by hand.
export const INTENT_TTL_MS = 24 * 60 * 60 * 1000;

// 100,000 lamports ≈ 0.0001 SOL. Small enough to be noise on a $9
// purchase, large enough that hitting someone else's number by chance
// is not a strategy.
const TAIL_SPACE = 100_000;

function tail() {
  return Math.floor(Math.random() * TAIL_SPACE);
}

export function lamportsFor(sol) {
  return Math.round(Number(sol) * 1e9);
}

const fresh = (e, now) => e && now - (e.at || 0) < INTENT_TTL_MS;

/**
 * Reserve an exact amount for each pack this account might buy.
 *
 * Every pack is armed at once, on page load, because the tap that
 * opens the wallet may not await anything — see the gesture rule in
 * lib/solanaPay.js. By the time someone chooses, the number is already
 * theirs.
 */
export async function armIntents(accountId, packs) {
  const db = getAdminDb();
  if (!db || !accountId) return {};
  const now = Date.now();
  const ref = db.collection(COLLECTION).doc(accountId);
  const snap = await ref.get();
  const kept = (snap.exists ? snap.data()?.entries || [] : []).filter(
    (e) => fresh(e, now) && !e.signature
  );

  const out = {};
  const taken = new Set(kept.map((e) => e.lamports));
  for (const p of packs) {
    const base = lamportsFor(p.sol);
    if (!(base > 0)) continue;
    // Reuse a live intent for the same pack at the same price rather
    // than minting a new number every page load — otherwise a refresh
    // between opening the wallet and paying would orphan the amount
    // the wallet is holding.
    const existing = kept.find((e) => e.packId === p.id && e.base === base);
    if (existing) { out[p.id] = existing.lamports; continue; }

    let lamports = base + tail();
    while (taken.has(lamports)) lamports = base + tail();
    taken.add(lamports);
    kept.push({ packId: p.id, base, lamports, at: now });
    out[p.id] = lamports;
  }

  await ref.set({ entries: kept, updatedAt: now }, { merge: false });
  return out;
}

/** Every amount this account is currently expected to pay. */
export async function liveIntents(accountId) {
  const db = getAdminDb();
  if (!db || !accountId) return [];
  const snap = await db.collection(COLLECTION).doc(accountId).get();
  if (!snap.exists) return [];
  const now = Date.now();
  return (snap.data()?.entries || []).filter((e) => fresh(e, now) && !e.signature);
}

/**
 * Does this transfer belong to this account?
 *
 * The intent must have been armed BEFORE the money moved. Without that
 * an intent could be armed to match a payment that had already landed,
 * which is the one way this could be turned into a way of claiming
 * somebody else's.
 */
export async function matchIntent(accountId, lamports, blockTimeMs) {
  const entries = await liveIntents(accountId);
  return (
    entries.find(
      (e) => e.lamports === lamports && (!blockTimeMs || blockTimeMs >= e.at - 60_000)
    ) || null
  );
}

/**
 * Spend an intent. Best effort on purpose: the authority that stops a
 * payment being credited twice is payments/{signature}, which is
 * created transactionally. This only keeps a used number from matching
 * again later.
 */
export async function consumeIntent(accountId, lamports, signature) {
  const db = getAdminDb();
  if (!db || !accountId) return;
  const ref = db.collection(COLLECTION).doc(accountId);
  try {
    const snap = await ref.get();
    if (!snap.exists) return;
    const now = Date.now();
    const entries = (snap.data()?.entries || [])
      .filter((e) => fresh(e, now))
      .map((e) => (e.lamports === lamports && !e.signature ? { ...e, signature } : e));
    await ref.set({ entries, updatedAt: now }, { merge: false });
  } catch {
    // A failure here cannot mint credits — it can only leave a spent
    // number matchable, and the signature check catches that.
  }
}
