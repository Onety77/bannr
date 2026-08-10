// GET /api/solana/find — has this account's payment landed?
//
// A transfer request gives no redirect and no signature: the wallet
// builds, signs and sends on its own and the browser never sees it. So
// the payment has to be recognised on the chain.
//
// ══ THREE WAYS OF RECOGNISING IT HAVE FAILED ══
//
// By REFERENCE — Solana Pay's own answer, a key attached to the
// request. Our RPC provider does not index read-only marker accounts:
// asked about the reference it returns zero rows while asked about the
// treasury it returns that exact transaction.
//
// By MEMO — worked on Solflare, which carries it. Phantom discards
// both the memo and the reference and sends a bare transfer, so on
// Phantom there is nothing in the transaction naming an account at all.
//
// By SENDER — only works for a wallet already linked, which a
// first-time buyer has not got.
//
// ══ SO IT IS RECOGNISED BY ITS AMOUNT ══
//
// The exact lamports were reserved for this account before the wallet
// was ever opened — see lib/payIntents.js. A transfer of that number is
// this account's payment, and it needs nothing whatsoever from the
// wallet. The account comes from the session cookie, never the query
// string.
//
// This route grants nothing. /api/pay/claim reads the transaction back
// off the chain and decides.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { liveIntents } from "@/lib/payIntents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";

// getSignaturesForAddress does not carry amounts, so a candidate costs
// one getTransaction. Bounded so a busy treasury cannot turn a poll
// into a burst of calls; the window means there are normally none or
// one. Oldest first, so the earliest unclaimed payment is found first.
const MAX_LOOKUPS = 12;

export async function GET(req) {
  const session = requireUser(req);
  if (!session?.accountId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const treasury = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  if (!treasury) {
    return NextResponse.json({ error: "Payments aren't switched on yet." }, { status: 503 });
  }

  const intents = await liveIntents(session.accountId).catch(() => []);
  if (!intents.length) {
    return NextResponse.json({ ok: true, pending: true, watching: 0 }, { status: 200 });
  }
  const wanted = new Map(intents.map((e) => [e.lamports, e]));
  // A minute of slack, because an intent's timestamp is our clock and
  // blockTime is the cluster's, and they are not the same clock.
  const earliest = Math.min(...intents.map((e) => e.at)) - 60_000;

  const rpc = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;
  const call = async (method, params) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "bannr", method, params }),
    });
    const data = await res.json();
    if (data?.error) throw new Error(data.error.message || "rpc error");
    return data.result;
  };

  try {
    const rows = (await call("getSignaturesForAddress", [
      treasury,
      { limit: 50, commitment: "confirmed" },
    ])) || [];

    const candidates = rows
      // A rejected transaction still leaves a row. Chasing one would
      // send the claim looking for money that never moved.
      .filter((r) => r?.signature && !r.err && (r.blockTime || 0) * 1000 >= earliest)
      .reverse()
      .slice(0, MAX_LOOKUPS);

    for (const row of candidates) {
      const tx = await call("getTransaction", [
        row.signature,
        { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx || tx.meta?.err) continue;

      // What the treasury actually gained, from the balances rather
      // than by reading instructions. A transfer can arrive in more
      // than one shape; the balance delta is the same in all of them.
      const keys = (tx.transaction?.message?.accountKeys || []).map((k) =>
        typeof k === "string" ? k : k?.pubkey
      );
      const i = keys.indexOf(treasury);
      if (i < 0) continue;
      const gained = (tx.meta?.postBalances?.[i] || 0) - (tx.meta?.preBalances?.[i] || 0);
      if (gained <= 0) continue;

      const hit = wanted.get(gained);
      if (hit) {
        return NextResponse.json({ ok: true, signature: row.signature, packId: hit.packId });
      }
    }

    return NextResponse.json(
      { ok: true, pending: true, watching: intents.length, seen: candidates.length },
      { status: 200 }
    );
  } catch (e) {
    console.error("[find]", e.message);
    return NextResponse.json(
      { error: "Couldn't reach the network. Try again in a moment." },
      { status: 502 }
    );
  }
}
