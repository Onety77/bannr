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

const T = load("lib/tiers.js", "DEFAULT_TIERS, DEFAULT_FREE, cleanTiers, cleanFree, tierFor, tierById, entitlementsOf, nextTier");
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
  ok(free.discount === 0, "no discount");
  // A free run is a smaller amount of the real product, not a demo of
  // a worse one. Nothing in the app is gated by a tier.
  ok(free.styles === undefined, "and no capability flags at all — features are priced, never gated");
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
  ok(t3.earlyAccess === true && t3.customStyle === true, "and its status perks");
  ok(t3.tierId === "t3" && t3.tierName === "Founder", "named, for the page");
}
{
  // An admin can save a rung worse than free. The ladder's first step
  // must never be a step down.
  const g = { tiers: T.cleanTiers([{ id: "t1", minTokens: 1000, dailyRuns: 0 }]), free: { dailyRuns: 2 } };
  ok(T.entitlementsOf(g, g.tiers[0]).dailyRuns === 2, "FREE IS THE FLOOR — a tier never grants fewer runs than nothing does");
}

console.log("\n=== 2b. A TIER GIVEN RATHER THAN EARNED ===");
{
  const G = load("lib/tiers.js", "activeGrant, cleanGrant");
  const now = Date.now();
  ok(G.activeGrant({ tierGrant: { tier: "t3", until: now + 1000 } }, now).tier === "t3", "a live grant is returned");
  ok(G.activeGrant({ tierGrant: { tier: "t3", until: now - 1 } }, now) === null, "an expired one is not");
  // A partner or a teammate is a permanent arrangement, and a date
  // invented to satisfy a required field surprises somebody later.
  ok(G.activeGrant({ tierGrant: { tier: "t3", until: 0 } }, now).tier === "t3", "0 means no expiry, not expired");
  ok(G.activeGrant({}, now) === null && G.activeGrant(null, now) === null, "no grant, no tier");
  ok(G.activeGrant({ tierGrant: { until: 0 } }, now) === null, "a grant with no tier is not a grant");

  ok(G.cleanGrant({ tier: "nope" }) === null, "an unknown tier id is refused, never stored");
  ok(G.cleanGrant({ tier: "t2", days: 0 }).until === 0, "0 days stores no expiry");
  {
    const g = G.cleanGrant({ tier: "t2", days: 30 }, "me@x");
    // Stored as a MOMENT, not a duration: "granted 30 days ago for 30
    // days" is a subtraction somebody gets wrong at midnight.
    ok(g.until > Date.now() + 29 * 86400000, "days become an absolute expiry");
    ok(g.by === "me@x", "and who did it is recorded");
  }
  ok(G.cleanGrant({ tier: "t1", days: 99999 }).days === 3650, "an absurd duration is clamped");
}

console.log("\n=== 2c. A GRANT IS A FLOOR, NEVER A CEILING ===");
{
  // The whole risk of this feature in one block. Handing a t1 prize to
  // somebody already holding t3 must not demote them — it would be
  // silent, and it would hit the biggest holders first.
  const E = bare(read("lib/entitlements.js"));
  ok(/const best = \(a, b\) =>/.test(E), "the resolver takes the better of the two");
  ok(/gate\.tiers\.indexOf\(a\) >= gate\.tiers\.indexOf\(b\)/.test(E), "compared by position on the ladder");
  // Exactly two: the cached verdict and the fresh balance read. The
  // third path — tiers switched off — has no earned tier to compare
  // against, so it uses the grant directly and correctly.
  ok(/best\(earned, granted\)/.test(E), "on the cached path");
  ok(/best\(verdict\.tier \|\| null, granted\)/.test(E), "and on the fresh balance read");
  ok(/tier: granted,/.test(E), "with the tiers off it stands alone, having nothing to beat");
  // Checked ABOVE the enabled test: "give them access before we
  // launch" is the main reason to grant a tier at all.
  ok(E.indexOf("activeGrant(u)") < E.indexOf("if (!gate.enabled)"),
     "AND THE GRANT IS READ BEFORE THE GATE-OFF EARLY RETURN, or it would be useless before launch");
  // A granted tier never depended on the chain, so a dead RPC cannot
  // take it away.
  ok(/const tier = best\(verdict\.tier \|\| null, granted\)/.test(E), "a failed balance read cannot revoke a grant");

  const U = bare(read("lib/users.js"));
  // Revoking and granting both have to bite now. An account that has
  // already generated today would otherwise keep its old standing
  // until tomorrow — the day somebody is most likely to be watching.
  ok(/gateDate: "", gateAllowance: 0, gateTier: "", gateEnt: null/.test(U), "granting clears today's verdict");
  ok((U.match(/gateDate: "", gateAllowance: 0/g) || []).length === 2, "and so does revoking");
}

console.log("\n=== 2d. THE PAGE AGREES WITH THE SERVER ===");
{
  // The failure this prevents: an admin grants a tier BEFORE launch,
  // the server allows everything, and the browser locks the fields —
  // because it resolves tierId against the public table, which is
  // empty while the tiers are off.
  const H = bare(read("lib/useEntitlements.js"));
  ok(/auth\.user\?\.entitlements/.test(H), "the client prefers the server's cached answer");
  ok(/\.\.\.base,/.test(H), "merged over the shared table rather than replacing it");
  // ══ THE GAP THAT SHIPPED ══
  //
  // The assertions below said the client PREFERS the cached answer and
  // that the verdict WRITES one. Neither asked whether the granted
  // path writes one — and with the tiers off it did not. So a granted
  // account got a tier that half worked: /api/pricing computes
  // entitlements live and showed the 40% discount correctly, while
  // /create read the cache that was never written and locked every
  // field. Granted the top tier, shown the free one, with a working
  // discount on the next page as proof it had been applied.
  const E = bare(read("lib/entitlements.js"));
  const off = E.slice(E.indexOf("if (!gate.enabled)"), E.indexOf("const st = gateStateOf"));
  ok(off.length > 100, "the tiers-off branch was found");
  ok(/setGateVerdict\(accountId, ent/.test(off),
     "A GRANT RECORDS ITS VERDICT EVEN WITH THE TIERS OFF — which is the only situation a grant exists for");
  ok(/if \(granted\)/.test(off), "only when there is one, so an ordinary visit still writes nothing");
  ok(/stale/.test(off), "and only when it would change something, so this stays a read");

  const U = bare(read("lib/users.js"));
  ok(/gateEnt: \{/.test(U), "which the verdict writes");
  ok(/entitlements: gateToday && u\.gateEnt \? u\.gateEnt : null/.test(U), "and publicUser returns, expiring with the day");
  // The reason and who granted it are ours, not theirs.
  ok(/grant: activeGrant\(u\) \? \{ until/.test(U), "the browser learns when it ends and nothing else");
  ok(!/reason: g\.reason/.test(U), "not why, and not who");
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
  // ══ NOTHING IN THE BRIEF IS GATED ══
  //
  // This route used to strip the direction note, force a locked
  // account back to Default and empty the advanced settings. It meant
  // somebody who had PAID ranked below somebody holding $20 of a token
  // they could sell in one click — the person handing us cash could
  // not pick a style.
  ok(!/ent\.direction/.test(G), "the direction note is never stripped");
  ok(!/ent\.styles/.test(G), "a chosen style is never overridden");
  ok(!/ent\.advanced/.test(G), "and the advanced settings are never emptied");
  ok(!/locked:/.test(G), "so there is nothing to report as dropped");
  ok(/allowance: ent\.dailyRuns/.test(G), "the allowance is all a tier decides here");
  ok(!/gate\.dailyRuns/.test(G), "and never from a flat gate field again");
}
{
  const C = bare(read("app/create/page.jsx"));
  ok(/useEntitlements\(\)/.test(C), "the create page reads the same table");
  ok(/ent\.dailyRuns/.test(C), "for the free-run count, and nothing else");
  // Every lock is gone, including the ones that only ever existed in
  // the UI. A row offering to unlock a feature is the same insult in
  // softer clothes.
  // \b, because without it `ent\.direction` matches inside
  // `formRef.current.direction` and the assertion fails on the field
  // it is meant to be protecting.
  ok(!/\bent\.(styles|direction|advanced)\b/.test(C), "AND NOTHING IN THE FORM IS HIDDEN BY A TIER");
  ok(!/for every style/.test(C), "no row offers to unlock a feature");
  ok(!/setLocked/.test(C), "and nothing reports a field as dropped");
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
// ══ THE COST CONSTANT IS EVIDENCE, SO IT HAS TO BE TRUE ══
//
// It said 0.081, from $0.024 an image measured against an older model
// and then never revisited. Every allowance field in the panel shows a
// projected monthly spend derived from this, so a Founder rung at four
// runs a day reported $9.72 a month against a real figure nearer $37 —
// and the rungs were being chosen against it.
//
// A stale constant is worse than no constant: it looks like it was
// measured. $0.10 an image × 3 + $0.008 for the director.
ok(read("app/api/admin/token/route.js").includes("COST_PER_RUN = 0.308"),
   "0.308 a run — three images at ten cents, plus the director");
// One definition. The launch checklist had its own copy of 0.081 and
// would have gone on quoting it after this was corrected.
ok(/import \{ COST_PER_RUN \}/.test(read("app/api/admin/launch/route.js")),
   "and the launch checklist imports it rather than keeping a second copy");
// bare(): the comment explaining WHY the copy was removed names the
// old number, and a test that matched it would be grading the note
// rather than the code.
ok(!/0\.081/.test(bare(read("app/api/admin/launch/route.js"))), "with the old figure gone from the code");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
