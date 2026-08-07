// ============================================================
// POST /api/webhooks/helius
// Phase 2: Helius pushes every transaction that touches the
// treasury wallet. We verify the auth header, match the sender
// to a linked wallet, and credit their account — idempotently
// (doc id = tx signature, so replays can never double-credit).
//
// Fully wired; activates once env vars + Firebase are set.
// ============================================================

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { creditsForPayment } from "@/lib/packs";
import { solUsd } from "@/lib/solPrice";

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

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(payRef);
      if (existing.exists) return; // idempotency: already processed

      const sender = transfer.fromUserAccount;
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
        tx.set(payRef, {
          wallet: sender, amountSol: pack.sol, packId: pack.id,
          usd: +(pack.usd || 0).toFixed(2), solUsdRate: rate,
          creditsGranted: pack.credits, status: "unclaimed",
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

    results.push(sig);
  }

  return NextResponse.json({ ok: true, processed: results.length });
}
