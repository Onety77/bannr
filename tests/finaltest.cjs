const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const TAB = read("components/TabBar.jsx");
const G = read("app/globals.css");
const SET = read("app/settings/page.jsx");

console.log("\n1. ONE NUMBER, MEASURED");
ok(TAB.includes('root.style.setProperty("--tabbar-h"'), "the bar publishes its own height");
ok(TAB.includes("el.offsetHeight"), "measured, so the safe-area inset is included without anyone naming it");
ok(TAB.includes("new ResizeObserver(write)"), "and re-measured when it changes");
ok(TAB.includes('root.style.removeProperty("--tabbar-h")'), "cleaned up on unmount");

console.log("\n2. NOTHING GUESSES ANY MORE");
ok(G.includes(".app-scroll { padding-bottom: var(--tabbar-h); }"), "the scroller reserves the measured height");
// Save is no longer sticky at all — it sits at the end of the form,
// so it has nothing to clear. See the note above .set-save.
{
  const rule = G.slice(G.indexOf(".set-save {"));
  const body = rule.slice(0, rule.indexOf("}"));
  ok(!body.includes("position: sticky"), "Save is in the flow, not floating over the form");
  ok(!body.includes("bottom:"), "so it has no offset to get wrong");
}
// Generate is no longer sticky either — it sits at the end of the
// brief. Only the scroll container still reserves room for the bar.
ok(!/.run-bar {[sS]{0,140}position: sticky/.test(G), "and Generate does not float over the brief");
ok(!G.includes("bottom: calc(58px + env(safe-area-inset-bottom))"), "the 58px guess is gone");
ok(!G.includes("bottom: calc(74px + env(safe-area-inset-bottom))"), "and the 74px one");
ok(!/\.app-scroll \{ padding-bottom: calc\(64px/.test(G), "and the 64px one");
// The double-count that put Save mid-page: two independent numbers for
// one bar. There is one now.
const guesses = (G.match(/calc\((?:58|64|74)px \+ env\(safe-area-inset-bottom\)\)/g) || []).length;
ok(guesses === 0, "no hardcoded tab-bar heights left anywhere (" + guesses + ")");

console.log("\n3. DESKTOP");
ok(G.includes(":root { --tabbar-h: 0px; }"), "zero by default, because a wide screen has no tab bar");
ok(G.includes("@media (max-width: 760px) { :root { --tabbar-h: 64px; } }"), "and a sane value on phones before JS has measured anything");
// display:none measures 0, which is the correct offset on a screen
// with no tab bar — the same rule works on both without a media query.
ok(TAB.includes('window.addEventListener("resize", write)'), "re-measures when the media query flips the bar off");

console.log("\n4. THERE IS ALWAYS A WAY TO CONNECT");
// The handoff into a wallet's OWN browser is gone. A phone browser
// now asks the wallet APP directly by deeplink and gets a signature
// back on the redirect — same page, same session, nothing to carry
// across. See dltest.cjs.
ok(SET.includes("auth.needsDeeplink ? ("), "a phone browser gets the deeplink");
ok(SET.includes('auth.startWalletDeeplink("link")'), "which asks the wallet app to sign");
ok(!/phantomBrowseUrl|handoff/i.test(SET), "and nothing sends anyone into a second browser any more");
ok(SET.includes("auth.walletAvailable ? ("), "an injected wallet still connects directly");
ok(SET.includes("No wallet on this device"), "and the dead end says so instead of showing nothing");
ok(!/\{auth\.walletAvailable && \(\s*<button[\s\S]{0,200}Connect a wallet/.test(SET),
   "the row is no longer hidden behind walletAvailable, which is false in mobile Safari");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
