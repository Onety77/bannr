// Exercises lib/deeplink.js for real: base58 against the reference
// implementation, and a full encrypt/decrypt round trip against
// tweetnacl playing the part of the wallet.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const nacl = require(R + "node_modules/tweetnacl");
const bs58ref = require(R + "node_modules/bs58");
const REF = bs58ref.default || bs58ref;
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
// Comments stripped before asserting ABOUT code. The gesture rule is
// explained in prose right next to the code that obeys it, and a
// regex for "await" or "signMessage" matches the explanation — the
// test would then be grading its own writing.
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// --- load the module with a fake browser ---
let href = "https://bannr.vercel.app/link";
const store = new Map();
let navigated = null;
let emitted = [];

// `window.location.href = url` is a SETTER ON location, so the fake
// has to be one persistent object with a real accessor — a getter
// returning a fresh literal swallows the assignment and every
// navigation test silently passes on undefined.
const fakeLocation = {
  get href() { return href; },
  set href(v) { navigated = v; },
  get origin() { return new URL(href).origin; },
  get search() { return new URL(href).search; },
};
global.window = {
  location: fakeLocation,
  history: { replaceState: (a, b, u) => { href = u; } },
  dispatchEvent: (e) => emitted.push(e.detail),
};
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
global.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const src = read("lib/deeplink.js")
  .replace(/^"use client";$/m, "")
  .replace(/^import nacl from "tweetnacl";$/m, "")
  .replace(/^export default DeepLink;$/m, "")
  .replace(/^export /gm, "");
const M = new Function("nacl", src + "\nreturn { bs58encode, bs58decode, connect, signMessage, handleRedirect, restoreSession, anySession, isRedirect, disconnect, PROVIDERS };")(nacl);

console.log("\n1. BASE58 AGAINST THE REFERENCE LIBRARY");
{
  // If this is wrong, every signature fails and nothing says why.
  const cases = [
    new Uint8Array([]),
    new Uint8Array([0]),
    new Uint8Array([0, 0, 0]),
    new Uint8Array([1]),
    new Uint8Array([255]),
    new Uint8Array([0, 0, 1, 2, 3]),
    nacl.randomBytes(32),
    nacl.randomBytes(64),
    nacl.randomBytes(24),
    new Uint8Array(64).fill(0),
    new Uint8Array(32).fill(255),
  ];
  let encFails = 0, decFails = 0;
  for (const c of cases) {
    const mine = M.bs58encode(c);
    const theirs = REF.encode(Buffer.from(c));
    if (mine !== theirs) { encFails++; console.log("      encode differs for", Array.from(c).slice(0, 6), mine, theirs); }
    const back = Buffer.from(M.bs58decode(theirs)).toString("hex");
    if (back !== Buffer.from(c).toString("hex")) { decFails++; console.log("      decode differs for", theirs); }
  }
  ok(encFails === 0, "encode matches bs58 on " + cases.length + " cases including leading zeros");
  ok(decFails === 0, "and decode round-trips every one of them");

  // Fuzz, because the leading-zero handling is the part that is
  // usually subtly wrong and only shows up on some keys.
  let fuzzBad = 0;
  for (let i = 0; i < 500; i++) {
    const n = 1 + Math.floor(Math.random() * 64);
    const b = nacl.randomBytes(n);
    if (Math.random() < 0.3) { b[0] = 0; if (Math.random() < 0.5) b[1] = 0; }
    if (M.bs58encode(b) !== REF.encode(Buffer.from(b))) fuzzBad++;
    if (Buffer.from(M.bs58decode(M.bs58encode(b))).toString("hex") !== Buffer.from(b).toString("hex")) fuzzBad++;
  }
  ok(fuzzBad === 0, "and 500 random buffers agree, leading zeros included");
}
{
  let threw = false;
  try { M.bs58decode("0OIl"); } catch { threw = true; }
  ok(threw, "a character outside the alphabet throws rather than decoding to nonsense");
}

console.log("\n2. CONNECT HOPS TO THE WALLET");
{
  store.clear(); navigated = null;
  M.connect("phantom");
  const u = new URL(navigated);
  ok(u.origin + u.pathname === "https://phantom.app/ul/v1/connect", "opens Phantom's connect deeplink");
  ok(u.searchParams.get("cluster") === "mainnet-beta", "on mainnet");
  ok(u.searchParams.get("app_url") === "https://bannr.vercel.app", "naming us as the requester");
  const back = new URL(u.searchParams.get("redirect_link"));
  ok(back.origin + back.pathname === "https://bannr.vercel.app/link", "and comes back to the page it started on");
  ok(back.searchParams.get("dlwallet") === "phantom:connect", "carrying the marker that resumes the flow");
  ok(M.bs58decode(u.searchParams.get("dapp_encryption_public_key")).length === 32, "with a fresh 32-byte x25519 public key");
  ok(store.get("dl:phantom:secretKey"), "and the secret half kept locally");
  ok(!store.get("dl:phantom:session"), "no session yet, obviously");
}

console.log("\n3. THE WALLET ANSWERS");
// Play the wallet: derive the shared secret the same way, seal a
// reply, and hand it back on the query string.
const wallet = nacl.box.keyPair();
const walletSigner = nacl.sign.keyPair();
const ADDR = REF.encode(Buffer.from(walletSigner.publicKey));
let shared;
{
  const dappPub = M.bs58decode(new URL(navigated).searchParams.get("dapp_encryption_public_key"));
  shared = nacl.box.before(dappPub, wallet.secretKey);
  const nonce = nacl.randomBytes(24);
  const body = new TextEncoder().encode(JSON.stringify({ public_key: ADDR, session: "sess-abc" }));
  const boxed = nacl.box.after(body, nonce, shared);

  href = "https://bannr.vercel.app/link?dlwallet=phantom%3Aconnect"
    + "&phantom_encryption_public_key=" + M.bs58encode(wallet.publicKey)
    + "&nonce=" + M.bs58encode(nonce)
    + "&data=" + M.bs58encode(boxed);
  emitted = [];
  const out = M.handleRedirect();
  ok(out?.type === "connect", "handleRedirect resumes the connect");
  ok(out.publicKey === ADDR, "with the wallet's address");
  ok(emitted.length === 1 && emitted[0].type === "connect", "and announces it once on the window");
  ok(M.restoreSession("phantom")?.session === "sess-abc", "the session survives for the next hop");
  ok(!href.includes("dlwallet"), "the marker is scrubbed from the URL");
  ok(!href.includes("data="), "along with the payload, so a reload cannot replay it");
}

console.log("\n4. SIGN A MESSAGE — THE ONE THE SERVER NEEDS");
{
  const MSG = "bannr wants you to prove this wallet is yours.\nNonce: abc123\nThis authorises nothing.";
  navigated = null;
  M.signMessage("phantom", MSG, "Wallet linked");
  const u = new URL(navigated);
  ok(u.origin + u.pathname === "https://phantom.app/ul/v1/signMessage", "opens the signMessage deeplink, NOT a transaction one");
  ok(!/signAndSend/i.test(navigated), "nothing is broadcast and nothing is spent");

  // Decrypt what we sent it, as the wallet would.
  const payload = JSON.parse(
    new TextDecoder().decode(
      nacl.box.open.after(M.bs58decode(u.searchParams.get("payload")), M.bs58decode(u.searchParams.get("nonce")), shared)
    )
  );
  ok(payload.session === "sess-abc", "the session is inside the sealed payload");
  ok(payload.display === "utf8", "asking the wallet to show the text, not hex");
  ok(new TextDecoder().decode(M.bs58decode(payload.message)) === MSG, "and the message arrives EXACTLY as the server composed it");
  ok(store.get("dl:phantom:pending") === "Wallet linked", "the label is held across the navigation");

  // Now answer as the wallet: sign it for real.
  const sig = nacl.sign.detached(new TextEncoder().encode(MSG), walletSigner.secretKey);
  const nonce = nacl.randomBytes(24);
  const boxed = nacl.box.after(
    new TextEncoder().encode(JSON.stringify({ signature: REF.encode(Buffer.from(sig)) })),
    nonce, shared
  );
  href = "https://bannr.vercel.app/link?dlwallet=phantom%3Amessage&nonce=" + M.bs58encode(nonce) + "&data=" + M.bs58encode(boxed);
  emitted = [];
  const out = M.handleRedirect();
  ok(out?.type === "message", "the redirect resumes as a message signature");
  ok(out.label === "Wallet linked", "with the label it set out with");
  ok(out.publicKey === ADDR, "and the address it belongs to, so the caller need not have remembered");
  ok(!store.get("dl:phantom:pending"), "the pending label is cleared, so it cannot leak into the next hop");

  console.log("\n4a. AND THE SERVER ACCEPTS IT");
  // This is the assertion that matters: what comes out of the module
  // has to satisfy lib/auth.js verifySignature, unchanged.
  const sigBytes = Buffer.from(out.signature, "base64");
  ok(sigBytes.length === 64, "base64 of exactly 64 bytes, which is what verifySignature demands");
  ok(
    nacl.sign.detached.verify(new TextEncoder().encode(MSG), sigBytes, Buffer.from(REF.decode(ADDR))),
    "AND IT VERIFIES against the address, by the same call the server makes"
  );
  ok(
    !nacl.sign.detached.verify(new TextEncoder().encode(MSG + "!"), sigBytes, Buffer.from(REF.decode(ADDR))),
    "while a tampered message does not"
  );
}

console.log("\n5. WHEN IT GOES WRONG");
{
  href = "https://bannr.vercel.app/link?dlwallet=phantom%3Amessage&errorCode=4001&errorMessage=User%20rejected";
  emitted = [];
  const out = M.handleRedirect();
  ok(out?.type === "error" && /rejected/i.test(out.message), "a rejection comes back as an error, not a hang");
  ok(emitted.length === 1, "announced once");
}
{
  // A garbled payload must not throw out of handleRedirect and kill
  // the page it was called from.
  href = "https://bannr.vercel.app/link?dlwallet=phantom%3Amessage&nonce=111&data=111";
  emitted = [];
  let threw = false;
  let out;
  try { out = M.handleRedirect(); } catch { threw = true; }
  ok(!threw, "a corrupt payload never throws out of handleRedirect");
  ok(out?.type === "error", "it is reported as an error instead");
}
{
  href = "https://bannr.vercel.app/create";
  ok(M.isRedirect() === false, "a normal page load is not a redirect");
  ok(M.handleRedirect() === null, "and does nothing at all");
  href = "https://bannr.vercel.app/create?dlwallet=phantom%3Aconnect";
  ok(M.isRedirect() === true, "a marked one is");
}
{
  // Signing before connecting has to fail loudly, not send garbage.
  M.disconnect("phantom");
  let msg = "";
  try { M.signMessage("phantom", "hi"); } catch (e) { msg = e.message; }
  ok(/session expired|connect again/i.test(msg), "signing with no session refuses rather than sending an empty one");
  ok(M.restoreSession("phantom") === null, "and disconnect really clears it");
  ok(M.anySession() === null, "with nothing left anywhere");
}

console.log("\n6. NO CDN, NO NETWORK, ON THE SIGN-IN PATH");
{
  const S = read("lib/deeplink.js");
  // Comments stripped: the header explains WHY the CDN is gone, and
  // matching that sentence would be the test grading its own prose.
  const code = S.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/esm\.sh|unpkg|jsdelivr/.test(code), "tweetnacl is NOT fetched from a third-party host at sign-in time");
  ok(!/import\(\s*["']https:/.test(code), "and nothing else imports over the network either");
  ok(S.includes('import nacl from "tweetnacl";'), "it comes from our own dependency");
  ok(JSON.parse(read("package.json")).dependencies.tweetnacl, "which is a declared dependency, not a transitive accident");
  ok(!/await loadNacl|naclPromise/.test(S), "and there is no lazy loader left to fail offline");
}

// Sections 7 and 8 await fetches, so they run inside an async IIFE.
(async () => {
console.log("\n7. THE FLOW SURVIVES THE PAGE LOADS — AND THE NEW TAB");
{
  // sessionStorage is deliberately BOOBY-TRAPPED here. If walletFlow
  // ever touches it again this section throws, which is the whole
  // point: iOS opens the redirect in a NEW TAB, sessionStorage is
  // per-tab, and that is exactly how the resume came back to a page
  // that had never heard of the flow and still said "None linked".
  global.sessionStorage = {
    getItem() { throw new Error("walletFlow must not use sessionStorage — the redirect lands in another tab"); },
    setItem() { throw new Error("walletFlow must not use sessionStorage — the redirect lands in another tab"); },
    removeItem() { throw new Error("walletFlow must not use sessionStorage — the redirect lands in another tab"); },
  };
  const fsrc = read("lib/walletFlow.js").replace(/^"use client";$/m, "").replace(/^export /gm, "");
  const F = new Function(fsrc + "\nreturn { beginFlow, readFlow, endFlow, announceDone, fetchChallenge, submitSignature, DONE_KEY };")();

  ok(!/sessionStorage/.test(bare(read("lib/walletFlow.js"))), "walletFlow uses localStorage ONLY — it has to cross tabs");

  F.beginFlow("link", "phantom");
  ok(F.readFlow()?.intent === "link", "the intent survives being written down");
  ok(F.readFlow()?.provider === "phantom", "and so does which wallet");
  ok(store.has("bl:flow"), "IN LOCALSTORAGE, which a new tab can read");
  F.endFlow();
  ok(F.readFlow() === null, "and it can be cleared");

  // The payload: a purchase names a pack, and the page that knew
  // which one is a tab iOS left behind.
  F.beginFlow("buy", "phantom", { packId: "starter" });
  ok(F.readFlow()?.payload?.packId === "starter", "a payload rides along, so a purchase knows which pack it was");
  ok(F.readFlow()?.intent === "buy", "under its own intent");
  F.endFlow();

  // Other tabs are told, because the one that started this is still
  // open and still mid-flow.
  F.announceDone();
  ok(store.has("bl:done"), "finishing sets a key other tabs can hear");
  ok(F.DONE_KEY === "bl:done", "and useAuth listens for that exact key");

  // Stale intents must not be resumed: the server's nonce is dead at
  // five minutes, so marching someone through two app-hops to be told
  // no is worse than forgetting. This matters MORE in localStorage,
  // which outlives the tab.
  store.set("bl:flow", JSON.stringify({ intent: "link", provider: "phantom", at: Date.now() - 11 * 60_000 }));
  ok(F.readFlow() === null, "an intent older than the nonce it depends on is dropped, not resumed");
  store.set("bl:flow", JSON.stringify({ intent: "link", provider: "phantom", at: Date.now() - 60_000 }));
  ok(F.readFlow()?.intent === "link", "a fresh one is kept");
  store.set("bl:flow", "{{{not json");
  ok(F.readFlow() === null, "and corrupt storage never throws");

  // Routing: link and sign-in are different endpoints with different
  // bodies, and sending one to the other fails in a way that would be
  // very hard to read from the outside.
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true, user: { accountId: "a1" } }) };
  };
  await F.submitSignature({ intent: "signin", address: "ADDR", nonce: "N", signature: "S" });
  ok(calls[0].url === "/api/auth/verify", "signing in posts to verify");
  ok(!("type" in calls[0].body), "with no identity type");
  await F.submitSignature({ intent: "link", address: "ADDR", nonce: "N", signature: "S" });
  ok(calls[1].url === "/api/auth/identities", "linking posts to identities");
  ok(calls[1].body.type === "wallet", "naming the identity type it is adding");
  for (const c of calls) {
    ok(c.body.wallet === "ADDR" && c.body.nonce === "N" && c.body.signature === "S",
       "both send address, nonce and signature — the three things the server checks");
  }

  global.fetch = async () => ({ ok: false, json: async () => ({ error: "Nonce expired." }) });
  let msg = "";
  try { await F.submitSignature({ intent: "link" }); } catch (e) { msg = e.message; }
  ok(msg === "Nonce expired.", "and the server's own words reach the user, not a generic apology");

  global.fetch = async () => ({ ok: false, json: async () => ({ error: "That isn't a valid Solana address." }) });
  try { await F.fetchChallenge("bad"); } catch (e) { msg = e.message; }
  ok(/valid Solana address/.test(msg), "a rejected challenge says why");
  ok(!/signMessage|location.href/.test(bare(read("lib/walletFlow.js"))), "and walletFlow CANNOT navigate at all — it only fetches");
}

console.log("\n7a. THE GESTURE RULE — WHY THE FIRST VERSION LANDED ON A DOWNLOAD PAGE");
{
  // iOS hands a universal link to the app only when the navigation is
  // user-initiated. Await anything before setting location.href and
  // the gesture is spent, so Safari loads phantom.app as a web page
  // and the user is told to install an app they already have.
  const A = read("lib/useAuth.js");
  const start = A.slice(A.indexOf("const startWalletDeeplink"), A.indexOf("// The second hop"));
  ok(!/^\s*const startWalletDeeplink = useCallback\(async/m.test(A), "startWalletDeeplink is NOT async");
  ok(!/await/.test(bare(start)), "and awaits NOTHING between the tap and the navigation");
  ok(!/import\(/.test(bare(start)), "no dynamic import in it — that was the original bug");
  ok(!/fetch\(/.test(bare(start)), "and no fetch either");
  ok(start.includes("mods.DeepLink.connect(provider);"), "it navigates straight out");
  ok(start.includes("if (!mods)"), "having required the modules to be loaded ALREADY");

  const cont = A.slice(A.indexOf("const continueWalletDeeplink"), A.indexOf("// Resume."));
  ok(!/^\s*const continueWalletDeeplink = useCallback\(async/m.test(A), "the second hop is not async either");
  ok(!/await|fetch\(|import\(/.test(bare(cont)), "and awaits nothing before ITS navigation");
  ok(cont.includes("mods.DeepLink.signMessage("), "it just goes");

  // Preload: the whole reason the tap has nothing to wait for.
  ok(/Promise\.all\(\[import\("@\/lib\/deeplink"\), import\("@\/lib\/walletFlow"\)\]\)/.test(A),
     "both modules are preloaded in an effect");
  ok(A.includes("if (!wallet.mobile || wallet.available) return;"), "only on a device that will need them");

  // And the resume must NOT navigate: a page load has no gesture at
  // all, so a hop fired there always lands on the web page.
  // The resume moved out of the hook entirely — see 7b.
  const eff = read("lib/walletResume.js");
  ok(!/signMessage\(/.test(bare(eff)), "the resume NEVER navigates to the wallet");
  ok(eff.includes("flow.fetchChallenge(result.publicKey)"), "it fetches the challenge, which needs no gesture");
  ok(eff.includes("pendingSign: {"), "and parks it for a tap");

  // The buy hop obeys the same rule, and its transaction has to be
  // built BEFORE the tap for exactly the same reason.
  const pay = A.slice(A.indexOf("const payWithDeeplink"), A.indexOf("const finishFlow"));
  ok(!/^\s*const payWithDeeplink = useCallback\(async/m.test(A), "payWithDeeplink is not async either");
  ok(!/await|fetch\(|import\(/.test(bare(pay)), "and awaits nothing before handing the transaction over");
  // signTransaction since Phantom retired signAndSendTransaction —
  // see tests/paytest.cjs. The gesture rule is unchanged by that: the
  // navigation still has to happen inside the tap, and broadcasting
  // now happens later, on the way back, where an await is free.
  ok(pay.includes("mods.DeepLink.signTransaction("), "it just goes");
  {
    const CR = read("app/credits/page.jsx");
    ok(CR.includes('auth.startWalletDeeplink("buy", "phantom", { packId: pack.id });'),
       "the pack travels with the flow, because this tab will be gone");
    ok(CR.includes("const built = await buildTreasuryTx(pack.sol, auth.user?.accountId, p.address);"),
       "and the transaction is built on page load");
    // The handler clears the previous attempt's message first, since
    // an expired payment now offers this same button again with the
    // explanation still on screen. Still synchronous, which is the
    // part that matters: nothing may be awaited before the navigation.
    ok(CR.includes("auth.payWithDeeplink(tx.transaction);"), "then handed over on a tap");
    ok(/onClick=\{\(\) => \{ setErr\(null\); auth\.payWithDeeplink/.test(CR),
       "and nothing is awaited inside that handler");
    ok(!/onClick=\{async[^}]*payWithDeeplink/.test(CR), "not from an async handler");
    // The builder is shared, so the injected path and the deeplink
    // path cannot drift on something as load-bearing as the memo.
    const W = read("lib/wallet.js");
    ok(W.includes("export async function buildTreasuryTx"), "one builder");
    ok(W.includes("const built = await buildTreasuryTx(sol, accountId, p.publicKey.toString());"),
       "used by the injected path too, so the memo cannot differ between them");
    ok((W.match(/MEMO_PROGRAM_ID/g) || []).length === 2, "and the memo is written in exactly one place");
  }

  const WC = read("components/WalletContinue.jsx");
  ok(WC.includes("onClick={auth.continueWalletDeeplink}"), "which WalletContinue provides");
  ok(!/onClick=\{async/.test(WC), "not as an async handler");
  ok(read("components/SignInModal.jsx").includes("<WalletContinue auth={auth} />"),
     "shown in the sign-in dialog");
  ok(read("app/settings/page.jsx").includes("auth.pendingSign ? (\n                    <WalletContinue auth={auth} />"),
     "and in settings, so a flow started there can finish there");
}

console.log("\n7b. ONE OWNER FOR THE REDIRECT");
{
  const A = read("lib/useAuth.js");
  const RES = read("lib/walletResume.js");

  // The bug: useAuth is called by the nav AND by the page, so two
  // instances raced for the same redirect. handleRedirect scrubs the
  // URL, so the winner kept the result and the loser got null — if
  // the nav won, the settings page never drew the button.
  ok(RES.includes("let started = false;") && RES.includes("if (started) return;\n  started = true;"),
     "the redirect is consumed at most once per page load, by module state");
  ok(!/handleRedirect\(\)/.test(bare(A)), "useAuth does not call handleRedirect at all any more");
  ok(A.includes("resumeOnce();") && A.includes("return subscribeWallet(setDl);"),
     "it subscribes instead, so every instance sees the same flow");
  ok(A.includes("const { pendingSign, pendingPay, paid, linked } = dlState;"),
     "and reads all of it from that one place");
  ok(!/useState\(null\);[^\n]*\n[^\n]*setPendingSign/.test(A), "no per-hook copy left to disagree");

  // Two instances must not both get past the check. There is an await
  // between "is this a redirect" and "handle it", so the guard has to
  // be set BEFORE that await, not after.
  {
    const fn = RES.slice(RES.indexOf("export function resumeOnce"), RES.indexOf("(async () => {"));
    ok(/started = true;/.test(fn), "the guard is set synchronously, before the first await");
  }

  // A decrypt failure means the stored keypair no longer matches what
  // the wallet answered. That state can never succeed again, so it is
  // thrown away rather than left to fail identically next time.
  ok(RES.includes('/decrypt|expired|session/i.test(result.message || "")'), "a decrypt failure is recognised");
  ok(RES.includes("DeepLink.disconnectAll()"), "and the unusable state is WIPED, so the retry starts clean");
  ok(RES.includes("That wallet connection went stale."), "with a message that says what to do");
  ok(A.includes("setWalletState({ pendingSign: null, pendingPay: null, paid: null, error: null });"),
     "and starting over clears anything half-finished, since connect mints a new keypair");

  ok(A.includes("busy: busy || dlState.busy") && A.includes("error: error || dlState.error"),
     "the shared flow reports through the same busy/error every consumer already reads");
  ok(A.includes("clearError: () => { setError(null); setWalletState({ error: null }); }"),
     "and dismissing an error clears both, or a stale one survives");
}

console.log("\n8. WIRED IN");
{
  const A = read("lib/useAuth.js");
  const RES = read("lib/walletResume.js");
  const CB = read("components/ConnectButton.jsx");
  const SET = read("app/settings/page.jsx");

  ok(A.includes("const startWalletDeeplink = useCallback"), "useAuth exposes a way to start it");
  ok(A.includes("needsDeeplink: wallet.mobile && !wallet.available"), "offered exactly when a phone browser has no provider");
  ok(!/needsHandoff/.test(A + CB + SET), "and the old handoff flag is gone from every consumer");
  // The resume lives in walletResume now, not in the hook.
  ok(RES.includes('if (!DeepLink?.isRedirect || !DeepLink.isRedirect()) return;'),
     "the resume checks the URL BEFORE doing anything");
  {
    // Cost on a normal page load: the marker check must come before
    // any use of the module, or tweetnacl lands in every route.
    ok(RES.indexOf("isRedirect()") < RES.indexOf("handleRedirect()"), "so handleRedirect only runs on a real redirect");
    ok(RES.includes('await import("@/lib/walletFlow")'), "and walletFlow is imported lazily too");
    ok(RES.includes("if (!pending) return;"), "a stray redirect we did not ask for is ignored");
    ok(RES.includes("if (!pending?.nonce || !pending?.address)"), "and a signature with no challenge behind it is dropped");
    ok(/reject|declin|cancel/.test(bare(RES)), "a rejection in the wallet is treated as a decision, not an error to shout about");
  }
  ok(RES.includes("linked: { intent: pending.intent, merged: out.merged || 0 }"),
     "success is announced through state, because the promise that started it died two page loads ago");
  ok(SET.includes("if (!auth.linked) return;") && SET.includes("auth.clearLinked();"),
     "settings reacts to that and clears it, so it fires once");
  ok(read("components/SignInModal.jsx").includes('auth.startWalletDeeplink("signin")'), "the dialog starts a sign-in");
  ok(SET.includes('auth.startWalletDeeplink("link")'), "and the settings button starts a link");
  ok(!/phantomBrowseUrl|solflareBrowseUrl/.test(CB), "no in-app-browser handoff left in the sign-in UI");
  ok(!/handoff/i.test(SET), "nor in settings");

  // The nonce is the sybil defence behind the token gate: connect
  // alone is the browser telling us an address, which proves nothing.
  ok(A.includes('if (e.key !== "bl:done") return;'), "and the tab left behind is told when another one finishes");
  ok(RES.includes("flow.announceDone();"), "which only happens after the account actually changed");
  ok(RES.includes("flow.fetchChallenge(result.publicKey)") && A.includes("mods.DeepLink.signMessage("),
     "CONNECT IS NEVER TREATED AS PROOF — it always goes on to ask for a signature");
  ok(!/submitSignature\(\{[^}]*signature: *result\.publicKey/.test(A), "and the address is never posted as if it were one");
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
})();

