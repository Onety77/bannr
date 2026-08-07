const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const FEED = read("lib/feed.js");
const CARD = read("components/FeedCard.jsx");
const AV = read("components/Avatar.jsx");
const USERS = read("lib/users.js");
const PB = read("components/PostButton.jsx");
const PAGE = read("app/feed/[id]/page.jsx");
const IMG = read("app/api/feed/[id]/image/route.js");
const LAYOUT = read("app/layout.jsx");

console.log("\n1. FACES");
ok(USERS.includes("export async function setPhoto"), "the Google photo is stored");
ok(/lh\\d\+\\\.googleusercontent/.test(USERS) || USERS.includes("googleusercontent.com"), "and only from Google's own host");
ok(read("app/api/auth/google/route.js").includes("setPhoto(user.id, decoded.picture)"), "captured on sign-in");
ok(read("app/api/auth/identities/route.js").includes("setPhoto(session.accountId, decoded.picture)"), "and when Google is linked later");
ok(FEED.includes("photo: handles[p.accountId]?.photo || null"), "and travels with each post");
ok(AV.includes("function tint(seed)"), "the fallback derives a colour from the handle");
ok(AV.includes("onError={() => setBroken(true)}"), "a dead photo URL falls back rather than breaking");
ok(AV.includes('referrerPolicy="no-referrer"'), "and does not leak the referrer to Google");

console.log("\n2. THE CONTRACT ADDRESS");
ok(FEED.includes("const CA_SHAPE ="), "shape-checked before storing");
ok(FEED.includes('ca: CA_SHAPE.test(str(body.ca, 64))'), "so free text can never become a link on a public page");
ok(FEED.includes("export function chainOf"), "chain inferred for the DexScreener path");
ok(CARD.includes("https://dexscreener.com/${post.chain"), "and the card links out");
ok(CARD.includes('rel="noopener noreferrer nofollow"'), "with a safe rel on an outbound user-supplied link");
ok(PB.includes("Contract address (optional)"), "optional at post time");
ok(read("app/create/page.jsx").includes("defaultCa={ca}"), "prefilled from the brief when there is one");

console.log("\n3. ORDER ON THE CARD");
const iTop = CARD.indexOf("fcard-top");
const iCoin = CARD.indexOf("fcard-coin");
const iShot = CARD.indexOf("fcard-shot");
const iAct = CARD.indexOf("fcard-actions");
ok(iTop < iCoin && iCoin < iShot && iShot < iAct, "author -> coin -> artwork -> actions");
ok(CARD.indexOf("Avatar") < iCoin, "the face leads");

console.log("\n4. SHARE");
ok(CARD.includes("navigator.share"), "native sheet where it exists");
ok(CARD.includes("navigator.clipboard.writeText"), "clipboard otherwise");
ok(CARD.includes("document.execCommand(\"copy\")"), "and execCommand for in-app browsers that block both");
ok(CARD.includes("/feed/${post.id}"), "links to the post's own page");

console.log("\n5. THE LINK UNFURLS");
ok(PAGE.includes("export async function generateMetadata"), "the page declares metadata");
ok(!PAGE.includes('"use client"'), "and is a SERVER component, or an unfurler sees nothing");
ok(PAGE.includes("summary_large_image"), "3:1 card");
ok(PAGE.includes("/api/feed/${params.id}/image"), "pointing at real bytes, not a data URL");
ok(LAYOUT.includes("metadataBase"), "metadataBase set, or the image path never resolves");
ok(IMG.includes("Buffer.from(m[2]"), "the endpoint decodes the stored data URL");
ok(IMG.includes("if (!post?.src) return new Response(\"Not found\", { status: 404 })"), "a hidden or missing post serves nothing");

console.log("\n6. STILL TRUE");
ok(FEED.includes("if (p.hidden) return null;"), "getPost refuses hidden posts, so moderation reaches shared links");
ok(read("components/SinglePost.jsx").includes("Sign in"), "liking a shared post asks for sign-in");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
