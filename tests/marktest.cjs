const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const G = fs.readFileSync(R + "app/globals.css", "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

console.log("\nTHE TICKER");
ok(/\.fcard-tick \{[\s\S]{0,400}color: var\(--accent\);/.test(G), "brand purple again");

console.log("\nTHE MARK");
ok(G.includes(".fcard::before {"), "on the card");
ok(/top: -22px; right: -20px;/.test(G), "cropped by the corner, not sitting politely inside it");
ok(/opacity: 0\.055;/.test(G), "barely there in light");
ok(G.includes('[data-theme="dark"] .fcard::before { opacity: 0.075; }'), "a touch stronger on dark");
ok(G.includes('background: url("/logo-mark.png")'), "uses the real mark");
ok(/\.fcard::before \{[\s\S]{0,400}pointer-events: none;/.test(G), "never intercepts a tap");
ok(/\.fcard \{[\s\S]{0,240}position: relative;/.test(G), "the card is the positioning context");
ok(G.includes(".fcard-top, .fcard-coin, .fcard-shot, .fcard-actions { position: relative; z-index: 1; }"), "everything else sits above it");
ok(/\.fcard \{[\s\S]{0,320}overflow: hidden;/.test(G), "overflow clips the bleed, which is what makes it a crop");

console.log("\nONE SOURCE OF TRUTH FOR THE THEME");
const media = G.match(/@media \(prefers-color-scheme[^)]*\)/g) || [];
ok(media.length === 0, "no prefers-color-scheme rules — data-theme is the only switch (found " + media.length + ")");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
