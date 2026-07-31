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

export const runtime = "nodejs";

// SOL → credits. Tune after measuring real per-generation API
// cost in Phase 0 (see blueprint §12).
const PACKS = [
  { id: "starter", sol: 0.05, credits: 15 },
  { id: "builder", sol: 0.12, credits: 45 },
  { id: "degen",   sol: 0.35, credits: 160 },
];

function matchPack(lamports) {
  const sol = lamports / 1e9;
  // exact-ish match with 2% tolerance; otherwise credit at starter rate
  for (const p of PACKS) {
    if (Math.abs(sol - p.sol) / p.sol < 0.02) return { ...p, sol };
  }
  const rate = PACKS[0].credits / PACKS[0].sol;
  return { id: "custom", sol, credits: Math.floor(sol * rate) };
}

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
      const pack = matchPack(transfer.amount);

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
