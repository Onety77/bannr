// GET /api/solana/find?since=… — has this account's payment landed?
//
// A transfer request gives us no redirect and no signature: the wallet
// builds, signs and sends the transaction on its own, and the browser
// never sees any of it. So the payment has to be found on the chain.
//
// ══ IT LOOKS AT THE TREASURY, NOT AT THE REFERENCE ══
//
// Solana Pay's own answer is the `reference` — 32 bytes attached to
// the request as a read-only account key, then searched for with
// getSignaturesForAddress. It is still attached, and on a node that
// indexes it this would work.
//
// Ours does not. Measured, after a real payment landed and the page
// waited for it forever: asked about the reference our node returns
// ZERO rows, while asked about the treasury it returns that exact
// transaction. Read-only marker accounts are simply not in its index —
// which is a property of the provider, not of the payment, and not
// something a retry or a longer wait was ever going to fix.
//
// The treasury is indexed, because it holds money and is written to.
// So the question is turned around: instead of "where did this
// reference go", it asks "has anything paid the treasury for THIS
// account since I started watching".
//
// ══ THE MEMO COMES BACK FOR FREE ══
//
// getSignaturesForAddress returns each row's memo inline, so matching
// costs no extra call — no getTransaction per candidate, one request
// per poll however busy the treasury gets.
//
// The account id is taken from the SESSION COOKIE, never from the
// query string. Otherwise anyone could ask "has account X paid" and be
// handed a signature to claim.
//
// This route decides nothing about money. Whether that signature
// really paid, how much, and for whom is settled by /api/pay/claim
// reading the transaction back off the chain.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";

// Far enough back to cover a slow approval, a phone call in the middle
// and the walk back to the browser; not so far that yesterday's
// payment is re-offered to today's watcher. Matches the 30 minutes
// lib/solanaPay.js keeps a pending attempt for.
const MAX_WINDOW_MS = 35 * 60 * 1000;

export async function GET(req) {
  const session = requireUser(req);
  if (!session?.accountId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const treasury = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  if (!treasury) {
    return NextResponse.json({ error: "Payments aren't switched on yet." }, { status: 503 });
  }

  // When the watch started, so a payment from an earlier attempt is not
  // handed back as if it were this one. Clamped rather than trusted.
  const asked = Number(req.nextUrl.searchParams.get("since")) || 0;
  const floor = Date.now() - MAX_WINDOW_MS;
  const since = Math.max(asked, floor);

  const rpc = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bannr",
        method: "getSignaturesForAddress",
        // Enough to see past other people paying at the same moment.
        // "confirmed" rather than "finalized" because the claim that
        // follows reads at confirmed too, and waiting for finality
        // would add half a minute to every purchase.
        params: [treasury, { limit: 50, commitment: "confirmed" }],
      }),
    });
    const data = await res.json();
    if (data?.error) throw new Error(data.error.message || "rpc error");

    const rows = Array.isArray(data?.result) ? data.result : [];
    const hit = rows.find(
      (r) =>
        r?.signature &&
        // A rejected transaction still leaves a row. Reporting one as a
        // payment would send the claim looking for money that never
        // moved.
        !r.err &&
        (r.blockTime || 0) * 1000 >= since &&
        // The node prefixes the memo with its length — "[22] acct_x" —
        // so this looks for the id inside rather than equal to it.
        typeof r.memo === "string" &&
        r.memo.includes(session.accountId)
    );

    // `node` and `rows` stay: a payment that had landed once read as
    // pending forever, and from outside there was no way to tell
    // whether the lookup had seen the transaction and rejected it or
    // never seen it at all. Neither value is secret.
    const node = process.env.HELIUS_RPC_URL ? "helius" : "public";
    if (!hit) {
      return NextResponse.json({ ok: true, pending: true, node, rows: rows.length }, { status: 200 });
    }
    return NextResponse.json({ ok: true, signature: hit.signature, node });
  } catch (e) {
    console.error("[find]", e.message);
    return NextResponse.json(
      { error: "Couldn't reach the network. Try again in a moment." },
      { status: 502 }
    );
  }
}
