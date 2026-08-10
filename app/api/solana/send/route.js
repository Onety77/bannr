// POST /api/solana/send — broadcast a transaction the user already signed.
//
// ══ WHY THIS EXISTS ══
//
// It did not need to, until Phantom retired the signAndSendTransaction
// deeplink. That method did both halves: the wallet signed AND
// broadcast through its own RPC, so the browser never needed a node
// beyond fetching a blockhash. Phantom now offers signTransaction
// only — it hands back a signed transaction and explicitly does not
// submit it — so submitting is ours to do.
//
// It is a server route for the same reason /api/solana/blockhash is:
// HELIUS_RPC_URL is not NEXT_PUBLIC_, so a browser doing this itself
// would fall back to the rate-limited public node, at the exact moment
// someone is paying.
//
// ══ WHAT THIS IS NOT ══
//
// It does not decide anything about money. It relays bytes the user's
// own wallet signed and returns the signature. Credit is granted by
// /api/pay/claim, which reads the transaction back off the chain and
// matches the memo — so a lie told here cannot mint credits, it can
// only fail to broadcast.
import { NextResponse } from "next/server";
import bs58 from "bs58";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";

// ══ THE SIGNATURE IS IN THE BYTES, NOT IN THE REPLY ══
//
// A transaction's id IS its first signature, so it is knowable before
// anything is broadcast and it does not change if the same bytes are
// submitted twice. Reading it here rather than trusting the node's
// reply is what makes "already been processed" a success instead of a
// dead end: a retry that loses the race still knows what to poll for.
//
// Wire format is a compact-u16 count followed by 64-byte signatures.
// The count is one byte for anything under 128, which every payment
// here is, but the loop is written properly because a silently wrong
// offset would yield a plausible-looking signature for the wrong
// transaction — and the claim would then wait forever on an id that
// was never on chain.
function firstSignature(raw) {
  let count = 0;
  let shift = 0;
  let i = 0;
  for (; i < raw.length; i += 1) {
    const byte = raw[i];
    count |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) { i += 1; break; }
    shift += 7;
    if (shift > 21) throw new Error("bad signature count");
  }
  if (count < 1) throw new Error("transaction carries no signature");
  if (raw.length < i + 64) throw new Error("transaction is truncated");
  return bs58.encode(raw.slice(i, i + 64));
}

// A signed transfer with a memo is a few hundred bytes; base58 of that
// is comfortably under 2k. The bound is here so a malformed or hostile
// body is refused before it reaches the node, not as a real limit.
const MAX_B58 = 4000;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read that request." }, { status: 400 });
  }

  const tx = typeof body?.transaction === "string" ? body.transaction.trim() : "";
  if (!tx || tx.length > MAX_B58 || /[^1-9A-HJ-NP-Za-km-z]/.test(tx)) {
    return NextResponse.json({ error: "That transaction wasn't readable." }, { status: 400 });
  }

  // Derived before broadcasting, so every path below can name the
  // transaction the caller should poll for — including the ones where
  // the node declines to tell us.
  let signature;
  try {
    signature = firstSignature(bs58.decode(tx));
  } catch {
    return NextResponse.json({ error: "That transaction wasn't readable." }, { status: 400 });
  }

  const rpc = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bannr",
        method: "sendTransaction",
        params: [
          tx,
          {
            // ══ PREFLIGHT ON, AND THIS WAS LEARNED THE HARD WAY ══
            //
            // It was off, reasoning that preflight against a node a
            // slot behind causes spurious failures on the money path.
            // The real failure was worse and silent: with preflight
            // off the node ACCEPTS a transaction whose blockhash has
            // already expired, hands back a signature, and drops it.
            // Nothing reaches the chain, no money moves, and the
            // client is left polling for an id that will never exist.
            //
            // A blockhash lives about a minute. This one is signed
            // across two app-hops — out to the wallet, a security
            // warning to read, an approval, and back — so expiry is
            // not an edge case here, it is the normal amount of time
            // a careful person takes. Preflight turns that into
            // "blockhash not found", which is mapped below into
            // something true and actionable.
            skipPreflight: false,
            encoding: "base58",
            maxRetries: 3,
            preflightCommitment: "confirmed",
          },
        ],
      }),
    });
    const data = await res.json();

    if (data?.error) {
      // Already broadcast — by a retry, or by the wallet itself. That
      // is a success with an awkward name: the signature is in the
      // message and the claim poll will find it on chain.
      const msg = String(data.error.message || "");
      console.error("[send]", msg);
      if (/already been processed|AlreadyProcessed/i.test(msg)) {
        return NextResponse.json({ ok: true, signature, duplicate: true }, { status: 200 });
      }
      // Flagged rather than just worded, because the caller can do
      // something about this one: the signature is dead but the
      // WALLET is still connected, so a rebuilt transaction and one
      // more approval is all it needs. Anything else here ends the
      // attempt.
      if (/blockhash not found|BlockhashNotFound/i.test(msg)) {
        return NextResponse.json(
          {
            expired: true,
            error: "That took a moment too long, so the payment expired. Nothing was charged — approve it once more.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "The network refused that payment. You weren't charged." },
        { status: 502 }
      );
    }

    // data.result is the same value; the derived one is returned so
    // that success and duplicate answer identically.
    return NextResponse.json({ ok: true, signature });
  } catch (e) {
    console.error("[send]", e.message);
    return NextResponse.json(
      { error: "Couldn't reach the network. You weren't charged — try again in a moment." },
      { status: 502 }
    );
  }
}
