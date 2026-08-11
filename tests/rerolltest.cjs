const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const U = fs.readFileSync(R + "lib/users.js", "utf8").replace(/\r\n/g, "\n");
const S = fs.readFileSync(R + "app/api/generate/route.js", "utf8").replace(/\r\n/g, "\n");
const C = fs.readFileSync(R + "app/create/page.jsx", "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

function grab(src, sig) {
  const i = src.indexOf(sig);
  let j = src.indexOf("(", i), p = 0;
  for (; j < src.length; j++) { if (src[j] === "(") p++; else if (src[j] === ")") { p--; if (!p) break; } }
  let d = 0, st = false;
  for (; j < src.length; j++) { if (src[j] === "{") { d++; st = true; } else if (src[j] === "}") { d--; if (st && !d) return src.slice(i, j + 1); } }
}
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    _store: store,
    collection: (c) => ({ doc: (d) => ({ _p: c + "/" + d }) }),
    runTransaction: async (fn) => {
      const w = [];
      const tx = {
        get: async (r) => ({ exists: store.has(r._p), data: () => ({ ...store.get(r._p) }) }),
        update: (r, p) => w.push([r._p, p, "merge"]),
        set: (r, p, o) => w.push([r._p, p, o?.merge ? "merge" : "set"]),
      };
      const out = await fn(tx);
      for (const [p, patch, mode] of w) store.set(p, mode === "set" ? { ...patch } : { ...(store.get(p) || {}), ...patch });
      return out;
    },
  };
}
const TODAY = "2026-08-04";
function build(db, refundSpy) {
  const src = grab(U, "export async function refundGeneration").replace(/^export /, "") + "\nreturn refundGeneration;";
  return new Function("getAdminDb", "todayKey", "GENERATION_COST", "mem", "refundCredits", src)(
    () => db, () => TODAY, 3, new Map(), refundSpy
  );
}

console.log("\n1. THE REFUND BUG A REROLL WOULD HAVE CREATED");
{
  let got = null;
  const f = build(fakeDb({ "users/a": { credits: 5 } }), async (_id, amt) => { got = amt; return amt; });
  await0(f);
  async function await0(fn) {}
}
(async () => {
  {
    let got = null;
    const f = build(fakeDb({ "users/a": { credits: 5 } }), async (_id, amt) => { got = amt; return amt; });
    await f("a", "credits", 1);
    ok(got === 1, "a 1-credit reroll refunds 1, not the run price (got " + got + ")");
  }
  {
    let got = null;
    const f = build(fakeDb({ "users/a": { credits: 5 } }), async (_id, amt) => { got = amt; return amt; });
    await f("a", "credits");
    ok(got === 3, "a run with no amount still refunds the full 3 (got " + got + ")");
  }
  {
    let called = false;
    const db = fakeDb({ "users/a": { credits: 5, gateDate: TODAY, gateUsed: 2 }, ["counters/gate-" + TODAY]: { runs: 9 } });
    const f = build(db, async () => { called = true; });
    await f("a", "holder", 1);
    ok(called === false, "a holder run never touches credits whatever the amount");
    ok(db._store.get("users/a").gateUsed === 1, "it returns the free run instead");
  }

  console.log("\n2. THE ROUTE — A REROLL IS NOT A RUN");
  // `let` since a free run is clamped after we learn how it was paid
  // for — see FREE_RUN_MAX_OPTIONS. A reroll is still pinned to 1 here
  // and never reaches that branch, because a reroll is not a run.
  ok(S.includes("let variantCount = isReroll ? 1 : Math.min("), "reroll bypasses the two-option floor");
  ok(S.indexOf('const isReroll = String(form.get("reroll")') < S.indexOf("let variantCount ="), "the flag is read BEFORE the clamp that would have doubled it");
  ok((S.match(/const isReroll =/g) || []).length === 1, "declared exactly once");
  ok(S.includes("if (isReroll && styleIds.length !== 1)"), "a reroll must name exactly one style");
  ok(S.includes("if (!demoMode && isReroll) {"), "reroll takes its own charging path");
  ok(S.includes("spendCredits(session.accountId, REROLL_COST)"), "charged 1 credit from credits");
  // Read the BRANCH, with comments stripped. The first version of this
  // matched the word consumeGeneration inside the comment that explains
  // we bypass it, and failed on correct code.
  {
    const a = S.indexOf("if (!demoMode && isReroll) {");
    const b = S.indexOf("} else if (!demoMode) {", a);
    const body = S.slice(a, b).replace(/\/\/[^\n]*/g, "");
    ok(a > 0 && b > a, "the reroll branch is its own branch");
    ok(body.includes("spendCredits("), "it charges credits directly");
    ok(!body.includes("consumeGeneration"), "the free holder bucket cannot fund a reroll");
    ok(!body.includes("getGate"), "and it does not even read the gate");
  }
  ok(S.includes("refundGeneration(charged.accountId, charged.paidWith, charged.amount)"), "refunds exactly what was charged");
  ok(S.includes("&& !isReroll) {"), "the partial-run refund is skipped for a reroll");
  ok(S.includes("ALREADY MADE FOR THIS PROJECT"), "the director is told what not to repeat");
  ok(S.includes("avoidConcept") && S.includes('String(form.get("avoidConcept")'), "and it comes from the request");

  console.log("\n3. THE CLIENT");
  ok(C.includes("async function reroll(i)"), "reroll exists");
  ok(C.includes('fd.set("reroll", "1")') && C.includes('fd.set("variants", "1")'), "asks for one image, flagged");
  ok(C.includes('fd.set("styles", v.templateId)'), "same style as the option being replaced");
  ok(C.includes('fd.set("avoidConcept", v.concept)'), "sends the concept being rejected");
  ok(C.includes("past: pushPast(old, {"), "the replaced option goes on the undo stack");
  ok(C.includes("concept: old.concept, edits: old.edits || 0,"), "the frame carries its concept and edit count");
  ok(C.includes("frame.edits != null"), "undo prefers the frame's own count");
  ok(C.includes("frame.concept !== undefined"), "restoring brings the matching concept back");
  ok(C.includes("delete n[i]"), "the stale X conversion is dropped");
  ok(C.includes("auth.user.credits < REROLL_COST"), "priced client-side before the request");
  ok(C.includes("disabled={rerollBusy !== null || busy}"), "one at a time, never during a run");

  console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
