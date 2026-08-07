const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const HO = read("lib/handoff.js");
const MINT = read("app/api/auth/handoff/route.js");
const CLAIM = read("app/api/auth/handoff/claim/route.js");
const PAGE = read("app/link/page.jsx");
const SET = read("app/settings/page.jsx");
const G = read("app/globals.css");

function grab(src, sig) {
  const i = src.indexOf(sig);
  let j = src.indexOf("(", i), p = 0;
  for (; j < src.length; j++) { if (src[j] === "(") p++; else if (src[j] === ")") { p--; if (!p) break; } }
  let d = 0, st = false;
  for (; j < src.length; j++) { if (src[j] === "{") { d++; st = true; } else if (src[j] === "}") { d--; if (st && !d) return src.slice(i, j + 1); } }
}

// ---- run the real claim against a fake Firestore ----
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    _store: store,
    collection: (c) => ({ doc: (d) => ({ _p: c + "/" + d }) }),
    runTransaction: async (fn) => {
      const w = [];
      const tx = {
        get: async (r) => ({ exists: store.has(r._p), data: () => ({ ...store.get(r._p) }) }),
        delete: (r) => w.push([r._p, "del"]),
        set: (r, p) => w.push([r._p, "set", p]),
      };
      const out = await fn(tx);
      for (const [p, mode, patch] of w) mode === "del" ? store.delete(p) : store.set(p, patch);
      return out;
    },
  };
}
const build = (db) => new Function("getAdminDb", "mem",
  grab(HO, "export async function claimHandoff").replace(/^export /, "") + "\nreturn claimHandoff;")(() => db, new Map());

(async () => {
  console.log("\n1. THE TOKEN IS SINGLE USE");
  {
    const db = fakeDb({ "handoffs/tok": { accountId: "acct1", expires: Date.now() + 60000, used: false } });
    const claim = build(db);
    ok((await claim("tok")) === "acct1", "a fresh token returns the account that minted it");
    ok(!db._store.has("handoffs/tok"), "and is destroyed on the way out");
    ok((await claim("tok")) === null, "so a second open gets nothing");
  }
  {
    const db = fakeDb({ "handoffs/old": { accountId: "acct1", expires: Date.now() - 1, used: false } });
    ok((await build(db)("old")) === null, "an expired token is refused");
    ok(!db._store.has("handoffs/old"), "and still destroyed, not left lying around");
  }
  ok((await build(fakeDb())("nope")) === null, "an invented token is refused");
  ok((await build(fakeDb())("")) === null, "so is an empty one");
  ok((await build(fakeDb())("x".repeat(200))) === null, "and an absurdly long one is rejected before any read");

  console.log("\n2. WHO CAN MINT, WHO CAN SPEND");
  ok(MINT.includes("const session = requireUser(req);"), "minting needs a session — it creates something that grants one");
  ok(!CLAIM.includes("requireUser"), "claiming does NOT, deliberately: the token IS the credential");
  ok(CLAIM.includes("res.cookies.set(SESSION_COOKIE"), "and it sets a real session cookie");
  ok(HO.includes("crypto.randomBytes(32)"), "32 random bytes");
  ok(HO.includes("const TTL_MS = 3 * 60 * 1000;"), "three minutes, because it is spent in seconds");
  ok(HO.includes("tx.delete(ref);"), "burned inside the transaction, so two opens cannot both win");
  ok(CLAIM.includes("That link has expired."), "expired, spent and invented all read the same");

  console.log("\n3. THE FLOW — NO LONGER REACHED FROM ANYWHERE");
  // Deeplinks replaced this: a phone browser asks the wallet APP for a
  // signature and gets it back on a redirect, so there is no second
  // browser and no session to carry into one. See dltest.cjs.
  //
  // The machinery below is still HERE, and still correct, because it
  // has not been proven unnecessary on a real device yet. These
  // assertions guard the one thing that matters in the meantime: that
  // nothing in the UI still walks anyone into it.
  ok(!/handoff/i.test(SET), "settings no longer mints a handoff token");
  ok(!/phantomBrowseUrl/.test(SET), "nor sends anyone into the wallet's own browser");
  ok(!read("components/ConnectButton.jsx").includes("BrowseUrl"), "and neither does the sign-in button");
  ok(PAGE.includes('fetch("/api/auth/handoff/claim"'), "the landing page still spends a token if one arrives");
  ok(PAGE.indexOf("handoff/claim") < PAGE.indexOf("auth.linkWallet()"), "BEFORE linking, or the wallet has nothing to attach to");
  ok(PAGE.includes('window.history.replaceState({}, "", "/link")'), "and strips it from the URL once spent");
  ok(PAGE.includes("await auth.refresh();"), "the session is re-read before the link attempt");
  ok(PAGE.includes("ran.current"), "runs once, so a re-render cannot double-spend");

  console.log("\n4. THE BUTTONS STOPPED FOLLOWING");
  ok(!/\.run-bar \{[\s\S]{0,120}position: sticky/.test(G), "Generate sits at the end of the brief");
  ok(!/\.set-save \{[\s\S]{0,120}position: sticky/.test(G), "and Save at the end of the form");
  // The invariant is the DIRECTION, not the count. A top-sticky nav or
  // sidebar is fine and there will be more of them; what must never
  // come back is something anchored to the bottom that rides up the
  // page over the thing you are using. Counting instead of testing
  // that failed the moment a legitimate sticky rail was added.
  {
    const rules = G.split("}");
    // The property itself, not any property ENDING in it. \bbottom:
    // matches border-bottom: and padding-bottom: too, because a hyphen
    // is a word boundary — which failed on a nav that has neither.
    const bottomSticky = rules.filter(
      (r) => /position:\s*sticky/.test(r) && /(^|[;{\n])\s*bottom:/.test(r)
    );
    ok(bottomSticky.length === 0, "nothing sticks from the bottom any more (" + bottomSticky.length + ")");
    const topSticky = rules.filter((r) => /position:\s*sticky/.test(r));
    ok(topSticky.length > 0, "top-sticky elements are untouched (" + topSticky.length + ")");
  }

  console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
