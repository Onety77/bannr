const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const FEED = read("lib/feed.js");
const H = read("lib/handles.js");
const YOU = read("app/you/page.jsx");
const PUB = read("app/u/[handle]/page.jsx");
const TAB = read("components/TabBar.jsx");
const CARD = read("components/FeedCard.jsx");
const DEL = read("app/api/feed/[id]/delete/route.js");
const MINE = read("app/api/me/posts/route.js");
const UAPI = read("app/api/u/[handle]/route.js");
const SET = read("app/settings/page.jsx");
const G = read("app/globals.css");
const USERS = read("lib/users.js");

console.log("\n1. THE VOID");
// overscroll-behavior did nothing on iOS. The document simply does not
// scroll on a phone any more — see shelltest for the whole shell.
ok(
  G.includes("html, body { height: 100%; overflow: hidden; }"),
  "the document does not scroll on phones, so there is no bounce to drag the tab bar"
);

console.log("\n2. DELETING YOUR OWN POST");
ok(FEED.includes("export async function deleteOwnPost"), "exists");
ok(FEED.includes('if (!snap.exists || snap.data().accountId !== accountId) return { ok: false, error: "Not found." };'),
   "ownership checked INSIDE the transaction, and missing reads the same as not-yours");
ok(DEL.includes("const session = requireUser(req);"), "route needs a session");
ok(DEL.includes("deleteOwnPost(session.accountId, params?.id)"), "and passes the SESSION's account, never the body's");
ok(!DEL.includes("body"), "the request body is not consulted at all");

console.log("\n3. NO COMPOSITE INDEXES");
ok(FEED.includes('.where("accountId", "==", accountId).limit(200).get()'), "posts-by-account is a single-field where");
ok(/postsByAccount[\s\S]{0,900}items\.sort\(/.test(FEED), "sorted in memory, not by orderBy");
ok(!/where\("accountId"[\s\S]{0,120}orderBy/.test(FEED), "never where + orderBy together");
ok(H.includes('db.collection("handles").doc(shape.handle).get()'), "handle lookup is a direct doc read");

console.log("\n4. WHAT EACH PROFILE SHOWS");
ok(MINE.includes("own: true"), "your own profile includes hidden posts");
ok(YOU.includes("Removed by a moderator"), "and labels them, so a takedown never reads as our bug");
ok(UAPI.includes("own: false"), "a stranger's view filters them out");

console.log("\n5. THE SPLIT");
ok(TAB.includes('href: "/you", label: "You"'), "the tab opens the profile, not settings");
ok(TAB.includes('path.startsWith("/u/")'), "and stays lit on credits, settings and a public profile");
ok(YOU.includes('["/settings", "Settings"'), "settings is one row away");
ok(SET.includes('<Link href="/you" className="set-back">'), "and has a way back, or it is a dead end on a phone");
ok(CARD.includes('href={`/u/${post.handle}`}'), "a handle in the feed finally goes somewhere");

console.log("\n6. NO EXTRA ROUND TRIPS");
ok(USERS.includes("handle: u.handle || null,") && USERS.includes("photo: u.photo || null,"), "the session carries handle and photo");
ok(!YOU.includes('fetch("/api/handle").then'), "so the profile does not re-fetch its own name");
ok(YOU.includes("useState(auth.user?.handle || null)"), "and paints it on the first frame");

console.log("\n7. RENAMING");
ok(YOU.includes("setHandle(d.handle);"), "a change takes effect immediately");
ok(FEED.includes("handlesFor([accountId])"), "and old posts resolve the new name, because none of them stored the old one");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
