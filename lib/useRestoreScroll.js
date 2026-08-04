// ============================================================
// PUT THEM BACK WHERE THEY WERE.
//
// Every cached list page needs the same two things: remember the
// scroll position on the way out, and restore it once the restored
// content has actually been laid out. That is small enough to copy and
// exactly the kind of thing that then drifts — one page saving on
// unmount, the other on scroll, and only one of them working.
//
// Saved on every scroll rather than in a cleanup. A cleanup that runs
// after the page has been torn down reads 0 on some browsers, which
// silently restores everyone to the top and looks exactly like no
// cache at all.
//
// Restored on the frame AFTER the content renders, and only once. It
// depends on the list reserving its real height before images decode
// (see .fcard-shot's aspect-ratio) — without that the scroll lands in
// a half-built page, which is worse than not restoring at all because
// it looks deliberate.
// ============================================================
"use client";
import { useEffect, useRef } from "react";
import { onScroll as subscribe, scrollTop, scrollToTop } from "@/lib/scroller";

// Keyed, and module-level for the same reason the caches are: Next
// keeps the JS context alive across client navigations, so this
// outlives the component that wrote it.
const positions = new Map();

export function forgetScroll(key) {
  positions.delete(key);
}

export function useRestoreScroll(key, ready) {
  const restored = useRef(false);

  useEffect(() => {
    const save = () => positions.set(key, scrollTop());
    const off = subscribe(save);
    return () => {
      save();
      off();
    };
  }, [key]);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const y = positions.get(key) || 0;
    if (y > 0) requestAnimationFrame(() => scrollToTop(y));
  }, [key, ready]);
}
