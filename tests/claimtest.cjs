const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const U = read("lib/users.js");
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
  const ref = (c, d) => ({ _p: c + "/" + d });
  return {
    _store: store,
    collection: (c) => ({
      doc: (d) => {
        const r = ref(c, d);
        r.get = async () => ({ exists: store.has(r._p), data: () => ({ ...store.get(r._p) }) });
        return r;
      },
    }),
    runTransaction: async (fn) => {
      const w = []; let wrote = false;
      const tx = {
        get: async (r) => {
          if (wrote) throw new Error("READ AFTER WRITE");
          return { exists: store.has(r._p), data: () => ({ ...store.get(r._p) }) };
        },
        update: (r, p) => { wrote = true; w.push([r._p, p]); },
      };
      const out = await fn(tx);
      for (const [p, patch] of w) store.set(p, { ...(store.get(p) || {}), ...patch });
      return out;
    },
  };
}

const build = (db, theirs) => new Function("getAdminDb", "identityKey", "identitiesFor",
  grab(U, "export async function claimWalletIdentity").replace(/^export /, "") + "\nreturn claimWalletIdentity;")(
  () => db,
  (t, id) => `${t}:${id}`,
  async () => theirs
);

const W = "Brp8aci8";
const KEY = `wallet:${W}`;

(async () => {
  console.log("\n1. THE ORPHAN CASE — the one that actually happens");
  {
    const db = fakeDb({
      [`identities/${KEY}`]: { accountId: "walletAcct" },
      "users/walletAcct": { credits: 175, wallets: [W] },
      "users/googleAcct": { credits: 63, wallets: [] },
    });
    const claim = build(db, [{ type: "wallet", key: KEY }]);
    const r = await claim(W, "googleAcct");
    ok(r.ok === true, "a wallet-only account gives the wallet up");
    ok(r.moved === 175, "and its credits come across (" + r.moved + ")");
    ok(db._store.get(`identities/${KEY}`).accountId === "googleAcct", "the identity now points at the Google account");
    ok(db._store.get("users/googleAcct").credits === 238, "which now holds 63 + 175 = " + db._store.get("users/googleAcct").credits);
    ok(db._store.get("users/walletAcct").credits === 0, "the old one is emptied");
    ok(db._store.get("users/walletAcct").mergedInto === "googleAcct", "and tombstoned rather than deleted");
    ok(db._store.get("users/googleAcct").wallets.includes(W), "the address is registered for payments too");
  }

  console.log("\n2. SOMEBODY ELSE'S ACCOUNT IS STILL SAFE");
  {
    const db = fakeDb({
      [`identities/${KEY}`]: { accountId: "theirs" },
      "users/theirs": { credits: 500 },
      "users/mine": { credits: 0 },
    });
    // That account has its own Google login — it is a real account.
    const claim = build(db, [{ type: "wallet", key: KEY }, { type: "google", key: "google:xyz" }]);
    const r = await claim(W, "mine");
    ok(r.ok === false && r.reason === "owned", "refused when the holder has another way in");
    ok(db._store.get(`identities/${KEY}`).accountId === "theirs", "the identity does not move");
    ok(db._store.get("users/theirs").credits === 500, "and nothing is taken");
  }

  console.log("\n3. THE EASY CASES");
  {
    const db = fakeDb({ [`identities/${KEY}`]: { accountId: "me" }, "users/me": { credits: 5 } });
    const r = await build(db, [{ type: "wallet", key: KEY }])(W, "me");
    ok(r.ok === true && r.already === true, "already mine is a no-op, not an error");
    ok(db._store.get("users/me").credits === 5, "and nothing is double-counted");
  }
  {
    const r = await build(fakeDb({}), [])(W, "me");
    ok(r.ok === false && r.reason === "unlinked", "an unlinked wallet says so, so the caller can link it normally");
  }

  console.log("\n4. THE ROUTE AND THE UI");
  const ROUTE = read("app/api/auth/identities/route.js");
  ok(ROUTE.includes("claimWalletIdentity(wallet, session.accountId)"), "the route tries to claim before refusing");
  ok(ROUTE.includes("has its own email"), "and explains the one case it still refuses");
  ok(ROUTE.includes("merged: claim.moved || 0"), "telling the client what moved");

  const AUTH = read("lib/useAuth.js");
  ok(AUTH.includes("return { ok: false, error: why };"), "linkWallet returns the reason");
  ok(AUTH.includes("return { ok: true, merged: out.merged || 0 };"), "and success is the same shape");
  // Read the function itself. A character window overshot into
  // unlinkIdentity, which returns false legitimately, and failed on
  // correct code.
  {
    const a = AUTH.indexOf("const linkWallet = useCallback");
    const b = AUTH.indexOf("}, [wallet]);", a);
    const body = AUTH.slice(a, b);
    const returns = body.match(/return [^;]+;/g) || [];
    ok(returns.length > 0, "linkWallet returns something");
    ok(returns.every((r) => r.includes("{ ok:")), "every one of its " + returns.length + " returns is a result object, never a bare boolean");
  }

  const PAGE = read("app/link/page.jsx");
  ok(PAGE.includes("const res = await auth.linkWallet();"), "the link page reads the returned reason");
  ok(!PAGE.includes("auth.error ||"), "not the stale state it used to read");
  ok(PAGE.includes("setMerged(res.merged || 0)"), "and says when credits came across");

  const SET = read("app/settings/page.jsx");
  ok(!/if \(await auth\.linkWallet\(\)\) loadIdentities/.test(SET), "settings no longer treats the object as a boolean");
  ok(SET.includes("(await auth.linkWallet())?.ok"), "it checks ok");

  console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
