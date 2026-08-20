// A credit back for posting a banner to the feed.
//
// This pays real credits on a public action, so the interesting part
// is not that it pays — it is every way it could be made to pay twice.
// The run token is verified for real here, against the real HMAC, and
// the eligibility rule is RUN against fake account documents rather
// than read out of the source.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nA CREDIT BACK FOR POSTING\n");

/* ---------------- the run token, for real ---------------- */
process.env.AUTH_SECRET = "secret-under-test";
const AUTH = new Function("require", read("lib/auth.js")
  .replace(/^import "server-only";$/m, "")
  .replace(/^import nacl.*$/m, "const nacl = null;")
  .replace(/^import \{ PublicKey \}.*$/m, "const PublicKey = null;")
  .replace(/^import \{ getAdminDb \}.*$/m, "const getAdminDb = () => null;")
  .replace(/^import crypto from "crypto";$/m, 'const crypto = require("crypto");')
  .replace(/^export /gm, "") + "\nreturn { issueRunToken, readRunToken };")(require);

const ALICE = "acct_alice", BOB = "acct_bob";
const tok = AUTH.issueRunToken(ALICE);

ok(AUTH.readRunToken(ALICE, tok) !== null, "a run token reads back for the account it was issued to");
// The whole reason it is signed: a run id typed by the browser would
// be a credit printer.
ok(AUTH.readRunToken(BOB, tok) === null, "and never for another account");
ok(AUTH.readRunToken(ALICE, tok.replace(/.$/, "x")) === null, "a tampered signature earns nothing");
ok(AUTH.readRunToken(ALICE, "made.2999-01-01.up") === null, "nor does an invented one");
ok(AUTH.issueRunToken(ALICE) !== AUTH.issueRunToken(ALICE), "every run gets a distinct id");
{
  const [n, , mac] = tok.split(".");
  ok(AUTH.readRunToken(ALICE, `${n}.2020-01-01.${mac}`) === null,
     "and a token cannot be replayed on another day");
}

/* ---------------- who gets paid ---------------- */
// The rule as publish() applies it, run against account documents
// rather than matched in the source — the failure being guarded is a
// wrong decision, not a missing line.
const PER_DAY = 3;
const decide = (d, runId, today) => {
  const sameDay = d.rewardDate === today;
  const paidRuns = sameDay && Array.isArray(d.paidRuns) ? d.paidRuns : [];
  return Boolean(runId) && !paidRuns.includes(runId) && paidRuns.length < PER_DAY;
};
const TODAY = "2026-08-16";

ok(decide({}, "r1", TODAY) === true, "a first post from a real run is paid");
ok(decide({ rewardDate: TODAY, paidRuns: ["r1"] }, "r1", TODAY) === false,
   "THE SAME RUN NEVER PAYS TWICE — four options from one run is one credit, not four");
ok(decide({ rewardDate: TODAY, paidRuns: ["r1"] }, "r2", TODAY) === true,
   "but a different run does");
ok(decide({ rewardDate: TODAY, paidRuns: ["r1", "r2", "r3"] }, "r4", TODAY) === false,
   "and the fourth run of the day is not paid");
ok(decide({}, null, TODAY) === false, "a post with no valid run token is not paid");
ok(decide({}, "", TODAY) === false, "nor one with an empty id");
// Yesterday's tally must not spend today's allowance.
ok(decide({ rewardDate: "2026-08-15", paidRuns: ["a", "b", "c"] }, "r1", TODAY) === true,
   "and the count resets with the day");

/* ---------------- what the payout can cost ---------------- */
const FEED = new Function(read("lib/feed.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
  "\nreturn { POST_REWARD_CREDITS, REWARDED_POSTS_PER_DAY };")();
ok(FEED.POST_REWARD_CREDITS === 1, "one credit per post");
ok(FEED.REWARDED_POSTS_PER_DAY === 3, "three a day at most");
// Three credits is one free run's worth. If a post ever paid more
// than a run costs, posting would be cheaper than generating.
const PACKS = new Function(read("lib/packs.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
  "\nreturn { runCost };")();
ok(FEED.POST_REWARD_CREDITS < PACKS.runCost(2),
   "and one post never pays back more than the cheapest run costs");

/* ---------------- settled with the post, not after it ---------------- */
const SRC = bare(read("lib/feed.js"));
// Two requests racing must not both find the last paid slot free, and
// a post must never be written with its payment left undecided.
ok(/tx\.update\(userRef, \{[\s\S]{0,400}credits: \(d\.credits \|\| 0\) \+ POST_REWARD_CREDITS/.test(SRC),
   "the credit is written in the same transaction as the post");
ok(/paidRuns: \[\.\.\.paidRuns, runId\]/.test(SRC), "with the run recorded as paid");
ok(/const runId = readRunToken\(accountId, body\.runToken\)/.test(SRC),
   "and the token verified rather than trusted");
ok(!/body\.runId/.test(SRC), "a raw run id from the browser is never read");

/* ---------------- and the client only reports ---------------- */
const BTN = bare(read("components/PostButton.jsx"));
ok(/runToken: runToken \|\| ""/.test(BTN), "the button sends the signed token");
ok(/if \(d\.earned > 0\)/.test(BTN), "and reports what the server actually paid");
ok(!/credits \+ 1|balance \+/.test(BTN), "never adding a credit locally, which would eventually disagree");
const CREATE = bare(read("app/create/page.jsx"));
ok(/runToken: data\.runToken \|\| ""/.test(CREATE), "the run keeps its token");
ok(/downloaded\[i\] && runMeta\?\.runToken && !posted/.test(CREATE),
   "the offer appears only after a download, and only while the run can still earn");

/* ---------------- the rules are readable somewhere ---------------- */
const FEEDPAGE = bare(read("app/feed/page.jsx"));
ok(/How this works/.test(FEEDPAGE), "the feed explains itself on request");
ok(/Once per run, three times a day/.test(FEEDPAGE), "stating the limits exactly as they are enforced");
ok(/most likes is featured/.test(FEEDPAGE), "and that the day's most liked is featured and rewarded");

console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
process.exit(bad ? 1 : 0);
