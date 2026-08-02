// ============================================================
// THE DRAFT — what you were doing on /create, kept while you look at
// something else.
//
// Navigating to another tab unmounts the create page, and every piece
// of it lived in component state: the name, the ticker, the About, the
// logo you uploaded, the styles you picked, the settings you opened
// and adjusted, and the banners you had already generated. Coming back
// showed an empty form, as though you had never been there. Worse, a
// generation running when you left was simply abandoned — the request
// carried on, the credits were spent, and the result had nowhere to
// land.
//
// This is a module-level store, deliberately. Next's client-side
// navigation keeps the JavaScript context alive between routes, so a
// value held here outlives the component that created it. That is what
// makes an in-flight generation resumable rather than merely
// remembered: the SAME promise is still running, and the page that
// comes back re-attaches to it and receives the result it would have
// received anyway.
//
// NOT localStorage, and not sessionStorage. The draft holds File
// objects (the logo, the reference images) and a live promise, none of
// which survive serialisation — and a half-restored draft missing its
// logo would be worse than none. This lives exactly as long as the tab
// does, which is exactly as long as it is useful.
// ============================================================
"use client";

let draft = null;

// The generation currently running, if any. Held here rather than in
// the component so that leaving the page does not orphan it.
let inFlight = null;

export function saveDraft(next) {
  draft = next;
}

export function loadDraft() {
  return draft;
}

export function clearDraft() {
  draft = null;
}

// --- the running generation ---

// `promise` should already be attached to its own handlers by the
// caller; this only makes it findable again.
export function setInFlight(promise) {
  inFlight = promise;
  // Clear itself when it settles, so a later mount does not re-attach
  // to something that finished long ago. Both paths, because a
  // rejection still means "no longer running".
  const done = () => { if (inFlight === promise) inFlight = null; };
  promise.then(done, done);
}

export function getInFlight() {
  return inFlight;
}
