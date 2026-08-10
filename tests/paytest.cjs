// Buying credits on a phone. Four bugs deep, and each one only showed
// up on a real handset — so the history is kept here, because every
// assertion below exists because something took money's worth of
// someone's time.
//
//   1. The pack id was passed as a third argument to a function that
//      took two. It never arrived, so nothing could be built, so the
//      confirm button never appeared, so the next tap started the
//      CONNECT hop again — Phantom asking to connect, forever.
//   2. Phantom retired the signAndSendTransaction deeplink. It began
//      answering "method not supported" AFTER the user approved.
//   3. The claim poll returned on its first pass, because 202 makes
//      Response.ok true. "Still confirming — hold on." was displayed
//      as a final answer.
//   4. And the one that ended the design: WE chose the blockhash. A
//      blockhash lives about a minute — measured, not assumed — and
//      the round trip through a wallet app is a person reading a
//      warning about their own money. It expired more often than it
//      landed, at forty seconds and at ten.
//
// So paying is a Solana Pay transfer request now. The wallet is handed
// the intent and builds, signs and sends the transaction ITSELF, with
// a blockhash it fetches at the moment of approval. There is no
// deadline left to miss, and no signing hop to get wrong.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bs58lib = require(R + "node_modules/bs58");
const B58 = bs58lib.default || bs58lib;
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
// Assertions ABOUT code must not be able to match the prose beside it.
// The comment above says "blockhash" and "reference" repeatedly.
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nPAYING FOR A PACK ON A PHONE\n");

/* ---------------- the URL the wallet is handed ---------------- */
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
global.crypto = require("crypto").webcrypto;

const P = new Function(
  read("lib/solanaPay.js")
    .replace(/^"use client";$/m, "")
    .replace(/^export /gm, "") +
    "\nreturn { newReference, transferUrl, savePending, readPending, clearPending };"
)();

// A reference is an account key we attach and then search for. It has
// to be a real 32-byte address or the node cannot look it up.
const ref = P.newReference();
ok(B58.decode(ref).length === 32, `a reference is 32 bytes (${ref.slice(0, 8)}…)`);
ok(P.newReference() !== P.newReference(), "and a fresh one every time, so attempts never collide");

const url = P.transferUrl({
  treasury: "TREASURYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  sol: 0.0711,
  reference: ref,
  accountId: "acct_123",
  message: "15 credits",
});
ok(url.startsWith("solana:TREASURY"), "the URL is a transfer request to the treasury");
{
  const q = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  ok(q.get("amount") === "0.0711", "carrying the exact amount");
  ok(q.get("reference") === ref, "and the reference that will find it afterwards");
  // The memo is what lets ANY wallet pay for THIS account without
  // being registered to it first — /api/pay/claim matches it against
  // the signed-in account. Without it a first-time buyer pays and
  // cannot be credited.
  ok(q.get("memo") === "acct_123", "and the account id as the memo, which is how it gets credited");
  ok(q.get("label") === "bannr", "named, since this is what the wallet shows");
}
// Trailing zeros would be rendered back to the user verbatim by some
// wallets, and "0.07110000" reads like a glitch on a payment screen.
ok(
  new URLSearchParams(
    P.transferUrl({ treasury: "T", sol: 0.5, reference: ref }).split("?")[1]
  ).get("amount") === "0.5",
  "an amount is not padded with zeros"
);

// Refusing beats sending someone to a wallet with a broken request.
for (const [bad_, why] of [
  [{ treasury: "", sol: 1, reference: ref }, "no treasury"],
  [{ treasury: "T", sol: 0, reference: ref }, "no price"],
  [{ treasury: "T", sol: 1, reference: "" }, "no reference"],
]) {
  let threw = false;
  try { P.transferUrl(bad_); } catch { threw = true; }
  ok(threw, `refuses to build a request with ${why}`);
}

/* ------------- the attempt outlives the app switch ------------- */
// Opening a solana: URL switches apps and iOS may discard the tab. The
// reference is written down first so a cold load can resume the watch.
store.clear();
P.savePending({ reference: ref, packId: "starter", sol: 0.0711 });
ok(P.readPending()?.reference === ref, "a pending payment survives being backgrounded");
ok(P.readPending()?.packId === "starter", "and remembers which pack it was for");
P.clearPending();
ok(P.readPending() === null, "and is forgotten once it is done");

store.clear();
localStorage.setItem("bannr:pay", JSON.stringify({ reference: ref, at: Date.now() - 31 * 60 * 1000 }));
ok(P.readPending() === null, "an abandoned attempt expires rather than being polled for tomorrow");

/* ---------------- wired into the page, inside the tap ---------------- */
const credits = bare(read("app/credits/page.jsx"));
ok(/window\.location\.href = url;/.test(credits), "the page navigates to the request");
{
  // THE GESTURE RULE. iOS only opens the app when it considers the
  // navigation user-initiated; await anything first and Safari loads
  // the wallet's WEBSITE instead. This is why the reference is
  // generated locally rather than with @solana/web3.js, whose import
  // is dynamic.
  const buy = credits.slice(credits.indexOf("async function buy("), credits.indexOf("// ---------- the transfer-request half"));
  // Bounded to the PHONE branch only. The desktop path below it talks
  // to an injected wallet and awaits freely, which is fine — it has a
  // provider in the page and never leaves it. Slicing past the closing
  // brace would drag those awaits in and fail on code that is correct.
  const from = buy.indexOf("if (auth.needsDeeplink)");
  const hop = buy.slice(from, buy.indexOf("\n    }", from) + 6);
  ok(hop.length > 100 && /return;/.test(hop), "the phone branch was found, whole");
  ok(!/wallet\.connect|payTreasury/.test(hop), "and it really is only that branch");
  ok(!/await|import\(|fetch\(/.test(hop), "and awaits nothing between the tap and the navigation");
  ok(/savePending\(/.test(hop), "the reference is written down BEFORE leaving");
}
ok(!/buildTreasuryTx/.test(credits), "no transaction is built for the phone path at all");
ok(!/startWalletDeeplink\("buy"/.test(credits), "and no wallet flow is started to pay");

/* ------------- the amount IS the identifier ------------- */
// Everything that used to identify a payment came from the wallet, and
// the wallet cannot be relied on to send any of it. Read off the chain
// on real purchases:
//
//   Solflare — memo YES, reference YES
//   Phantom  — memo NO,  reference NO
//
// Phantom takes a transfer request and sends a bare transfer. So on the
// biggest wallet, nothing in the transaction names an account, and both
// the reference lookup AND the memo check were dead ends.
//
// The exact lamports are reserved for the account BEFORE the wallet is
// opened, and that is what a payment is recognised by.
const intents = bare(read("lib/payIntents.js"));
{
  const I = new Function(
    intents
      .replace(/^import[^\n]*$/gm, "")
      .replace(/^export /gm, "") +
      "\nreturn { lamportsFor, INTENT_TTL_MS };"
  )();
  ok(I.lamportsFor(0.0712) === 71_200_000, "SOL converts to whole lamports");
  ok(I.lamportsFor(1) === 1e9, "and a whole SOL is a billion of them");
  ok(I.INTENT_TTL_MS === 24 * 60 * 60 * 1000, "an intent lives a day, so a slow payment is not lost");
}
// The tail is what stops two people buying the same pack at the same
// second from colliding. Chosen by the SERVER: a caller who could name
// their own amount could name someone else's and take their payment.
ok(/Math\.floor\(Math\.random\(\) \* TAIL_SPACE\)/.test(intents), "the amount carries a random tail");
ok(/TAIL_SPACE = 100_000/.test(intents), "big enough that guessing is not a strategy");
ok(!/req|searchParams|body/.test(intents), "and nothing about it comes from the caller");
// An intent armed AFTER the money moved could be used to claim a
// payment that had already landed — someone else's.
ok(/blockTimeMs >= e\.at - 60_000/.test(intents), "an intent only matches a payment made after it was armed");
ok(/!e\.signature/.test(intents), "and a spent one never matches again");

// Armed in /api/pricing, because the tap that opens the wallet may not
// await anything and the number must already exist by then.
const pricing = bare(read("app/api/pricing/route.js"));
ok(/armIntents\(session\.accountId, packs\)/.test(pricing), "the amounts are reserved when the page prices itself");
ok(/session\?\.accountId && rate !== null/.test(pricing), "only for someone signed in, at a rate we trust");
ok(/lamports: armed\[p\.id\]/.test(pricing), "and the exact figure travels to the page");

// The claim has to accept a payment with no memo, or it refuses most
// purchases — that was the state of things.
const claimSrc = bare(read("app/api/pay/claim/route.js"));
ok(/matchIntent\(session\.accountId, lamports, blockTimeMs\)/.test(claimSrc),
   "the claim recognises a payment by its reserved amount");
ok(/if \(!memo && !intent\)/.test(claimSrc), "and only falls back to the sender when there is neither");
ok(/consumeIntent\(session\.accountId, lamports, signature\)/.test(claimSrc), "a used amount is spent");
{
  // Ordering matters: consuming before the credits land would strand
  // the payment if the grant threw.
  const g = claimSrc.indexOf("await grantCredits(");
  const c = claimSrc.indexOf("consumeIntent(session.accountId");
  ok(g > 0 && c > g, "and spent only after the credits actually landed");
}

/* ------------- checking again cannot mint credits ------------- */
// The whole safety of a "check now" button, and of sweeping on every
// visit, rests on this: the claim keys on the signature.
ok(/db\.collection\("payments"\)\.doc\(signature\)/.test(claimSrc), "a payment is keyed by its signature");
ok(/payRef\.create\(/.test(claimSrc), "created, not set, so a second writer throws instead of granting again");
ok(/already: true/.test(claimSrc), "and a repeat claim answers 'already' rather than crediting");
{
  // The poll, the visit sweep and the button all go through one
  // function. A manual check that behaved differently from the
  // automatic one would be a second thing to debug.
  const calls = (credits.match(/\/api\/solana\/find/g) || []).length;
  ok(calls === 1, `the lookup is called from exactly one place (${calls})`);
}

/* ------------- stopping must not cost anyone money ------------- */
ok(/const d = await sweep\(\)/.test(credits), "every visit checks for a payment that landed while away");
ok(!/Check now/.test(credits), "no manual confirmation button interrupts checkout");
ok(!/Stop waiting/.test(credits), "the wait no longer reads as giving up on the money");

// ══ A BUTTON THAT ANSWERS ══
//
// It shared `claiming` with the automatic poll, and `claiming` only
// becomes true once a payment has been FOUND. So pressing it when the
// answer was "not yet" — which is the answer most of the time —
// changed nothing on screen and was indistinguishable from a dead
// button. It has its own progress state and it says what it found.
ok(!/checkingPay|setCheckingPay|sweep\(true\)/.test(credits),
   "manual checking state and its dead-end action are removed");
// The background poll runs every two seconds. If it spoke, it would
// bury the page in messages.
ok(/const sweep = useCallback\(async \(\)/.test(credits), "automatic confirmation stays silent and focused");

// ══ AND THE PANEL HAS TO BE REACHABLE ══
//
// It used to appear only while the BROWSER still remembered the
// attempt, which expires in half an hour. Someone who paid, closed the
// tab and came back later saw an ordinary credits page with no sign
// anything was owed and nothing to press. The server knows what is
// outstanding for a full day, so the server decides.
ok(/if \(d\?\.watching > 0\) setWatching\(\(w\) => w \|\| \{ pack: null \}\)/.test(credits),
   "an outstanding amount opens the panel even with nothing remembered locally");

// Paying by hand was taken back out. It was a workaround for the
// wallet not carrying a memo, and the amount solves that properly for
// every wallet — so the panel is one thing again rather than a payment
// screen with a second payment screen inside it.
ok(!/paybox|CopyRow|payrow/.test(credits), "no manual payment block");
ok(!/paybox|payrow/.test(read("app/globals.css")), "and none of its styles left behind");

/* ---------------- finding it on the chain ---------------- */
// ══ THE TREASURY, NOT THE REFERENCE ══
//
// Solana Pay says to search for the reference. Our RPC provider does
// not index read-only marker accounts, which is exactly what a
// reference is — measured after a real payment landed and the page
// waited for it forever: asked about the reference the node returns
// ZERO rows, asked about the treasury it returns that same
// transaction. No retry and no longer wait was going to fix that.
const find = bare(read("app/api/solana/find/route.js"));
ok(/getSignaturesForAddress/.test(find), "the payment is found on the chain");
ok(/NEXT_PUBLIC_TREASURY_WALLET/.test(find), "by watching the treasury, which the node does index");
ok(!/searchParams\.get\("reference"\)/.test(find), "and not by the reference, which it does not");
ok(/commitment: "confirmed"/.test(find), "at confirmed, since the claim reads at confirmed too");
// Not the memo either. That worked on Solflare and never on Phantom,
// which sends a bare transfer. The reserved amount is the only thing
// that works on both, because it needs nothing from the wallet.
ok(/liveIntents\(session\.accountId\)/.test(find), "matched against the amounts reserved for this account");
ok(!/r\.memo/.test(find), "and not by a memo the wallet may never send");
// getSignaturesForAddress carries no amounts, so a candidate costs one
// getTransaction. Bounded, or a busy treasury turns a poll into a
// burst of calls.
ok(/postBalances\?\.\[i\] \|\| 0\) - \(tx\.meta\?\.preBalances/.test(find),
   "reading what the treasury actually gained, from the balances");
ok(/MAX_LOOKUPS = 12/.test(find), "with the number of lookups per poll bounded");
// How many amounts are still owed. The page uses this to decide
// whether to show the waiting panel at all, so someone who paid and
// closed the tab still finds something to press when they come back.
ok(/watching: intents\.length/.test(find), "and it reports what is still outstanding");
ok(/requireUser\(req\)/.test(find), "whose id comes from the session cookie");
ok(!/searchParams\.get\("accountId"\)/.test(find),
   "never from the query string, or anyone could ask whether anyone had paid");
// A rejected transaction still leaves a row. Reporting one as a
// payment would send the claim looking for money that never moved.
ok(/!r\.err/.test(find), "failed transactions are skipped, not reported as payments");
// The window is derived from when the intents were armed, not from
// anything the client says — and the clock slack is deliberate,
// because our timestamp and the cluster's blockTime are two clocks.
ok(/Math\.min\(\.\.\.intents\.map\(\(e\) => e\.at\)\) - 60_000/.test(find),
   "searching back only as far as the oldest reserved amount");
ok(!/searchParams/.test(find), "and taking no part of the window from the caller");

/* ---------------- the poll that never polled ---------------- */
// 202 sits inside the 200-299 band that makes Response.ok true, so
// `if (r.ok) return d` caught it on the first pass and the retry below
// had never once run. RUN, not read: the bug was a status code landing
// in the wrong branch, which is exactly what a regex can be made to
// "prove" while the code still does the wrong thing.
(async () => {
  const raw = read("app/credits/page.jsx");
  const start = raw.indexOf("async function claim(signature)");
  const endMark = raw.indexOf("no need to pay again.", start);
  const src = raw.slice(start, raw.indexOf("\n  }", endMark) + 4);
  ok(start > 0 && src.length > 200, "the claim poll was found, to be run");

  const now = (fn) => fn(); // immediate, so 20 passes of 3s stay out of the suite
  const build = (fetchImpl) =>
    new Function("fetch", "setTimeout", src + "\nreturn claim;")(fetchImpl, now);

  let calls = 0;
  const replies = [
    { status: 202, body: { error: "Still confirming — hold on." } },
    { status: 202, body: { error: "Still confirming — hold on." } },
    { status: 200, body: { ok: true, credits: 15, user: { id: "u1" } } },
  ];
  const out = await build(async () => {
    const r = replies[Math.min(calls++, replies.length - 1)];
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  })("SIG");
  ok(calls === 3, `it keeps polling through 202 (asked ${calls} times)`);
  ok(out?.credits === 15, "and returns the payment once it lands");
  ok(!out?.error, "with no error attached to one that worked");

  calls = 0;
  const out2 = await build(async () => {
    calls += 1;
    return { ok: false, status: 400, json: async () => ({ error: "That transaction failed on-chain." }) };
  })("SIG");
  ok(calls === 1, `a real answer is not retried (asked ${calls} time)`);
  ok(/failed on-chain/.test(out2?.error || ""), "and is reported as it was given");

  /* ------------- what the old design left behind ------------- */
  // Asserted as absences so none of it can quietly come back. Each of
  // these was a live failure mode, not a tidy-up.
  const dl = bare(read("lib/deeplink.js"));
  ok(!/signAndSendTransaction/.test(dl), "the retired Phantom method is gone");
  ok(!/signTransaction/.test(dl), "and so is the one that made us pick the blockhash");
  ok(!fs.existsSync(R + "app/api/solana/send/route.js"), "nothing broadcasts on the user's behalf any more");
  ok(!/payWithDeeplink/.test(bare(read("lib/useAuth.js"))), "and no hook is left to hand a transaction over");

  // The session freshness check STAYS. It is about signing in, not
  // paying: a stored session outlives the wallet's willingness to
  // honour it, so the one-tap path was failing every first attempt.
  const auth = bare(read("lib/useAuth.js"));
  ok(/session\.connectedAt \|\| 0\) < SESSION_TRUST_MS/.test(auth),
     "the one-tap sign-in is still only taken on a session worth betting a hop on");

  console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
