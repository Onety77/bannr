const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const CARD = read("components/FeedCard.jsx");
const CREATE = read("app/create/page.jsx");
const API = read("app/api/feed/[id]/route.js");
const G = read("app/globals.css");

console.log("\n1. THE LINK NOW CARRIES SOMETHING");
ok(CARD.includes("&from=${encodeURIComponent(post.id)}"), "the post id travels with the style");
ok(CREATE.includes('const fromParam = (params.get("from") || "").trim();'), "and the create page reads it");

console.log("\n2. THE BANNER BECOMES A REFERENCE");
ok(CREATE.includes("await fetch(`/api/feed/${encodeURIComponent(fromParam)}`)"), "fetches the post");
ok(CREATE.includes("await (await fetch(post.src)).blob()"), "turns the stored data URL straight into bytes");
ok(CREATE.includes('new File([blob], "reference.jpg"'), "as a File the run can send");
ok(CREATE.includes("prev.length >= 3 ? prev :"), "respects the three-reference cap");
ok(CREATE.includes("return () => { live = false; };"), "and cannot set state after unmount");

console.log("\n3. AND IT SAYS SO");
ok(CREATE.includes("setInspiredBy({"), "the source is recorded for display");
ok(CREATE.includes("Making one like"), "and stated on arrival");
ok(CREATE.includes("is attached as a"), "naming what actually carried over");
ok(CREATE.includes("Everything else is yours."), "and what did not");
ok(CREATE.includes("onClick={() => setInspiredBy(null)}"), "dismissable");
ok(G.includes(".inspired {"), "styled");

console.log("\n4. THE API IT LEANS ON");
ok(API.includes("if (!post) return NextResponse.json({ error: \"Not found.\" }, { status: 404 })"), "hidden or missing posts 404, same guard as the page");
ok(API.includes('"Cache-Control": "no-store"'), "not cached, so a taken-down post stops being fetchable");

console.log("\n5. THE HEADER BAND");
ok(G.includes(".fcard::after {"), "the band has a canvas grid");
ok(G.includes("repeating-linear-gradient(to right, var(--hairline)"), "drafting-paper lines");
ok(G.includes("mask-image: linear-gradient(to bottom"), "faded to nothing before it reaches the artwork");
ok(!G.includes("perspective(") || !/\.fcard::after[\s\S]{0,400}perspective\(/.test(G), "flat, not a synthwave vanishing grid");
// Read the whole rule instead of guessing a character window. The
// first version allowed 400 chars and the rule is longer than that,
// so it failed on correct CSS.
{
  const rule = G.slice(G.indexOf(".fcard::after {"));
  const body = rule.slice(0, rule.indexOf("\n}"));
  ok(body.includes("pointer-events: none;"), "and never intercepts the double-tap");
  ok(body.includes("z-index: 0;"), "sitting behind the content");
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
