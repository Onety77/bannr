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

/* ---------------- finding it on the chain ---------------- */
const find = bare(read("app/api/solana/find/route.js"));
ok(/getSignaturesForAddress/.test(find), "the payment is found by its reference");
ok(/limit: 10, commitment: "confirmed"/.test(find), "at confirmed, since the claim reads at confirmed too");
// A rejected transaction still leaves a row against the reference.
// Handing that to the claim would report a payment that never was.
ok(/!r\.err/.test(find), "failed transactions are skipped, not reported as payments");
ok(/\.pop\(\)/.test(find), "and the oldest success is taken, not the latest thing to touch the key");

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
