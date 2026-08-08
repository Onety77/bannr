// The launch model: no signup grant, free runs come from HOLDING,
// two doors into an account, and both asks live in a dialog.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const U = read("lib/users.js");
const VER = read("app/api/auth/verify/route.js");
const OFFER = read("lib/offer.js");
const PAGE = read("app/page.jsx");
const CB = read("components/ConnectButton.jsx");
const SIM = read("components/SignInModal.jsx");
const TOP = read("components/TopUpModal.jsx");
const MODALS = read("components/Modals.jsx");
const CREATE = read("app/create/page.jsx");
const SET = read("app/settings/page.jsx");
const YOU = read("app/you/page.jsx");
const HIST = read("app/history/page.jsx");

console.log("\n1. THE GIVEAWAY IS OFF");
ok(/export const SIGNUP_CREDITS = 0;/.test(U), "new accounts get zero credits");
ok(U.includes("credits: SIGNUP_CREDITS,"), "and the blank account reads that one constant");
{
  const grants = (bare(U).match(/credits: \d+/g) || []).filter((m) => m !== "credits: 0");
  ok(grants.length === 0, "no other hardcoded grant crept in anywhere");
}

console.log("\n2. TWO DOORS, BOTH REAL");
ok(VER.includes('const user = await getOrCreateByIdentity("wallet", wallet);'), "a wallet opens an account");
ok(!/needs_google|getByIdentity/.test(VER), "and nothing sends anyone to Google first");
ok(!/getByIdentity/.test(U), "the resolve-without-create helper is gone, not left dangling");
ok(read("app/api/auth/google/route.js").includes("getOrCreateByIdentity"), "Google opens one too");
ok(read("app/api/auth/identities/route.js").includes("linkIdentity"), "and either can be added to the other later");

console.log("\n3. THE OFFER IS READ, NEVER WRITTEN DOWN");
{
  const offerLine = new Function(
    OFFER.slice(OFFER.indexOf("export function tokenAmount")).replace(/^export /gm, "") + "\nreturn offerLine;"
  )();
  // A ladder, as publicGate publishes it. `free` is what everyone
  // already gets, and the sentence is the DELTA against it.
  const rungs = (free, ...t) => ({ live: true, symbol: "BANNR", free, tiers: t });
  const rung = (minTokens, dailyRuns, discount = 0, caps = {}) => ({ minTokens, dailyRuns, discount, ...caps });
  const NOFREE = { dailyRuns: 0, styles: false, direction: false };

  ok(offerLine(rungs(NOFREE, rung(250_000, 10)))
      === "Hold 250K $BANNR for 10 more free banners a day.", "reads as a sentence");
  ok(offerLine(rungs(NOFREE, rung(1000, 1)))
      === "Hold 1K $BANNR for 1 more free banner a day.", "and gets the singular right");
  ok(offerLine(rungs(NOFREE, rung(2_500_000, 5)))
      === "Hold 2.5M $BANNR for 5 more free banners a day.", "millions read as millions");

  // ══ THE FIRST BUG THIS BLOCK EXISTS FOR ══
  //
  // publicGate publishes `minTokens` (the ENTRY bar) and `dailyRuns`
  // (the TOP tier's grant) as two flat numbers, and pairing them reads
  // as one offer. It is not one offer: it advertises the cheapest
  // price for the best benefit, which is a promise the product will
  // not keep. The sentence must come from a single rung.
  ok(offerLine({ ...rungs(NOFREE, rung(1000, 1), rung(50_000, 2), rung(250_000, 3)), minTokens: 1000, dailyRuns: 3 })
      === "Hold 1K $BANNR for 1 more free banner a day.",
      "THE ENTRY BAR IS PAIRED WITH THE ENTRY GRANT, never with the top tier's");

  // ══ AND THE SECOND ══
  //
  // Everyone gets one free run a day, so a rung granting one adds
  // nothing in runs and the sentence must not pretend otherwise.
  //
  // It used to list unlocked FEATURES here — every style, your own
  // direction. Those are gone: gating a feature put a paying customer
  // below a token holder who never spent a cent, so a rung is extra
  // runs, a cheaper pack and status. Nothing to unlock.
  ok(offerLine(rungs({ dailyRuns: 1 }, rung(1000, 1, 10)))
      === "Hold 1K $BANNR for 10% off credits.",
      "A RUNG MATCHED TO FREE ON RUNS advertises only what it really adds");
  ok(!/free banner/.test(offerLine(rungs({ dailyRuns: 2 }, rung(1000, 2, 10)))),
     "and never claims more runs when there are none to gain");
  ok(offerLine(rungs({ dailyRuns: 1 }, rung(1000, 3, 10)))
      === "Hold 1K $BANNR for 2 more free banners a day and 10% off credits.",
     "the runs it advertises are the DIFFERENCE, not the total");

  // A discount-only rung is a real offer and has to say so.
  ok(offerLine(rungs(NOFREE, rung(1000, 0, 25))) === "Hold 1K $BANNR for 25% off credits.",
     "a rung that only discounts still has something to advertise");
  ok(offerLine(rungs(NOFREE, rung(1000, 1, 10))) === "Hold 1K $BANNR for 1 more free banner a day and 10% off credits.",
     "and a rung with both says both");

  // NULL is the case that matters: no token yet, or the tiers off.
  ok(offerLine({ ...rungs(NOFREE, rung(1, 10)), live: false }) === null, "TIERS OFF → null, so nothing promises a free tier");
  ok(offerLine(rungs(NOFREE, rung(1000, 0, 0))) === null, "a rung granting nothing → null");
  ok(offerLine(rungs({ dailyRuns: 3, styles: true, direction: true }, rung(1000, 1, 0, { styles: true, direction: true }))) === null,
     "and a rung that adds NOTHING over free → null, rather than an empty boast");
  ok(offerLine(rungs(NOFREE)) === null, "no rungs at all → null");
  // An unset threshold is not "everybody qualifies".
  ok(offerLine(rungs(NOFREE, rung(0, 5))) === null, "a threshold of 0 is UNSET, not free-for-all");
  ok(offerLine(null) === null, "and no config at all → null");
}
ok(!/^\s*["']use client["']|server-only/.test(bare(OFFER)), "lib/offer belongs to neither side, since both need it");

console.log("\n4. NOTHING PROMISES 12 CREDITS");
for (const [name, src] of Object.entries({
  "app/page.jsx": PAGE, "components/ConnectButton.jsx": CB, "components/SinglePost.jsx": read("components/SinglePost.jsx"),
})) {
  ok(!/12 free credits|free credits/i.test(bare(src)), name + ": the old promise is gone");
}
ok(PAGE.includes("export default async function Landing()"), "the homepage is async, so it can read the gate");
ok(PAGE.includes('if (f.id === "offer" && !offer) return null;'), "the offer card is DROPPED when there is none, not softened");

console.log("\n5. ONE BUTTON, AND THE CHOICE IS IN THE DIALOG");
{
  // The sign-in surface used to be two buttons, a line under each, a
  // reversibility line and a paragraph — too big to put anywhere but
  // /create, which is why /you told people to go there to sign in.
  ok(/export default function ConnectButton/.test(CB), "one button");
  ok(CB.includes("onClick={openSignIn}"), "and it opens the dialog");
  ok(bare(CB).length < 900, "with nothing else in it (" + bare(CB).length + " chars)");
  ok(!/SignInChoice|ConnectNote|WalletSignIn|doors-note/.test(CB), "no doors, no notes, no third component");
  ok(!/Google/.test(bare(CB)), "and the button is no longer Google-specific");

  ok(SIM.includes("Continue with Phantom"), "the dialog offers Phantom");
  ok(SIM.includes("Continue with Google"), "and Google");
  {
    // Two buttons and a title. Nothing explaining what either does.
    const copy = (SIM.match(/>[A-Z][^<>{}]{12,}</g) || []).join(" ");
    ok(!/free generations|add the other|two steps|later/i.test(copy), "and explains neither: " + JSON.stringify(copy.trim().slice(0, 60)));
  }
  ok(SIM.includes("auth.armWalletDeeplink?.();"), "opening it arms the one-tap wallet path");
  ok(SIM.includes("if (auth.user) closeModal();"), "and it closes itself once signed in");
  ok(SIM.includes("if (auth.pendingSign)"), "carrying the wallet flow when one is mid-way");
}

console.log("\n5a. AND IT IS REACHABLE FROM EVERY DEAD END");
{
  ok(!/Sign in from the create page/.test(YOU), "'sign in from the create page' is GONE");
  ok(!/Go to Create/.test(YOU), "and so is the button that sent them there");
  for (const [name, src] of Object.entries({ "app/you": YOU, "app/history": HIST, "app/create": CREATE, "app/settings": SET })) {
    ok(/<ConnectButton/.test(src), name + " signs you in where you are");
  }
  ok(HIST.includes("!auth.loading && !auth.user ?"), "history tells signed-out apart from empty");
  ok(read("app/layout.jsx").includes("<Modals />"), "the dialogs are mounted once, in the layout");
  ok(MODALS.includes("if (auth.pendingSign && !getModal()) openSignIn();"),
     "and reopen themselves when a wallet redirect lands on a fresh page");
}

console.log("\n6. NOTHING TO SPEND OPENS A DIALOG, NOT A DEAD END");
{
  ok((CREATE.match(/openTopUp\(\);/g) || []).length === 2, "generate and reroll both open it");
  ok(!/Not enough credits \(need/.test(CREATE), "the old error string is gone");
  ok(!fs.existsSync(R + "components/NothingToSpend.jsx"), "and the inline notice with it");

  ok(TOP.includes("const offer = offerLine(token);"), "the dialog reads the live gate");
  // bare(), because the code explains the old titles by quoting them.
  ok(!/Get free generations/.test(bare(TOP)), "without promising free generations above an offer that may not include any");

  // ══ THIS ONE SCREEN IS THE WHOLE CONVERSION FUNNEL ══
  //
  // Somebody made a banner, liked it, asked for another. Three things
  // were wrong and each is worth a line here.
  const t = bare(TOP);
  // 1. The free run comes back. True, costs a sale nobody was making
  //    today, and is the difference between a wall and a wait.
  ok(/Your free run is back tomorrow\./.test(t), "it says the free run returns");
  // 2. An unpriced button asks you to navigate to find out what you
  //    are agreeing to.
  ok(/Buy credits — from \$\{PACKS\[0\]\.usd\}/.test(t), "the buy button carries a price");
  ok(/from "@\/lib\/packs"/.test(t), "read from the price list, so it cannot drift from what /credits charges");
  // 3. "Connect your wallet" was PRIMARY. Connecting gives you nothing
  //    unless you already hold, so the loudest control on the screen
  //    did nothing for the people most likely to be reading it.
  const buyAt = t.indexOf("Buy credits —");
  const holdAt = t.indexOf("Hold ${sym} instead");
  ok(buyAt > -1 && holdAt > buyAt, "BUYING LEADS, holding is the second option");
  ok(/btn primary block" onClick=\{toCredits\}/.test(t), "and buying is the primary button");
  ok(!/btn primary[^\n]*connect/.test(t), "connecting a wallet is never the primary action");
  // hasWallet was computed and never used. Connecting a wallet that is
  // already linked does nothing at all.
  ok(/hasWallet \?/.test(t), "a wallet already linked is sent to the ladder rather than asked to connect again");
  {
    // The token route is entirely behind the offer. Before the tiers
    // are armed there is nothing to hold, and a button pointing at an
    // offer that does not exist is a dead end.
    ok((t.match(/\{offer && /g) || []).length >= 2, "every mention of the token is behind `offer &&`");
    // Only what is RENDERED, which is what the original assertion
    // scoped to as well. Imports, the useToken hook and the separate
    // pendingSign resume flow all legitimately name a wallet; the
    // question is whether a person with the tiers off sees one.
    // The closing tag AFTER the opening one. There is an earlier
    // </Modal> — the pendingSign resume branch returns its own — so a
    // bare indexOf found it, produced end < start, and sliced to an
    // empty string that passes every test put to it. Verified by
    // injecting a leak and watching it pass.
    const start = t.indexOf('<Modal title="Out of runs"');
    const body = t.slice(start, t.indexOf("</Modal>", start));
    ok(body.length > 100, "the modal body was actually found");
    const noOffer = body
      .replace(/\{offer && \([\s\S]*?\n\s*\)\}/g, "")
      .replace(/\{offer && <[^>]*>\{offer\}<\/[^>]*>\}/g, "");
    ok(!/wallet|hold|token|BANNR/i.test(noOffer), "so with the tiers off, no trace of a token is rendered");
  }
  ok(TOP.includes("if (auth.pendingSign)"), "it carries the wallet flow when one is mid-way");
}

console.log("\n7. FREE RUNS STILL REACH THE CLIENT");
ok(U.includes("holderRunsLeft:"), "publicUser exposes what is left today");
ok(/const freeRuns =\s*\n?\s*auth\.user\?\.holderRunsLeft/.test(CREATE), "the create page reads it");
ok(/\(auth\.user\.holderRunsLeft \|\| 0\) <= 0 &&/.test(CREATE) &&
   /auth\.user\.credits < GENERATION_COST/.test(CREATE),
   "and someone with free runs and zero credits is NOT stopped before the request leaves");
// ══ THE FIRST VISIT, WHICH IS THE FREE TIER'S ENTIRE AUDIENCE ══
//
// holderRunsLeft comes from the last balance check the server did, and
// on a first visit there has never been one — so it reads 0. Alongside
// 0 credits that showed the top-up dialog to exactly the person the
// free run exists for, on the visit that decides whether they return.
ok(/maybeFree/.test(CREATE), "a brand-new account is not blocked before its first free run");
ok(/!auth\.user\.holderDailyRuns/.test(CREATE),
   "and 'never checked' is told apart from 'checked, and you have none'");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
