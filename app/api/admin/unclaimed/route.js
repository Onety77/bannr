// GET /api/admin/unclaimed — money that arrived and reached nobody.
//
// ══ AN ALARM, NOT A MACHINE ══
//
// Crediting somebody by hand is already a thirty-second job in Give
// credits. The part that could not be improvised was KNOWING: a
// payment that cannot be attributed is written to payments/{signature}
// with no accountId and then mentioned nowhere. It does not appear in
// anyone's billing history, it does not appear here, and the first
// anybody hears of it is a customer saying they paid.
//
// So this counts them and says which. There is deliberately no button
// to fix one — the failure modes left are narrow enough that a screen
// for them would be built on guesses about what it needs to handle.
// If this number ever moves, that is the moment to find out.
//
// ══ WHAT COUNTS AS UNCLAIMED ══
//
// No accountId. Not the status field: "unclaimed" and "unpriced" are
// the two the webhook writes today, and a third could be added
// tomorrow without anyone remembering to update a list here. The
// absence of an account is the thing that actually means nobody was
// credited, whatever it is called.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ordered on one field and filtered in memory, so no composite index
// is needed anywhere — see CLAUDE.md. Payments are rare enough that
// the most recent few hundred covers any window worth alarming about.
const SCAN = 300;

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ count: 0, rows: [] });

  try {
    const snap = await db.collection("payments").orderBy("ts", "desc").limit(SCAN).get();
    const rows = [];
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      if (d.accountId) continue;
      rows.push({
        signature: doc.id,
        sol: d.amountSol ?? d.sol ?? 0,
        // What it WOULD have been worth, which the webhook records
        // under a name that does not claim it happened.
        credits: d.creditsQuoted ?? 0,
        wallet: d.wallet || null,
        status: d.status || "unknown",
        ts: d.ts || 0,
      });
    }
    return NextResponse.json({ count: rows.length, rows: rows.slice(0, 20) });
  } catch (e) {
    console.error("[admin/unclaimed]", e.message);
    // Zero rather than an error: this sits beside the real money tools
    // and must never be the reason that page fails to render.
    return NextResponse.json({ count: 0, rows: [], error: "Couldn't read payments." });
  }
}
