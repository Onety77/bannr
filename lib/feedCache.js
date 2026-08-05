// ============================================================
// THE FEED, KEPT WHILE YOU LOOK AT SOMETHING ELSE.
//
// Same idea as lib/draft.js, and the same mechanism: a module-level
// store. Next's client-side navigation keeps the JavaScript context
// alive between routes, so a value held here outlives the component
// that put it there.
//
// What was actually wrong was not the reload — it was the SCROLL.
// Twenty posts down, tap Create, come back, and you are at the top of
// a shimmering skeleton looking for your place again. A feed that
// forgets where you were is a feed you stop scrolling.
//
// The scroll position is NOT here — it lives in lib/useRestoreScroll,
// which both cached lists share.
//
// STALE-WHILE-REVALIDATE. The cached page paints immediately, and a
// fresh first page is fetched quietly behind it. Anything new is
// prepended and like counts are updated in place, so coming back is
// instant AND current — which are usually a trade, and here are not.
//
// NOT localStorage. Each post carries its image as a data URL, so a
// page of them is over a megabyte; that belongs in memory for the life
// of the tab, not in a storage quota. Capped for the same reason.
// ============================================================
"use client";

// Roughly three pages. Enough that "load more" is not undone by a tab
// switch, bounded so a long session cannot grow without limit.
const MAX_POSTS = 60;

// Older than this and the background refresh is worth doing. Younger
// and the cache is almost certainly still right.
export const STALE_MS = 45_000;

// One cache per filter. A single shared one meant switching to Tek
// painted the unfiltered posts you had a second ago and only then
// corrected itself — a cache that instantly shows the wrong answer
// is worse than a spinner showing none.
const caches = new Map(); // styleId (or "") -> { posts, cursor, done, at }

export function readFeed(key = "") {
  return caches.get(key) || null;
}

export function writeFeed(next, key = "") {
  const prev = caches.get(key) || null;
  const cache = { ...(prev || {}), ...next, at: next.at ?? prev?.at ?? Date.now() };
  caches.set(key, cache);
  if (cache.posts?.length > MAX_POSTS) {
    cache.posts = cache.posts.slice(0, MAX_POSTS);
    // The cursor belongs to the posts we dropped, so paging on from
    // here would skip a chunk. Better to let it re-page than to serve
    // a hole.
    cache.done = false;
    cache.cursor = cache.posts[cache.posts.length - 1]?.ts || 0;
  }
  return cache;
}

export function clearFeed() {
  caches.clear();
}

// Fold a freshly fetched first page into what is already on screen.
//
// Posts are newest-first, so anything unseen is newer and belongs at
// the top. Everything already present keeps its position — that is the
// whole point, since the person is standing somewhere in this list —
// but takes the server's like count, which may have moved while they
// were away.
export function mergeFresh(existing, fresh) {
  if (!existing?.length) return fresh;
  const seen = new Set(existing.map((p) => p.id));
  const added = fresh.filter((p) => !seen.has(p.id));
  const byId = new Map(fresh.map((p) => [p.id, p]));
  const updated = existing.map((p) => {
    const f = byId.get(p.id);
    return f ? { ...p, likes: f.likes, liked: f.liked } : p;
  });
  return [...added, ...updated];
}
