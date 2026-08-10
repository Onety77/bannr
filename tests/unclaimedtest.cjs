// Money that arrived and reached nobody.
//
// A payment that cannot be attributed is written to
// payments/{signature} with no accountId and then mentioned NOWHERE —
// not in a billing history, not in admin — so the first anyone hears
// of it is a customer saying they paid. Crediting by hand was always
// a thirty-second job; knowing there was anyone to credit was the
// part that could not be improvised.
//
// The filter is RUN against fake documents, because the whole question
// is which rows it picks, and a regex over the source cannot answer
// that.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nPAYMENTS THAT REACHED NOBODY\n");

const ROUTE = read("app/api/admin/unclaimed/route.js");

// The handler, with Firestore and the admin check replaced.
function build(docs) {
  const src = ROUTE
    .replace(/^import[^\n]*$/gm, "")
    .replace(/^export const [^\n]*$/gm, "")
    .replace(/^export /gm, "");
  const db = {
    collection: () => ({
      orderBy: () => ({
        limit: () => ({
          get: async () => ({ docs: docs.map((d) => ({ id: d.id, data: () => d })) }),
        }),
      }),
    }),
  };
  return new Function(
    "NextResponse", "requireAdmin", "getAdminDb",
    src + "\nreturn GET;"
  )(
    { json: (body, init) => ({ body, status: init?.status || 200 }) },
    async () => ({ email: "admin@bannr" }),
    () => db
  );
}

(async () => {
  const GET = build([
    { id: "sigA", accountId: "acct_1", amountSol: 0.12, creditsGranted: 15, status: "credited", ts: 5 },
    { id: "sigB", amountSol: 0.0712, creditsQuoted: 15, wallet: "Wal1", status: "unclaimed", ts: 4 },
    { id: "sigC", amountSol: 0.5, status: "unpriced", ts: 3 },
    { id: "sigD", accountId: "acct_2", amountSol: 0.9, status: "credited", ts: 2 },
  ]);
  const res = await GET({});

  ok(res.body.count === 2, `only the unattributed ones are counted (${res.body.count})`);
  const ids = res.body.rows.map((r) => r.signature);
  ok(ids.includes("sigB") && ids.includes("sigC"), "both kinds are listed");
  ok(!ids.includes("sigA") && !ids.includes("sigD"), "and a credited payment is not");

  // ══ ABSENCE OF AN ACCOUNT, NOT A STATUS STRING ══
  //
  // "unclaimed" and "unpriced" are what the webhook writes today. A
  // third could be added tomorrow and nobody would remember to update
  // a list here. What actually means nobody was credited is that no
  // account is on the record.
  const odd = build([{ id: "sigE", amountSol: 1, status: "something-new", ts: 1 }]);
  ok((await odd({})).body.count === 1, "an unfamiliar status still counts, because it has no account");
  ok(!/status === "unclaimed"/.test(bare(ROUTE)), "and the route does not match on the status string");

  // It sits beside the real money tools. Failing must not take the tab
  // down with it.
  const broken = new Function(
    "NextResponse", "requireAdmin", "getAdminDb",
    ROUTE.replace(/^import[^\n]*$/gm, "").replace(/^export const [^\n]*$/gm, "").replace(/^export /gm, "") +
      "\nreturn GET;"
  )(
    { json: (body) => ({ body, status: 200 }) },
    async () => ({ email: "a" }),
    () => ({ collection: () => { throw new Error("firestore down"); } })
  );
  ok((await broken({})).body.count === 0, "a read that fails reports nothing rather than throwing");

  const noAdmin = new Function(
    "NextResponse", "requireAdmin", "getAdminDb",
    ROUTE.replace(/^import[^\n]*$/gm, "").replace(/^export const [^\n]*$/gm, "").replace(/^export /gm, "") +
      "\nreturn GET;"
  )(
    { json: (body, init) => ({ body, status: init?.status || 200 }) },
    async () => null,
    () => null
  );
  ok((await noAdmin({})).status === 401, "and it is admin-only, like every other admin route");

  /* ---------------- silent when there is nothing ---------------- */
  const UI = bare(read("components/AdminUnclaimed.jsx"));
  // A row reading "0 unclaimed payments" is a thing to read and dismiss
  // every single time this tab is opened, and a warning that is always
  // there stops being read.
  ok(/if \(!data\?\.count\) return null/.test(UI), "the panel renders nothing at zero");
  ok(/payment\{data\.count === 1 \? "" : "s"\} not credited/.test(UI), "and states the count plainly when there is one");

  const ADMIN = bare(read("app/admin7731/page.jsx"));
  ok(/<AdminUnclaimed user=\{user\} \/>/.test(ADMIN), "it is on the money tab");
  {
    // Above Give credits, because it is the reason to use it.
    const a = ADMIN.indexOf("<AdminUnclaimed");
    const b = ADMIN.indexOf("<AdminGrant");
    ok(a > 0 && b > a, "above the form that fixes it");
  }
  // No fix-it button on purpose: the remaining failure modes are narrow
  // enough that a screen for them would be built on guesses.
  ok(!/fetch\("\/api\/admin\/grant"/.test(UI), "and it does not try to credit anyone itself");

  console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
