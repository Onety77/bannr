// ============================================================
// WHO GETS THE FREE RUN — everyone, buyers only, or nobody.
//
// A switch in /admin7731 for the stretch where the app is handed out to
// try and a free run for anyone who signs in would be the product given
// away. The rule runs here through the real functions; the places that
// must agree with it are checked for doing so.
// ============================================================
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const TIERS = read("lib/tiers.js");
const T = new Function(
  TIERS.replace(/^export /gm, "") +
  "\nreturn { cleanFree, freeRunsFor, freeOffered, entitlementsOf, FREE_WHO, DEFAULT_FREE };"
)();
const OFFER = read("lib/offer.js");
const O = new Function(
  OFFER.slice(OFFER.indexOf("export function tokenAmount")).replace(/^export /gm, "") +
  "\nreturn { freeLine, offerLine };"
)();

console.log("\n1. THE SETTING");
{
  ok(T.DEFAULT_FREE.who === "everyone", "the default is the trial as it has always been");
  ok(T.cleanFree({ dailyRuns: 1 }).who === "everyone", "a config saved before the switch existed means everyone");
  ok(T.cleanFree({ dailyRuns: 1, who: "buyers" }).who === "buyers", "buyers is kept");
  ok(T.cleanFree({ dailyRuns: 1, who: "nobody" }).who === "nobody", "nobody is kept");
  ok(T.cleanFree({ dailyRuns: 1, who: "admins" }).who === "everyone", "anything else is refused, not stored");
  ok(T.cleanFree({ who: "nobody", dailyRuns: 2 }).dailyRuns === 2, "the number survives being switched off, for switching back on");
}

console.log("\n2. WHAT ONE ACCOUNT GETS");
{
  const gate = (who, dailyRuns = 1) => ({ free: { dailyRuns, who } });
  const runs = (who, buyer) => T.entitlementsOf(gate(who), null, { buyer }).dailyRuns;
  ok(runs("everyone", false) === 1 && runs("everyone", true) === 1, "everyone: every account");
  ok(runs("buyers", false) === 0, "buyers: an account that never paid gets none");
  ok(runs("buyers", true) === 1, "buyers: one that did gets it");
  ok(runs("nobody", false) === 0 && runs("nobody", true) === 0, "nobody: not even a buyer");
  ok(T.entitlementsOf(gate("buyers"), null).dailyRuns === 0, "not saying whether they bought means they did not");

  // A tier's own runs are what holding buys. The switch moves the floor
  // underneath the ladder and nothing else.
  const t1 = { id: "t1", name: "Holder", dailyRuns: 2, discount: 10 };
  ok(T.entitlementsOf(gate("nobody"), t1).dailyRuns === 2, "a holder keeps their tier's runs with free off");
  const t0 = { id: "t1", name: "Holder", dailyRuns: 0, discount: 10 };
  ok(T.entitlementsOf(gate("everyone"), t0).dailyRuns === 1, "free is still the floor under a tier when it is on");
  ok(T.entitlementsOf(gate("nobody"), t0).dailyRuns === 0, "and is no floor at all when it is off");
  ok(T.entitlementsOf(gate("buyers"), t0, { buyer: true }).dailyRuns === 1, "a buyer on a zero-run rung keeps the buyer's run");
}

console.log("\n3. WHAT THE SITE PROMISES");
{
  const t = (who, extra = {}) => ({ free: { dailyRuns: 1, who }, ...extra });
  ok(O.freeLine(t("everyone")) === "One free banner a day.", "the homepage says it when it is true for anyone");
  ok(O.freeLine(t("buyers")) === null, "and not when only customers get it");
  ok(O.freeLine(t("nobody")) === null, "or when it is off");
  ok(O.freeLine({ free: { dailyRuns: 1 } }) === "One free banner a day.", "an old config still reads as everyone");

  // The offer is the delta against what a stranger already has.
  const live = (who) => t(who, { live: true, symbol: "BANNR", tiers: [{ id: "t1", minTokens: 1000, dailyRuns: 2, discount: 0 }] });
  ok(/for 1 more free banner a day/.test(O.offerLine(live("everyone"))), "with free on, holding adds one more");
  ok(/for 2 more free banners a day/.test(O.offerLine(live("nobody"))), "with free off, holding adds both");

  ok(T.freeOffered({ dailyRuns: 1, who: "buyers" }) === 1, "the credits ladder shows what buying gets you");
  ok(T.freeOffered({ dailyRuns: 1, who: "nobody" }) === 0, "and nothing when it is off");

  const PRICING = bare(read("app/api/pricing/route.js"));
  ok(/dailyRuns: freeOffered\(gate\.free\)/.test(PRICING) && /who: cleanFree\(gate\.free\)\.who/.test(PRICING), "pricing publishes the rung that way");
  const CREDITS = bare(read("app/credits/page.jsx"));
  ok(/pricing\?\.free\?\.dailyRuns > 0 \? pricing\.free : null/.test(CREDITS), "an empty free rung drops off the ladder");
  ok(/t\.who === "buyers" \? "With any pack" : "Signed in"/.test(CREDITS), "and a buyers-only one says how to get it");
  const MODAL = bare(read("components/TopUpModal.jsx"));
  ok(/\{ent\.dailyRuns > 0 && <p className="modal-lead">Your free run is back tomorrow\.<\/p>\}/.test(MODAL),
     "\"your free run is back tomorrow\" only to someone who has one");
}

console.log("\n4. SERVER AND PAGE REACH THE SAME ANSWER");
{
  const ENT = bare(read("lib/entitlements.js"));
  ok(/const buyer = Boolean\(u\?\.boughtAt\);/.test(ENT), "the server reads the purchase off the account");
  ok((ENT.match(/entitlementsOf\(gate, \w+, \{ buyer \}\)/g) || []).length === 3, "and passes it on every path that knows the account");
  const USERS = bare(read("lib/users.js"));
  ok(/bought: Boolean\(u\.boughtAt\),/.test(USERS), "the page is told yes or no, never the date");
  const USE = bare(read("lib/useEntitlements.js"));
  ok(/\{ buyer: Boolean\(auth\.user\?\.bought\) \}/.test(USE), "and passes the same thing to the same function");
}

console.log("\n5. A PURCHASE MAKES A BUYER, IN THE SAME WRITE");
{
  const CLAIM = bare(read("app/api/pay/claim/route.js"));
  const tx = CLAIM.slice(CLAIM.indexOf("await db.runTransaction(async (t) =>"), CLAIM.indexOf("} catch (e)", CLAIM.indexOf("await db.runTransaction(async (t) =>")));
  ok(/boughtAt: userSnap\.data\(\)\.boughtAt \|\| Date\.now\(\)/.test(tx), "a claimed payment marks the buyer inside its transaction");
  const HOOK = bare(read("app/api/webhooks/helius/route.js"));
  ok((HOOK.match(/boughtAt: \w+\.data\(\)\.boughtAt \|\| Date\.now\(\)/g) || []).length === 2, "so do both webhook credit paths");
  ok(!/boughtAt/.test(bare(read("app/api/admin/grant/route.js"))), "a gift of credits does not");

  // Accounts that paid before the mark existed are marked on the switch.
  const ADMIN = bare(read("app/api/admin/token/route.js"));
  ok(/if \(saved\.free\?\.who === "buyers"\) \{\s*await markPastBuyers\(db\)\.catch/.test(ADMIN), "choosing buyers marks everyone who already paid");
  ok(/if \(!u\.exists \|\| u\.data\(\)\.boughtAt\) continue;/.test(ADMIN), "without moving anyone's first purchase");
  ok(/\.where\("status", "==", "credited"\)/.test(ADMIN), "from payments that actually credited someone");
}

console.log("\n6. THE SWITCH");
{
  const PANEL = read("components/AdminToken.jsx");
  const ids = (PANEL.match(/\{ id: "(\w+)", label:/g) || []).map((s) => s.match(/"(\w+)"/)[1]);
  ok(JSON.stringify(ids) === JSON.stringify(T.FREE_WHO), "the panel offers exactly the three the rule knows");
  ok(/type="radio"/.test(PANEL) && /onChange=\{\(\) => setFree\("who", o\.id\)\}/.test(PANEL), "as one choice, saved with the rest of the panel");
  const LAUNCH = bare(read("app/api/admin/launch/route.js"));
  ok(/ok: gate\.dailyGlobalRuns > 0 \|\| \(gate\.free\?\.who === "nobody" && !gate\.enabled\)/.test(LAUNCH),
     "a missing ceiling is not a launch blocker while there is nothing free to cap");
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
