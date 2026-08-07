// Runs the SHIPPED cache functions, plus static checks on the page.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const C = read("lib/feedCache.js");
const PAGE = read("app/feed/page.jsx");
const G = read("app/globals.css");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

function grab(src, sig) {
  const i = src.indexOf(sig);
  let j = src.indexOf("(", i), p = 0;
  for (; j < src.length; j++) { if (src[j] === "(") p++; else if (src[j] === ")") { p--; if (!p) break; } }
  let d = 0, st = false;
  for (; j < src.length; j++) { if (src[j] === "{") { d++; st = true; } else if (src[j] === "}") { d--; if (st && !d) return src.slice(i, j + 1); } }
}
const mergeFresh = new Function(grab(C, "export function mergeFresh").replace(/^export /, "") + "\nreturn mergeFresh;")();
const MAX = Number(C.match(/const MAX_POSTS = (\d+);/)[1]);

const p = (id, ts, likes = 0, liked = false) => ({ id, ts, likes, liked });

console.log("\n1. MERGING A FRESH PAGE IN");
{
  const have = [p("c", 300), p("b", 200), p("a", 100)];
  const fresh = [p("e", 500), p("d", 400), p("c", 300)];
  const out = mergeFresh(have, fresh);
  ok(out.map((x) => x.id).join(",") === "e,d,c,b,a", "new posts land on TOP, nothing reordered below");
  ok(out.length === 5, "and nothing is duplicated");
}
{
  const have = [p("a", 100, 3, true)];
  const fresh = [p("a", 100, 9, true)];
  const out = mergeFresh(have, fresh);
  ok(out[0].likes === 9, "a post you can already see takes the server's like count");
  ok(out.length === 1, "without moving");
}
{
  const have = [p("a", 100, 3, true)];
  // Someone else liked it; our own liked state comes from the server
  // for this viewer, so it is authoritative too.
  const out = mergeFresh(have, [p("a", 100, 4, false)]);
  ok(out[0].liked === false, "and the server's view of whether YOU liked it");
}
ok(mergeFresh([], [p("a", 1)]).length === 1, "an empty cache just takes the fresh page");
ok(mergeFresh(null, [p("a", 1)]).length === 1, "and so does no cache at all");

console.log("\n2. THE CAP");
{
  // writeFeed mutates module state, so exercise it in its own context.
  const mod = new Function(
    "const caches = new Map();\nconst MAX_POSTS = " + MAX + ";\n" +
    grab(C, "export function writeFeed").replace(/^export /, "") + "\n" +
    grab(C, "export function readFeed").replace(/^export /, "") + "\n" +
    "return { writeFeed, readFeed };"
  )();
  const many = Array.from({ length: MAX + 25 }, (_, i) => p("p" + i, 10000 - i));
  mod.writeFeed({ posts: many, cursor: 1, done: true });
  const c = mod.readFeed();
  ok(c.posts.length === MAX, "trimmed to " + MAX + " posts, so a long session cannot grow forever");
  ok(c.done === false, "and no longer marked done");
  ok(c.cursor === c.posts[c.posts.length - 1].ts, "the cursor follows the trim, so paging on cannot skip a chunk");
}

console.log("\n3. THE PAGE");
ok(PAGE.includes("const cached = typeof window === \"undefined\" ? null : readFeed(style);"), "read synchronously in the initialiser, keyed by filter");
ok(PAGE.includes("useState(cached?.posts ?? null)"), "so the first render is the feed, not skeletons");
ok(PAGE.includes("if (!c?.posts?.length) {"), "a cold start still loads normally");
ok(PAGE.includes("Date.now() - (c.at || 0) > STALE_MS"), "and a warm one only revalidates when stale");
ok(PAGE.includes("useRestoreScroll(`feed:${style}`, Boolean(posts?.length))"), "scroll handled by the shared hook, per filter");
ok(/setPosts\(\(list\) => \{[\s\S]{0,240}writeFeed\(\{ posts: next \}, style\)/.test(PAGE), "a like survives the trip, into the right filter's cache");

console.log("\n3a. FILTERING BY STYLE");
{
  const FEED = read("lib/feed.js");
  const API = read("app/api/feed/route.js");
  ok(FEED.includes("(!styleId || p.styleId === styleId)"), "filtered in memory, so no composite index");
  ok(!/where\("styleId"/.test(FEED), "and never as a where clause");
  ok(FEED.includes("const span = styleId ? PAGE * 8 : PAGE * 2;"), "over-fetches when filtering, so a page is not mostly empty");
  ok(FEED.includes("done: raw.length < span,"), "and `done` uses that same span, or paging stops early");
  ok(API.includes('url.searchParams.get("style")'), "the route reads it");
  ok(PAGE.includes('router.push(next ? `/feed?style='), "the filter lives in the URL, so it can be linked and gone back from");
  ok(PAGE.includes("readFeed(style)") && PAGE.includes("}, style);"), "each filter has its own cache");
  ok(C.includes("const caches = new Map();"), "which the cache actually provides");
}

console.log("\n3b. THE SHARED SCROLL HOOK");
{
  const H = read("lib/useRestoreScroll.js");
  const HIST = read("app/history/page.jsx");
  ok(H.includes("requestAnimationFrame(() => scrollToTop(y))"), "restores after layout");
  ok(H.includes("const off = subscribe(save);"), "saves continuously, not in a cleanup");
  ok(/return \(\) => \{\s*save\(\);/.test(H), "and once more on the way out");
  ok(H.includes("restored.current"), "only once per mount");
  ok(H.includes("const positions = new Map();"), "keyed, so two lists cannot overwrite each other");
  ok(HIST.includes('useRestoreScroll("history", Boolean(items?.length))'), "and My banners uses the same one");
  ok(!read("lib/feedCache.js").includes("scrollY"), "the feed cache no longer owns scroll at all");
}

console.log("\n3c. MY BANNERS");
{
  const HIST = read("app/history/page.jsx");
  const HC = read("lib/historyCache.js");
  ok(HIST.includes("const cached = typeof window === \"undefined\" ? null : readHistory();"), "restored synchronously");
  ok(HIST.includes("useState(cached?.items ?? null)"), "so it paints the list, not LOADING…");
  ok(HIST.includes("if (c?.items && Date.now() - c.at < STALE_MS) return"), "and skips the refetch while warm");
  ok(HIST.includes("patchHistory(next);"), "a delete is written through, or it reappears on the way back");
  ok(HC.includes("export function writeHistory"), "the cache exists");
}

console.log("\n4. WHY THE SCROLL LANDS RIGHT");
ok(/\.fcard-shot \{[\s\S]{0,400}aspect-ratio: 3 \/ 1;/.test(G), "the box reserves 3:1 before the image decodes");
ok(/\.fcard-shot img \{[\s\S]{0,160}height: 100%/.test(G), "and the image fills it");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
