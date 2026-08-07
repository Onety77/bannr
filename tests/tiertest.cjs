// ============================================================
// THE LADDER, THE PRICES, AND THE LOCKS.
//
// Every block here is a way this could go wrong with real money or a
// real promise attached, and most of them were found by reasoning
// about the change rather than by shipping it — which is the one
// category of test worth writing before the bug.
//
// lib/tiers.js, lib/packs.js and lib/solPrice.js are pure enough to
// load by stripping their exports, so these run the REAL functions.
// The routes and pages are read as source, because what matters there
// is which function they call.
// ============================================================
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;

const load = (file, names) =>
  new Function(read(file).replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") + `\nreturn { ${names} };`)();

const T = load("lib/tiers.js", "DEFAULT_TIERS, DEFAULT_FREE, CAPS, cleanTiers, cleanFree, tierFor, tierById, entitlementsOf, nextTier");
const P = load("lib/packs.js", "PACKS, priceUsd, creditsForPayment, packLabel, TOLERANCE");
const S = load("lib/solPrice.js", "pickSolUsd, solForUsd, usdForSol, WSOL");

const LADDER = T.cleanTiers([
  { id: "t1", minTokens: 1000,    dailyRuns: 1, discount: 10 },
  { id: "t2", minTokens: 50_000,  dailyRuns: 2, discount: 25 },
  { id: "t3", minTokens: 250_000, dailyRuns: 3, discount: 40 },
]);
const GATE = { tiers: LADDER, free: T.DEFAULT_FREE };

console.log("\n=== 1. WHICH RUNG A BALANCE REACHES ===");
ok(T.tierFor(0, LADDER) === null, "holding nothing reaches nothing");
ok(T.tierFor(999, LADDER) === null, "one token short of the first rung is still nothing");
ok(T.tierFor(1000, LADDER).id === "t1", "exactly the threshold counts");
ok(T.tierFor(49_999, LADDER).id === "t1", "between rungs stays on the lower one");
ok(T.tierFor(9_000_000, LADDER).id === "t3", "far above the top is the top, not an error");
ok(T.tierFor(null, LADDER) === null, "an unknown balance is not a tier");
// A failed RPC returns null, and null must never read as "qualifies".
ok(T.tierFor(undefined, LADDER) === null, "AND A FAILED BALANCE READ REACHES NOTHING");
// An unset threshold is 0, and 0 >= 0 is true — which would hand the
// whole ladder to everyone the moment the panel was half filled in.
ok(T.tierFor(5, T.cleanTiers([{ id: "t1", minTokens: 0, dailyRuns: 9 }])) === null,
   "A THRESHOLD OF 0 IS UNSET, not a rung everybody clears");

console.log("\n=== 2. THE FREE TIER IS A STANDING, NOT AN ABSENCE ===");
{
  const free = T.entitlementsOf(GATE, null);
  ok(free.dailyRuns === 1, "a non-holder gets one run a day");
  ok(free.styles === false && free.direction === false, "and cannot pick a style or say what they want");
  ok(free.discount === 0, "no discount");
  ok(free.tierId === null, "and no tier id, so the UI can tell the difference");
}
{
  // The gate being off must not take the free tier with it: it is the
  // trial, and it has to work before there is a token at all.
  const off = T.entitlementsOf({ tiers: [], free: T.DEFAULT_FREE }, null);
  ok(off.dailyRuns === 1, "THE FREE RUN SURVIVES THE TIERS BEING OFF");
}
{
  const t3 = T.entitlementsOf(GATE, T.tierFor(250_000, LADDER));
  ok(t3.dailyRuns === 3 && t3.discount === 40, "the top rung gets its own numbers");
  ok(t3.styles && t3.direction && t3.advanced, "and everything unlocked");
  ok(t3.tierId === "t3" && t3.tierName === "Founder", "named, for the page");
}
{
  // An admin can save a rung worse than free. The ladder's first step
  // must never be a step down.
  const g = { tiers: T.cleanTiers([{ id: "t1", minTokens: 1000, dailyRuns: 0 }]), free: { dailyRuns: 2 } };
  ok(T.entitlementsOf(g, g.tiers[0]).dailyRuns === 2, "FREE IS THE FLOOR — a tier never grants fewer runs than nothing does");
}

console.log("\n=== 3. HOW FAR TO THE NEXT RUNG ===");
ok(T.nextTier(0, LADDER).id === "t1" && T.nextTier(0, LADDER).away === 1000, "from nothing, the first rung and the whole distance");
ok(T.nextTier(40_000, LADDER).away === 10_000, "part way up, only what is left");
ok(T.nextTier(250_000, LADDER) === null, "at the top there is no next");
ok(T.nextTier(999_999, LADDER) === null, "and past the top there still is not");

console.log("\n=== 4. PRICES ARE IN DOLLARS ===");
ok(P.PACKS.every((p) => typeof p.usd === "number" && p.usd > 0), "every pack has a dollar price");
ok(P.PACKS.every((p) => p.sol === undefined), "AND NONE OF THEM HAS A SOL AMOUNT — that was the defect");
ok(P.PACKS.map((p) => p.usd).join() === "9,29,79", "the ladder is 9/29/79");
ok(P.PACKS.filter((p) => p.featured).length === 1, "exactly one is featured");
ok(P.priceUsd({ usd: 29 }, 0) === 29, "no discount, no change");
ok(P.priceUsd({ usd: 29 }, 25) === 21.75, "25% off 29 is 21.75");
ok(P.priceUsd({ usd: 9 }, 40) === 5.4, "and 40% off 9 is 5.40");
// Whole cents, because the page shows this number and the matcher
// expects it — derived separately, a fraction of a cent puts a correct
// payment outside its own tolerance band.
ok(Number.isInteger(P.priceUsd({ usd: 79 }, 33) * 100), "always a whole number of cents");
ok(P.priceUsd({ usd: 9 }, 500) === 0.9, "a mad discount is clamped, never free");
// History is translated, not rewritten.
ok(P.packLabel("degen") === "Degen", "an id from before the move still reads as a name");
ok(P.packLabel("launch") === "Launch", "and a current one reads as itself");

console.log("\n=== 5. GRADING A PAYMENT ===");
const RATE = 72; // roughly where SOL was when this was written
{
  const exact = P.creditsForPayment(29 / RATE, RATE, 0);
  ok(exact.id === "launch" && exact.credits === 60, "the exact price buys the pack");
}
{
  // The drift the band exists for: quoted at 72, confirmed at 69.
  const quoted = 29 / 72;
  ok(P.creditsForPayment(quoted, 69, 0).id === "launch", "a 4% move between quote and confirmation still lands on the pack");
  ok(P.creditsForPayment(quoted, 75, 0).id === "launch", "and so does one the other way");
}
{
  // ══ THE BUG THIS WHOLE ARGUMENT EXISTS FOR ══
  //
  // A holder is quoted the discounted price and sends exactly it.
  // Graded without the discount, that amount is nowhere near Launch,
  // falls through to the "best pack it clears" rule, and is credited
  // at STARTER's rate — a holder getting fewer credits per dollar than
  // a stranger, silently.
  const paid = P.priceUsd({ usd: 29 }, 25) / RATE;
  ok(P.creditsForPayment(paid, RATE, 25).id === "launch", "a discounted payment matches its pack when the discount is known");
  ok(P.creditsForPayment(paid, RATE, 25).credits === 60, "and gets the FULL credits, not a reduced share");
  const blind = P.creditsForPayment(paid, RATE, 0);
  ok(blind.id !== "launch" && blind.credits < 60,
     "GRADED WITHOUT THE DISCOUNT IT UNDERPAYS — which is why the matcher takes one");
}
{
  // Paying more must never get you less.
  let last = -1, monotonic = true;
  for (let usd = 1; usd <= 200; usd += 1) {
    const c = P.creditsForPayment(usd / RATE, RATE, 0).credits;
    if (c < last) monotonic = false;
    last = c;
  }
  ok(monotonic, "credits never go backwards as the amount goes up");
}
ok(P.creditsForPayment(1, null, 0) === null, "no rate -> no grade, rather than a guess");
ok(P.creditsForPayment(0, RATE, 0).credits === 0, "nothing paid, nothing credited");
{
  // The bands must not overlap, or a payment could match two packs and
  // the answer would depend on iteration order.
  const prices = P.PACKS.map((p) => p.usd);
  let clear = true;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] * (1 - P.TOLERANCE) <= prices[i - 1] * (1 + P.TOLERANCE)) clear = false;
  }
  ok(clear, "no two packs' tolerance bands can overlap");
}

console.log("\n=== 6. THE SOL PRICE, AND REFUSING TO GUESS ===");
const pair = (usd, quote, liq) => ({ baseToken: { address: S.WSOL }, quoteToken: { address: quote }, priceUsd: usd, liquidity: { usd: liq } });
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
ok(S.pickSolUsd([pair("72.4", USDC, 9e6)]) === 72.4, "a real stablecoin pair is read");
ok(S.pickSolUsd([pair("72.4", USDC, 1e3), pair("71.9", USDC, 9e6)]) === 71.9, "the deepest pool wins, not the first listed");
ok(S.pickSolUsd([pair("0.004", USDC, 9e9)]) === null, "A MANIPULATED $0.004 READ IS THROWN AWAY, not honoured");
ok(S.pickSolUsd([pair("48000", USDC, 9e9)]) === null, "and so is an absurd high one");
ok(S.pickSolUsd([pair("72", "SomeRandomMint", 9e9)]) === null, "a SOL/anything pair cannot set the dollar price");
ok(S.pickSolUsd([]) === null, "nothing to read -> null");
ok(S.pickSolUsd(undefined) === null, "and a broken reply -> null");
ok(S.solForUsd(9, 72) === 0.125, "nine dollars at 72 is 0.125 SOL");
ok(S.solForUsd(9, 0) === null && S.solForUsd(9, null) === null, "no rate -> no amount");
// Rounded UP, so rounding can never leave a payment a hair under its
// own pack and drop it into the tier below.
ok(S.solForUsd(29, 71.3) * 71.3 >= 29, "the quoted SOL is never worth less than the price");
ok(near(S.usdForSol(0.125, 72), 9), "and the reverse direction agrees");

console.log("\n=== 7. THE SERVER ENFORCES THE LOCKS, NOT THE PAGE ===");
{
  const G = bare(read("app/api/generate/route.js"));
  ok(/resolveEntitlements\(session\.accountId\)/.test(G), "the run resolves entitlements from the session, never from the form");
  ok(G.indexOf("resolveEntitlements") < G.indexOf("await req.formData()"),
     "AND BEFORE THE FORM IS READ — otherwise the fields are acted on before anyone asks if they are allowed");
  ok(/ent\.direction \?/.test(G), "the direction note is dropped when the tier does not include it");
  ok(/if \(!ent\.styles\)/.test(G), "so is a chosen style");
  ok(/if \(!ent\.advanced/.test(G), "and the advanced settings");
  ok(/locked: locked\.length/.test(G), "and what was dropped is reported, not silently swallowed");
  ok(/allowance: ent\.dailyRuns/.test(G), "the allowance comes from the ladder");
  ok(!/gate\.dailyRuns/.test(G), "and never from a flat gate field again");
}
{
  const C = bare(read("app/create/page.jsx"));
  ok(/useEntitlements\(\)/.test(C), "the create page reads the same table");
  ok(/!ent\.styles \?/.test(C) && /!ent\.direction \?/.test(C), "and locks both rows rather than hiding them");
  // A restored draft or a ?style= link can carry a style this account
  // may not pick; leaving it selected would show a chosen style the
  // server then drops.
  ok(/if \(ent\.styles\) return;/.test(C), "a locked account is forced back to Default in state, not just at submit");
}
{
  const E = read("lib/useEntitlements.js");
  // bare(), because the file's own header explains at length why it is
  // neither — and matching that comment instead of the code is the
  // exact failure this suite keeps rediscovering.
  const L = bare(read("lib/tiers.js"));
  ok(/entitlementsOf/.test(E) && /entitlementsOf/.test(read("lib/entitlements.js")),
     "both sides reduce to the same function");
  ok(!/server-only/.test(L) && !/use client/.test(L),
     "which is why lib/tiers belongs to neither side");
}

console.log("\n=== 8. THE PAGE AND THE PAYOUT CANNOT DISAGREE ===");
{
  const CLAIM = bare(read("app/api/pay/claim/route.js"));
  const PRICE = bare(read("app/api/pricing/route.js"));
  ok(/resolveEntitlements/.test(CLAIM) && /resolveEntitlements/.test(PRICE),
     "the quote and the grading read the discount from one place");
  ok(/creditsForPayment\(sol, rate, ent\.discount\)/.test(CLAIM), "and the grading actually applies it");
  ok(/rate === null/.test(CLAIM), "a missing price holds the payment");
  ok(/status: 202/.test(CLAIM), "as pending, which the client already polls");
  ok(!/creditsForSol/.test(CLAIM), "the SOL-priced matcher is gone");
}
{
  const W = bare(read("app/api/webhooks/helius/route.js"));
  ok(/creditsForPayment\(sol, rate, 0\)/.test(W), "the backstop grades at list price — there is no session to read a tier from");
  ok(/status: "unpriced"/.test(W), "and an unpriceable payment is recorded for a human rather than dropped");
}

console.log("\n=== 9. FREE IS A RUNG, NOT A FOOTNOTE ===");
{
  const PR = bare(read("app/api/pricing/route.js"));
  const CR = bare(read("app/credits/page.jsx"));
  // Sent unconditionally and in tier shape, so the page can render it
  // with the same component and the reader can compare it to the rest.
  ok(/free: \{\s*\n?\s*id: "free"/.test(PR), "the free tier is sent in the same shape as a tier");
  ok(/tiers: gate\.enabled \? gate\.tiers : \[\]/.test(PR),
     "and the holder rungs still stay empty until the gate is armed");
  ok(/\[pricing\.free, \.\.\.\(pricing\.tiers/.test(CR), "the page puts free at the bottom of the ladder");
  // Before the tiers are armed the ladder is one card rather than
  // nothing at all — a section that renders nothing is a section
  // nobody knows exists.
  ok(/const armed =/.test(CR) && /!armed &&/.test(CR), "one rung before launch, and it says the rest are coming");

  // The allowance moved out of the balance panel. A balance panel
  // carries balances; an entitlement is not one.
  ok(!/\+\{you\.dailyRuns\}/.test(CR), "the balance row no longer states the allowance");
  ok(/you\.runsLeft/.test(CR), "it states what is left today instead");
  ok(/runsLeftToday/.test(PR), "which the server computes");
  ok(/u\.gateDate !== todayKey\(\)/.test(PR),
     "AND TELLS 'never checked' APART FROM 'checked, and you have none' — the first-visit bug again");
  ok(PR.indexOf("resolveEntitlements") < PR.indexOf("getUser(session.accountId)"),
     "reading the account after the verdict is written, not before");
}
{
  const CR = bare(read("app/credits/page.jsx"));
  ok(/LADDER_ROWS/.test(CR), "there is one list of what a rung can carry");
  ok(/earlyAccess.*New surfaces|New surfaces first/.test(CR) && /customStyle|A style of your own/.test(CR),
     "including the two perks honoured by hand — to the reader there is no difference");
  ok(/openLadder/.test(CR), "and one control opens every card at once, so the rungs can be compared");
  ok(/lad-row \$\{on \? "" : "off"\}/.test(CR),
     "ABSENCES ARE SHOWN, NOT DROPPED — what climbing buys is only legible beside what it does not");
}

console.log("\n=== 10. THE CEILING NOW COVERS EVERYONE ===");
{
  const A = bare(read("components/AdminToken.jsx"));
  ok(/form\.free\.dailyRuns/.test(A), "the free tier is editable");
  ok(/monthly\(/.test(A), "allowances are shown in dollars a month, which is the unit the decision is made in");
  ok(/per active account/.test(A), "and the free row says it applies to every account, not to holders");
  ok(/form\.tiers\.map/.test(A), "all three rungs are editable");
  ok(!/0\.073/.test(A), "the cost figure includes the art-director call");
}
ok(read("app/api/admin/token/route.js").includes("COST_PER_RUN = 0.081"),
   "0.081 a run — three images plus the director, not three images alone");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
