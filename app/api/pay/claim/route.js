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
import { creditsForPayment } from "@/lib/packs";
import { solUsd } from "@/lib/solPrice";
import { resolveEntitlements } from "@/lib/entitlements";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { matchIntent, consumeIntent } from "@/lib/payIntents";

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

  // ══ RECORDED IS NOT THE SAME AS CREDITED ══
  //
  // This used to treat the document existing as the job being done.
  // It is not, and the gap is a payment that vanishes:
  //
  // The webhook writes this same document. When it sees SOL from a
  // wallet that belongs to no account — which is now the NORMAL case,
  // because buying stopped requiring a linked wallet — it records
  // `status: "unclaimed"` with a creditsGranted figure and credits
  // NOBODY. It cannot; it has no account to credit.
  //
  // The browser then claimed, found the document, and answered
  // "already" with that same figure. The page said the credits had
  // been added. The balance had never moved, the money was in the
  // treasury, and nothing anywhere said it had gone wrong.
  //
  // So the question is not "does a record exist" but "has anyone
  // actually been credited". A record with no accountId is a payment
  // waiting to be attributed, and the session asking is exactly the
  // attribution it was waiting for — so it falls through and is
  // claimed properly below.
  const payRef = db.collection("payments").doc(signature);
  const existing = await payRef.get();
  const prior = existing.exists ? existing.data() : null;
  if (prior?.accountId && prior.accountId !== session.accountId) {
    return NextResponse.json({ error: "That transaction belongs to another account." }, { status: 409 });
  }
  if (prior?.accountId === session.accountId) {
    const u = await getUser(session.accountId);
    return NextResponse.json({
      ok: true, already: true, credits: prior.creditsGranted || 0,
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
  // The same figure in lamports, unrounded, because that is what a
  // payment intent is matched on. Going via `sol` and back would put a
  // float in the middle of an exact-integer comparison.
  const lamports = Math.round(sol * LAMPORTS);
  const blockTimeMs = (tx?.blockTime || 0) * 1000;
  if (sol <= 0) {
    return NextResponse.json({ error: "That transaction didn't pay bannr." }, { status: 400 });
  }

  // The memo is the anti-theft check — see the note at the top.
  const memo = readMemo(tx);
  if (memo && memo.trim() !== session.accountId) {
    return NextResponse.json({ error: "That transaction belongs to another account." }, { status: 409 });
  }
  // ══ NO MEMO IS THE NORMAL CASE NOW, NOT THE ODD ONE ══
  //
  // Phantom takes a Solana Pay transfer request and sends a bare
  // transfer, discarding the memo AND the reference. Read off the
  // chain, on real purchases: Solflare carries both, Phantom neither.
  // So a payment arriving with nothing in it that names an account is
  // not a hand-sent oddity — it is what the biggest wallet does every
  // time, and refusing it refused most purchases.
  //
  // The amount is what names it instead. Those exact lamports were
  // reserved for this account before the wallet was opened, and an
  // intent only counts if it was armed BEFORE the money moved — see
  // lib/payIntents.js.
  //
  // Looked up whether or not there is a memo, because it does two jobs
  // now. It says whose payment this is, and it carries the QUOTE — the
  // credits and dollars this exact amount was offered at. A payment
  // with a memo still deserves the price it was promised.
  const intent = await matchIntent(session.accountId, lamports, blockTimeMs).catch(() => null);
  if (!memo && !intent) {
    // Still nothing: an old client, or a genuinely hand-sent transfer.
    // Fall back to the sender being a wallet already registered to
    // this account, which is the pre-existing webhook rule.
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

  // ══ WHAT THAT SOL WAS WORTH ══
  //
  // The packs are priced in dollars, so grading a payment means
  // converting what arrived. Two things have to be true at once:
  //
  //   the rate must be one we trust — see lib/solPrice.js, which
  //   returns null rather than a fallback, because the failure mode of
  //   a wrong rate is not an error page, it is quietly selling $79 of
  //   credits for whatever the bad number came to;
  //
  //   the discount must be the SAME one the page quoted. The payer
  //   sent the exact SOL we asked for. If we graded it against the
  //   undiscounted price it would land outside its own pack's
  //   tolerance band and be credited at the tier below — a holder
  //   getting fewer credits per dollar than a stranger, silently.
  // ══ A QUOTED PAYMENT IS NOT RE-PRICED ══
  //
  // When the amount was reserved, the deal was written down with it:
  // these credits, these dollars, at this rate, with this discount. The
  // payer sent exactly that amount. Grading it again against a later
  // rate is re-running the sum with different inputs and hoping for the
  // same answer — and over a day-long intent and an 8% band, SOL moves
  // far enough that it is not the same answer.
  //
  // Honouring the quote also means a payment can be credited while the
  // price feed is down. There is nothing to look up: the price was
  // agreed before it went away.
  const quoted = intent?.credits > 0 ? intent : null;

  const rate = quoted ? quoted.rate : await solUsd();
  if (!quoted && rate === null) {
    // Nothing is lost by waiting: the transaction is on chain and the
    // client polls this endpoint. 202 is the "not yet" status it
    // already understands.
    console.error("[pay/claim] no SOL price — holding", signature.slice(0, 12));
    return NextResponse.json(
      { ok: false, pending: true, error: "Confirming — this is taking a moment." },
      { status: 202 }
    );
  }
  const { ent } = quoted
    ? { ent: { discount: quoted.discount || 0 } }
    : await resolveEntitlements(session.accountId).catch(() => ({ ent: { discount: 0 } }));
  const pack = quoted
    ? { id: quoted.packId, credits: quoted.credits, usd: quoted.usd, sol }
    : { ...creditsForPayment(sol, rate, ent.discount), sol };

  // ══ TAKING THE PAYMENT, ATOMICALLY ══
  //
  // This was `create()`, which throws if the document exists — fine
  // when the only writer that mattered was another claim, and wrong
  // once the webhook records unattributed payments. A payment the
  // webhook had already filed as "unclaimed" could then never be
  // claimed by anybody: create threw, and the caller was told it was
  // already done.
  //
  // A transaction instead, because "is it still unattributed" and
  // "take it" have to be one step. Two browsers claiming at once, or a
  // claim racing the webhook, must produce exactly one winner — the
  // read-then-write it replaces had a gap between them wide enough for
  // both to pass.
  //
  // Losing is not an error. It means somebody else attributed this
  // payment first, which for the same account is simply the answer
  // arriving twice.
  let won = true;
  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(payRef);
      const cur = snap.exists ? snap.data() : null;
      if (cur?.accountId) { won = false; return; }
      t.set(payRef, {
        accountId: session.accountId,
        sol,
        // The dollar figures are recorded, not recomputed later. A
        // payment graded at one rate and displayed at another is a
        // support conversation nobody can win, and the rate at the
        // moment of grading is the only honest record of the deal.
        usd: +(pack.usd || 0).toFixed(2),
        solUsdRate: rate,
        discount: ent.discount || 0,
        // The SAME number under the webhook's name for it. These two
        // paths write the same document and had drifted: the webhook
        // writes `amountSol`, this writes `sol`, and /settings reads
        // only `amountSol` — so every payment claimed here (which is
        // the main path) showed a blank amount in billing history.
        amountSol: sol,
        packId: pack.id,
        creditsGranted: pack.credits,
        status: "credited",
        via: "claim",
        // Whether this was honoured against the quote it was sold at or
        // graded from the amount. Worth knowing a month later when
        // someone asks why a payment is worth what it is.
        priced: quoted ? "quoted" : "graded",
        // Kept when adopting a record the webhook filed first, so the
        // history still shows when the money actually arrived.
        ts: cur?.ts || Date.now(),
        ...(cur ? { adoptedFrom: cur.status || "unknown", adoptedAt: Date.now() } : {}),
      });
    });
  } catch (e) {
    // A transaction that could not run at all is not a claim that
    // lost. Saying "already credited" here would be the same silent
    // zero this whole change exists to remove.
    console.error("[pay/claim] tx", e.message);
    return NextResponse.json(
      { ok: false, pending: true, error: "Confirming — this is taking a moment." },
      { status: 202 }
    );
  }
  if (!won) {
    const u = await getUser(session.accountId);
    return NextResponse.json({
      ok: true, already: true, credits: pack.credits,
      user: publicUser(u, await identitiesFor(session.accountId)),
    });
  }

  await grantCredits(session.accountId, pack.credits);

  // Spend the reserved amount, so the same number cannot match a
  // second payment later. Only after the credits actually landed:
  // consuming it earlier would strand the payment if the grant threw.
  if (intent) await consumeIntent(session.accountId, lamports, signature);

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
