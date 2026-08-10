// GET /api/solana/find?reference=… — has the transfer request been paid?
//
// A transfer request gives us no redirect and no signature: the wallet
// builds, signs and sends the transaction on its own, and the browser
// never sees any of it. What we do have is the REFERENCE — 32 bytes we
// generated and attached to the request as a read-only account key —
// and an account key is searchable. getSignaturesForAddress on it
// returns the transaction the moment it lands.
//
// This route only turns a reference into a signature. Whether that
// signature actually paid bannr, for how much, and for whose account,
// is decided by /api/pay/claim reading the transaction back off the
// chain. Nothing here grants anything.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";

export async function GET(req) {
  const reference = (req.nextUrl.searchParams.get("reference") || "").trim();
  // Base58, 32 bytes, which lands between 32 and 44 characters. Refused
  // rather than passed on: an address the node cannot parse is an error
  // that would surface as "couldn't reach the network".
  if (!reference || reference.length < 32 || reference.length > 44 ||
      /[^1-9A-HJ-NP-Za-km-z]/.test(reference)) {
    return NextResponse.json({ error: "That payment reference wasn't readable." }, { status: 400 });
  }

  const rpc = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bannr",
        method: "getSignaturesForAddress",
        // A reference is used once, so there is never a second page to
        // walk. "confirmed" rather than "finalized" because the claim
        // that follows reads at confirmed too, and waiting for
        // finality here would add half a minute to every purchase.
        params: [reference, { limit: 10, commitment: "confirmed" }],
      }),
    });
    const data = await res.json();
    if (data?.error) throw new Error(data.error.message || "rpc error");

    const rows = Array.isArray(data?.result) ? data.result : [];
    // The node returns newest first, so pop() takes the OLDEST — and a
    // reference is generated per attempt, so the oldest success is the
    // payment itself rather than anything that touched the key after.
    // Failed transactions are skipped: a rejected one leaves a row and
    // handing that to the claim would report a payment that never was.
    const hit = rows.filter((r) => r?.signature && !r.err).pop();

    if (!hit) return NextResponse.json({ ok: true, pending: true }, { status: 200 });
    return NextResponse.json({ ok: true, signature: hit.signature });
  } catch (e) {
    console.error("[find]", e.message);
    return NextResponse.json(
      { error: "Couldn't reach the network. Try again in a moment." },
      { status: 502 }
    );
  }
}
