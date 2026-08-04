#!/usr/bin/env node
// ============================================================
// TWO NAVIGATIONS, ONE APP.
//
// The mobile tab bar and the desktop nav are separate components, and
// they drifted: the feed and the profile shipped, the tab bar got
// them, and the desktop nav did not. Both existed on a laptop and
// neither was reachable without typing the URL.
//
// Nothing warns you about that. The pages build, the routes work,
// every test passes, and the feature is simply invisible to half the
// people using it.
//
// So: every destination in the tab bar must be reachable somewhere in
// the desktop chrome — the nav links or the account menu. Not the same
// LAYOUT, which would be a worse product on both, just no destination
// that exists on one and nowhere on the other.
//
//   node scripts/check-nav.cjs
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

const TAB = read("components/TabBar.jsx");
const NAV = read("components/Nav.jsx");

// Every literal route mentioned in the file, however it is written.
// The desktop nav keeps its links in an array of tuples and the tab
// bar uses href: keys, so matching on `href=` alone found neither —
// which is how the first version of this check reported the nav as
// broken when it was correct.
//
// Asset paths are not routes. A template literal is a per-user
// destination (a public profile), not a fixed place a nav carries.
const hrefs = (src) =>
  [...src.matchAll(/"(\/[A-Za-z0-9_\-/]*)"/g)]
    .map((m) => m[1])
    .filter(
      (h) =>
        h !== "/" &&
        // An asset, not a route.
        !/\.[a-z]{2,4}$/.test(h) &&
        // A trailing slash is a prefix being matched — the tab bar uses
        // startsWith("/u/") to stay lit on a profile — not a place
        // anything navigates to.
        !h.endsWith("/")
    );

const tabs = [...new Set(hrefs(TAB))];
const desktop = new Set(hrefs(NAV));

const missing = tabs.filter((h) => !desktop.has(h));

if (!missing.length) {
  console.log(`check-nav: clean (${tabs.length} tab destinations, all reachable on desktop)`);
  process.exit(0);
}

console.error("check-nav: in the tab bar but nowhere in the desktop nav\n");
for (const h of missing) {
  console.error(`  ${h}`);
}
console.error(`
  Add it to LINKS or the account menu in components/Nav.jsx, or the
  feature is invisible to everyone on a laptop.
`);
process.exit(1);
