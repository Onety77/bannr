// ============================================================
// THE FEED — banners people chose to make public.
//
// PUBLISHING IS ALWAYS A DELIBERATE ACT. Downloading already nominates
// a banner to the private admin pool, and that is fine because that
// pool is private. This is not: people make banners for projects that
// have not launched, and a ticker on a public page is a leak they
// never agreed to. Nothing reaches this collection without someone
// pressing a button that says so.
//
//   posts/{id}          the banner, the project, the style, the concept
//   likes/{id}_{acct}   one row per person per post
//   reports/{id}_{acct} same, for the report button
//
// NO COMPOSITE INDEXES ANYWHERE. A where() on one field plus an
// orderBy on another needs one, a missing one throws at runtime, and
// that is exactly how the homepage spotlight silently emptied itself
// once. Hidden posts are filtered in memory after an over-fetch, which
// costs a few wasted reads and cannot fail.
//
// THE AUTHOR'S NAME IS NOT STORED HERE. Only accountId. Handles are
// resolved at read time in one batched call — see lib/handles.js for
// why that beats the usual denormalisation.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { handlesFor } from "@/lib/handles";

export const PAGE = 18;

// Posts per account per day. Not a moderation tool — it is there so a
// script cannot fill the feed faster than a person can look at it.
export const POSTS_PER_DAY = 10;

// Reports that hide a post automatically, pending review.
//
// A deliberate trade, and worth stating: five people acting together
// can hide a post that broke no rule. The alternative is that a genuine
// scam stays up until an admin happens to wake up, and on a public feed
// attached to a token launch that is the worse failure. Admin can
// restore, and the report count is visible when they do.
export const AUTOHIDE_REPORTS = 5;

const MAX_SRC = 400_000; // base64 chars; a 900x300 jpeg is ~80-160k

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const str = (v, n) => String(v ?? "").trim().slice(0, n);

// Width ÷ height for a post whose image is not the usual 3:1, which
// is how a card reserves the right height before the image decodes.
//
// A BROWSER SENDS THIS, so it is treated as hostile input rather than
// as a measurement. Anything not a finite number, and anything
// outside a range a banner could plausibly be, becomes null — which
// falls back to 3:1. Without the ceiling, one post claiming a ratio
// of 0.01 reserves a box a hundred screens tall and takes the feed
// with it.
const MIN_RATIO = 1.2; // taller than this and it is not a banner
const MAX_RATIO = 4;
function ratioOf(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < MIN_RATIO || n > MAX_RATIO) return null;
  return Math.round(n * 1000) / 1000;
}

// The contract address is optional — plenty of banners are made
// before a token exists — but when it is there it turns a picture
// into something you can act on.
const CA_SHAPE = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})$/;

// Which DexScreener path an address belongs under. Inferred from
// the shape, which is exact for Solana and a best guess for EVM —
// 0x addresses look identical across Ethereum, Base and BNB, and
// nothing in a post tells us which. Solana is the overwhelming
// majority here and the one we get right.
export function chainOf(ca) {
  if (!CA_SHAPE.test(ca)) return "";
  return ca.startsWith("0x") ? "ethereum" : "solana";
}

// ---------- publishing ----------

// Returns { ok, id } or { ok: false, error, code }.
export async function publish(accountId, body = {}) {
  const db = getAdminDb();
  if (!db) return { ok: false, error: "Not configured." };

  const src = String(body.src || "");
  if (!src.startsWith("data:image/") || src.length > MAX_SRC) {
    return { ok: false, error: "That image can't be posted." };
  }

  const sig = str(body.sig, 80);
  if (sig) {
    const dup = await db.collection("posts").where("sig", "==", sig).limit(1).get();
    if (!dup.empty) return { ok: false, error: "That banner is already on the feed.", code: "duplicate" };
  }

  // The daily cap and the post are written together, so two requests
  // racing cannot both see the last slot as free.
  const userRef = db.collection("users").doc(accountId);
  const postRef = db.collection("posts").doc();
  const today = todayKey();

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return { ok: false, error: "Sign in first." };
    const d = snap.data();
    if (!d.handle) return { ok: false, error: "Pick a handle first.", code: "no_handle" };

    const used = d.postDate === today ? d.postCount || 0 : 0;
    if (used >= POSTS_PER_DAY) {
      return { ok: false, error: `That's ${POSTS_PER_DAY} posts today — the feed resets tomorrow.`, code: "rate" };
    }

    tx.set(postRef, {
      accountId,
      src,
      // Width ÷ height, so a card can reserve the right box before
      // the image decodes. Absent means 3:1, which every plain banner
      // is and every post was before pairing existed.
      //
      // Clamped and sanity-checked because it arrives from a browser:
      // a NaN or a wild value here would reserve a box tall enough to
      // push the rest of the feed off the screen.
      ratio: ratioOf(body.ratio),
      ticker: str(body.ticker, 24),
      name: str(body.name, 60),
      styleId: str(body.styleId, 40),
      styleName: str(body.styleName, 40),
      // The director's note, if this style had one. Public on purpose:
      // it is the thing that makes the feed worth scrolling rather than
      // a wall of pictures, and it is what "make one like this" acts on.
      concept: str(body.concept, 900),
      // Stored only if it is shaped like an address. A free-text
      // field here would end up rendered as a link on a public
      // page, which is somebody else's phishing surface.
      ca: CA_SHAPE.test(str(body.ca, 64)) ? str(body.ca, 64) : "",
      chain: chainOf(str(body.ca, 64)),
      sig,
      likes: 0,
      reports: 0,
      hidden: false,
      ts: Date.now(),
    });
    tx.update(userRef, { postDate: today, postCount: used + 1 });
    return { ok: true, id: postRef.id };
  });

  return result;
}

// ---------- reading ----------

// One page, newest first. `before` is a ts cursor.
//
// Over-fetches so that hidden posts removed in memory do not leave a
// short page. Anything still short after that genuinely is the end.
export async function listPosts({ before = 0, viewer = null, styleId = "" } = {}) {
  const db = getAdminDb();
  if (!db) return { posts: [], done: true };

  // Filtered in memory, NOT with a where() clause. A where on styleId
  // plus an orderBy on ts is a composite index, and a missing one
  // throws at runtime — the failure that silently emptied the
  // homepage spotlight once. Over-fetching costs a few reads and
  // cannot fail.
  //
  // The cost, named rather than discovered: a style nobody posts in
  // makes this read the whole window and return almost nothing. At
  // this feed's size that is free. When a style gets rare enough to
  // produce empty pages, that is the moment to buy the index.
  const span = styleId ? PAGE * 8 : PAGE * 2;
  let q = db.collection("posts").orderBy("ts", "desc").limit(span);
  if (before > 0) q = q.startAfter(before);

  const snap = await q.get();
  const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const visible = raw
    .filter((p) => !p.hidden && (!styleId || p.styleId === styleId))
    .slice(0, PAGE);

  const [handles, liked] = await Promise.all([
    handlesFor(visible.map((p) => p.accountId)),
    likedByViewer(db, viewer, visible.map((p) => p.id)),
  ]);

  return {
    posts: visible.map((p) => ({
      id: p.id,
      src: p.src,
      ratio: p.ratio || null,
      ticker: p.ticker || "",
      name: p.name || "",
      styleId: p.styleId || "",
      styleName: p.styleName || "",
      concept: p.concept || "",
      ca: p.ca || "",
      chain: p.chain || "",
      likes: p.likes || 0,
      ts: p.ts || 0,
      handle: handles[p.accountId]?.handle || null,
      photo: handles[p.accountId]?.photo || null,
      // So the heart can render filled on first paint rather than
      // popping a moment later.
      liked: liked.has(p.id),
      mine: viewer ? p.accountId === viewer : false,
    })),
    // The cursor comes from the RAW list, not the visible one. Paging
    // from the last visible post would re-read every hidden row that
    // followed it, forever.
    cursor: raw.length ? raw[raw.length - 1].ts : 0,
    done: raw.length < span,
  };
}

async function likedByViewer(db, viewer, ids) {
  const set = new Set();
  if (!viewer || !ids.length) return set;
  try {
    const refs = ids.map((id) => db.collection("likes").doc(`${id}_${viewer}`));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => {
      if (s.exists) set.add(s.id.slice(0, s.id.lastIndexOf("_")));
    });
  } catch {}
  return set;
}

// THE MOST LIKED, RECENTLY.
//
// A time window plus an ordering by a different field is a composite
// index, so this reads recent posts by ts — the index Firestore builds
// on its own — and ranks them here. Two hundred rows is nothing to
// sort in memory, and it cannot fail at runtime, which a missing index
// can.
//
// This is also the shape the daily most-liked board will need, so it
// is worth having right rather than quick.
export async function topPosts({ hours = 24, limit = 5 } = {}) {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db.collection("posts").orderBy("ts", "desc").limit(200).get();
  const since = Date.now() - hours * 3600_000;
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => !p.hidden && (p.ts || 0) >= since && (p.likes || 0) > 0)
    .sort((a, b) => (b.likes || 0) - (a.likes || 0) || (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);

  const handles = await handlesFor(rows.map((p) => p.accountId));
  return rows.map((p) => ({
    id: p.id,
    src: p.src,
    ratio: p.ratio || null,
    ticker: p.ticker || "",
    name: p.name || "",
    likes: p.likes || 0,
    handle: handles[p.accountId]?.handle || null,
  }));
}

// ---------- one post ----------
//
// For the share page. Hidden posts return null rather than a
// tombstone: a link to something a moderator took down should look
// like a link to nothing, not like a page confirming it existed.
export async function getPost(id, viewer = null) {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("posts").doc(String(id || "")).get();
  if (!snap.exists) return null;
  const p = snap.data();
  if (p.hidden) return null;

  const [handles, liked] = await Promise.all([
    handlesFor([p.accountId]),
    likedByViewer(db, viewer, [snap.id]),
  ]);
  return {
    id: snap.id,
    src: p.src,
    ratio: p.ratio || null,
    ticker: p.ticker || "",
    name: p.name || "",
    styleId: p.styleId || "",
    styleName: p.styleName || "",
    concept: p.concept || "",
    ca: p.ca || "",
    chain: p.chain || "",
    likes: p.likes || 0,
    ts: p.ts || 0,
    handle: handles[p.accountId]?.handle || null,
    photo: handles[p.accountId]?.photo || null,
    liked: liked.has(snap.id),
    mine: viewer ? p.accountId === viewer : false,
  };
}

// ---------- one account's posts ----------
//
// where() with no orderBy, sorted in memory. A where on accountId
// plus an orderBy on ts is a composite index, a missing one throws
// at runtime, and that is how the homepage spotlight silently
// emptied itself once. Nobody has 200 posts; sorting them here
// costs nothing and cannot fail.
//
// `own` is the difference between your profile and someone else's:
// yours shows hidden posts (labelled), because a post that vanished
// with no explanation is worse than one you can see was removed.
export async function postsByAccount(accountId, { viewer = null, own = false } = {}) {
  const db = getAdminDb();
  if (!db || !accountId) return [];
  const snap = await db.collection("posts").where("accountId", "==", accountId).limit(200).get();
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!own) items = items.filter((p) => !p.hidden);
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const [handles, liked] = await Promise.all([
    handlesFor([accountId]),
    likedByViewer(db, viewer, items.map((p) => p.id)),
  ]);
  return items.map((p) => ({
    id: p.id,
    src: p.src,
    ratio: p.ratio || null,
    ticker: p.ticker || "",
    name: p.name || "",
    styleId: p.styleId || "",
    styleName: p.styleName || "",
    ca: p.ca || "",
    chain: p.chain || "",
    likes: p.likes || 0,
    ts: p.ts || 0,
    hidden: Boolean(p.hidden),
    handle: handles[accountId]?.handle || null,
    photo: handles[accountId]?.photo || null,
    liked: liked.has(p.id),
    mine: viewer ? accountId === viewer : false,
  }));
}

// Remove your own post. Checks ownership inside the transaction
// rather than before it — an id is guessable, and a delete route
// that trusts the caller is a delete route for everyone's posts.
export async function deleteOwnPost(accountId, postId) {
  const db = getAdminDb();
  if (!db) return { ok: false };
  const ref = db.collection("posts").doc(String(postId || ""));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // Same answer for missing and not-yours, so nobody can probe
    // which post ids exist.
    if (!snap.exists || snap.data().accountId !== accountId) return { ok: false, error: "Not found." };
    tx.delete(ref);
    return { ok: true };
  });
}

// ---------- likes ----------

// Toggle, in a transaction with the counter, so a double-tap cannot
// leave the count and the row disagreeing.
export async function toggleLike(accountId, postId) {
  const db = getAdminDb();
  if (!db) return { ok: false };

  const postRef = db.collection("posts").doc(postId);
  const likeRef = db.collection("likes").doc(`${postId}_${accountId}`);

  return db.runTransaction(async (tx) => {
    const [post, like] = [await tx.get(postRef), await tx.get(likeRef)];
    if (!post.exists) return { ok: false, error: "That post is gone." };
    const count = post.data().likes || 0;

    if (like.exists) {
      tx.delete(likeRef);
      tx.update(postRef, { likes: Math.max(0, count - 1) });
      return { ok: true, liked: false, likes: Math.max(0, count - 1) };
    }
    tx.set(likeRef, { postId, accountId, ts: Date.now() });
    tx.update(postRef, { likes: count + 1 });
    return { ok: true, liked: true, likes: count + 1 };
  });
}

// ---------- reports ----------

export async function reportPost(accountId, postId, reason = "") {
  const db = getAdminDb();
  if (!db) return { ok: false };

  const postRef = db.collection("posts").doc(postId);
  const repRef = db.collection("reports").doc(`${postId}_${accountId}`);

  return db.runTransaction(async (tx) => {
    const [post, rep] = [await tx.get(postRef), await tx.get(repRef)];
    if (!post.exists) return { ok: false, error: "That post is gone." };
    // Reporting twice is not two reports. Silently fine, so nobody
    // learns whether their earlier report registered.
    if (rep.exists) return { ok: true, already: true };

    const next = (post.data().reports || 0) + 1;
    tx.set(repRef, { postId, accountId, reason: str(reason, 200), ts: Date.now() });
    tx.update(postRef, {
      reports: next,
      ...(next >= AUTOHIDE_REPORTS ? { hidden: true, autoHidden: true } : {}),
    });
    return { ok: true };
  });
}

// ---------- moderation ----------

export async function setHidden(postId, hidden) {
  const db = getAdminDb();
  if (!db) return false;
  await db.collection("posts").doc(postId).update({
    hidden: Boolean(hidden),
    // Cleared on an admin decision either way, so a restored post is
    // not re-hidden the instant one more report arrives.
    autoHidden: false,
    ...(hidden ? {} : { reports: 0 }),
  });
  return true;
}

// Everything an admin needs to review, newest first. No where() clause,
// so no index — the admin list is small and filtered in memory.
export async function listForAdmin({ filter = "all" } = {}) {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db.collection("posts").orderBy("ts", "desc").limit(200).get();
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (filter === "reported") items = items.filter((p) => (p.reports || 0) > 0);
  else if (filter === "hidden") items = items.filter((p) => p.hidden);
  const handles = await handlesFor(items.map((p) => p.accountId));
  return items.map((p) => ({ ...p, handle: handles[p.accountId]?.handle || null }));
}
