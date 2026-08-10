// Buying credits on a phone, and the one link in that chain that was
// broken: the pack id.
//
// Choosing a pack hops out to Phantom to connect, comes back on a
// fresh page load, and has to remember WHICH pack was chosen — React
// state does not survive the navigation, so the id rides in
// localStorage via beginFlow's `payload`. The caller passed it, the
// store accepted it, and the function in the middle took two
// parameters and dropped the third on the floor. Result: payload
// null, no pack matched, the transaction never got built, and because
// the confirm step is a button that only appears once a transaction
// exists, the next tap started the CONNECT hop again. Phantom asking
// to connect, forever, never asking to confirm.
//
// Nothing here mocks the chain. The round trip is the real
// walletFlow; the wiring assertions read the real source.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
// Assertions ABOUT code must not be able to match the prose next to
// it. The paragraph above says "payload" and "beginFlow" repeatedly;
// ungrated, a test for those words would be grading my own comment.
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nPAYING FOR A PACK ON A PHONE\n");

/* ---------------- the store round trip, for real ---------------- */
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const flow = new Function(
  read("lib/walletFlow.js")
    .replace(/^"use client";$/m, "")
    .replace(/^import[^\n]*$/gm, "")
    .replace(/^export /gm, "") +
    "\nreturn { beginFlow, readFlow, endFlow };"
)();

flow.beginFlow("buy", "phantom", { packId: "launch" });
const back = flow.readFlow();
ok(back?.payload?.packId === "launch", "a pack id survives the hop out and back");
ok(back?.intent === "buy", "so does the intent that went with it");

// The armed one-tap path writes the challenge alongside, and used to
// hardcode null in the payload slot. A returning buyer takes that
// branch, so it has to carry the pack too.
flow.endFlow();
flow.beginFlow("buy", "phantom", { packId: "studio" }, { address: "abc", nonce: "n1" });
const armed = flow.readFlow();
ok(armed?.payload?.packId === "studio", "and survives the armed path, alongside a challenge");
ok(armed?.nonce === "n1", "without displacing the challenge it travels with");

/* ---------------- the wiring that broke ---------------- */
const auth = bare(read("lib/useAuth.js"));
const credits = bare(read("app/credits/page.jsx"));

// The caller. Three arguments: intent, provider, and the pack.
const call = credits.match(/startWalletDeeplink\(\s*"buy"[^)]*\)/);
ok(!!call, "the credits page starts a buy flow");
ok(/packId/.test(call?.[0] || ""), "and names the pack when it does");

// The function in the middle. This is the assertion that was missing:
// it accepted two parameters while being handed three.
const sig = auth.match(/const startWalletDeeplink = useCallback\(\(([^)]*)\)/);
ok(!!sig, "startWalletDeeplink is defined");
const params = (sig?.[1] || "").split(",").map((s) => s.trim()).filter(Boolean);
ok(params.length >= 3, `it accepts the payload as a third parameter (has ${params.length})`);
ok(/payload/.test(params[2] || ""), "and that third parameter is the payload");

// Every handoff to the store must pass it on. Two branches reach
// beginFlow — the fresh connect and the armed one-tap — and both were
// discarding it, one by omission and one by a literal null.
const begins = auth.match(/beginFlow\([^)]*\)/g) || [];
ok(begins.length >= 2, `both branches reach the store (found ${begins.length})`);
for (const b of begins) {
  const args = b.slice(b.indexOf("(") + 1, -1).split(",").map((s) => s.trim());
  ok(args[2] === "payload", `payload is forwarded, not dropped: ${b}`);
}

// The far side already read it correctly; it was only ever starved.
// Asserted so a future tidy-up of walletResume cannot quietly undo
// the half of this that always worked.
const resume = bare(read("lib/walletResume.js"));
ok(/payload:\s*pending\.payload/.test(resume), "the resume hands the pack to the credits page");

/* ---------------- and the failure it produced ---------------- */
// The error the user actually saw. Kept as a test so the message and
// the lookup it reports on cannot drift apart.
ok(
  /packs\.find\(\s*\(\s*x\s*\)\s*=>\s*x\.id === p\.payload\?\.packId\s*\)/.test(credits),
  "the credits page looks the pack up by the id that travelled"
);

// "all green" exactly — tests/run.cjs greps for it, so a file that
// passes every assertion and says anything else still reports FAIL.
console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
process.exit(bad ? 1 : 0);
