// GET  /api/settings — saved preferences + billing history
// POST /api/settings — save preferences
//
// Preferences live on the account, not the browser, so they follow the
// wallet to a new device. Everything written here is sanitised and
// size-capped in lib/users.js — it's user-supplied JSON heading into a
// Firestore document with a 1 MiB ceiling.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUser, getSettings, saveSettings, publicUser } from "@/lib/users";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYMENT_LIMIT = 25;

// The blockchain is the receipt — every purchase already has a
// permanent, publicly verifiable record, so the account page links
// straight to it rather than us emailing anything.
async function billingHistory(accountId) {
  const db = getAdminDb();
  if (!db) return [];
  try {
    const snap = await db
      .collection("payments")
      // By ACCOUNT, not by wallet — an account can pay from any
      // number of wallets, and a Google-only account has none at all.
      .where("accountId", "==", accountId)
      .limit(PAYMENT_LIMIT)
      .get();
    return snap.docs
      .map((d) => ({
        signature: d.id,
        amountSol: d.data().amountSol ?? null,
        // Recorded at the moment of grading, never recomputed here. A
        // payment shown at today's rate rather than the one it was
        // priced at is a support conversation nobody can win. Absent
        // on anything bought before packs moved to dollars.
        usd: d.data().usd ?? null,
        credits: d.data().creditsGranted ?? 0,
        status: d.data().status || "credited",
        ts: d.data().ts || 0,
      }))
      // Sorted here rather than in the query: an orderBy alongside the
      // where would need a composite index, and this list is capped at
      // 25 rows anyway.
      .sort((a, b) => b.ts - a.ts);
  } catch (e) {
    console.error("[settings] billing lookup failed:", e.message);
    return [];
  }
}

export async function GET(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const [user, settings, payments] = await Promise.all([
    getUser(session.accountId),
    getSettings(session.accountId),
    billingHistory(session.accountId),
  ]);

  return NextResponse.json({ ok: true, user: publicUser(user), settings, payments });
}

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read those settings." }, { status: 400 });
  }

  const settings = await saveSettings(session.accountId, body.settings || {});
  return NextResponse.json({ ok: true, settings });
}
