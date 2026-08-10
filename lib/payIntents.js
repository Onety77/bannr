// A mobile Solana transfer cannot be trusted to preserve a memo or
// reference. Before the wallet opens, reserve an exact amount for the
// signed-in account. The amount index is global, so it can never identify
// two people at once.
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

const COLLECTION = "payIntents";
const AMOUNTS = "payAmounts";

export const INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const TAIL_SPACE = 100_000;
const MAX_TAIL_ATTEMPTS = 200;

function tail() {
  return Math.floor(Math.random() * TAIL_SPACE);
}

export function lamportsFor(sol) {
  return Math.round(Number(sol) * 1e9);
}

const fresh = (entry, now) => entry && now - (entry.at || 0) < INTENT_TTL_MS;

/**
 * Reserve the exact transfer amount for every displayed pack. A global
 * reservation document makes the amount an unambiguous payment reference,
 * even when two customers load the price page at the same time.
 */
// ══ WHAT WAS QUOTED, RECORDED WITH THE AMOUNT ══
//
// A payment used to be graded at CLAIM time: take the SOL that
// arrived, look up today's rate, work out which pack that is. That is
// re-running the sum with different inputs and hoping for the same
// answer.
//
// It usually agreed. It cannot be relied on to: the reserved amount
// lives for a day, the tolerance band is 8%, and SOL moves further
// than that in a day often enough. Pay for Studio, come back after a
// swing, and the same transaction grades as something else — the payer
// having sent exactly what was asked for.
//
// So the deal is written down when it is offered. Credits, dollars,
// the rate it was struck at and the discount applied. The claim then
// honours the quote instead of recomputing it, which also means a
// payment can be credited while the price feed is down: the price was
// agreed before it went away.
const quoteOf = (pack, quote) => ({
  credits: pack.credits,
  usd: pack.usd,
  rate: quote.rate ?? null,
  discount: quote.discount ?? 0,
});

export async function armIntents(accountId, packs, quote = {}) {
  const db = getAdminDb();
  if (!db || !accountId) return {};
  const accountRef = db.collection(COLLECTION).doc(accountId);

  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const accountSnap = await tx.get(accountRef);
    const entries = (accountSnap.exists ? accountSnap.data()?.entries || [] : []).filter(
      (entry) => fresh(entry, now) && !entry.signature
    );
    const assigned = {};
    const local = new Set(entries.map((entry) => entry.lamports));
    const writes = [];

    for (const pack of packs) {
      const base = lamportsFor(pack.sol);
      if (!(base > 0)) continue;

      const current = entries.find((entry) => entry.packId === pack.id && entry.base === base);
      if (current) {
        const amountRef = db.collection(AMOUNTS).doc(String(current.lamports));
        const amountSnap = await tx.get(amountRef);
        const owner = amountSnap.exists ? amountSnap.data() : null;
        if (!owner || !fresh(owner, now) || owner.accountId === accountId) {
          // Re-stamp the quote: the price is re-struck on every page
          // load, so a reused amount must carry TODAY figures or the
          // payer is graded against a quote they never saw.
          Object.assign(current, quoteOf(pack, quote));
          writes.push([amountRef, { accountId, packId: pack.id, at: current.at }]);
          assigned[pack.id] = current.lamports;
          continue;
        }
        // An intent created by the old account-local allocator collided.
        // Retire it and allocate a globally reserved amount below.
        entries.splice(entries.indexOf(current), 1);
        local.delete(current.lamports);
      }

      let lamports = 0;
      let amountRef = null;
      for (let tries = 0; tries < MAX_TAIL_ATTEMPTS; tries += 1) {
        const candidate = base + tail();
        if (local.has(candidate)) continue;
        const candidateRef = db.collection(AMOUNTS).doc(String(candidate));
        const candidateSnap = await tx.get(candidateRef);
        const owner = candidateSnap.exists ? candidateSnap.data() : null;
        if (owner && fresh(owner, now) && owner.accountId !== accountId) continue;
        lamports = candidate;
        amountRef = candidateRef;
        break;
      }
      if (!amountRef) throw new Error("Couldn't prepare checkout. Please try again.");

      local.add(lamports);
      entries.push({ packId: pack.id, base, lamports, at: now, ...quoteOf(pack, quote) });
      writes.push([amountRef, { accountId, packId: pack.id, at: now }]);
      assigned[pack.id] = lamports;
    }

    // Every read above has completed before Firestore receives a write.
    tx.set(accountRef, { entries, updatedAt: now }, { merge: false });
    for (const [amountRef, value] of writes) tx.set(amountRef, value, { merge: false });
    return assigned;
  });
}

export async function liveIntents(accountId) {
  const db = getAdminDb();
  if (!db || !accountId) return [];
  const snap = await db.collection(COLLECTION).doc(accountId).get();
  if (!snap.exists) return [];
  const now = Date.now();
  return (snap.data()?.entries || []).filter((e) => fresh(e, now) && !e.signature);
}

export async function matchIntent(accountId, lamports, blockTimeMs) {
  const entries = await liveIntents(accountId);
  return entries.find(
    (e) => e.lamports === lamports && (!blockTimeMs || blockTimeMs >= e.at - 60_000)
  ) || null;
}

export async function consumeIntent(accountId, lamports, signature) {
  const db = getAdminDb();
  if (!db || !accountId) return;
  const ref = db.collection(COLLECTION).doc(accountId);
  try {
    const snap = await ref.get();
    if (!snap.exists) return;
    const now = Date.now();
    const entries = (snap.data()?.entries || [])
      .filter((entry) => fresh(entry, now))
      .map((entry) => (entry.lamports === lamports && !entry.signature ? { ...entry, signature } : entry));
    await ref.set({ entries, updatedAt: now }, { merge: false });
  } catch {
    // Payment idempotency is enforced by payments/{signature}; failure here
    // cannot create extra credits.
  }
}
