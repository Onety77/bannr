// TONE. These people have approved a thousand transactions and know
// what a wallet does. Copy that narrates the mechanic reads as talking
// down, and copy that answers a question nobody asked is what makes
// them start asking it.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const SURFACES = [
  "app/page.jsx", "app/credits/page.jsx", "app/feed/page.jsx", "app/history/page.jsx",
  "app/you/page.jsx", "app/settings/page.jsx", "app/create/page.jsx",
  "components/XComingSoon.jsx", "components/SignInModal.jsx", "components/TopUpModal.jsx",
  "components/ConnectButton.jsx", "components/WalletContinue.jsx", "components/PostButton.jsx",
];

console.log("\n1. NOBODY IS TOLD HOW A WALLET WORKS");
{
  // The exception, and the only one: after a payment poll times out.
  // Someone who paid and sees no credits WILL pay again — that is an
  // active worry with money attached, not a preemptive one.
  const ALLOWED = "Still confirming. Your credits will appear automatically — no need to pay again.";
  const banned = [
    [/your wallet (will )?opens? for approval/i, "narrating that the wallet opens"],
    [/pick a pack and your wallet/i, "explaining what pressing buy does"],
    [/it makes no difference to your account/i, "reassuring about something nobody asked"],
    [/holder checks run/i, "describing our own infrastructure"],
    [/\bvia Helius\b/i, "naming an internal vendor"],
    [/at generation time/i, "internal timing vocabulary"],
  ];
  for (const f of SURFACES) {
    const src = bare(read(f)).split(ALLOWED).join("");
    for (const [re, why] of banned) {
      if (re.test(src)) { ok(false, f + ": " + why); }
    }
  }
  ok(true, "no surface narrates the payment mechanic");
  ok(read("app/credits/page.jsx").includes(ALLOWED), "and the ONE reassurance that answers a real worry survives");
}

console.log("\n2. THE CREDITS PAGE");
{
  const raw = read("app/credits/page.jsx");
  // Comments stripped: the code now explains in a comment WHY the old
  // line was wrong, and it quotes it to do so.
  const C = bare(raw);
  ok(!/get 3 free runs every day/.test(C), "the hardcoded '3 free runs' is gone");
  ok(raw.includes("{offer && <div className=\"notice page-gap\">{offer}</div>}"),
     "the offer is read live, so an admin edit cannot make it a lie");
  ok(raw.includes("const offer = offerLine(useToken());"), "from the same place as everywhere else");
  ok(!/COMING WITH \$BANNR/.test(C), "and the shouted teaser with it");
  // Gone entirely, not softened.
  ok(!/Pick a pack and your wallet/.test(C), "no line explaining what buying does");
  ok(!/Connected\. Pick a pack to pay/.test(C), "nor the connected variant of it");
}

console.log("\n3. SUBTITLES SAY WHAT THE PAGE IS");
{
  const cases = [
    ["app/feed/page.jsx", "What people are shipping.", "Banners people made and chose to share."],
    ["components/XComingSoon.jsx", "Designed for X, not resized for it.", "where the platform actually crops them"],
    ["app/history/page.jsx", "Every run, saved with its brief.", "with one click"],
    ["app/settings/page.jsx", "Saved to your account.", "so they follow you to any device"],
  ];
  for (const [f, want, gone] of cases) {
    const src = read(f);
    ok(src.includes(want), f + ": " + JSON.stringify(want));
    // bare(), because a file may explain in a comment what it used to
    // say — history.jsx does exactly that.
    ok(!bare(src).includes(gone), "  …and the old one is gone");
  }
}

console.log("\n4. NO CARD REPEATS ITS OWN TITLE");
{
  // "Pay in SOL" / "Pay in SOL. Credited the moment it confirms."
  const P = read("app/page.jsx");
  const cards = [...P.matchAll(/title: "([^"]+)",\s*\n\s*body: "([^"]*)"/g)];
  ok(cards.length >= 5, "found " + cards.length + " feature cards");
  for (const [, title, body] of cards) {
    if (!body) continue;
    ok(!body.toLowerCase().startsWith(title.toLowerCase()), JSON.stringify(title) + " does not restate itself");
  }
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
