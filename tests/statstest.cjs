// Runs the SHIPPED stats + before/after code where it can be run, and
// static-checks the wiring where it cannot.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const S = read("lib/stats.js");
const T = read("lib/track.js");
const ROUTE = read("app/api/track/route.js");
const GEN = read("app/api/generate/route.js");
const PB = read("components/PostButton.jsx");
const CREATE = read("app/create/page.jsx");
const CSS = read("app/globals.css");

function grab(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let j = src.indexOf("(", i), p = 0;
  for (; j < src.length; j++) { if (src[j] === "(") p++; else if (src[j] === ")") { p--; if (!p) break; } }
  let d = 0, st = false;
  for (; j < src.length; j++) { if (src[j] === "{") { d++; st = true; } else if (src[j] === "}") { d--; if (st && !d) return src.slice(i, j + 1); } }
  return null;
}

console.log("\n1. THE DAY KEY");
{
  const dayKey = new Function(grab(S, "export function dayKey").replace(/^export /, "") + "\nreturn dayKey;")();
  ok(dayKey(new Date("2026-08-05T00:00:01Z")) === "2026-08-05", "midnight UTC is the new day");
  ok(dayKey(new Date("2026-08-05T23:59:59Z")) === "2026-08-05", "one second to midnight is still it");
  ok(dayKey(new Date("2026-08-06T00:00:00Z")) === "2026-08-06", "and then it rolls");
  ok(/toISOString\(\)\.slice\(0, 10\)/.test(S), "UTC, not local — two people cannot disagree about yesterday");
}

console.log("\n2. WHAT A BROWSER MAY COUNT");
ok(/EVENTS = \["landed", "started", "generated"\]/.test(S), "three events exist");
ok(/CLIENT_EVENTS = \["landed", "started"\]/.test(S), "and a browser may only post two of them");
ok(!S.match(/CLIENT_EVENTS = \[[^\]]*generated/), "GENERATED IS NOT ONE OF THEM");
ok(ROUTE.includes("CLIENT_EVENTS.includes(event)"), "the route validates against that list, not EVENTS");
// Word-boundaried: CLIENT_EVENTS.includes CONTAINS "EVENTS.includes".
ok(!/[^_A-Z]EVENTS\.includes/.test(ROUTE), "and never against the wider one");
ok(/if \(!EVENTS\.includes\(event\)\) return false;/.test(S), "bump() refuses an unknown field, so a typo cannot invent one");
ok(ROUTE.includes("export const dynamic"), "not statically cached, or it would count once ever");

console.log("\n2a. GENERATED IS COUNTED WHERE THE MONEY MOVED");
ok(GEN.includes('bump("generated")'), "the generate route counts it");
ok(GEN.includes('if (!isReroll) bump("generated")'), "and excludes rerolls, which are the same person asking twice");
{
  // It must sit AFTER the charge and AFTER results exist — not next
  // to the early returns that reject a run.
  const at = GEN.indexOf('bump("generated")');
  ok(at > GEN.indexOf("const paid = await consumeGeneration"), "after the credit is spent");
  ok(at > GEN.indexOf("const missing = attempted - results.length"), "and after the images came back");
  ok(at < GEN.indexOf("return NextResponse.json({\n      ok: true,"), "but before the response");
}
ok(/bump\("generated"\)\.catch\(\(\) => \{\}\)/.test(GEN), "and cannot fail the run it is counting");

console.log("\n3. ONCE PER TAB");
ok(T.includes("sessionStorage.getItem(KEY(event))"), "checked before firing");
{
  const set = T.indexOf("sessionStorage.setItem");
  const fire = T.indexOf('fetch("/api/track"');
  ok(set < fire, "and WRITTEN BEFORE the request, so a double render cannot both pass");
}
ok(T.includes("keepalive: true"), "survives the navigation that often follows");
ok(/catch \{\s*\/\/ Private mode[\s\S]{0,220}\}\s*try \{/.test(T), "storage being unavailable still counts, rather than silently dropping");
ok(read("components/Track.jsx").includes('track("landed")'), "landed fires from the layout");
ok(read("app/layout.jsx").includes("<Track />"), "which is actually mounted");

console.log("\n3a. STARTED");
ok(/function setField\(k, v\) \{\s*track\("started"\);/.test(CREATE), "any brief field counts as started");
ok(CREATE.includes('if (!f) return;\n    track("started");'), "and so does dropping a logo in");
{
  // A CA import repopulates the brief through setField, so it is
  // covered — but only if it really goes through setField.
  const imp = CREATE.slice(CREATE.indexOf("resetBrief();\n      saveRecentCA"), CREATE.indexOf("let gotLogo"));
  ok(/setField\("name"/.test(imp), "a contract address import goes through setField too");
}
{
  // The dangerous case: setField called from an effect would count
  // everyone who merely opened the page.
  const effects = CREATE.match(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/g) || [];
  ok(!effects.some((e) => e.includes("setField(")), "nothing calls setField from an effect, so it stays a human act");
}

console.log("\n4. READING A WEEK");
ok(S.includes("db.getAll(...refs)"), "read by known document IDs in one round trip");
{
  // Comments stripped first — the header of stats.js explains WHY it
  // avoids where()+orderBy, and matching that sentence would be the
  // test grading its own prose instead of the code.
  const code = S.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/\.where\(/.test(code) && !/orderBy/.test(code), "NO QUERY AND NO INDEX — the failure mode that emptied the spotlight cannot happen here");
}
ok(/for \(let i = days - 1; i >= 0; i--\)/.test(S), "days built oldest-first");
ok(S.includes("keys.map((k) => {"), "and mapped back over the FULL key list, so a quiet day is a zero rather than a gap");
ok(/landed: d\.landed \|\| 0/.test(S), "missing fields read as zero");

console.log("\n5. THE ADMIN VIEW");
{
  const F = read("components/AdminFunnel.jsx");
  const AR = read("app/api/admin/stats/route.js");
  ok(AR.includes("requireAdmin(req)"), "admin-gated server-side");
  ok(AR.includes("await recent(14)"), "fourteen days");
  ok(/sum = days\.reduce/.test(AR), "rates come off the window total, not one small day");
  const pct = new Function("const pct = " + F.match(/const pct = ([^;]+);/)[1] + "; return pct;")();
  ok(pct(34, 210) === 16, "16% of 210 is 34");
  ok(pct(0, 0) === null, "and an empty day has no rate at all");
  ok(pct(5, 0) === null, "never a divide by zero");
  ok(F.includes("if (!data) return null;"), "renders nothing until it has numbers");
  ok(F.includes("Math.max(1, ...days.map((d) => d.landed))"), "the chart scales to the busiest day, never to zero");
  ok(read("app/admin7731/page.jsx").includes("<AdminFunnel user={user} />"), "and it is mounted above the tabs");
  {
    const p = read("app/admin7731/page.jsx");
    ok(p.indexOf("<AdminFunnel") < p.indexOf('className="admin-tabs"'), "seen rather than visited");
  }
}

// Sections on the source logo moved to batest.cjs, which owns that
// feature end to end now that it is a card overlay rather than a
// composite.

console.log("\n6c. ONE COPY OF THE ADDRESS SHAPE");
{
  const CA = read("lib/ca.js");
  ok(/LOOKS_LIKE_CA = \/\^\(\[1-9A-HJ-NP-Za-km-z\]\{32,44\}\|0x\[a-fA-F0-9\]\{40\}\)\$\//.test(CA), "the regex lives in lib/ca.js");
  for (const f of ["app/create/page.jsx", "components/HeroStart.jsx", "components/PostButton.jsx"]) {
    ok(read(f).includes('import { LOOKS_LIKE_CA } from "@/lib/ca";'), f + " imports it");
    ok(!/^const LOOKS_LIKE_CA/m.test(read(f)), "  …and no longer declares its own");
  }
  // An import stranded inside a comment block still parses, but it is
  // how the last mechanical edit nearly shipped something unreadable.
  for (const f of ["app/create/page.jsx", "components/HeroStart.jsx"]) {
    const line = read(f).split("\n").findIndex((l) => l.includes('from "@/lib/ca"'));
    const prev = read(f).split("\n")[line - 1] || "";
    const next = read(f).split("\n")[line + 1] || "";
    ok(!(/^\/\/ /.test(prev.trim()) && /^\/\/ /.test(next.trim())), f + ": the import is not stranded mid-comment");
  }
}

console.log("\n7. STYLES");
ok(/\.funnel \{/.test(CSS) && /\.funnel-bar-made \{/.test(CSS), "the funnel is styled");
ok(!/\.post-ba/.test(CSS), "and the dead toggle styles are gone, not just unused");
{
  // The class collision that once collapsed the lightbox toolbar.
  for (const c of ["funnel", "funnel-bar", "funnel-cell"]) {
    const n = (CSS.match(new RegExp("^\\." + c + " \\{", "gm")) || []).length;
    ok(n === 1, "." + c + " is declared exactly once");
  }
}

console.log("\n7a. NOT EXPLAINING OURSELVES");
{
  // Internal vocabulary that should never reach a visitor.
  const pages = ["app/create/page.jsx", "app/page.jsx", "app/feed/page.jsx", "components/PostButton.jsx", "components/FeedCard.jsx", "app/you/page.jsx"];
  for (const f of pages) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    ok(!/the director|art-directed|the model is|our prompt/i.test(src), f + ": no internal role names in the UI");
  }
}

console.log("\n8. THE COPY");
ok(CREATE.includes('<div className="hint">The more real, the less generic.</div>'), "the About hint lost its front half");
ok(!CREATE.includes("This decides the whole treatment"), "and the old line is gone");
ok(CREATE.includes('<span className="tag-opt">if you already have an idea</span>'), "the direction tag asks instead of selling");
ok(!CREATE.includes("optional, but worth it"), "and 'worth it' is gone everywhere, comments included");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);__BLOCK__


