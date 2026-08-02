// POST /api/pay/claim — "I just paid, here is the transaction."
//
// THIS IS WHY NO WALLET LINKING IS NEEDED. The old model was
// webhook-first: SOL lands at the treasury from some address, and the
// server has to work out whose account it belongs to — which is why
// wallets had to be registered to accounts in advance.
//
// But when someone pays from inside a signed-in session, attribution
// is not a puzzle to solve: the browser already knows whose account it
// is, because the session cookie says so. It hands us a signature, we
// read that transaction off-chain-of-trust (straight from the RPC, not
// from anything the client claims about it), and credit the session's
// account. The sender's address never matters. They can pay from a
// different wallet every single time.
//
// THE CLAIM RACE, and why the memo exists. Accepting any valid
// signature that paid the treasury would let someone watching the
// chain submit a stranger's signature before their browser does, and
// take the credits. So the transaction carries a memo containing the
// account id, written by the payer's own wallet as part of the same
// approval they already give. No extra step, no extra signature, and
// a claim whose memo names a different account is refused.
//
// Idempotency is the payments document id — the signature itself — so
// a replay, a double-click, or the webhook arriving first can never
// credit twice.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { grantCredits, getUser, publicUser, addPayingWallet } from "@/lib/users";
import { identitiesFor } from "@/lib/identities";
import { creditsForSol } from "@/lib/packs";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";
const LAMPORTS = 1e9;

// Signatures are base58, 64 bytes — 87 or 88 characters. Checked
// before it reaches the RPC so obvious junk costs us nothing.
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{86,90}$/;

async function rpc(method, params) {
  const url = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "bannr", method, params }),
    cache: "no-store",
  });
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || "rpc error");
  return data?.result ?? null;
}

// How much the treasury actually gained, in SOL. Taken from the
// balance deltas rather than by parsing instructions, so it is correct
// no matter how the transfer was constructed.
function treasuryGain(tx, treasury) {
  const keys = tx?.transaction?.message?.accountKeys || [];
  const idx = keys.findIndex((k) => (typeof k === "string" ? k : k?.pubkey) === treasury);
  if (idx < 0) return 0;
  const pre = tx?.meta?.preBalances?.[idx];
  const post = tx?.meta?.postBalances?.[idx];
  if (typeof pre !== "number" || typeof post !== "number") return 0;
  return (post - pre) / LAMPORTS;
}

// The memo rides in its own instruction. Helius returns parsed
// instructions for the memo program, and the log line is a reliable
// second source when parsing is unavailable.
function readMemo(tx) {
  const parsed = tx?.transaction?.message?.instructions || [];
  const inner = (tx?.meta?.innerInstructions || []).flatMap((i) => i.instructions || []);
  for (const ix of [...parsed, ...inner]) {
    if (ix?.program === "spl-memo" && typeof ix.parsed === "string") return ix.parsed;
    if (typeof ix?.parsed === "string" && ix?.programId?.includes?.("Memo")) return ix.parsed;
  }
  for (const line of tx?.meta?.logMessages || []) {
    const m = line.match(/Program log: Memo \(len \d+\): "(.*)"$/);
    if (m) return m[1];
  }
  return null;
}

export async function POST(req) {
  const session = requireUser(req);
  if (!session) {
    return NextResponse.json({ error: "Sign in first.", code: "signin_required" }, { status: 401 });
  }

  const treasury = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  if (!treasury) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Payments are not available right now." }, { status: 503 });
  }

  let signature;
  try {
    ({ signature } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  signature = String(signature || "").trim();
  if (!SIG_RE.test(signature)) {
    return NextResponse.json({ error: "That doesn't look like a transaction." }, { status: 400 });
  }

  // Already recorded? Say so plainly rather than pretending to credit
  // again — the client polls this, so "already done" is a normal,
  // expected answer and not an error.
  const payRef = db.collection("payments").doc(signature);
  const existing = await payRef.get();
  if (existing.exists) {
    const d = existing.data();
    if (d.accountId && d.accountId !== session.accountId) {
      return NextResponse.json({ error: "That transaction belongs to another account." }, { status: 409 });
    }
    const u = await getUser(session.accountId);
    return NextResponse.json({
      ok: true, already: true, credits: d.creditsGranted || 0,
      user: publicUser(u, await identitiesFor(session.accountId)),
    });
  }

  let tx;
  try {
    tx = await rpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
  } catch (e) {
    console.error("[pay/claim] rpc", e.message);
    return NextResponse.json({ error: "Couldn't reach the network. Try again in a moment." }, { status: 502 });
  }

  // Not landed yet is not a failure — the client retries.
  if (!tx) {
    return NextResponse.json({ ok: false, pending: true, error: "Still confirming — hold on." }, { status: 202 });
  }
  if (tx?.meta?.err) {
    return NextResponse.json({ error: "That transaction failed on-chain. Nothing was charged." }, { status: 400 });
  }

  const sol = treasuryGain(tx, treasury);
  if (sol <= 0) {
    return NextResponse.json({ error: "That transaction didn't pay bannr." }, { status: 400 });
  }

  // The memo is the anti-theft check — see the note at the top.
  const memo = readMemo(tx);
  if (memo && memo.trim() !== session.accountId) {
    return NextResponse.json({ error: "That transaction belongs to another account." }, { status: 409 });
  }
  if (!memo) {
    // No memo at all: an old client, or a hand-sent transfer. Fall back
    // to the sender being a wallet already registered to this account,
    // which is the pre-existing webhook rule. Anything else waits for
    // the manual claim flow rather than being handed out on trust.
    const sender = (tx?.transaction?.message?.accountKeys || [])
      .map((k) => (typeof k === "string" ? k : k?.pubkey))
      .find(Boolean);
    const u = await getUser(session.accountId);
    if (!sender || !(u?.wallets || []).includes(sender)) {
      return NextResponse.json(
        { error: "We couldn't match that payment to your account. Contact support with the transaction id." },
        { status: 409 }
      );
    }
  }

  const pack = { ...creditsForSol(sol), sol };

  // create() rather than set(): if the webhook wrote this signature
  // between our read above and here, this throws instead of granting a
  // second time.
  try {
    await payRef.create({
      accountId: session.accountId,
      sol,
      packId: pack.id,
      creditsGranted: pack.credits,
      status: "credited",
      via: "claim",
      ts: Date.now(),
    });
  } catch {
    const u = await getUser(session.accountId);
    return NextResponse.json({
      ok: true, already: true, credits: pack.credits,
      user: publicUser(u, await identitiesFor(session.accountId)),
    });
  }

  await grantCredits(session.accountId, pack.credits);

  // Remember the address so a later hand-sent transfer from the same
  // wallet still finds its way home through the webhook.
  const sender = (tx?.transaction?.message?.accountKeys || [])
    .map((k) => (typeof k === "string" ? k : k?.pubkey))
    .find(Boolean);
  if (sender) await addPayingWallet(session.accountId, sender);

  const user = await getUser(session.accountId);
  console.log(`[pay/claim] +${pack.credits} credits to ${session.accountId} (${sol} SOL, ${signature.slice(0, 12)}…)`);
  return NextResponse.json({
    ok: true,
    credits: pack.credits,
    user: publicUser(user, await identitiesFor(session.accountId)),
  });
}
