// The buyback ledger, and the grant tool that replaced a hole.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const B = read("lib/buybacks.js");
const ADMINR = read("app/api/admin/buyback/route.js");
const PUB = read("app/api/buybacks/route.js");
const PAGE = read("components/TokenView.jsx");
const GRANT = read("app/api/admin/grant/route.js");
const ADMINJS = read("lib/admin.js");

// Load the pure maths out of buybacks.js with a fake tx.
const M = new Function(
  B.replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
  "\nreturn { solSpent, tokensGained, tokensBurned, INCINERATOR, SOURCES };"
)();

const MINT = "MintAAA";
const WALLET = "TreasuryAAA";

const tx = ({ keys = [], pre = [], post = [], preTok = [], postTok = [] }) => ({
  transaction: { message: { accountKeys: keys } },
  meta: { preBalances: pre, postBalances: post, preTokenBalances: preTok, postTokenBalances: postTok },
});

console.log("\n1. AMOUNTS COME OFF THE CHAIN, NOT OFF A FORM");
{
  ok(!/amount|sol\s*[:=]\s*Number\(body/.test(bare(ADMINR)), "the admin route never reads an amount from the request");
  ok(ADMINR.includes("signature: String(body.signature"), "only a signature");
  ok(ADMINR.includes("mint: gate.mint"), "and the mint comes from the gate config, not the caller");
  ok(B.includes("export async function inspect"), "the figures are read by inspecting the transaction");
}

console.log("\n2. THE MATHS");
{
  // 2 SOL out of the treasury (1e9 lamports = 1 SOL).
  const t = tx({ keys: [WALLET], pre: [3e9], post: [1e9] });
  ok(M.solSpent(t, WALLET) === 2, "SOL spent is the balance delta, not a parsed instruction");
  ok(M.solSpent(t, "SomeoneElse") === 0, "a wallet not in the transaction spent nothing");
  // Money coming IN must never read as a buyback.
  ok(M.solSpent(tx({ keys: [WALLET], pre: [1e9], post: [3e9] }), WALLET) === 0,
     "and a transaction that PAYS the wallet counts as zero spent");
}
{
  const t = tx({
    keys: [WALLET],
    preTok: [{ mint: MINT, owner: WALLET, accountIndex: 0, uiTokenAmount: { uiAmount: 100 } }],
    postTok: [{ mint: MINT, owner: WALLET, accountIndex: 0, uiTokenAmount: { uiAmount: 1100 } }],
  });
  ok(M.tokensGained(t, WALLET, MINT) === 1000, "tokens gained is also a delta");
  ok(M.tokensGained(t, WALLET, "OtherMint") === 0, "and only for OUR mint — another token in the same swap is ignored");
}

console.log("\n3. A BURN IS A BURN EITHER WAY");
{
  // Sent to the incinerator: it shows up as a gain there.
  const sent = tx({
    keys: [M.INCINERATOR],
    preTok: [{ mint: MINT, owner: M.INCINERATOR, accountIndex: 0, uiTokenAmount: { uiAmount: 0 } }],
    postTok: [{ mint: MINT, owner: M.INCINERATOR, accountIndex: 0, uiTokenAmount: { uiAmount: 500 } }],
  });
  ok(M.tokensBurned(sent, MINT) === 500, "transfer to the incinerator counts");

  // A real burn instruction destroys supply — NO account gains, so a
  // gain-based check alone would report zero and silently under-count.
  const burned = tx({
    keys: [WALLET],
    preTok: [{ mint: MINT, owner: WALLET, accountIndex: 0, uiTokenAmount: { uiAmount: 800 } }],
    postTok: [{ mint: MINT, owner: WALLET, accountIndex: 0, uiTokenAmount: { uiAmount: 300 } }],
  });
  ok(M.tokensBurned(burned, MINT) === 500, "and so does a burn instruction, which nobody gains from");
  ok(M.tokensBurned(tx({}), MINT) === 0, "an unrelated transaction burns nothing");
}

console.log("\n3a. A SWAP AND A BURN ARE TWO TRANSACTIONS");
{
  // Each is logged on its own, and each row says what ITS transaction
  // did. A row reading "0 SOL → 2.8M" or "12 SOL → 0" looks like a
  // fault rather than like half of a pair.
  ok(B.includes('const kind = bought && burned ? "both" : burned ? "burn" : "buy";'),
     "the ledger records which of the three a transaction was");
  ok(PAGE.includes('e.kind === "burn"') && PAGE.includes('e.kind === "both"'), "and the page renders each differently");
  ok(read("components/AdminBuybacks.jsx").includes("Log the swap and the burn separately"),
     "admin says to log both");

  // Before the first burn, the headline must not read zero while rows
  // show real tokens.
  ok(PAGE.includes("product?.burned\n                  ? <>{big(product.burned)}"),
     "the headline shows burned when there is any");
  ok(PAGE.includes("<>{big(product?.bought)} {sym} bought</>"),
     "and bought before the first burn, rather than standing at zero");
}

console.log("\n3b. READ IT BACK BEFORE COMMITTING");
{
  const AB = read("components/AdminBuybacks.jsx");
  // The kind is detected, not chosen, so the preview is the only
  // moment to see the transaction was understood the way it was meant.
  ok(ADMINR.includes('const sig = (url.searchParams.get("sig") || "").trim();'), "GET can inspect one signature");
  // Was pinned to the exact line. It returns the commitment alongside
  // the ledger now, so the assertion is on the behaviour: no signature
  // means the ledger comes back rather than an inspection.
  ok(/if \(!sig\) \{[\s\S]*?await ledger\(200\)/.test(ADMINR), "and still returns the ledger without one");
  ok(/promise: g\.buybackPct > 0 \? await commitment/.test(ADMINR),
     "with what is still owed, which is the question the panel is open to answer");
  ok(!/db.collection\("buybacks"\).doc/.test(ADMINR), "the preview records NOTHING — that is the point");
  ok(ADMINR.includes("const already = entries.some"), "and says when a signature is already logged");

  ok(AB.includes("const [look, setLook] = useState(null);"), "the form holds what it read");
  ok(AB.includes("}, [sig, source, user]);"), "re-reading when the SOURCE changes too");
  ok(AB.includes("if (s.length < 80 || !user) return;"), "not firing at every keystroke of a paste");
  ok(/setTimeout\(async \(\) => \{/.test(AB), "debounced");
  ok(AB.includes("disabled={busy || looking || !look || look.already}"),
     "and Log it is disabled until something has actually been read");
  ok(AB.includes("<b>Swap</b>") && AB.includes("<b>Burn</b>") && AB.includes("<b>Swap and burn</b>"),
     "all three kinds are named back");
  ok(AB.includes("check the source above"),
     "and 0 SOL says the likely cause rather than leaving a zero to puzzle over");
  ok(AB.includes("setLook(null);\n      setData(d);"), "the preview clears once logged");
}

console.log("\n4. THE TWO SOURCES ARE NEVER SUMMED");
{
  ok(/SOURCES = \["product", "fees"\]/.test(B), "there are exactly two");
  ok(B.includes("product: { sol: 0, bought: 0, burned: 0, count: 0 }"), "each totalled separately");
  // One helper, used by BOTH the preview and the record — otherwise
  // the form could show a figure read against one wallet and store a
  // figure read against another.
  ok(ADMINR.includes('return source === "fees"'), "the WALLET is chosen by source");
  ok(ADMINR.includes("wallet: walletFor(body.source)"), "  …by the same rule when recording");
  ok(ADMINR.includes("wallet: walletFor(url.searchParams.get(\"source\"))"), "  …as when previewing");
  ok(/DEV_WALLET/.test(ADMINR) && /TREASURY_WALLET/.test(ADMINR),
     "fees from the dev wallet, product from the treasury — different addresses");
  // The whole argument of the page depends on them staying apart.
  ok(!/totals\.product\.sol \+ totals\.fees\.sol|product \+ fees/.test(bare(PAGE)), "the page never adds them together");
  ok(PAGE.includes("From banners sold") && PAGE.includes("From trading fees"), "and labels which is which");
  ok(PAGE.indexOf("From banners sold") < PAGE.indexOf("From trading fees"),
     "with the product line FIRST — it is the one that cannot be copied");
  ok(PAGE.includes("tok-line-lead"), "and given the visual weight, though it is the smaller number");
}

console.log("\n5. IT IS RECORDED SO IT CANNOT DOUBLE-COUNT");
ok(B.includes('db.collection("buybacks").doc(found.signature)'), "keyed by signature, so logging one twice is a no-op");
ok(B.includes("orderBy(\"ts\", \"desc\")") && !/\.where\(/.test(bare(B)), "read with one orderBy and no where() — no composite index");

console.log("\n6. THE PUBLIC PAGE SHOWS NOTHING UNTIL THERE IS SOMETHING");
ok(PUB.includes("live: entries.length > 0"), "live only once something is logged");
ok(PAGE.includes("d?.live ?"), "and the page respects it");
ok(PAGE.includes("Nothing burned yet"), "showing an empty state rather than a row of zeros");
ok(PUB.includes("mint: t.mint"), "the address still comes from publicGate, so it cannot leak before announcement");
{
  const rows = PAGE.slice(PAGE.indexOf("tok-log"));
  ok(/solscan\.io\/tx\/\$\{e\.signature\}/.test(rows), "every row opens on-chain");
}

console.log("\n6a. IT IS REACHABLE, AND IT UNFURLS");
{
  const BAR = read("components/TokenBar.jsx");
  const CSSF = read("app/globals.css");
  const SHELL = read("app/token/page.jsx");
  const VIEW = read("components/TokenView.jsx");

  ok(BAR.includes('<Link className="tbar-more" href="/token">'), "the token bar links to it");
  // GENERAL, because the page is. It was "Buybacks and burns", which
  // named one half of a page that also carries the performing-token
  // list — underselling the other half, and guaranteed to go stale
  // again the next time something lands there.
  ok(/>\s*Token page/.test(BAR), "labelled for the page, not for one section of it");
  ok(!BAR.includes("Buybacks and burns</Link>"), "and the old section-specific label is gone");

  // ══ IT IS A ROW NOW, NOT THREE THINGS ON A BASELINE ══
  //
  // .tbar had no layout at all: a plain block with three inline
  // elements of three different sizes flowing on a text baseline,
  // spaced by margin-top guesses. The address sat tall, the market cap
  // short and low beside it, and the way through was bare underlined
  // text with no shape. It read as an afterthought because it was one.
  ok(/\.tbar-row \{\s*display: inline-flex; flex-wrap: wrap;\s*align-items: stretch; justify-content: center;/.test(CSSF),
     "the bar is a real row — one gap, and stretch so the chips share a height");
  // INLINE-level, and this is the bit that was wrong the first time.
  // As a block it ignored text-align and pinned itself left while the
  // whole hero above it was centred. Inline means it obeys whatever
  // alignment its container already has — centred in the hero, hard
  // left under the left-aligned heading on /token — with no flag to
  // pass and nothing to forget at a third call site.
  ok(!/\.tbar-row \{\s*display: flex;/.test(CSSF), "and inline-level, so it follows its container's alignment");
  ok(!/\.tbar-ca \{ flex: 1 1 100%/.test(CSSF), "with no forced full-width override fighting that");
  ok(/\.tbar-more \{[\s\S]{0,200}?border-radius: var\(--pill/.test(CSSF),
     "the way through is shaped like its neighbours");
  ok(!/\.tbar-more \{[\s\S]{0,200}?border-bottom: 1px solid/.test(CSSF), "  not an underline");
  ok(!/\.tbar-live \{[\s\S]{0,120}?margin-top: 8px/.test(CSSF), "and the margin-top spacing hacks are gone");
  // The perk is a sentence, so it must not be pulled into the row.
  ok(BAR.indexOf('className="tbar-perk"') > BAR.indexOf("</div>"), "the perk line stays outside the row");
  ok(!/Where the money goes/.test(bare(BAR) + bare(PAGE) + bare(SHELL)), "and the braggier line is gone everywhere");
  ok(SHELL.includes("buybacks and burns`"), "and so does the unfurl title");
  // The CA belongs where someone is deciding about the token, not
  // where they are buying credits.
  ok(!/<TokenBar/.test(read("app/credits/page.jsx")), "no contract address on the credits page");
  ok(/<TokenBar/.test(read("app/page.jsx")) && /<TokenBar/.test(read("components/FeedRail.jsx")),
     "still on the homepage and the feed rail");
  {
    // The bar is a BUTTON whose whole job is copying the address —
    // wrapping it in a link would hand that action to a page.
    const btn = BAR.slice(BAR.indexOf('className="tbar-ca"'), BAR.indexOf("</button>"));
    ok(!/<Link|href=/.test(btn), "without wrapping the copy button");
    ok(BAR.indexOf('className="tbar-ca"') < BAR.indexOf('className="tbar-more"'), "and sitting after it");
  }

  // The unfurl is the point of the page — it exists to be pasted.
  ok(!/"use client"/.test(SHELL), "the page itself is a server component");
  ok(SHELL.includes("export async function generateMetadata"), "so it can carry metadata");
  ok(VIEW.includes('"use client"'), "with the live view split out as a client one");
  ok(SHELL.includes("<TokenView />"), "and rendered by it");
  ok(/openGraph:/.test(SHELL) && /twitter:/.test(SHELL), "both unfurl formats declared");
  ok(SHELL.includes("summary_large_image"), "as a large card");

  // The numbers go IN the preview, so it reads without being opened.
  ok(/big\(burned\)/.test(SHELL) && /sol\(spent\)/.test(SHELL), "the description carries the real totals");
  ok(SHELL.includes("came from banners people bought"), "and names the product line separately — that is the argument");
  ok(SHELL.includes("if (entries.length) {"), "falling back to a standing line when nothing is logged yet");
  ok(/catch \{/.test(SHELL), "and never failing the page over metadata");
  {
    const big = new Function("const big = " + SHELL.match(/const big = ([\s\S]*?);\nconst sol/)[1] + "; return big;")();
    ok(big(2_800_000) === "2.8M", "2,800,000 reads as 2.8M");
    ok(big(31_000_000) === "31M", "and 31,000,000 as 31M");
    ok(big(450) === "450", "small numbers stay whole");
  }
}

console.log("\n6b. TOKENS MADE WITH BANNR");
{
  const D = read("lib/directory.js");
  const RAIL = read("components/FeedRail.jsx");
  const STATS = read("lib/stats.js");

  // Not a second feed — the same posts, asked a different question.
  ok(D.includes('db.collection("posts").orderBy("ts", "desc")'), "reads the SAME posts, not a new collection");
  ok(!/\.where\(/.test(bare(D)), "over-fetched and filtered in memory — no composite index");
  ok(D.includes("if (!p?.ca || p.hidden) continue;"), "only posts with a contract address, and nothing hidden");
  ok(D.includes("if (byCa.has(p.ca)) continue;"), "one row per TOKEN, not per banner");

  // MARKET CAP is the floor, because it is the number people can
  // state — "you're under 15k" is an answer someone can act on, and
  // an invisible rule on a public page reads as favouritism.
  ok(D.includes("t.marketCap >= floor"), "market cap is the floor");
  ok(D.includes("gate?.dirMinMarketCap"), "read from the gate config, so it is tunable without a deploy");
  ok(/dirMinMarketCap: 15000/.test(read("lib/tokenGate.js")), "defaulting to 15k");
  ok(/dirMinMarketCap: \{ min: 0, max: 1e9 \}/.test(read("lib/tokenGate.js")), "and clamped like every other gate number");
  ok(read("components/AdminToken.jsx").includes('set("dirMinMarketCap"'), "with a field on the Token tab");
  // The liquidity check stays, doing a different job.
  ok(D.includes("MIN_LIQUIDITY_USD = 1_000"), "a low liquidity floor survives as a corpse guard");
  ok(D.includes("t.liquidity >= MIN_LIQUIDITY_USD"), "  …applied alongside it");
  ok(D.includes("sort((a, b) => b.marketCap - a.marketCap)"), "sorted by size");
  // Live, not stored: falls off below the floor, returns above it.
  // FIRESTORE writes, not Map.set — the module is full of the latter.
  ok(!/\.doc\([^)]*\)\.(set|update)\(|collection\([^)]*\)\.add\(/.test(bare(D)),
     "nothing about who qualified is written down — the list is a view, recomputed live");
  ok(D.includes("MAX_ROWS = 12") && D.includes("slice(0, MAX_ROWS)"), "capped — a highlight reel, not a census");
  ok(D.includes("prev.liquidity >= liq"), "and the deepest pair wins when a token trades on several");

  // One upstream request per 30 addresses, and one bad chunk must not
  // empty the page.
  ok(D.includes("BATCH = 30"), "batched to DexScreener's limit");
  ok(/for \(let i = 0; i < addresses\.length; i \+= BATCH\)/.test(D), "so a full page is one call");
  ok(/catch \{[\s\S]{0,120}\}\s*\}\s*return out;/.test(D), "a failed chunk is skipped, not fatal");

  // It claims made-here, never displayed-there.
  ok(!/info\.header|header/.test(bare(D)), "it never claims DEX Screener is showing our banner");

  // ── the second source ──
  // Most banners are never posted: people download them and put them
  // straight on DEX Screener, and the projects least likely to stop
  // and post are the real launches. Posts alone would under-represent
  // exactly the tokens worth showing.
  const ATT = read("app/api/admin/attach/route.js");
  ok(D.includes('db.collection("generations").orderBy("ts", "desc")'), "generations are a second source");
  ok(D.includes('take(posts, "post");') && D.includes('take(gens, "attached");'), "both feed the same map");
  ok(D.indexOf('take(posts, "post");') < D.indexOf('take(gens, "attached");'),
     "posts FIRST, so a published banner beats an attached one for the same token");
  ok(D.includes("if (byCa.has(p.ca)) continue;"), "and a token still appears once");
  ok(D.includes("for (const [ca, t] of byCa) if (!t.src) byCa.delete(ca);"), "anything with no image is dropped");

  ok(ATT.includes("requireAdmin(req)"), "attaching is admin-only");
  ok(ATT.includes("CA_SHAPE.test(ca)"), "and shape-checked — free text here becomes a link on a public page");
  ok(ATT.includes('ca: ca || ""'), "an empty value detaches");
  ok(ATT.includes("caBy: ca ? admin.email"), "who attached it is recorded");
  ok(/publishing is a deliberate act|already public/i.test(ATT), "and the bar for using it is written down");
  ok(read("components/AttachCa.jsx").includes('placeholder="Live on DEX as… (contract address)"'),
     "the field says the bar rather than just asking for an address");

  // Cumulative, not daily — a daily figure can read 4 on a slow day.
  ok(STATS.includes("export async function madeTotal"), "the banners-made total exists");
  ok(!/dayKey\(\)/.test(STATS.slice(STATS.indexOf("madeTotal"), STATS.indexOf("export async function recent"))),
     "and is lifetime, not today");

  // ONE ROW IS ENOUGH. This was `>= 4`, on the theory that a short
  // list argues nothing. What it actually did was gate the TAB as
  // well as the list, so the whole section disappeared — no button,
  // no heading — the day an unrelated token fell under the market-cap
  // floor and the count went 4 to 3. A $28M token was on the page and
  // invisible, and nothing distinguished that from a bug.
  ok(PAGE.includes("const hasTokens = d?.tokens?.length >= 1;"),
     "the section shows from one token, not four");
  ok(/\.tok-grid > :only-child \{ grid-column: 1 \/ -1; \}/.test(read("app/globals.css")),
     "and a lone row spans the grid instead of floating in half of it");
  // The tab and the panel must stay on the SAME condition — the
  // failure was a tab that could not exist for a view that did.
  ok((PAGE.match(/hasTokens/g) || []).length >= 3, "tab and panel share one condition");
  ok(RAIL.includes("tokens.length >= 4 &&"), "same threshold in the rail");
  ok(RAIL.includes('fetch("/api/buybacks")'), "which reads the SAME endpoint, so the two cannot disagree");
  ok(RAIL.includes('href="/token">All of them'), "and links through rather than repeating the page");
  {
    // No second SECTION on the feed. The style chips there are a
    // tablist too and a legitimate one, so this checks for the
    // directory itself rather than for the word "tab".
    const FEED = read("app/feed/page.jsx");
    ok(!/Live tokens|tok-grid|Tokens made with/.test(FEED), "the feed grew no second section");
    ok(!/surface-tabs/.test(FEED), "and no surface tabs — that pattern is for two jobs, not two audiences");
  }
  ok(PAGE.indexOf("Tokens made with bannr") < PAGE.indexOf("d?.live ?"),
     "proof sits ABOVE the burn totals — it is what makes them mean anything");
}

console.log("\n6c. THE PAGE OPENS ON WHAT IT IS FOR");
{
  ok(PAGE.includes('const [view, setView] = useState("money");'), "buybacks are the default view");
  ok(PAGE.includes('className="surface-tabs"'), "and the token list is behind a switch");
  ok(PAGE.includes("Performing tokens"), "labelled so it reads as the ones doing well");
  ok(PAGE.includes("{hasTokens && ("), "the switch only appears when there is something to switch to");
  ok(PAGE.includes("above {usd(d.floor || 15000)} market cap"), "and the bar is stated, from the live config");
  // The bar itself is worth stating — a project that is missing can
  // read why instead of assuming favouritism. That it recomputes on
  // every read is our mechanism and was cut.
  ok(!PAGE.includes("come back if they recover"), "without explaining the mechanism behind it");
  ok(!/<p>Every buyback and burn, on-chain\.<\/p>/.test(PAGE), "no subtitle restating the page you are on");
  ok(read("app/api/buybacks/route.js").includes("floor: dir.floor || 0"), "the floor reaches the client");
  ok(read("app/api/buybacks/route.js").includes("s-maxage=30"), "and the page refreshes every 30s, not 60");
}

console.log("\n6d. THE LIVE MARKET CAP");
{
  const PR = read("app/api/token/price/route.js");
  const UP = read("lib/usePrice.js");
  const BAR = read("components/TokenBar.jsx");

  // Polling is only cheap because the CDN answers almost all of it.
  ok(PR.includes("s-maxage=5"), "cached 5s at the edge");
  ok(UP.includes("const EVERY = 5000;"), "polled every 5s");
  ok(!/no-store/.test(PR.slice(PR.indexOf("NextResponse.json"))), "so upstream load does not grow with traffic");
  ok(PR.includes("status: 204") && PR.includes("!t.announced"), "204 until the token is announced");
  ok(PR.includes("Number(p.liquidity?.usd || 0) > Number(best.liquidity?.usd || 0)"), "the deepest pair is the honest price");

  // One timer for the page, not one per component.
  ok(UP.includes("const subs = new Set();") && UP.includes("let timer = null;"), "one poller, shared");
  ok(UP.includes("if (!subs.size && timer)"), "stopped when the last subscriber leaves");
  ok(UP.includes("document.hidden"), "and paused on a hidden tab");
  ok(UP.includes('document.addEventListener("visibilitychange", onVis)'), "catching up when it returns");
  ok(/catch \{[\s\S]{0,200}\}\s*\}/.test(UP), "a dropped request keeps the last figure rather than blanking it");

  ok(BAR.includes("const price = usePrice();"), "the token bar carries it");
  ok(BAR.includes("{price?.marketCap > 0 && ("), "and renders nothing until there is a price");
  ok(/font-variant-numeric: tabular-nums/.test(read("app/globals.css").slice(read("app/globals.css").indexOf(".tbar-live {"))),
     "tabular figures, so a ticking number does not jiggle what is beside it");
  {
    // Sliced to the function's own closing brace rather than to
    // whatever happens to follow it — a comment added between the two
    // should not break the test.
    const from = BAR.indexOf("const usd = (n) => {");
    const body = BAR.slice(from, BAR.indexOf("\n};", from) + 3);
    const usd = new Function(body + "\nreturn usd;")();
    ok(usd(312_481) === "$312K", "312,481 reads as $312K");
    ok(usd(1_240_000) === "$1.24M", "and 1.24M as $1.24M");
    ok(usd(12_000_000) === "$12M", "12M drops the decimals");
    ok(usd(2_000_000) === "$2M", "and a round 2M does not read as $2.00M");
  }
}

console.log("\n6e. SWITCHING VIEWS IS FELT, NOT WATCHED");
{
  const CSS = read("app/globals.css");
  const CR = read("app/create/page.jsx");
  const AD = read("app/admin7731/page.jsx");

  ok(/@keyframes view-in/.test(CSS), "one animation for the whole app");
  {
    const rule = CSS.slice(CSS.indexOf(".swap {"), CSS.indexOf("}", CSS.indexOf(".swap {")));
    // Must start with a DIGIT: `[\d.]+s` happily matched the leading
    // "." of ".swap" followed by the "s" of "swap", giving NaN.
    const ms = Number((rule.match(/(\d[\d.]*)s\b/) || [])[1]) * 1000;
    ok(ms >= 200 && ms <= 320, "long enough to register, short enough never to wait for (" + ms + "ms)");
  }
  {
    const kf = CSS.slice(CSS.indexOf("@keyframes view-in"), CSS.indexOf("}", CSS.indexOf("to   { opacity")));
    const px = Number((kf.match(/translateY\((\d+)px\)/) || [])[1]);
    ok(px >= 8 && px <= 16, "and enough rise to be seen, not a slide (" + px + "px)");
    ok(!/scale|rotate|perspective|rotateY/.test(kf), "no flips, no zooms — the transition is not the thing anyone came for");
  }
  ok(/prefers-reduced-motion[\s\S]{0,200}\.swap \{ animation: none/.test(CSS), "and it is off for reduced motion");

  // Applied where a view actually swaps.
  ok(PAGE.includes('key="tokens"') && PAGE.includes('key="money"'), "/token switches with it");
  ok(AD.includes('className="swap" key="token"'), "so do the admin tabs");
  ok(CR.includes('<div className="swap" key="x"><XComingSoon /></div>'), "and the X surface on create");

  // The one place it is deliberately NOT applied.
  ok(CR.includes('<div className="create-grid" hidden={surface !== "dex"}>'),
     "but NOT the brief, which is hidden rather than unmounted");
  ok(!/create-grid[^>]*key=/.test(CR),
     "  …and is never keyed — remounting to replay a fade would reset the panels inside it");

  ok(/\.surface-tabs button:active[\s\S]{0,80}transform: scale\(0\.97\)/.test(CSS), "and a pressed tab feels pressed");
}

console.log("\n6f. THE LINK IS NOT SHOWN ON THE PAGE IT POINTS AT");
{
  const BAR = read("components/TokenBar.jsx");
  ok(BAR.includes("hideMore = false"), "the bar takes a flag");
  ok(/\{!hideMore && \(\s*<Link className="tbar-more"/.test(BAR), "which drops the link");
  ok(PAGE.includes("<TokenBar hideMore />"), "and /token passes it");
  ok(read("app/page.jsx").includes("<TokenBar />"), "while the homepage still shows it");
}

console.log("\n7. THE BACKDOOR IS GONE, AND WHAT REPLACED IT IS BETTER");
{
  ok(!fs.existsSync(R + "app/api/dev/grant/route.js"), "/api/dev/grant is deleted");
  ok(!fs.existsSync(R + "app/api/dev"), "and the whole dev folder with it");
  ok(!/TEST_CREDIT_EMAILS|canMintTestCredits/.test(bare(ADMINJS)), "the four-address mint list is gone");
  ok(!/NEXT_PUBLIC_ENABLE_TEST_CREDITS/.test(read("app/credits/page.jsx")), "and the flag that switched it on");

  // The replacement is the opposite in every way that mattered.
  ok(GRANT.includes("requireAdmin(req)"), "admin-verified server-side, not by an env flag");
  ok(GRANT.includes('String(body.to || "")'), "credits go to a NAMED recipient");
  ok(!/session\.accountId/.test(GRANT), "NOT to whoever called it — that was the bug");
  ok(GRANT.includes('db.collection("grants").add('), "and every grant is written down");
  ok(/reason/.test(GRANT) && /by: admin\.email/.test(GRANT), "with a reason and who did it");
  ok(GRANT.includes("Math.min(Math.max(parseInt(body.amount, 10) || 0, 1), MAX_GRANT)"), "amount is clamped");
  ok(GRANT.includes("accountForHandle"), "and a handle resolves to an account, since that is what an admin has");
}

console.log("\n8. THE PAYMENT FIELD THAT HAD DRIFTED");
{
  const CLAIM = read("app/api/pay/claim/route.js");
  ok(CLAIM.includes("amountSol: sol,"), "the claim route writes the webhook's field name too");
  ok(B.includes("Number(p.sol ?? p.amountSol ?? 0)"), "and revenue reads either spelling");
  ok(read("app/api/settings/route.js").includes("amountSol"), "which is what /settings was reading all along");
}

console.log("\n9. THE COMMITMENT IS ARITHMETIC, NOT A SLOGAN");
let weekly = Promise.resolve();
{
  // lastSevenDays is pure when it is handed the rows, so this runs
  // the shipped function rather than a description of it.
  const week = new Function(
    "ledger",
    B.replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") + "\nreturn lastSevenDays;"
  )(async () => ({ entries: [] }));

  const now = Date.now();
  const day = 24 * 3600_000;
  // ══ THE EXIT HAS TO WAIT FOR THIS ══
  //
  // lastSevenDays is async, and the first version of this block ran it
  // in a bare `(async () => {...})()`. process.exit() at the bottom of
  // the file is synchronous, so it fired before the microtask ever
  // ran: three assertions that reported nothing, failed nothing, and
  // looked exactly like passing. The suite's own warning about
  // vacuously-true assertions, arrived at from a new direction. The
  // promise is exported and the final report awaits it.
  weekly = (async () => {
    const rows = [
      { ts: now - 1 * day, source: "product", sol: 2, bought: 1000, burned: 1000 },
      { ts: now - 6 * day, source: "product", sol: 1, bought: 500, burned: 0 },
      { ts: now - 9 * day, source: "product", sol: 50, bought: 99999, burned: 99999 },
      { ts: now - 2 * day, source: "fees", sol: 30, bought: 8000, burned: 8000 },
    ];
    const w = await week(rows);
    ok(w.sol === 3, "the weekly figure counts only the last seven days (got " + w.sol + ")");
    ok(w.count === 2, "two rows, not four");
    // Fee buybacks are circular and traders discount them correctly.
    // Letting a busy trading week discharge a promise made about
    // customer revenue is the specific dishonesty this prevents.
    ok(w.burned === 1000, "AND ONLY PRODUCT REVENUE — a fee buyback cannot pay off a product promise");
  })();

  ok(/export async function commitment/.test(B), "the promise is computed, not stated");

  // ══ THE SAME SOL MUST NEVER BE TAXED TWICE ══
  //
  // Run the real commitment() against a fake Firestore. The obvious
  // implementation tracks "revenue since the last buyback" and needs a
  // marker moved on every one; anything that puts the marker wrong —
  // a buyback logged late, two out of order, one deleted — silently
  // re-taxes or skips a stretch of revenue and nothing looks wrong.
  // This holds no marker: both sides are recomputed from the totals,
  // so the answer is a subtraction rather than a running tally.
  const fakeDb = (payments, buybacks) => ({
    collection: (name) => ({
      limit: () => ({
        get: async () => {
          const rows = name === "payments" ? payments : buybacks;
          return { docs: rows.map((r) => ({ data: () => r })), size: rows.length };
        },
      }),
    }),
  });
  // Only getAdminDb is injected. SOURCES is declared by the module
  // itself, and passing it as a parameter too collides with that
  // declaration — the module has to be loaded as it is written.
  const commitmentWith = (payments, buybacks) =>
    new Function(
      "getAdminDb",
      B.replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") + "\nreturn commitment;"
    )(() => fakeDb(payments, buybacks));

  weekly = weekly.then(async () => {
    const pay = (sol) => ({ sol, usd: 0 });
    const buy = (sol, source = "product") => ({ sol, source });

    {
      const c = await commitmentWith([pay(10)], [])(30, 1);
      ok(c.owedSol === 3, "30% of 10 SOL earned is 3 owed");
      ok(c.outstandingSol === 3, "and all of it outstanding before any buyback");
      ok(c.nudgeAt === 0.3, "the trigger is 1 SOL earned at 30% = 0.3 owed");
      ok(c.due === true, "3 owed is past 0.3, so it is due");
    }
    {
      // The exact worry: does more revenue re-tax what was already
      // bought back? owed climbs to 30% of the NEW total and the
      // buyback stays subtracted, so each SOL is counted once.
      const c = await commitmentWith([pay(10), pay(10)], [buy(3)])(30, 1);
      ok(c.owedSol === 6, "another 10 SOL earned takes owed to 6, not to 9");
      ok(c.outstandingSol === 3, "AND THE 3 ALREADY BOUGHT STAYS SUBTRACTED — the first 10 is not taxed twice");
    }
    {
      // Order must not matter, because a marker-based version is
      // exactly where order starts mattering.
      const a = await commitmentWith([pay(4), pay(6)], [buy(1), buy(2)])(30, 1);
      const b = await commitmentWith([pay(6), pay(4)], [buy(2), buy(1)])(30, 1);
      ok(a.outstandingSol === b.outstandingSol, "logging buybacks out of order changes nothing");
      ok(a.outstandingSol === 0, "10 earned, 3 owed, 3 bought — square");
      ok(a.due === false, "and nothing owed is not due");
    }
    {
      // Overshooting carries forward and suppresses the nudge until
      // new revenue catches up, rather than being lost.
      const c = await commitmentWith([pay(10)], [buy(5)])(30, 1);
      ok(c.aheadSol === 2 && c.outstandingSol === 0, "buying more than owed banks the surplus");
      ok(c.due === false, "and does not ask for more");
    }
    {
      // Fee buybacks are circular; letting one discharge a promise
      // made about customer revenue is the specific dishonesty here.
      const c = await commitmentWith([pay(10)], [buy(3, "fees")])(30, 1);
      ok(c.outstandingSol === 3, "A FEE BUYBACK DOES NOT PAY OFF THE PRODUCT COMMITMENT");
    }
    {
      const c = await commitmentWith([pay(0.5)], [])(30, 1);
      ok(c.outstandingSol === 0.15 && c.due === false,
         "under the threshold it is owed but not yet worth swapping");
      // A threshold of 0 would mean permanently due, which is not a
      // cadence — it is a warning light nobody reads.
      ok((await commitmentWith([pay(0.5)], [])(30, 0)).due === false, "and no threshold set is never due");
    }
  });
  // A promise measured only by its running total rots quietly upward.
  ok(/spentBySource/.test(B), "spend is summed across the WHOLE ledger, not the page being displayed");
  // Everything from one export to the next. Crude, and enough to ask
  // "what does THIS function do" without matching a neighbour's code.
  const fn = (name) => {
    const i = B.indexOf(name);
    if (i < 0) return "";
    const j = B.indexOf("\nexport ", i + name.length);
    return B.slice(i, j < 0 ? B.length : j);
  };
  ok(!/limit\(100\)/.test(fn("export async function spentBySource")),
     "so pagination cannot make a kept promise read as broken");
  ok(/usd \+= Number\(p\.usd \?\? 0\)/.test(B), "revenue carries the dollars it was actually priced at");
  ok(!/solUsd|rate\b/.test(bare(fn("export async function productRevenue"))),
     "and never reconstructs them from today's rate, which would move the published figure with SOL");

  const VIEW = bare(read("components/TokenView.jsx"));
  ok(/d\.promise &&/.test(VIEW), "the page states it only when a percentage is published");
  ok(/outstandingSol > 0/.test(VIEW), "and says so when it is behind, which is what makes it checkable");

  const PUB = read("app/api/buybacks/route.js");
  ok(/t\.buybackPct > 0 \? await commitment/.test(PUB), "0% publishes nothing rather than a claim nobody made");
}

console.log("\n10. THE LAUNCH CHECK REPORTS PRESENCE, NEVER VALUES");
{
  const L = read("app/api/admin/launch/route.js");
  const b = bare(L);
  ok(/requireAdmin\(req\)/.test(b), "admin-verified on every call");

  // ══ THE RULE THIS PAGE LIVES OR DIES BY ══
  //
  // An admin session is a Google account, and a page that renders
  // secrets is one screenshot away from leaking them. Every env var
  // must reach the response as a boolean — no key, no wallet address,
  // not even a masked prefix.
  const refs = [...b.matchAll(/process\.env\.([A-Z_0-9]+)/g)].map((m) => m[0]);
  ok(refs.length > 0, "it does read the environment");
  // THE FIRST VERSION OF THIS ASSERTION WAS USELESS, and proving it
  // was what caught that: it asked whether each variable was wrapped
  // in Boolean() ANYWHERE in the file, so a var read safely on one
  // line and leaked raw on the next still passed. Injecting exactly
  // that bug produced zero failures.
  //
  // What matters is not how a value is read but what is ASSIGNED, so
  // the rule is now about the shape of the response: no property may
  // take a raw env value. A ternary is fine — it yields a string we
  // wrote, never the secret.
  //
  // A ternary is safe — `detail: process.env.X ? "Set." : "Missing."`
  // yields a sentence we wrote, never the secret — so the check looks
  // at what FOLLOWS the variable rather than trying to express that in
  // one pattern. Two attempts at a pure regex passed a real leak and
  // then flagged a safe line; reading the next characters in JS is
  // both shorter and actually right.
  // `\s*.` rather than a fixed window: the `?` of a ternary is usually
  // on the NEXT line after indentation, and a four-character lookahead
  // never reached it — which flagged every safe line in the file.
  const leaks = [...b.matchAll(/\b(?:ok|detail|fix|label|id)\s*:\s*process\.env\.[A-Z_0-9]+(\s*.)/g)]
    .filter((m) => m[1].trim() !== "?");
  ok(leaks.length === 0,
     "AND NO FIELD IS EVER ASSIGNED A RAW ENV VALUE — every one is a boolean or a sentence");
  // Belt and braces: nothing interpolates an env var into a string.
  ok(!/\$\{process\.env\./.test(b), "no env var is ever interpolated into a message");

  // The rehearsal cannot be read from config and must not be guessed.
  ok(/ok: null/.test(b), "the item nothing can verify is left unanswerable rather than ticked");

  const C = bare(read("components/AdminLaunch.jsx"));
  ok(/RANK\[a\.severity\] - RANK\[b\.severity\]/.test(C), "blockers sort above everything else");
  ok(/i\.ok !== true && <p className="lx-fix">/.test(C), "and only unresolved rows say where to go");
}

// Awaited, so the async block above is counted. Reporting before it
// resolved is what made three assertions invisible.
weekly.then(() => {
  console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
  process.exit(bad ? 1 : 0);
});
