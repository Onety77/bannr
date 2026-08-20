// The links in the footer, and the ones that are not there yet.
//
// Two entries shipped as `your-community-id` and `your-token-address`
// — live, clickable 404s in the footer of every page. That is the kind
// of broken everybody sees on launch day and nobody bothers to report,
// so the fix is structural rather than a one-time correction: an entry
// still holding a placeholder is not rendered at all.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

console.log("\nSOCIAL LINKS\n");

const S = new Function(read("lib/site.js").replace(/^export /gm, "") + "\nreturn { SOCIALS, MINT, liveSocials };")();

/* ---------------- nothing half-finished reaches a page ---------------- */
const live = S.liveSocials();
ok(live.every((s) => !s.url.includes("your-")), "no placeholder URL is ever rendered");
ok(live.every((s) => /^https:\/\//.test(s.url)), "and every rendered link is absolute and https");
ok(live.length < S.SOCIALS.length, "at least one entry is still unfilled, and is being withheld rather than shown");
ok(read("components/Socials.jsx").includes("liveSocials()"), "the component renders the filtered list");
ok(!/\{SOCIALS\.map/.test(read("components/Socials.jsx")), "and not the raw one");

/* ---------------- the ones that are live ---------------- */
const by = (id) => S.SOCIALS.find((s) => s.id === id);
ok(by("x").url === "https://x.com/get_bannr", "X points at the real account");
// The chart link is built from MINT rather than typed out, so a
// mistyped address cannot disagree with itself between links.
ok(by("chart").url.endsWith(S.MINT), "the chart link is built from the contract address");
ok(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(S.MINT), `and that address is valid base58 (${S.MINT.slice(0, 8)}…)`);
// Every icon id must exist in the component, or a link renders with
// the fallback glyph and looks like a mistake.
{
  const C = read("components/Socials.jsx");
  for (const s of live) ok(C.indexOf(s.id + ": (") > 0, "  " + s.id + " has its own icon");
}

console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
process.exit(bad ? 1 : 0);
