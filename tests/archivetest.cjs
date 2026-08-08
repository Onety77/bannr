// ============================================================
// THE FULL-RESOLUTION ARCHIVE.
//
// A banner used to exist at full quality only as long as the tab that
// made it. Everything here is a property that has to hold for the file
// to be worth keeping at all: only what someone kept, reachable only
// by the person who kept it, and never able to break a download.
// ============================================================
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const A = read("lib/archive.js");
const PUT = read("app/api/archive/route.js");
const GET = read("app/api/archive/[id]/route.js");
const HIST = read("app/api/history/route.js");
const CRED = read("lib/credits.js");
const PAGE = read("app/history/page.jsx");
const DL = read("lib/download.js");

// The real path helpers, loaded without their imports.
const M = new Function(
  "randomUUID", "getAdminBucket",
  A.replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
  "\nreturn { isArchivePath, archivePath };"
)(() => "11111111-2222-3333-4444-555555555555", () => null);

console.log("\n1. ONLY WHAT SOMEBODY KEPT");
{
  // Four options render and one gets downloaded. Storing all four
  // would cost four times as much AND keep banners people looked at
  // and rejected, which is the part that actually matters.
  ok(/archiveFull\(id, dataUrl\)/.test(bare(CRED)), "the archive is written from saveToHistory");
  const save = bare(CRED).slice(bare(CRED).indexOf("function saveToHistory"));
  ok(!/generate|onGenerate/.test(save.slice(0, 400)), "which is called on DOWNLOAD, never on generate");
  ok(!/archiveFull/.test(bare(read("app/api/generate/route.js"))),
     "AND THE GENERATE ROUTE STORES NOTHING — a rejected option is never uploaded at all");
}

console.log("\n2. IT CANNOT BREAK A DOWNLOAD");
{
  const c = bare(CRED);
  // The file is already on disk by the time this runs. An archive that
  // is slow, refused or impossible must not make a finished download
  // feel unfinished.
  ok(/[^a-z]archiveFull\(id, dataUrl\);/.test(c), "the upload is NOT awaited");
  ok(/async function archiveFull[\s\S]*?catch \{\}/.test(c), "and every failure inside it is swallowed");
  // Every early return in the route is a plain ok:false rather than a
  // throw, so nothing upstream can turn into an error the user sees.
  ok(!/throw /.test(bare(PUT)), "the endpoint never throws");
  ok(/reason: "no-bucket"/.test(PUT), "an unconfigured bucket is an answer, not a failure");
}

console.log("\n3. NOBODY ELSE'S BANNER");
{
  const g = bare(GET);
  ok(/requireUser\(req\)/.test(g), "the read needs a session");
  ok(/collection\("users"\)\.doc\(session\.accountId\)/.test(g),
     "AND THE DOCUMENT IS LOOKED UP UNDER THE SESSION'S OWN ACCOUNT — another account's card cannot be named");
  ok(/isArchivePath\(path\)/.test(g), "the stored path is shape-checked before it reaches the bucket");
  // Ownership on every request, not once when the list was drawn: a
  // page left open must not outlive the session that opened it.
  ok(g.indexOf("requireUser") < g.indexOf("bucket.file(path).download()"),
     "and ownership is settled before a single byte is read");

  const p = bare(PUT);
  ok(/if \(!snap\.exists\)/.test(p), "writing requires a card that already exists");
  ok(/if \(snap\.data\(\)\.path\)/.test(p), "and never overwrites one, which would orphan the previous object");
}

console.log("\n4. THE PATH NEVER REACHES A BROWSER");
{
  const h = bare(HIST);
  ok(/const \{ path, \.\.\.rest \} = d\.data\(\)/.test(h), "`path` is stripped from every history row");
  ok(/hasFile: Boolean\(path\)/.test(h), "and replaced by a flag");
  ok(!/signedUrl/.test(h), "no signed URL is minted for the page");
  // A signed URL is cross-origin: the <img> would load and the
  // download fetch would be refused by CORS — the one action the
  // feature exists for. It is also a world-reachable handle sitting
  // in a browser where any log or referrer can pick it up.
  ok(/\/api\/archive\/\$\{viewing\.id\}/.test(PAGE),
     "THE PAGE ASKS OUR OWN ORIGIN, which is why there is no CORS setup step to forget");
  ok(/credentials: "same-origin"/.test(bare(DL)), "and the download fetch is same-origin");
}

console.log("\n5. A DELETED CARD TAKES ITS FILE");
{
  const h = bare(HIST);
  // Read before delete, because afterwards nothing says which object
  // belonged to the card.
  const del = h.slice(h.indexOf("export async function DELETE"));
  ok(del.indexOf("ref.get()") < del.indexOf("ref.delete()"), "the path is read before the document goes");
  ok(/removeBanner\(snap\.data\(\)\.path\)/.test(del), "and the object is removed after it");
  // Falling off the end of the list is the other way a card dies, and
  // it is the one that happens without anyone asking — every banner
  // ever evicted would otherwise stay in the bucket forever with
  // nothing pointing at it.
  ok(/stale\.map\(\(d\) => removeBanner/.test(h), "AND AN EVICTED CARD TAKES ITS FILE TOO — no bill made of orphans");
}

console.log("\n6. PATHS ARE OURS, AND UNGUESSABLE");
{
  const p = M.archivePath("acc123");
  ok(/^banners\/acc123\/[0-9a-f-]{36}\.png$/.test(p), "scoped by account, named by uuid");
  ok(M.isArchivePath(p), "and it validates");
  ok(M.isArchivePath("banners/a/../../etc/passwd") === false, "traversal refused");
  ok(M.isArchivePath("banners/a/b.png/../c") === false, "and so is anything after the extension");
  ok(M.isArchivePath("other/a/b.png") === false, "a path outside banners/ is refused");
  ok(M.isArchivePath("") === false && M.isArchivePath(null) === false, "empty and null are not paths");
  // The account id is sanitised, so a hostile id cannot climb out of
  // its own folder.
  ok(!M.archivePath("../../evil").includes(".."), "a hostile account id cannot escape its folder");
}

console.log("\n7. THE CARD CAP MOVED FOR A REASON");
{
  ok(/const MAX_ITEMS = 50;/.test(HIST), "50 cards, up from 24");
  // The old number was set by what a card COSTS — a ~100KB base64
  // thumbnail inline in the document. That is still true, so the cap
  // still exists; it moved because the expensive half went to Storage.
  ok(/MAX_THUMB = 200_000/.test(HIST), "the thumbnail is still capped, because it is still inline");
  ok(/all\.docs\.slice\(MAX_ITEMS\)/.test(bare(HIST)), "and the cap is still enforced at write time");
}

console.log("\n7b. THE ADMIN BOARD REACHES THE REAL FILE");
{
  const AB = bare(read("app/api/admin/banner/[id]/route.js"));
  const GEN = bare(read("app/api/admin/generations/route.js"));
  const UP = bare(read("app/api/admin/upload/route.js"));
  const PAGE = bare(read("app/admin7731/page.jsx"));

  // The featuring pool and the archive are written by the same click
  // and stamped with the same image-derived sig, which is what lets
  // one card point at the other's file.
  ok(/collection\("generations"\)\.where\("sig", "==", sig\)/.test(bare(PUT)),
     "a download links the board card to the file it just stored");
  ok(/!gen\.docs\[0\]\.data\(\)\.path/.test(bare(PUT)), "and never overwrites one already linked");

  // Admin, NOT owner. An admin looking at the board is looking at
  // other people's banners — that is the job — so this deliberately
  // does not scope to a session's own account the way /api/archive
  // does. requireAdmin is the stronger check.
  ok(/requireAdmin\(req\)/.test(AB), "the admin route is admin-verified");
  ok(!/session\.accountId/.test(AB), "and does not pretend to be an ownership check");
  ok(/isArchivePath\(path\)/.test(AB), "the path is still shape-checked before the bucket");

  // Same rule as everywhere else: the storage path never reaches a
  // browser.
  ok(/const \{ path, \.\.\.rest \} = d\.data\(\)/.test(GEN), "the board strips `path` from every row");
  ok(/hasFile: Boolean\(path\)/.test(GEN), "and sends a flag instead");

  // ══ AN <img src> CANNOT SEND A BEARER TOKEN ══
  //
  // Every admin route reads the Authorization header and nothing else.
  // Pointing an <img> at one gets a 401 and a broken picture, and the
  // fix is not markup — it is fetching with the header and holding an
  // object URL. A token in the query string would put a credential in
  // every log and referrer.
  ok(/Authorization: `Bearer \$\{token\}`/.test(PAGE) && /createObjectURL/.test(PAGE),
     "THE VIEWER FETCHES WITH THE HEADER rather than pointing an img at a guarded route");
  ok(/revokeObjectURL/.test(PAGE), "and releases it, since each one pins megabytes");
  ok(/src=\{fullUrl \|\| viewing\.src\}/.test(PAGE), "showing the card image until the real one lands");
  // Older cards genuinely have no file. Saying so beats implying a
  // 900×300 JPEG is a deliverable.
  ok(/preview only · 900 × 300/.test(PAGE), "and a card with no file says exactly that");

  // A hand-placed banner arrives at full quality; it was being reduced
  // to a 760px JPEG with the original discarded.
  ok(/putBanner\("admin", full\)/.test(UP), "an uploaded banner keeps its full-resolution original");
}

console.log("\n8. WHAT IS STORED IS A REAL BANNER");
{
  const p = bare(PUT);
  // The bytes arrive from a browser. This is the one place a client
  // payload becomes a stored file.
  ok(/sharp\(Buffer\.from\(await file\.arrayBuffer\(\)\)\)/.test(p), "the upload is re-encoded, never trusted");
  ok(/resize\(BANNER_W, BANNER_H/.test(p), "at the banner's own dimensions");
  ok(/reason: "not-an-image"/.test(p), "and anything that will not decode is refused");
  ok(/MAX_BYTES/.test(p), "with a size ceiling");
  // Multipart, not base64 in JSON: ~2MB stays ~2MB instead of becoming
  // ~2.7MB against a ~4.5MB limit — the 413 the PFP maker just had.
  ok(/req\.formData\(\)/.test(p), "sent as multipart");
  ok(/fd\.set\("image", blob/.test(bare(CRED)), "as a Blob, so it never becomes base64");
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
