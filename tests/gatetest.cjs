// Tests the SHIPPED functions, extracted from source and run against a
// fake Firestore that honours the read-before-write transaction shape.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const U = fs.readFileSync(R + "lib/users.js", "utf8").replace(/\r\n/g, "\n");
const G = fs.readFileSync(R + "lib/tokenGate.js", "utf8").replace(/\r\n/g, "\n");

let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

// --- pull a whole function out of a source file by brace matching ---
function grab(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error("not found: " + sig);
  // Skip the PARAMETER LIST first. `function f(a = {}) {` has braces
  // in its defaults, and counting from the first `{` in the file
  // closes the function immediately after `a = {}`.
  let j = i;
  if (/function/.test(sig)) {
    const open = src.indexOf("(", i);
    let p = 0;
    for (j = open; j < src.length; j++) {
      if (src[j] === "(") p++;
      else if (src[j] === ")") { p--; if (p === 0) break; }
    }
  }
  let d = 0, started = false;
  for (; j < src.length; j++) {
    if (src[j] === "{") { d++; started = true; }
    else if (src[j] === "}") { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error("unbalanced: " + sig);
}
const strip = (s) => s.replace(/^export\s+/, "");

// --- fake Firestore ---
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ref = (p) => ({ _p: p });
  return {
    _store: store,
    collection: (c) => ({ doc: (d) => ref(`${c}/${d}`) }),
    runTransaction: async (fn) => {
      const writes = [];
      let wroteYet = false;
      const tx = {
        get: async (r) => {
          if (wroteYet) throw new Error("READ AFTER WRITE — Firestore forbids this");
          return { exists: store.has(r._p), data: () => ({ ...store.get(r._p) }) };
        },
        update: (r, patch) => { wroteYet = true; writes.push([r._p, patch, "merge"]); },
        set: (r, patch, o) => { wroteYet = true; writes.push([r._p, patch, o?.merge ? "merge" : "set"]); },
      };
      const out = await fn(tx);
      for (const [p, patch, mode] of writes) {
        store.set(p, mode === "set" ? { ...patch } : { ...(store.get(p) || {}), ...patch });
      }
      return out;
    },
  };
}

const TODAY = "2026-08-04";
function build(db) {
  const src = [
    strip(grab(U, "export function gateStateOf")),
    strip(grab(U, "export async function consumeGeneration")),
    strip(grab(U, "export async function refundGeneration")),
    "return { gateStateOf, consumeGeneration, refundGeneration };",
  ].join("\n\n");
  return new Function("getAdminDb", "todayKey", "GENERATION_COST", "mem", "blank", "refundCredits", src)(
    () => db, () => TODAY, 3, new Map(), () => ({}), async () => "REFUNDED_CREDITS"
  );
}

const cleanGate = new Function("DEFAULT_GATE", "NUMERIC", "isAddress", strip(grab(G, "export function cleanGate")) + "\nreturn cleanGate;")(
  eval("(" + grab(G, "export const DEFAULT_GATE").replace(/^export const DEFAULT_GATE =/, "").replace(/;$/, "") + ")"),
  eval("(" + grab(G, "const NUMERIC =").replace(/^const NUMERIC =/, "").replace(/;$/, "") + ")"),
  (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || "").trim())
);
const publicGate = new Function(strip(grab(G, "export function publicGate")) + "\nreturn publicGate;")();

const MINT = "So11111111111111111111111111111111111111112";

(async () => {
console.log("\n=== 1. CONFIG CANNOT BE ARMED WITHOUT MEANING SOMETHING ===");
ok(cleanGate({ enabled: true }).enabled === false, "enabled with no mint -> off");
ok(cleanGate({ enabled: true, mint: MINT, minTokens: 0, dailyRuns: 20 }).enabled === false, "no threshold -> off");
ok(cleanGate({ enabled: true, mint: MINT, minTokens: 100, dailyRuns: 0 }).enabled === false, "no allowance -> off");
ok(cleanGate({ enabled: true, mint: MINT, minTokens: 100, dailyRuns: 20 }).enabled === true, "all three present -> on");
ok(cleanGate({ mint: "not-an-address" }).mint === "", "junk address rejected");
ok(cleanGate({ mint: MINT }).mint === MINT, "real address kept");
ok(cleanGate({ dailyRuns: 99999 }).dailyRuns === 500, "allowance clamped (got " + cleanGate({ dailyRuns: 99999 }).dailyRuns + ")");
ok(cleanGate({ dailyRuns: -5 }).dailyRuns === 0, "negative allowance clamped to 0");
ok(cleanGate({ recheckMinutes: 0 }).recheckMinutes >= 1, "recheck cannot be 0 (would hammer the RPC)");

console.log("\n=== 2. THE PUBLIC ENDPOINT LEAKS NOTHING ===");
const armed = cleanGate({ enabled: true, announced: false, mint: MINT, minTokens: 100, dailyRuns: 20, dailyGlobalRuns: 500, recheckMinutes: 7 });
const pub = publicGate(armed);
ok(pub.mint === "", "CA withheld until announced");
ok(!("dailyGlobalRuns" in pub), "daily ceiling never sent to the browser");
ok(!("recheckMinutes" in pub), "recheck window never sent to the browser");
ok(publicGate({ ...armed, announced: true }).mint === MINT, "CA published once announced");
ok(publicGate({ ...armed, enabled: false, announced: true }).dailyRuns === 0, "gate off -> promises nothing");

console.log("\n=== 3. WHEN TO RE-READ A BALANCE ===");
const { gateStateOf } = build(fakeDb());
const gate = { recheckMinutes: 10 };
ok(gateStateOf(null, gate).needsCheck === true, "no account -> check");
ok(gateStateOf({ gateDate: "2026-08-03", gateAllowance: 20 }, gate).needsCheck === true, "yesterday's grant -> check");
ok(gateStateOf({ gateDate: TODAY, gateAllowance: 20, gateUsed: 5 }, gate).needsCheck === false, "qualifying today -> no RPC");
ok(gateStateOf({ gateDate: TODAY, gateAllowance: 20, gateUsed: 20 }, gate).allowance === 20, "spent out, allowance still reported");
ok(gateStateOf({ gateDate: TODAY, gateAllowance: 0, gateCheckedAt: Date.now() }, gate).needsCheck === false, "non-holder just checked -> wait");
ok(gateStateOf({ gateDate: TODAY, gateAllowance: 0, gateCheckedAt: Date.now() - 11 * 60_000 }, gate).needsCheck === true, "non-holder after 11min -> re-check (bought at noon, works at noon)");

console.log("\n=== 4. WHO PAYS, AND IN WHAT ORDER ===");
{
  const db = fakeDb({ "users/a": { credits: 12, gateDate: TODAY, gateAllowance: 20, gateUsed: 0 } });
  const { consumeGeneration } = build(db);
  const r = await consumeGeneration("a", { allowance: 20 });
  ok(r.paidWith === "holder", "free run taken before credits");
  ok(db._store.get("users/a").credits === 12, "credits untouched (still 12)");
  ok(db._store.get("counters/gate-" + TODAY).runs === 1, "global counter incremented");
}
{
  const db = fakeDb({ "users/a": { credits: 12, gateDate: TODAY, gateAllowance: 20, gateUsed: 20 } });
  const { consumeGeneration } = build(db);
  const r = await consumeGeneration("a", { allowance: 20 });
  ok(r.paidWith === "credits" && r.credits === 9, "allowance spent -> credits charged");
  ok(!db._store.has("counters/gate-" + TODAY), "a paid run does NOT touch the free counter");
}
{
  const db = fakeDb({ "users/a": { credits: 0, gateDate: TODAY, gateAllowance: 20, gateUsed: 0 } });
  const { consumeGeneration } = build(db);
  ok((await consumeGeneration("a", { allowance: 20 })).ok === true, "0 credits + free runs = allowed (the client bug just fixed)");
}
{
  const db = fakeDb({ "users/a": { credits: 2 } });
  const { consumeGeneration } = build(db);
  ok((await consumeGeneration("a", { allowance: 0 })).ok === false, "no allowance, 2 credits -> refused");
}

console.log("\n=== 5. YESTERDAY'S ALLOWANCE IS NOT SPENDABLE TODAY ===");
{
  const db = fakeDb({ "users/a": { credits: 12, gateDate: "2026-08-03", gateAllowance: 20, gateUsed: 0 } });
  const { consumeGeneration } = build(db);
  const r = await consumeGeneration("a", { allowance: 0 });
  ok(r.paidWith === "credits", "stale grant ignored, charged credits");
  ok(db._store.get("users/a").gateUsed === 0 && db._store.get("users/a").gateDate === TODAY, "day rolled over");
}

console.log("\n=== 6. THE GLOBAL CEILING ===");
{
  const db = fakeDb({
    "users/a": { credits: 12, gateDate: TODAY, gateAllowance: 20, gateUsed: 0 },
    ["counters/gate-" + TODAY]: { runs: 500 },
  });
  const { consumeGeneration } = build(db);
  const r = await consumeGeneration("a", { allowance: 20, globalCap: 500 });
  ok(r.capped === true, "ceiling reported");
  ok(r.paidWith === "credits" && r.ok === true, "degrades to credits rather than blocking a paying user");
  ok(db._store.get("counters/gate-" + TODAY).runs === 500, "counter did not go past the ceiling");
}
{
  const db = fakeDb({
    "users/a": { credits: 0, gateDate: TODAY, gateAllowance: 20, gateUsed: 0 },
    ["counters/gate-" + TODAY]: { runs: 500 },
  });
  const { consumeGeneration } = build(db);
  const r = await consumeGeneration("a", { allowance: 20, globalCap: 500 });
  ok(r.ok === false && r.capped === true, "ceiling + no credits -> honest refusal, not a free run");
}
{
  const db = fakeDb({ "users/a": { credits: 0, gateDate: TODAY, gateAllowance: 20, gateUsed: 0 }, ["counters/gate-" + TODAY]: { runs: 9999 } });
  const { consumeGeneration } = build(db);
  ok((await consumeGeneration("a", { allowance: 20, globalCap: 0 })).paidWith === "holder", "globalCap 0 means unlimited, not zero");
}

console.log("\n=== 7. REFUNDS GO BACK TO THE SIDE THAT PAID ===");
{
  const db = fakeDb({ "users/a": { credits: 5, gateDate: TODAY, gateUsed: 3 }, ["counters/gate-" + TODAY]: { runs: 40 } });
  const { refundGeneration } = build(db);
  await refundGeneration("a", "holder");
  ok(db._store.get("users/a").gateUsed === 2, "free run returned to the bucket");
  ok(db._store.get("users/a").credits === 5, "credits NOT minted (the 1,404-credit bug)");
  ok(db._store.get("counters/gate-" + TODAY).runs === 39, "global counter released too");
}
{
  const db = fakeDb({ "users/a": { credits: 5 } });
  const { refundGeneration } = build(db);
  ok((await refundGeneration("a", "credits")) === "REFUNDED_CREDITS", "a credit run refunds credits");
}
{
  const db = fakeDb({ "users/a": { credits: 5, gateDate: "2026-08-03", gateUsed: 3 } });
  const { refundGeneration } = build(db);
  await refundGeneration("a", "holder");
  ok(db._store.get("users/a").gateUsed === 3, "a run from yesterday is not credited to today's bucket");
}

console.log("\n=== 8. ZERO DIFF WHEN THE GATE IS OFF ===");
{
  const db = fakeDb({ "users/a": { credits: 12 } });
  const { consumeGeneration } = build(db);
  const r = await consumeGeneration("a", { allowance: 0, globalCap: 0 });
  ok(r.paidWith === "credits" && r.credits === 9, "charges exactly 3 credits, as before");
  ok(!db._store.has("counters/gate-" + TODAY), "no counter document is even created");
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
})();
