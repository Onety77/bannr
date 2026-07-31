// GET /api/solana/blockhash — a recent blockhash for the payment tx.
//
// Exists purely to keep the Helius key server-side. lib/wallet.js runs
// in the browser, where process.env.HELIUS_RPC_URL is undefined (Next
// only inlines NEXT_PUBLIC_* into client bundles), so it was silently
// falling back to the free public mainnet RPC — rate-limited, and
// hit at the precise moment someone is trying to pay.
//
// Moving the key into NEXT_PUBLIC_ would fix it by shipping the key to
// every visitor. This does it without that trade.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";

export async function GET() {
  const rpc = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bannr",
        method: "getLatestBlockhash",
        params: [{ commitment: "confirmed" }],
      }),
    });
    const data = await res.json();
    const blockhash = data?.result?.value?.blockhash;
    if (!blockhash) throw new Error("no blockhash in response");
    return NextResponse.json({ ok: true, blockhash });
  } catch (e) {
    console.error("[blockhash]", e.message);
    return NextResponse.json(
      { error: "Couldn't reach the network. Try again in a moment." },
      { status: 502 }
    );
  }
}
