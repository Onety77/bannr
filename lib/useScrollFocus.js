// ============================================================
// SCROLL FOCUS — one number, --f, written onto an element.
//
// 0 while the element is entering or leaving the viewport, 1 when it
// sits dead centre, and symmetric: scrolling up through it looks the
// same as scrolling down. CSS does the rest, so nothing here knows or
// cares what the animation actually is.
//
// Smoothstepped rather than linear. A straight ramp spends too long
// almost-open at both ends and reads as sluggish.
//
// Extracted from Spotlight, which had it inline, so the X teaser could
// have the same behaviour without a second copy drifting away from the
// first.
//
// Two things it is careful about:
//   - It only measures while the element is near the screen. A scroll
//     listener doing geometry for a section nobody can see is waste.
//   - Reduced motion pins --f at 0 and never listens at all. Someone
//     who asked for less motion should not get a rig that breathes at
//     them as they scroll.
// ============================================================
"use client";
import { useCallback, useEffect } from "react";
import { onScroll as subscribe } from "@/lib/scroller";

export function useScrollFocus(ref, enabled = true) {
  const update = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const distance = Math.abs(r.top + r.height / 2 - vh / 2);
    const range = (vh + r.height) / 2;
    const t = Math.max(0, Math.min(1, 1 - distance / range));
    node.style.setProperty("--f", (t * t * (3 - 2 * t)).toFixed(4));
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      el.style.setProperty("--f", "0");
      return;
    }

    let raf = 0;
    let off = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; update(); });
    };
    const listen = (on) => {
      if (on === Boolean(off)) return;
      if (on) off = subscribe(onScroll);
      else { off(); off = null; }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        listen(entry.isIntersecting);
        if (entry.isIntersecting) update();
        else el.style.setProperty("--f", "0");
      },
      { rootMargin: "120px 0px" }
    );
    io.observe(el);
    update();

    return () => {
      io.disconnect();
      if (off) { off(); off = null; }
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, enabled, update]);
}
