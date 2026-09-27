// ============================================================
// THE PRE-LAUNCH HARDENING PASS.
//
// Six things found by reading rather than by shipping, every one of
// them a failure that would have arrived with launch traffic or with
// the first unlucky run. Where the code can be run it is run — the
// deadline, the error copy — and the wiring is checked where it cannot.
// ============================================================
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

function grab(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let j = src.indexOf("(", i), p = 0;
  for (; j < src.length; j++) { if (src[j] === "(") p++; else if (src[j] === ")") { p--; if (!p) break; } }
  let d = 0, st = false;
  for (; j < src.length; j++) { if (src[j] === "{") { d++; st = true; } else if (src[j] === "}") { d--; if (st && !d) return src.slice(i, j + 1); } }
  return null;
}
const fn = (src, sig) => grab(src, sig).replace(/^export\s+/, "");

const HIST = bare(read("app/api/history/route.js"));
const THUMB = bare(read("app/api/history/[id]/thumb/route.js"));
const HPAGE = read("app/history/page.jsx");
const PB = bare(read("components/PostButton.jsx"));
const FEED = bare(read("lib/feed.js"));
const IMG = bare(read("app/api/feed/[id]/image/route.js"));
const LOGO = bare(read("app/api/feed/[id]/logo/route.js"));
const TOP = bare(read("app/api/feed/top/route.js"));
const DIR = bare(read("lib/directory.js"));
const CLAIM = bare(read("app/api/pay/claim/route.js"));
const GEN = bare(read("app/api/generate/route.js"));
const EDIT = bare(read("app/api/edit/route.js"));
const PFP = bare(read("app/api/pfp/route.js"));
const ERR = read("lib/errors.js");
const CREATE = bare(read("app/create/page.jsx"));
const PFPM = bare(read("components/PfpMaker.jsx"));
const PKG = JSON.parse(read("package.json"));

(async () => {
  console.log("\n1. MY BANNERS NEVER SENDS ITS PICTURES IN THE LIST");
  {
    // Fifty cards with a ~100KB thumbnail each was ~5MB, past the
    // platform's ~4.5MB ceiling — the page broke at about the forty-
    // fifth banner someone kept.
    const get = grab(HIST, "export async function GET");
    ok(/\.select\(\.\.\.CARD_FIELDS\)/.test(get), "the list reads only the card's fields");
    const fields = (HIST.match(/const CARD_FIELDS = \[([^\]]*)\]/) || [])[1] || "";
    ok(fields.length > 0 && !/"thumb"/.test(fields), "and the thumbnail is not one of them");
    ok(/thumb: thumbUrl\(d\.id\)/.test(get), "each card points at its own thumbnail instead");
    ok(/const \{ path, \.\.\.rest \} = d\.data\(\)/.test(get), "and `path` is still never returned");
    const post = grab(HIST, "export async function POST");
    ok(/orderBy\("ts", "desc"\)\.select\("path"\)\.get\(\)/.test(post),
       "trimming the list on save reads paths, not fifty pictures");

    // The picture route is the list's privacy rules, not the feed's.
    ok(/requireUser\(req\)/.test(THUMB), "a thumbnail needs a session");
    ok(/collection\("users"\)\.doc\(session\.accountId\)\s*\.collection\("history"\)\.doc\(id\)/.test(THUMB),
       "and can only name the session's own card");
    ok(/"Cache-Control": "private,/.test(THUMB), "and no shared cache ever holds one");

    ok((HPAGE.match(/<img src=\{it\.thumb\}[^>]*loading="lazy"/g) || []).length === 2, "the cards lazy-load");

    // Posting from My banners used the inline thumbnail as the feed
    // image. It is a URL now, and the feed only accepts bytes.
    ok(/async function asDataUrl\(src\)/.test(PB), "posting a saved banner fetches its bytes");
    ok(/prepared \? await asDataUrl\(variant\.dataUrl\)/.test(PB), "rather than posting a URL the feed would refuse");
  }

  console.log("\n2. THE FEED SENDS ADDRESSES, NOT PICTURES");
  {
    const fields = (FEED.match(/const LIST_FIELDS = \[([\s\S]*?)\]/) || [])[1] || "";
    ok(fields.length > 0 && !/"src"/.test(fields), "no list reads the banner out of the database");
    ok(/q = q\.select\(\.\.\.LIST_FIELDS\)/.test(grab(FEED, "export async function listPosts")), "the feed page");
    ok(/\.select\(\.\.\.LIST_FIELDS\)/.test(grab(FEED, "export async function topPosts")), "the top-five strip");
    ok(/\.select\(\.\.\.LIST_FIELDS\)/.test(grab(FEED, "export async function postsByAccount")), "a profile");
    ok(!/src: p\.src,/.test(FEED.replace(/p\.hidden \? \{ src: p\.src/, "")), "and no read path hands back inline bytes for a visible post");

    // Moderation still reaches every URL: the picture reader refuses a
    // hidden post, and both routes go through it.
    const pic = grab(FEED, "export async function postPicture");
    ok(/if \(p\.hidden\) return null;/.test(pic), "a hidden post's picture is not served");
    ok(/postPicture\(params\?\.id, "src"\)/.test(IMG) && /postPicture\(params\?\.id, "logo"\)/.test(LOGO), "by either route");
    // A week at the edge would keep a taken-down banner live for a week.
    ok(!/s-maxage=604800/.test(IMG) && /s-maxage=3600/.test(IMG), "and the edge forgets it within the hour");

    // Hidden posts are still shown to their author and to an admin, and
    // the routes refuse them — so those carry their picture inline.
    ok(/hiddenPictures\(db, items\.filter\(\(p\) => p\.hidden\)/.test(FEED), "your own hidden posts still show");
    ok(/p\.hidden \? \{ src: p\.src, logo: p\.logo \|\| null \} : pictures\(p\.id, p\)/.test(FEED), "and so do the admin queue's");

    ok(/s-maxage=60/.test(TOP), "the top strip is cached at the edge, not only in one browser");

    ok((DIR.match(/\.select\("ca", "hidden", "ticker"\)/g) || []).length === 2, "the performing-tokens scan reads addresses only");

    // The real listPosts against a fake: URLs out, never bytes.
    const listPosts = new Function("getAdminDb", "handlesFor",
      "const PAGE = 18;\nconst LIST_FIELDS = [];\n" +
      "const imageUrl = (id) => `/api/feed/${encodeURIComponent(id)}/image`;\n" +
      "const logoUrl = (id) => `/api/feed/${encodeURIComponent(id)}/logo`;\n" +
      "const pictures = (id, p) => ({ src: imageUrl(id), logo: p.logo ? logoUrl(id) : null });\n" +
      fn(FEED, "export async function listPosts") + "\n" +
      fn(FEED, "async function likedByViewer") + "\nreturn listPosts;"
    )(() => ({
      collection: () => {
        const q = {
          orderBy: () => q, limit: () => q, startAfter: () => q, select: () => q,
          get: async () => ({ docs: [
            { id: "a", data: () => ({ ts: 2, logo: "data:image/jpeg;base64,xx" }) },
            { id: "b", data: () => ({ ts: 1 }) },
          ] }),
        };
        return q;
      },
    }), async () => ({}));
    const page = await listPosts({});
    ok(page.posts[0].src === "/api/feed/a/image" && page.posts[0].logo === "/api/feed/a/logo", "a post with a logo points at both");
    ok(page.posts[1].logo === null, "and one without says so");
  }

  console.log("\n3. A PAYMENT IS RECORDED AND CREDITED IN ONE WRITE");
  {
    // Two writes left a window where the record said "credited" and the
    // balance never moved, and every retry answered "already".
    const tx = CLAIM.slice(CLAIM.indexOf("await db.runTransaction(async (t) =>"));
    const body = tx.slice(0, tx.indexOf("} catch (e)"));
    ok(/t\.update\(userRef, \{\s*credits: \(userSnap\.data\(\)\.credits \|\| 0\) \+ pack\.credits,/.test(body),
       "the balance rises inside the same transaction");
    ok(/t\.set\(payRef, \{/.test(body), "that files the payment");
    ok(!/grantCredits/.test(CLAIM), "and there is no second, separate grant to fail");
    ok(/outcome = "credited";\s*const snap/.test(body), "the outcome resets on every attempt of the transaction");
    ok(/if \(outcome === "already"\)/.test(CLAIM), "a payment already credited answers as before");
  }

  console.log("\n4. A SLOW RUN IS REFUNDED BEFORE THE PLATFORM KILLS IT");
  {
    ok(/const DEADLINE_MS = \(maxDuration - 15\) \* 1000;/.test(GEN), "the route keeps its own deadline inside maxDuration");
    ok(/await settleBy\(\s*jobs\.map/.test(GEN) && /\}\),\s*deadlineAt\s*\);/.test(GEN), "and the image jobs are bounded by it");

    // The real settleBy, run.
    const settleBy = new Function(
      fn(GEN, "function deadlineError") + "\n" + fn(GEN, "async function settleBy") + "\nreturn settleBy;"
    )();
    const wait = (ms, v, fail) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms));
    const t0 = Date.now();
    const out = await settleBy([wait(10, "fast"), wait(5000, "slow"), wait(5, "refused", true)], Date.now() + 80);
    ok(Date.now() - t0 < 1000, "it answers at the deadline, not when the slowest job finishes");
    ok(out[0].status === "fulfilled" && out[0].value === "fast", "what arrived is kept");
    ok(out[1].status === "rejected" && out[1].reason.deadline === true && out[1].reason.status === 504, "what did not is a timeout");
    ok(out[2].status === "rejected" && out[2].reason.message === "refused", "and a real failure stays itself");

    ok(/failed\.find\(\(s\) => !s\.reason\?\.deadline\) \|\| failed\[0\]/.test(GEN), "a refusal outranks the deadline as the reason shown");

    // Edit retries a refusal only with time left to finish.
    ok(/if \(left < MIN_RETRY_MS\) throw err;/.test(EDIT), "an edit does not start a retry it cannot finish");

    // The copy. "Credits weren't spent" is only said when true.
    const { publicError } = new Function(ERR.replace(/^export /gm, "") + "\nreturn { publicError };")();
    const t = publicError({ message: "timed out", status: 504 }, "generate");
    ok(/Your credits weren't spent\.$/.test(t.error), "a refunded failure says so");
    const f = publicError({ message: "timed out", status: 504 }, "generate", { refunded: false });
    ok(!/spent|charged/.test(f.error) && f.error.endsWith("try again."), "a failed refund does not claim one");
    ok(/publicError\(err, "generate", \{ refunded: square \}\)/.test(GEN), "generate passes the truth");
    ok(/publicError\(err, "edit", \{ refunded: square \}\)/.test(EDIT), "so does edit");
    ok(/publicError\(err, "pfp", \{ refunded: square \}\)/.test(PFP), "and the PFP maker");
    ok(/refunded: Boolean\(charged\) && square/.test(GEN), "and the flag the page reads matches");

    // The page cannot tell a killed function from a dropped connection,
    // so it no longer claims a refund for either.
    const gen = grab(CREATE, "async function generate(");
    ok(!/credits refunded\. Please try again|Network error — credits refunded/.test(CREATE), "the network branch makes no claim about money");
    ok(/const raw = await res\.text\(\);/.test(gen), "a non-JSON answer is read, not thrown into that branch");
    ok(!/you weren't charged/.test(PFPM.slice(PFPM.indexOf('e.name === "AbortError"'))), "nor does the PFP maker on a timeout");
  }

  console.log("\n5. THE ANSWER IS SMALLER, AND MEASURED");
  {
    ok(/\.png\(\{ compressionLevel: 9, adaptiveFiltering: true \}\)/.test(GEN), "banners are compressed hard, losslessly");
    ok(/\.png\(\{ compressionLevel: 9, adaptiveFiltering: true \}\)/.test(EDIT), "edits too");
    ok(/bgSource \? await sharp\(bgSource\)/.test(GEN), "a real banner no longer ships a second JPEG copy of itself");
    ok(!/bgJpeg/.test(EDIT), "nor does an edit");
    ok(/const bg = v\.bg \|\| \(await jpegOf\(v\.dataUrl\)\);/.test(CREATE), "the X conversion makes its copy when asked");
    ok(/LARGE RESPONSE/.test(GEN) && /Buffer\.byteLength\(body\)/.test(GEN), "and every run logs how big its answer was");
  }

  console.log("\n6. UPLOADS ARE BOUNDED, AND THE FRAMEWORK IS PATCHED");
  {
    for (const [f, n] of [
      ["app/api/generate/route.js", 2], ["app/api/edit/route.js", 2], ["app/api/pfp/route.js", 1],
      ["app/api/archive/route.js", 1], ["app/api/admin/upload/route.js", 2],
    ]) {
      const s = bare(read(f));
      ok((s.match(/, DECODE\)/g) || []).length === n, `${f}: every upload is decoded under a pixel limit`);
    }
    ok(PKG.dependencies.next === "14.2.35", "next is on the last 14.x");
    ok(PKG.dependencies.sharp === "0.35.4", "sharp carries the patched libvips");
    try {
      const sharp = require(R + "node_modules/sharp");
      const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: "#fff" } }).png().toBuffer();
      const { DECODE } = new Function(read("lib/decode.js").replace(/^export /gm, "") + "\nreturn { DECODE };")();
      let refused = false;
      try { await sharp(bomb, DECODE).png().toBuffer(); } catch { refused = true; }
      ok(refused, `a small file declaring 64 megapixels (${Math.round(bomb.length / 1024)}KB) is refused`);
    } catch (e) {
      ok(false, "sharp could not be loaded to run the decode check: " + e.message);
    }
  }

  console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
