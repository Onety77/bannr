// The linked-wallet dot, and why it was grey on a desktop with
// Phantom open two inches away.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const W = read("lib/wallet.js");
const SET = read("app/settings/page.jsx");
const CSS = read("app/globals.css");

console.log("\n1. A WALLET DOES NOT VOLUNTEER ITS ADDRESS");
{
  // publicKey is null on every page load, even with the extension
  // installed, unlocked and the site already approved. Reading it
  // directly meant the answer was always "no wallet here".
  ok(W.includes("p.connect?.({ onlyIfTrusted: true })"), "so it is ASKED, with onlyIfTrusted");
  ok(/onlyIfTrusted: true \}\)\s*\.then/.test(W), "and the resolved key is what sets the address");
  ok(/\.catch\(\(\) => \{\}\)/.test(W.slice(W.indexOf("onlyIfTrusted"))), "a refusal is silent — not trusted yet is the normal case");
  ok(W.includes("if (p.publicKey) {"), "and an already-exposed key short-circuits it");
  {
    // It must not pop anything up: this runs unprompted on load.
    const eff = W.slice(W.indexOf("const p = provider();"), W.indexOf("const connect = useCallback"));
    ok(!/\.connect\(\)/.test(bare(eff)), "NOTHING calls a bare connect() on mount, which would open a popup on every page load");
    ok(!/signMessage|signAndSend/.test(bare(eff)), "and nothing asks for a signature either");
  }
}

console.log("\n2. AND IT STAYS HONEST AFTERWARDS");
{
  for (const ev of ["connect", "disconnect", "accountChanged"]) {
    ok(W.includes(`p.on?.("${ev}"`), `listens for ${ev}`);
    ok(W.includes(`p.off?.("${ev}"`), `  …and unsubscribes on unmount`);
  }
  ok(W.includes("const onDisconnect = () => setAddress(null);"), "disconnecting from the wallet's own UI clears it");
  ok(W.includes("const onAccount = (key) => setAddress(key ? key.toString() : null);"),
     "and switching accounts inside the wallet updates it, rather than describing a state that ended minutes ago");
}

console.log("\n3. THE ROW IS JUST A DOT NOW");
{
  ok(SET.includes('className={`wal-dot${walletLive ? " on" : ""}`}'), "the indicator is there");
  ok(!/not open in this browser/.test(SET.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")), "the sentence beside it is GONE from the markup");
  ok(!/connected here/.test(SET.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")), "both halves of it");
  ok(SET.includes('title={walletLive ? "Connected in this browser" : "Not open in this browser"}'),
     "the meaning survives on hover, so the dot is not decoration");
  ok(SET.includes("<span className=\"mono\">{short(linkedWallet.id)}</span>"), "the address still shows");

  // Dead styles removed rather than left to rot.
  ok(!/\.wal em/.test(CSS), "and the styles for that text are gone, not just unused");
  ok(/\.wal-dot \{/.test(CSS) && /\.wal-dot\.on \{/.test(CSS), "while the dot keeps both states");
  ok((CSS.match(/^\.wal-dot \{/gm) || []).length === 1, "declared exactly once");
}

console.log("\n4. WHAT GREEN MEANS");
{
  ok(SET.includes("const walletLive = Boolean(linkedWallet && wallet.address === linkedWallet.id);"),
     "green is THIS browser holding THAT wallet — not merely a wallet, and not merely linked");
}

console.log("\n5. THE SECOND WALLET PROMPT IS ANNOUNCED BEFORE THE FIRST TAP");
{
  const CB = read("components/ConnectButton.jsx");
  const WC = read("components/WalletContinue.jsx");
  const CR = read("app/credits/page.jsx");
  // A FIRST connection needs two wallet prompts and there is no way
  // round it: signMessage needs the session only connect returns.
  // Returning visitors get one, because the session survives and the
  // challenge is fetched before the tap — so a fixed "two taps" on
  // the button would be wrong half the time. The count moved to the
  // screen that follows, where it is always right.
  ok(!/two taps|Two steps/.test(bare(CB)), "the sign-in door does NOT claim a fixed number of taps");
  ok(read("components/SignInModal.jsx").includes("Continue with Phantom"), "the dialog just offers the two, unexplained");
  ok(SET.includes("We check the wallet you connect."), "and settings says why a wallet is wanted at all");
  ok(SET.includes("!linkedWallet && !auth.pendingSign && offer"), "  …only when there is something to gain by it");
  // It has to WRAP, not get clipped: in the value cell of the settings
  // row it sat beside the label and lost its second line to the row
  // below.
  ok(/\.wal-note-2 \{[\s\S]{0,200}display: block; width: 100%;/.test(CSS), "and it is a full-width block, not squeezed into a value cell");
  ok(/\.set-acct > div \{[\s\S]{0,300}flex-wrap: wrap;/.test(CSS), "the row wraps so it gets a line of its own");
  {
    const row = SET.slice(SET.indexOf('<span className="set-k">Wallet</span>'), SET.indexOf('<span className="set-k">Credits</span>'));
    ok(row.indexOf("wal-note-2") > row.indexOf("</span>"), "and it sits OUTSIDE the value cell in the markup");
  }
  // No door explains WHY there are two prompts, or why we need a
  // wallet at all. That is our problem, not something to teach
  // someone who wanted to press a button.
  {
    const lines = (CB.match(/<em>[^<]*<\/em>|>[A-Z][^<>{}]{15,90}</g) || []).join(" ");
    ok(!/because|the server|cannot trust|prove it to us/i.test(lines), "and no door explains WHY, which is our problem");
  }

  // The count is what turns "asking again?" into "last one".
  ok(WC.includes("Step 2 of 2"), "the second screen is numbered");
  // The purchase path has one screen now, not two: the wallet is
  // handed the whole payment at once. So it is labelled by STATE
  // rather than by step, because there is no step two to count to.
  ok(CR.includes("Waiting"), "the purchase path says where it is up to");
  ok(/\.wcont-step \{/.test(CSS), "and the count is styled to be read first");

  // Phantom's own screen is titled "Sign Message". Calling it
  // something else here makes it look like a different request.
  ok(WC.includes("Sign the message"), "the button uses Phantom's own word");
  ok(!/Approve in your wallet/.test(WC), "not a word Phantom never shows");
  ok(WC.includes("Sign to prove this wallet is yours."), "and says what the signature is FOR");

  console.log("\n5a. AND NEVER VOLUNTEERS THAT IT IS SAFE");
  {
    // Reassurance is what plants the doubt. Nobody arrives at a
    // signature worrying about cost; saying "nothing is spent" is an
    // answer to a question that only exists once they have read it.
    const AUTH = read("lib/auth.js");
    const surfaces = {
      "components/WalletContinue.jsx": WC,
      "components/ConnectButton.jsx": CB,
      "app/settings/page.jsx": SET,
      "app/credits/page.jsx": CR,
      "lib/auth.js": AUTH,
    };
    const banned = /costs? nothing|moves? nothing|nothing is (spent|sent)|no gas|does not authorise|free and safe|perfectly safe/i;
    for (const [name, src] of Object.entries(surfaces)) {
      ok(!banned.test(bare(src)), name + ": no reassurance about cost or safety");
    }
    // The signed message is shown VERBATIM inside Phantom, so it is a
    // surface like any other.
    ok(AUTH.includes('"This proves you own this wallet.",'), "the signed message states its purpose");
    ok(!/costs nothing/.test(bare(AUTH)), "  …and stops there");
    {
      const msg = AUTH.slice(AUTH.indexOf("export function buildSignInMessage"), AUTH.indexOf("// ---------- signature verification"));
      const lines = (bare(msg).match(/^\s*"[^"]*",?$/gm) || []).length;
      ok(lines <= 5, "kept short — a long message in a wallet sheet reads as fine print (" + lines + " lines)");
    }
    // The waiting panel is gone. It announced "Waiting", explained
    // that credits would arrive on their own, and offered a button to
    // dismiss itself — all of it describing machinery rather than
    // anything anyone could act on. The balance at the top of the page
    // is the answer to "did it work", and the only line worth printing
    // is the one that says it worked.
    ok(!/wcont-step">Waiting/.test(CR), "no panel narrating that a payment is in progress");
    ok(CR.includes("${out.credits} credits added. Thank you."), "the payment states the deal and stops");
  }
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
