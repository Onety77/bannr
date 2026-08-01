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
import { creditsForSol } from "@/lib/packs";

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
      const pack = { ...creditsForSol(sol), sol };

      // find user by linked wallet
      const userSnap = await tx.get(
        db.collection("users").where("wallets", "array-contains", sender).limit(1)
      );

      if (userSnap.empty) {
        tx.set(payRef, {
          wallet: sender, amountSol: pack.sol, packId: pack.id,
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
        userId: userDoc.id, wallet: sender, amountSol: pack.sol,
        packId: pack.id, creditsGranted: pack.credits,
        status: "credited", ts: Date.now(),
      });
    });

    results.push(sig);
  }

  return NextResponse.json({ ok: true, processed: results.length });
}
