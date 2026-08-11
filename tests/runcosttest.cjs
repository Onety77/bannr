// A run is priced by what it actually makes.
//
// Three credits bought two options, three or four — the same price for
// two thirds of the work. That is not a discount, it is a reason never
// to choose two, since the careful person paid exactly what the person
// taking everything paid.
//
// And a run paid from the free daily allowance stops at three options.
// Every free run is four images of real money against no revenue; at
// four a day the allowances were the largest single cost in the
// product.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nWHAT A RUN COSTS\n");

const P = new Function(
  read("lib/packs.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
    "\nreturn { runCost, FREE_RUN_MAX_OPTIONS };"
)();

/* ---------------- the price follows the count ---------------- */
ok(P.runCost(2) === 2, "two options cost two credits");
ok(P.runCost(3) === 3, "three cost three");
ok(P.runCost(4) === 3, "and four also cost three — the fourth rides along");
// Nobody can ask for one through the picker, but a hand-built request
// must not come out cheaper than the floor by accident.
ok(P.runCost(1) === 2, "anything smaller is still charged as two");
// A count that is missing or unreadable falls to the FULL price, not
// the cheap one. Never reachable through the picker, and if it ever
// were, erring toward undercharging is the wrong way to be wrong.
ok(P.runCost(0) === 2, "zero is charged as two");
ok(P.runCost(undefined) === 3 && P.runCost("x") === 3, "and an unreadable count is charged in full");

/* ---------------- and cannot drift from the constant ---------------- */
// runCost lives in lib/packs.js because the create page has to show it
// and lib/users.js is server-only. GENERATION_COST is still declared
// in users.js and is still what a full run costs, so the two are
// pinned together here rather than trusted to stay in step.
const users = bare(read("lib/users.js"));
const gen = Number((users.match(/export const GENERATION_COST = (\d+)/) || [])[1]);
ok(gen === 3, `GENERATION_COST is ${gen}`);
ok(P.runCost(4) === gen, "a full run still costs exactly GENERATION_COST");
ok(/export \{ runCost, FREE_RUN_MAX_OPTIONS \} from "@\/lib\/packs"/.test(users),
   "and users.js re-exports rather than keeping a second copy");

/* ---------------- the server charges what it quoted ---------------- */
const route = bare(read("app/api/generate/route.js"));
ok(/const cost = runCost\(variantCount\)/.test(route), "the route prices the run by its option count");
ok(/consumeGeneration\(session\.accountId, \{[\s\S]{0,120}cost,/.test(route), "and passes that to the charge");
ok(/charged = \{ accountId: session\.accountId, amount: cost/.test(route),
   "a refund gives back what was actually taken, not a constant");
// The charge itself must honour the amount rather than the old
// hardcoded three, or a two-option run would still cost three.
const usersFull = bare(read("lib/users.js"));
{
  const fn = usersFull.slice(usersFull.indexOf("export async function consumeGeneration"), usersFull.indexOf("\n}\n", usersFull.indexOf("export async function consumeGeneration")));
  ok(/cost = GENERATION_COST/.test(fn), "consumeGeneration takes a cost");
  ok(!/credits < GENERATION_COST/.test(fn) && !/credits - GENERATION_COST/.test(fn),
     "and spends that, not the constant");
}

/* ---------------- a free run stops at three ---------------- */
ok(P.FREE_RUN_MAX_OPTIONS === 3, "the free ceiling is three options");
ok(/paid\.paidWith === "holder"/.test(route), "applied only when the run came out of the allowance");
{
  // Decided AFTER charging on purpose: until consumeGeneration answers
  // we do not know which bucket paid, and only the free one is capped.
  const charge = route.indexOf("const paid = await consumeGeneration");
  const clamp = route.indexOf('paid.paidWith === "holder"');
  ok(charge > 0 && clamp > charge, "and decided after we know how the run was paid for");
}
// "Every style you picked appears at least once" is a promise the
// picker makes on screen. Saving one image is not a reason to break it.
ok(/Math\.max\(FREE_RUN_MAX_OPTIONS, styleIds\.length\)/.test(route),
   "but never below the number of styles chosen");

/* ---------------- and the price is on screen ---------------- */
// A price discovered afterwards on the balance is not a price anyone
// could choose against.
const create = bare(read("app/create/page.jsx"));
ok(/runCost\(variants\)\} credits for \{variants\} options/.test(create),
   "the create page shows the cost on the control that sets it");
ok(/import \{ runCost \} from "@\/lib\/packs"/.test(create), "from the same function the server charges with");
const credits = bare(read("app/credits/page.jsx"));
ok(!/up to 4 banner options/.test(credits), "the credits page no longer promises one price for any count");
ok(/2 banner options = 2 credits/.test(credits), "and states both");

/* ---------------- the PFP maker already did this ---------------- */
// One credit each, two maximum — which is what was wanted and what it
// already charged. Asserted so it stays that way.
const pfp = bare(read("lib/pfpStyles.js"));
ok(/export const PFP_COST = 1/.test(pfp), "a profile picture costs one credit");
ok(/export const PFP_MAX = 2/.test(pfp), "two at most");
ok(/const total = count \* PFP_COST/.test(bare(read("app/api/pfp/route.js"))), "and two of them cost two");

console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
process.exit(bad ? 1 : 0);
