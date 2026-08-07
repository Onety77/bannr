// The launch model: no signup grant, free runs come from HOLDING,
// two doors into an account, and both asks live in a dialog.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const U = read("lib/users.js");
const VER = read("app/api/auth/verify/route.js");
const OFFER = read("lib/offer.js");
const PAGE = read("app/page.jsx");
const CB = read("components/ConnectButton.jsx");
const SIM = read("components/SignInModal.jsx");
const TOP = read("components/TopUpModal.jsx");
const MODALS = read("components/Modals.jsx");
const CREATE = read("app/create/page.jsx");
const SET = read("app/settings/page.jsx");
const YOU = read("app/you/page.jsx");
const HIST = read("app/history/page.jsx");

console.log("\n1. THE GIVEAWAY IS OFF");
ok(/export const SIGNUP_CREDITS = 0;/.test(U), "new accounts get zero credits");
ok(U.includes("credits: SIGNUP_CREDITS,"), "and the blank account reads that one constant");
{
  const grants = (bare(U).match(/credits: \d+/g) || []).filter((m) => m !== "credits: 0");
  ok(grants.length === 0, "no other hardcoded grant crept in anywhere");
}

console.log("\n2. TWO DOORS, BOTH REAL");
ok(VER.includes('const user = await getOrCreateByIdentity("wallet", wallet);'), "a wallet opens an account");
ok(!/needs_google|getByIdentity/.test(VER), "and nothing sends anyone to Google first");
ok(!/getByIdentity/.test(U), "the resolve-without-create helper is gone, not left dangling");
ok(read("app/api/auth/google/route.js").includes("getOrCreateByIdentity"), "Google opens one too");
ok(read("app/api/auth/identities/route.js").includes("linkIdentity"), "and either can be added to the other later");

console.log("\n3. THE OFFER IS READ, NEVER WRITTEN DOWN");
{
  const offerLine = new Function(
    OFFER.slice(OFFER.indexOf("export function tokenAmount")).replace(/^export /gm, "") + "\nreturn offerLine;"
  )();
  ok(offerLine({ live: true, dailyRuns: 10, minTokens: 250000, symbol: "BANNR" })
      === "Hold 250K $BANNR for 10 free banners a day.", "reads as a sentence");
  ok(offerLine({ live: true, dailyRuns: 1, minTokens: 1000, symbol: "BANNR" })
      === "Hold 1K $BANNR for 1 free banner a day.", "and gets the singular right");
  ok(offerLine({ live: true, dailyRuns: 5, minTokens: 2_500_000, symbol: "BANNR" })
      === "Hold 2.5M $BANNR for 5 free banners a day.", "millions read as millions");
  // NULL is the case that matters: no token yet, or the gate off.
  ok(offerLine({ live: false, dailyRuns: 10, minTokens: 1 }) === null, "GATE OFF → null, so nothing promises a free tier");
  ok(offerLine({ live: true, dailyRuns: 0 }) === null, "zero runs → null");
  ok(offerLine(null) === null, "and no config at all → null");
}
ok(!/^\s*["']use client["']|server-only/.test(bare(OFFER)), "lib/offer belongs to neither side, since both need it");

console.log("\n4. NOTHING PROMISES 12 CREDITS");
for (const [name, src] of Object.entries({
  "app/page.jsx": PAGE, "components/ConnectButton.jsx": CB, "components/SinglePost.jsx": read("components/SinglePost.jsx"),
})) {
  ok(!/12 free credits|free credits/i.test(bare(src)), name + ": the old promise is gone");
}
ok(PAGE.includes("export default async function Landing()"), "the homepage is async, so it can read the gate");
ok(PAGE.includes('if (f.id === "offer" && !offer) return null;'), "the offer card is DROPPED when there is none, not softened");

console.log("\n5. ONE BUTTON, AND THE CHOICE IS IN THE DIALOG");
{
  // The sign-in surface used to be two buttons, a line under each, a
  // reversibility line and a paragraph — too big to put anywhere but
  // /create, which is why /you told people to go there to sign in.
  ok(/export default function ConnectButton/.test(CB), "one button");
  ok(CB.includes("onClick={openSignIn}"), "and it opens the dialog");
  ok(bare(CB).length < 900, "with nothing else in it (" + bare(CB).length + " chars)");
  ok(!/SignInChoice|ConnectNote|WalletSignIn|doors-note/.test(CB), "no doors, no notes, no third component");
  ok(!/Google/.test(bare(CB)), "and the button is no longer Google-specific");

  ok(SIM.includes("Continue with Phantom"), "the dialog offers Phantom");
  ok(SIM.includes("Continue with Google"), "and Google");
  {
    // Two buttons and a title. Nothing explaining what either does.
    const copy = (SIM.match(/>[A-Z][^<>{}]{12,}</g) || []).join(" ");
    ok(!/free generations|add the other|two steps|later/i.test(copy), "and explains neither: " + JSON.stringify(copy.trim().slice(0, 60)));
  }
  ok(SIM.includes("auth.armWalletDeeplink?.();"), "opening it arms the one-tap wallet path");
  ok(SIM.includes("if (auth.user) closeModal();"), "and it closes itself once signed in");
  ok(SIM.includes("if (auth.pendingSign)"), "carrying the wallet flow when one is mid-way");
}

console.log("\n5a. AND IT IS REACHABLE FROM EVERY DEAD END");
{
  ok(!/Sign in from the create page/.test(YOU), "'sign in from the create page' is GONE");
  ok(!/Go to Create/.test(YOU), "and so is the button that sent them there");
  for (const [name, src] of Object.entries({ "app/you": YOU, "app/history": HIST, "app/create": CREATE, "app/settings": SET })) {
    ok(/<ConnectButton/.test(src), name + " signs you in where you are");
  }
  ok(HIST.includes("!auth.loading && !auth.user ?"), "history tells signed-out apart from empty");
  ok(read("app/layout.jsx").includes("<Modals />"), "the dialogs are mounted once, in the layout");
  ok(MODALS.includes("if (auth.pendingSign && !getModal()) openSignIn();"),
     "and reopen themselves when a wallet redirect lands on a fresh page");
}

console.log("\n6. NOTHING TO SPEND OPENS A DIALOG, NOT A DEAD END");
{
  ok((CREATE.match(/openTopUp\(\);/g) || []).length === 2, "generate and reroll both open it");
  ok(!/Not enough credits \(need/.test(CREATE), "the old error string is gone");
  ok(!fs.existsSync(R + "components/NothingToSpend.jsx"), "and the inline notice with it");

  ok(TOP.includes("const offer = offerLine(useToken());"), "the dialog reads the live gate");
  ok(TOP.includes('offer ? "Get free generations" : "You need credits"'), "and titles itself accordingly");
  ok(TOP.includes("Connect your wallet"), "promo running: connect a wallet");
  ok(TOP.includes("Buy credits instead"), "  …with buying as the alternative");
  {
    // Promo over: one button to credits, and nothing left over that
    // mentions a token. That is the whole reason it reads the config.
    const off = TOP.slice(TOP.indexOf(") : ("));
    ok(/Buy credits/.test(off), "promo over: one button");
    ok(!/wallet|hold|token|BANNR/i.test(bare(off)), "and no trace of a token anywhere in that branch");
  }
  ok(TOP.includes("if (auth.pendingSign)"), "it carries the wallet flow when one is mid-way");
}

console.log("\n7. HOLDER RUNS STILL REACH THE CLIENT");
ok(U.includes("holderRunsLeft:"), "publicUser exposes what is left today");
ok(CREATE.includes("const freeRuns = auth.user?.holderRunsLeft || 0;"), "the create page reads it");
ok(CREATE.includes("(auth.user.holderRunsLeft || 0) <= 0 && auth.user.credits < GENERATION_COST"),
   "and a holder with zero credits is NOT stopped before the request leaves");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
