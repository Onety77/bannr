// ============================================================
// POST /api/webhooks/helius — Helius pushes every transaction that
// touches the treasury wallet, and this credits it.
//
// ══ THE PRIMARY PATH, NOT THE BACKSTOP ══
//
// It used to attribute a payment by looking the SENDER up among
// wallets registered to accounts. That was right when paying required
// a linked wallet. It does not any more — buying takes a signature and
// nothing else — so most senders are strangers to us, and this path
// filed their payments as "unclaimed" and credited nobody until a
// browser turned up to finish the job.
//
// It now asks by AMOUNT first. The exact lamports were reserved for
// one account before the wallet was ever opened, and they carry the
// quote, so this can credit the right person the right number with no
// session and without the browser ever coming back. See
// lib/payIntents.js.
//
// That makes the ORDER of arrival stop mattering: whichever of this
// and /api/pay/claim gets there first credits, and the other finds the
// payment attributed and does nothing. Both write the same
// payments/{signature}, which is what makes a double credit
// impossible.
//
// The sender rule is still here underneath, for SOL sent by hand to
// the treasury address by someone whose wallet we do know.
//
// Activates once HELIUS_WEBHOOK_AUTH and Firebase are set.
// ============================================================

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { creditsForPayment } from "@/lib/packs";
import { solUsd } from "@/lib/solPrice";
import { intentForAmount, consumeIntent } from "@/lib/payIntents";

export const runtime = "nodejs";


export async function POST(req) {
  const expected = process.env.HELIUS_WEBHOOK_AUTH;
  if (!expected) {
    return NextResponse.json(
      { error: "Webhook not configured yet (set HELIUS_WEBHOOK_AUTH)." },
      { status: 501 }
    );
  }
  if (req.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Firebase Admin not configured (set FIREBASE_SERVICE_ACCOUNT_JSON)." },
      { status: 501 }
    );
  }

  const treasury = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  const events = await req.json(); // Helius "enhanced" webhook payload (array)

  // Read once for the whole batch. Null means we cannot price these
  // right now, and the loop below records them unpriced rather than
  // guessing — see the note at the grading call.
  const rate = await solUsd();

  const results = [];
  for (const ev of Array.isArray(events) ? events : [events]) {
    const sig = ev.signature;
    if (!sig) continue;

    const transfer = (ev.nativeTransfers || []).find(
      (t) => t.toUserAccount === treasury && t.amount > 0
    );
    if (!transfer) continue;

    const payRef = db.collection("payments").doc(sig);

    // ══ WHOSE PAYMENT IS THIS? ASKED BY AMOUNT, BEFORE ANYTHING ELSE ══
    //
    // The old first question was "is the sender a wallet registered to
    // an account", which fails for every first-time buyer — buying
    // stopped requiring a linked wallet, so most senders are strangers
    // to us. Those payments were filed as "unclaimed" and credited to
    // nobody until a browser turned up to claim them.
    //
    // The amount answers it directly. It was reserved for one account
    // before the wallet was ever opened, and it carries the quote, so
    // this path can credit the right person the right number without a
    // session and without the browser ever coming back.
    //
    // Read outside the transaction on purpose: reads inside one must
    // all precede its writes, and this is two lookups. It is safe
    // because payments/{signature} is the thing that actually decides,
    // and it is re-read inside the transaction below.
    const lamports = Math.round(transfer.amount);
    const blockTimeMs = (ev.timestamp || 0) * 1000;
    const owned = await intentForAmount(lamports, blockTimeMs).catch(() => null);

    const outcome = await db.runTransaction(async (tx) => {
      const existing = await tx.get(payRef);
      // Attributed already — by a browser claim, or by an earlier
      // delivery of this same webhook. An UNATTRIBUTED record is not
      // done: it is a payment waiting for exactly this.
      if (existing.exists && existing.data()?.accountId) return;

      const sender = transfer.fromUserAccount;

      // The reserved amount wins over everything below it. It is the
      // only route that knows both who paid and what they were
      // promised.
      if (owned) {
        const e = owned.entry;
        const userRef = db.collection("users").doc(owned.accountId);
        const userSnap = await tx.get(userRef);
        if (userSnap.exists) {
          tx.update(userRef, { credits: (userSnap.data().credits || 0) + e.credits });
          tx.set(payRef, {
            accountId: owned.accountId, userId: owned.accountId,
            wallet: sender, amountSol: lamports / 1e9, sol: lamports / 1e9,
            usd: +(e.usd || 0).toFixed(2), solUsdRate: e.rate ?? rate,
            discount: e.discount || 0,
            packId: e.packId, creditsGranted: e.credits,
            status: "credited", via: "webhook", priced: "quoted", ts: Date.now(),
          });
          return "quoted";
        }
      }
      // Pricing lives in lib/packs.js so the page and the payout can
      // never disagree. Off-tier amounts are credited at the best rate
      // they qualify for — see the note there.
      const sol = transfer.amount / 1e9;

      // ══ NO DISCOUNT ON THIS PATH, AND THAT IS CORRECT ══
      //
      // This is the backstop: SOL that arrived without anyone claiming
      // it from a signed-in session. There is no account yet, so there
      // is no tier, so there is nothing to discount against — and
      // guessing one from the sending wallet would mean reading a
      // balance inside a Firestore transaction, which is both slow and
      // a different trust model from the signature-verified link the
      // ladder is built on.
      //
      // The consequence is bounded and in the right direction: a
      // holder whose claim never ran is credited as a non-holder, i.e.
      // slightly under. That is a refundable mistake. Crediting a
      // stranger at a founder's discount would not be.
      const pack = rate === null ? null : { ...creditsForPayment(sol, rate, 0), sol };

      // Unpriced: recorded in full, credited to nobody, and left for a
      // human. Losing the record would be far worse than delaying the
      // credits, and a payment marked "unpriced" is a thing somebody
      // can act on — a silent zero is not.
      if (!pack) {
        tx.set(payRef, {
          wallet: sender, amountSol: sol, packId: "", creditsGranted: 0,
          status: "unpriced",
          note: "No SOL price at the time this landed — grade and credit by hand.",
          ts: Date.now(),
        });
        return;
      }

      // THE BACKSTOP PATH. The primary route is now /api/pay/claim:
      // someone paying from a signed-in session tells us the signature
      // directly, so attribution never has to be guessed. This runs
      // when that didn't happen — a closed tab, or SOL sent by hand to
      // the treasury address — and falls back to the old rule of
      // matching the sender against addresses registered to an
      // account. Both paths write this same payments/{signature}
      // document, so whichever arrives first wins and the other is a
      // no-op.
      const userSnap = await tx.get(
        db.collection("users").where("wallets", "array-contains", sender).limit(1)
      );

      if (userSnap.empty) {
        // ══ creditsGranted IS ZERO, BECAUSE NOTHING WAS GRANTED ══
        //
        // It used to carry the full pack figure on a record credited to
        // nobody. Two things went wrong with that. Every reader that
        // sums this field — billing history, admin stats — counted
        // credits that had never been issued. And /api/pay/claim read
        // it back and reported it to the payer as though their balance
        // had moved.
        //
        // What the pack WOULD be worth is still recorded, under a name
        // that does not claim it happened.
        tx.set(payRef, {
          wallet: sender, amountSol: pack.sol, packId: pack.id,
          usd: +(pack.usd || 0).toFixed(2), solUsdRate: rate,
          creditsGranted: 0, creditsQuoted: pack.credits, status: "unclaimed",
          note: "Payment from unlinked wallet — claimable by proving ownership.",
          ts: Date.now(),
        });
        return;
      }

      const userDoc = userSnap.docs[0];
      tx.update(userDoc.ref, {
        credits: (userDoc.data().credits || 0) + pack.credits,
      });
      tx.set(payRef, {
        // accountId is the field billing history queries. userId is
        // kept because older documents have it and nothing gains from
        // rewriting history.
        accountId: userDoc.id, userId: userDoc.id,
        wallet: sender, amountSol: pack.sol,
        usd: +(pack.usd || 0).toFixed(2), solUsdRate: rate, discount: 0,
        packId: pack.id, creditsGranted: pack.credits,
        status: "credited", via: "webhook", ts: Date.now(),
      });
    });

    // Spend the reserved amount, so the same number cannot identify a
    // later payment. After the transaction and best-effort, exactly as
    // in /api/pay/claim: what actually prevents a double credit is
    // payments/{signature}, and failing here can only leave a used
    // number matchable, which that catches.
    if (outcome === "quoted" && owned) {
      await consumeIntent(owned.accountId, lamports, sig).catch(() => {});
    }

    results.push(sig);
  }

  return NextResponse.json({ ok: true, processed: results.length });
}
