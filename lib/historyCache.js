// ============================================================
// MY BANNERS, KEPT WHILE YOU LOOK AT SOMETHING ELSE.
//
// Same reason as lib/feedCache.js, and a worse offence without it:
// loadHistory does not merely fetch. When there is anything left in
// localStorage from before history moved server-side, it POSTs every
// one of those entries up before returning. Re-running that on every
// tab switch is a burst of writes to answer a question already
// answered.
//
// Deliberately its own file rather than shared with the feed. They
// look alike and are not: the feed pages, merges a fresh first page
// into what you are already looking at, and trims a cursor to match.
// This is one capped list of your own things. The genuinely identical
// part — remembering the scroll — is the hook they both call.
// ============================================================
"use client";

export const STALE_MS = 45_000;

let cache = null; // { items, at }

export function readHistory() {
  return cache;
}

export function writeHistory(items) {
  cache = { items, at: Date.now() };
  return cache;
}

// Called after a delete, so the next visit does not paint a banner
// that is already gone.
export function patchHistory(items) {
  if (cache) cache.items = items;
}

export function clearHistory() {
  cache = null;
}
