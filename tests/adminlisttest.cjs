// Finding a banner older than the last sixty.
//
// The board showed the 60 most recent and stopped, with nothing to
// press. Anything older could not be reached at all — including the
// banners attached to token addresses as examples during the launch,
// which therefore could not be found and could not be taken back off.
// The detach has existed the whole time; the list was what hid it.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("\nSEEING EVERY BANNER\n");

const ROUTE = bare(read("app/api/admin/generations/route.js"));
const UI = bare(read("app/admin7731/page.jsx"));

/* ---------------- paging ---------------- */
ok(ROUTE.includes("startAfter(before)"), "the list pages with a cursor");
// An offset skips or repeats rows whenever a banner is written while
// the board is open, and this board is read during a launch.
ok(!/\.offset\(/.test(ROUTE), "never an offset, which would skip rows as new ones arrive");
ok(/const before = Number\(new URL\(req\.url\)\.searchParams\.get\("before"\)\) \|\| 0/.test(ROUTE),
   "cursored on ts, the field it orders by");
ok(/items, counts, filter, more/.test(ROUTE), "and it reports whether another page exists");
ok(/items\.length === LIST_LIMIT/.test(ROUTE), "a full page being the only honest signal of more");

ok(/before=\$\{oldest\}/.test(UI), "the board asks from the oldest row it already has");
ok(/\[\.\.\.\(prev \|\| \[\]\), \.\.\.\(d\.items \|\| \[\]\)\]/.test(UI), "and appends rather than replacing");
ok(/filter === "all" && more/.test(UI), "the button shows only where paging applies");

/* ---------------- finding an attached one ---------------- */
ok(/filter === "attached"/.test(ROUTE), "there is a filter for banners claiming a token");
// where("ca","!=","") plus orderBy("ts") is a composite index, and
// this codebase does not use them. In-memory also catches documents
// where `ca` was never written rather than written empty.
ok(!/where\("ca"/.test(ROUTE), "matched in memory, so no composite index is needed");
ok(/typeof r\.ca === "string" && r\.ca\.trim\(\) !== ""/.test(ROUTE), "and an empty or missing ca does not count as attached");
ok(/ATTACHED_SCAN/.test(ROUTE), "reading a window deep enough to reach launch-day examples");
ok(/"attached", "Attached to a token"/.test(UI), "with a chip to reach it");

/* ---------------- and taking it off ---------------- */
// The whole point: an example attached by mistake has to be removable.
const ATTACH = read("app/api/admin/attach/route.js");
ok(/an empty ca detaches it/.test(ATTACH), "an empty address detaches");
ok(/ca: ca \|\| ""/.test(ATTACH), "and that is what gets written");

console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
process.exit(bad ? 1 : 0);
