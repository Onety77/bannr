const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const LAY = read("app/layout.jsx");
const G = read("app/globals.css");
const SC = read("lib/scroller.js");
const RS = read("lib/useRestoreScroll.js");
const SF = read("lib/useScrollFocus.js");
const BF = read("components/BannerField.jsx");
const YOU = read("app/you/page.jsx");
const SET = read("app/settings/page.jsx");

console.log("\n1. THE DOCUMENT STOPS SCROLLING (PHONES ONLY)");
ok(LAY.includes('<div id="app-scroll" className="app-scroll">'), "one container wraps everything scrollable");
ok(LAY.indexOf("app-scroll") < LAY.indexOf("<TabBar />"), "and the tab bar sits OUTSIDE it");
ok(/@media \(max-width: 760px\) \{\s*html, body \{ height: 100%; overflow: hidden; \}/.test(G), "document scrolling removed on phones");
ok(/\.app-scroll \{[\s\S]{0,260}overflow-y: auto;/.test(G), "the container takes over");
ok(!/^html, body \{ overscroll-behavior-y: none; \}/m.test(G), "the attempt that did nothing on iOS is gone");
// The number is now the bar's own measured height, not a literal —
// see finaltest for that. What matters here is only that the clearance
// belongs to the scroller rather than to the body.
ok(G.includes(".app-scroll { padding-bottom: var(--tabbar-h"), "the bar's clearance moved to whatever scrolls");
ok(G.includes(".kb-open .app-scroll { padding-bottom: 0; }"), "and the keyboard rule moved with it");

console.log("\n2. DESKTOP IS UNTOUCHED");
const mob = G.slice(G.indexOf("THE APP SHELL — phones only"));
ok(/@media \(max-width: 760px\)/.test(mob), "every shell rule is inside the mobile query");
ok(!/^\.app-scroll \{\s*height: 100%;/m.test(G.replace(mob, "")), "nothing outside it makes the container a scroller");
ok(SC.includes('getComputedStyle(el).overflowY === "auto"'), "JS asks the CSS which is scrolling rather than guessing a width");

console.log("\n3. NOTHING STILL TALKS TO THE OLD SCROLLER");
for (const [name, src] of [["useRestoreScroll", RS], ["useScrollFocus", SF], ["BannerField", BF]]) {
  ok(!/window\.addEventListener\("scroll"/.test(src), name + " no longer listens on window");
  ok(!/window\.scrollY|window\.scrollTo/.test(src), name + " no longer reads window scroll");
}
ok(RS.includes("scrollToTop(y)") && RS.includes("scrollTop()"), "restore goes through the helper");
ok(SF.includes("subscribe(onScroll)"), "and so does the spotlight");
ok(BF.includes('from "@/lib/scroller"'), "BannerField imports it");

console.log("\n4. THE MENU");
ok(YOU.includes('className="you-menu"'), "rows, not a paragraph of coloured words");
ok(YOU.includes("you-row-go"), "each row points somewhere");
ok(YOU.includes("you-row-out"), "sign out is set apart");
ok(!YOU.includes("you-links"), "the old bare-link row is gone");
ok(!G.includes(".you-links {"), "and so is its CSS");

console.log("\n5. THE WALLET");
ok(SET.includes("const wallet = useWallet();"), "settings knows the browser's wallet");
ok(SET.includes('(identities || []).find((i) => i.type === "wallet")'), "and which one is LINKED — the proven list, not payments");
ok(SET.includes("wallet.address === linkedWallet.id"), "green only when they are the same wallet");
ok(SET.includes("Connect a wallet"), "and offers to link one when there is none");
ok(!SET.includes("Paying wallets"), "the payment-attribution list is no longer shown");
ok(G.includes(".wal-dot.on {"), "the indicator is styled");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
