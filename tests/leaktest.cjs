// ============================================================
// CAN SOMEBODY GIVE THEMSELVES CREDITS?
//
// Every way a balance can go up, attacked the way a developer with a
// terminal would: the request body rewritten, a free run farmed, a
// refund gamed, a webhook forged, a wallet passed around. Each block
// names the hole it closes. Where the shipped function can be run
// against a fake database, it is.
//
// THE TRIPWIRE at the end is the part that keeps this true. It lists
// every file that writes a credit balance and how many times. Adding a
// new one fails this file until somebody has looked at it — a new way
// to mint credits should never arrive unreviewed.
// ============================================================
const fs = require("fs");
const path = require("path");
const R = path.join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

function grab(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let j = src.indexOf("(", i), p = 0;
  for (; j < src.length; j++) { if (src[j] === "(") p++; else if (src[j] === ")") { p--; if (!p) break; } }
  let d = 0, st = false;
  for (; j < src.length; j++) { if (src[j] === "{") { d++; st = true; } else if (src[j] === "}") { d--; if (st && !d) return src.slice(i, j + 1); } }
  return null;
}
const fn = (src, sig) => grab(src, sig).replace(/^export\s+/, "");

// One user document and a transaction that applies writes at the end.
function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  const ref = (p) => ({ _p: p, update: async (patch) => store.set(p, { ...store.get(p), ...patch }) });
  return {
    store,
    collection: (c) => ({ doc: (d) => ref(c + "/" + d) }),
    runTransaction: async (f) => {
      const w = [];
      const out = await f({
        get: async (r) => ({ exists: store.has(r._p), data: () => ({ ...store.get(r._p) }) }),
        update: (r, patch) => w.push([r._p, patch]),
      });
      for (const [p, patch] of w) store.set(p, { ...store.get(p), ...patch });
      return out;
    },
  };
}

const USERS = read("lib/users.js");
const GEN = bare(read("app/api/generate/route.js"));
const EDIT = bare(read("app/api/edit/route.js"));
const HOOK = bare(read("app/api/webhooks/helius/route.js"));
const CLAIM = bare(read("app/api/pay/claim/route.js"));
const IDS = bare(read("app/api/auth/identities/route.js"));
const PACKS = read("lib/packs.js");
const CREATE = bare(read("app/create/page.jsx"));

(async () => {
  console.log("\n1. MORE OPTIONS THAN WERE PAID FOR");
  {
    // runCost is 3 for anything over two, and a run made one option per
    // chosen style with no cap on styles: eight styles, eight images, 3
    // credits — and eight free images on a free run.
    const P = new Function(PACKS.replace(/^import.*$/gm, "").replace(/^export /gm, "") + "\nreturn { MAX_OPTIONS, runCost };")();
    ok(P.MAX_OPTIONS === 4, "a run makes at most four options");
    ok(/if \(styleIds\.length > MAX_OPTIONS\) \{\s*return NextResponse\.json\(\{ error: `Pick up to \$\{MAX_OPTIONS\} styles\.` \}, \{ status: 400 \}\)/.test(GEN),
       "a request naming five styles is refused, not served");
    ok(/Math\.max\(parseInt\(form\.get\("variants"\) \|\| "4", 10\) \|\| 4, 2, styleIds\.length\),\s*MAX_OPTIONS\s*\)/.test(GEN),
       "and the option count is clamped to the cap whatever `variants` says");
    ok(/prev\.length >= MAX_OPTIONS \? prev : \[\.\.\.prev, id\]/.test(CREATE), "the picker stops at four too");
  }

  console.log("\n2. A REFUND BIGGER THAN THE LOSS");
  {
    const f = new Function("GENERATION_COST", fn(USERS, "export function partialRefundCredits") + "\nreturn partialRefundCredits;")(3);
    let never = true, floor = true;
    for (const paid of [2, 3]) for (let a = 2; a <= 4; a++) for (let m = 0; m <= a; m++) {
      const back = f(m, a, paid);
      if (back > paid) never = false;
      if (m < a && back > paid - 1) floor = false;
    }
    ok(never, "a refund never exceeds what the run cost");
    ok(floor, "and a run that delivered anything always costs at least one credit");
    ok(f(1, 2, 2) === 1, "the case that leaked: two options for 2 credits, one lost, is 1 back — not 2");
    ok(/partialRefundCredits\(missing, attempted, charged\.amount\)/.test(GEN), "graded against what this run actually cost");
  }

  console.log("\n3. CREDITS FROM POSTING A RUN THAT COST NOTHING");
  {
    // The feed pays one credit back. On a free run, a reroll or a run
    // refunded down to one credit, that is a run that paid for itself
    // — and a free run on a throwaway wallet, posted, then linked into
    // a main account, was a credit printed from nothing.
    ok(/const netPaid = charged && charged\.paidWith === "credits" \? charged\.amount - refunded : 0;/.test(GEN), "only credits actually spent count");
    ok(/const rewardable = !isReroll && netPaid > POST_REWARD_CREDITS;/.test(GEN), "no reroll, and more spent than the reward returns");
    ok(/runToken: rewardable \? issueRunToken\(session\.accountId\) : ""/.test(GEN), "otherwise no token, so posting pays nothing");
    {
      const at = GEN.indexOf("const netPaid");
      const reset = GEN.indexOf("\n    charged = null;", at);
      ok(at > 0 && reset > GEN.indexOf("const rewardable") && !GEN.slice(GEN.indexOf("let charged = null;") + 20, at).includes("charged = null;"),
         "decided before the charge is forgotten");
    }
    // Only the shipped HMAC can make a token; there is no other door.
    const FEED = bare(read("lib/feed.js"));
    ok(/const runId = readRunToken\(accountId, body\.runToken\);/.test(FEED), "the feed only pays on a token it signed");
  }

  console.log("\n4. FREE EDITS AS A WAY ROUND THE FREE-RUN SWITCH");
  {
    // An edit accepts ANY image, so free edits were free renders — and
    // stayed free with free runs switched off.
    const consumeEdit = new Function("getAdminDb", "todayKey", "FREE_EDITS_PER_DAY", "EDIT_COST", "mem", "blank",
      fn(USERS, "export async function consumeEdit") + "\nreturn consumeEdit;");
    const run = async (free) => {
      const db = fakeDb({ "users/a": { credits: 5 } });
      const c = consumeEdit(() => db, () => "2026-09-27", 3, 1, new Map(), () => ({}));
      const r = await c("a", { free });
      return { r, credits: db.store.get("users/a").credits };
    };
    const off = await run(false);
    ok(off.r.paidWith === "credits" && off.credits === 4, "with no free runs, an edit costs a credit");
    const on = await run(true);
    ok(on.r.paidWith === "free" && on.credits === 5, "with them, the first edit is free");
    ok(/consumeEdit\(session\.accountId, \{ free: ent\.dailyRuns > 0 \}\)/.test(EDIT), "the route asks the same question the free run does");
  }

  console.log("\n5. ONE BAG OF TOKENS, MANY ACCOUNTS");
  {
    // A tier is not re-read for the rest of the day once earned, so a
    // wallet walked from account to account left a tier on each.
    ok(/if \(body\?\.type === "wallet"\) await forgetTier\(session\.accountId\)/.test(IDS), "unlinking a wallet drops the tier it earned");
    const forgetTier = new Function("getAdminDb", "mem", fn(USERS, "export async function forgetTier") + "\nreturn forgetTier;");
    const db = fakeDb({ "users/a": { gateTier: "t3", gateCheckedAt: 99, gateDate: "2026-09-27", gateUsed: 2 } });
    await forgetTier(() => db, new Map())("a");
    const u = db.store.get("users/a");
    ok(u.gateTier === "" && u.gateCheckedAt === 0, "so the next request re-reads what is still linked");
    ok(u.gateDate === "2026-09-27" && u.gateUsed === 2, "without handing back a free run already spent today");
  }

  console.log("\n6. A FORGED PAYMENT");
  {
    // The webhook took the amount and the sender from its own POST
    // body. Anyone holding the shared secret could post a payment that
    // never happened.
    ok(/const chainTx = await getTransaction\(sig\);/.test(HOOK), "the webhook reads the transaction off the chain");
    ok(/const gained = treasuryGain\(chainTx, treasury\);/.test(HOOK), "and takes the amount from the balance change");
    ok(/fromUserAccount: senderOf\(chainTx\)/.test(HOOK), "and the sender from the signer");
    ok(!/ev\.nativeTransfers|ev\.timestamp/.test(HOOK), "nothing in the body is believed except the signature");
    ok(/crypto\.timingSafeEqual/.test(HOOK), "and the secret is compared in constant time");
    ok(/tx = await getTransaction\(signature\);/.test(CLAIM), "the claim route reads the same way, through the same code");
    // A signature can only ever be credited once, to one account.
    ok(/if \(cur\?\.accountId\) \{ outcome = "already"; return; \}/.test(CLAIM), "a claimed payment is never credited twice");
    ok(/if \(prior\?\.accountId && prior\.accountId !== session\.accountId\)/.test(CLAIM), "or to a second account");
    ok(/if \(memo && memo\.trim\(\) !== session\.accountId\)/.test(CLAIM), "and a payment stamped for someone else is refused");
  }

  console.log("\n7. THE BROWSER CANNOT WRITE A BALANCE");
  {
    const rules = read("firestore.rules");
    ok(/match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/.test(rules), "the database rules deny every client read and write");
    const storage = read("storage.rules");
    ok(/allow read, write: if false;/.test(storage), "so do the storage rules");
    // The client bundle may sign in with Firebase and nothing else.
    const walk = (d) => fs.readdirSync(R + d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(d + "/" + e.name) : /\.(jsx?|mjs)$/.test(e.name) ? [d + "/" + e.name] : []));
    const clientDb = [...walk("app"), ...walk("components"), ...walk("lib")]
      .filter((f) => /^\s*["']use client["']/m.test(read(f)))
      .filter((f) => /firebase\/(firestore|storage|database)/.test(read(f)));
    ok(clientDb.length === 0, "no browser code imports Firestore or Storage" + (clientDb.length ? ": " + clientDb.join(", ") : ""));
    // The session names the account, and only the server can sign one.
    const AUTH = bare(read("lib/auth.js"));
    ok(/crypto\.timingSafeEqual\(Buffer\.from\(mac\), Buffer\.from\(expected\)\)/.test(AUTH), "a session cookie cannot be forged");
    const ADMIN = bare(read("lib/adminAuth.js"));
    ok(/decoded\.email_verified && decoded\.email === ADMIN_EMAIL/.test(ADMIN), "admin needs a verified Google token for the admin email");
    const admins = walk("app/api/admin").filter((f) => f.endsWith("route.js"));
    const open = admins.filter((f) => !/requireAdmin\(req\)/.test(read(f)));
    ok(admins.length > 0 && open.length === 0, `all ${admins.length} admin routes check it` + (open.length ? ": " + open.join(", ") : ""));
  }

  console.log("\n8. THE TRIPWIRE — EVERY PLACE A BALANCE IS WRITTEN");
  {
    // A read-modify-write of `credits`, or a call to a function that
    // adds to one. Reviewed by hand, file by file, when this was
    // written. A new entry here is a new way to change somebody's
    // balance: look at it, then update this list.
    const EXPECTED = {
      "app/api/admin/grant/route.js": "0/1",      // admin gives credits
      "app/api/edit/route.js": "0/1",             // refund a failed paid edit
      "app/api/generate/route.js": "0/2",         // refund a failed / partial run
      "app/api/pay/claim/route.js": "1/0",        // a verified payment
      "app/api/pfp/route.js": "0/2",              // refund a failed / partial PFP run
      "app/api/webhooks/helius/route.js": "2/0",  // a verified payment, two paths
      "lib/feed.js": "1/0",                       // the post reward, token-gated
      "lib/users.js": "8/5",                      // spend, refund, merge
    };
    const RW = /credits:\s*\(?[^,;\n{}]*\bcredits\b[^,;\n{}]*[+-]\s*[\w.(]/g;
    const CALL = /\b(refundCredits|grantCredits|refundGeneration)\(/g;
    const walk = (d) => fs.readdirSync(R + d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(d + "/" + e.name) : /\.(jsx?)$/.test(e.name) ? [d + "/" + e.name] : []));
    const found = {};
    for (const f of [...walk("app"), ...walk("lib")]) {
      const s = bare(read(f));
      const a = (s.match(RW) || []).length, b = (s.match(CALL) || []).length;
      if (a || b) found[f] = `${a}/${b}`;
    }
    const all = new Set([...Object.keys(EXPECTED), ...Object.keys(found)]);
    for (const f of [...all].sort()) {
      ok(found[f] === EXPECTED[f], `${f}: ${found[f] || "none"}${found[f] === EXPECTED[f] ? "" : " (expected " + (EXPECTED[f] || "none") + ") — REVIEW THIS"}`);
    }
  }

  console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
