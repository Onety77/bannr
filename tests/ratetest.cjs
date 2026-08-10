// Rate limits that survive a deploy.
//
// There were three copies of the same eight lines, each with its own
// `new Map()` in the module. That map is per serverless INSTANCE, so
// the limit reset on every deploy, was not shared between instances,
// and began at zero on every cold start. The real ceiling was the
// written number multiplied by however many Vercel happened to be
// running — and it scaled up under exactly the load a limit exists to
// survive. On /api/generate, where a call costs about three cents of
// image generation, that gap is money.
//
// The window is RUN here against a fake Firestore, because the bug it
// replaces was never in the wording — it was in where the counter
// lived. A test that reads the source would have passed against the
// broken version too.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nHOLDING A LIMIT ACROSS INSTANCES\n");

// One store, handed to two separately loaded copies of the module —
// which is the whole point. Two instances, one tally.
function makeDb(store) {
  return {
    collection: () => ({
      doc: (id) => ({ id }),
    }),
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => ({
          exists: store.has(ref.id),
          data: () => store.get(ref.id),
        }),
        set: (ref, value) => store.set(ref.id, value),
      }),
  };
}

const SRC = read("lib/rateLimit.js")
  .replace(/^import "server-only";$/m, "")
  .replace(/^import \{ getAdminDb \} from "@\/lib\/firebaseAdmin";$/m, "")
  .replace(/^export /gm, "");

const load = (db) =>
  new Function("getAdminDb", SRC + "\nreturn { rateLimit, callerIp };")(() => db);

(async () => {
  const store = new Map();
  const A = load(makeDb(store));      // "instance A"
  const B = load(makeDb(store));      // "instance B", same Firestore
  const RATE = { limit: 3, windowMs: 60_000 };

  ok((await A.rateLimit("t", "acct", RATE)).ok, "first call allowed");
  ok((await A.rateLimit("t", "acct", RATE)).ok, "second allowed");
  ok((await A.rateLimit("t", "acct", RATE)).ok, "third allowed, which is the limit");
  const over = await A.rateLimit("t", "acct", RATE);
  ok(!over.ok, "fourth refused");
  ok(over.retryAfter > 0 && over.retryAfter <= 60, `and says when to come back (${over.retryAfter}s)`);

  // THE ONE THAT MATTERS. The old limiter would allow this, because
  // instance B had its own empty map.
  ok(!(await B.rateLimit("t", "acct", RATE)).ok, "a SECOND instance sees the same tally and refuses too");

  // A different account is a different tally.
  ok((await B.rateLimit("t", "other", RATE)).ok, "and another account is unaffected");
  // As is a different route.
  ok((await B.rateLimit("other-scope", "acct", RATE)).ok, "as is the same account on another route");

  /* ---------------- the window really slides ---------------- */
  {
    const s = new Map();
    const C = load(makeDb(s));
    const R2 = { limit: 2, windowMs: 1000 };
    await C.rateLimit("w", "k", R2);
    await C.rateLimit("w", "k", R2);
    ok(!(await C.rateLimit("w", "k", R2)).ok, "spent the allowance");
    await new Promise((r) => setTimeout(r, 1100));
    ok((await C.rateLimit("w", "k", R2)).ok, "and it comes back once the window passes");
  }

  /* ---------------- an outage must not close the site ---------------- */
  {
    const dead = load(null);
    ok((await dead.rateLimit("t", "acct", RATE)).ok, "with no database at all, calls are ALLOWED");
    const throws = load({
      collection: () => ({ doc: (id) => ({ id }) }),
      runTransaction: async () => { throw new Error("firestore down"); },
    });
    ok((await throws.rateLimit("t", "acct", RATE)).ok, "and a failing one fails open, not closed");
  }

  /* ---------------- keys cannot escape their document ---------------- */
  {
    const s = new Map();
    const D = load(makeDb(s));
    await D.rateLimit("t", "../../admin/secret", { limit: 5, windowMs: 60_000 });
    const key = [...s.keys()][0];
    ok(!key.includes("/"), `a key with slashes is sanitised (${key})`);
  }

  /* ---------------- wired into the routes ---------------- */
  for (const [file, scope] of [
    ["app/api/generate/route.js", "generate"],
    ["app/api/edit/route.js", "edit"],
    ["app/api/pfp/route.js", "pfp"],
  ]) {
    const s = bare(read(file));
    ok(!/const hits = new Map\(\)/.test(s), `${scope}: the per-instance map is gone`);
    ok(new RegExp(`rateLimit\\("${scope}", session\\.accountId, RATE\\)`).test(s), `${scope}: uses the shared limiter`);
    ok(/"Retry-After": String\(rl\.retryAfter\)/.test(s), `${scope}: the 429 says when to come back`);
  }
  // These two had no limit whatsoever, and neither needs a session.
  for (const [file, scope] of [
    ["app/api/lookup/route.js", "lookup"],
    ["app/api/convert/route.js", "convert"],
  ]) {
    const s = bare(read(file));
    ok(new RegExp(`rateLimit\\("${scope}", callerIp\\(req\\), RATE\\)`).test(s), `${scope}: limited by caller`);
  }

  console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
