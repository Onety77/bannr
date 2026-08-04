// ============================================================
// WHICH THING IS SCROLLING.
//
// On a phone the page does not scroll — a container does. That is the
// only reliable way to stop iOS rubber-banding, because the bounce
// belongs to the DOCUMENT scroller and the only way to not have it is
// to not scroll the document. overscroll-behavior was tried first and
// did nothing here.
//
// It matters because iOS drags `position: fixed` along with the
// bounce, so scrolling past the footer lifted the tab bar off the
// bottom of the screen and left a screen of nothing under it.
//
// ON DESKTOP NOTHING CHANGES. There is no bounce to fix there, and
// taking scrolling away from the document costs real behaviour —
// find-in-page, anchor jumps, the native scrollbar. So the container
// only becomes a scroller inside the mobile media query, and this
// resolves at runtime by ASKING rather than by guessing at a width.
// ============================================================
"use client";

const ID = "app-scroll";

// The element that actually scrolls, or null when the window does.
export function scrollerEl() {
  if (typeof document === "undefined") return null;
  const el = document.getElementById(ID);
  if (!el) return null;
  // The CSS decides. Reading it back means one source of truth for the
  // breakpoint instead of a number duplicated in JS that drifts.
  return getComputedStyle(el).overflowY === "auto" ? el : null;
}

export function scrollTop() {
  const el = scrollerEl();
  if (el) return el.scrollTop;
  return typeof window === "undefined" ? 0 : window.scrollY;
}

export function scrollToTop(y) {
  const el = scrollerEl();
  if (el) el.scrollTop = y;
  else window.scrollTo(0, y);
}

// Subscribe to whichever is scrolling. Returns the unsubscribe.
export function onScroll(fn) {
  const el = scrollerEl();
  const target = el || window;
  target.addEventListener("scroll", fn, { passive: true });
  // Resize still belongs to the window either way — the container's
  // size changes when the viewport does.
  window.addEventListener("resize", fn, { passive: true });
  return () => {
    target.removeEventListener("scroll", fn);
    window.removeEventListener("resize", fn);
  };
}
