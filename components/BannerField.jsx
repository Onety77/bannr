// THE BANNER FIELD — a section's living background: parallel rows of
// real bannr output, the whole band tilted a few degrees.
//
// SCROLL-DRIVEN, NOT SELF-ANIMATING. The rows sit still until you
// scroll, then move at the speed you're scrolling and coast to a
// stop. A background that drifts on its own competes with the page
// for attention and reads as restless; one that answers the scroll
// feels like depth. That's what BASE_SPEEDS being zero buys.
//
// On pointer devices the field also dims in a soft circle around
// the cursor.
// Images come from /public/banner-bgs/bnbg1.jpg … bnbg20.jpg —
// whichever exist are used; none exist, no field.
// Positioned absolutely inside its host section (not fixed), so it
// scrolls away with that section instead of trailing the whole
// site. Drop one into any `position: relative` host. Honors
// prefers-reduced-motion (static collage, no drift).
"use client";
import { useEffect, useRef, useState } from "react";

const MAX_IMAGES = 20;
const ROW_COUNT = 10;                   // enough to fill a tall hero top-to-bottom; extra rows clip on shorter sections
const TILES_PER_ROW = 8;
// All zero: rows are motionless until the page scrolls. Alternating
// signs are kept per row via the existing direction logic, so rows
// still travel opposite ways — they just do it under your control.
const BASE_SPEEDS = [0, 0, 0, 0];
const SCROLL_PUSH = 3.2;                // scroll velocity -> row speed
const MAX_BOOST = 420;                  // px/s cap, so a flick can't blur it

export default function BannerField() {
  const [imgs, setImgs] = useState(null);
  const fieldRef = useRef(null);
  const trackRefs = useRef([]);

  // probe which bnbgN.jpg files actually exist
  useEffect(() => {
    let alive = true;
    Promise.all(
      Array.from({ length: MAX_IMAGES }, (_, i) => {
        const src = `/banner-bgs/bnbg${i + 1}.jpg`;
        return new Promise((res) => {
          const im = new Image();
          im.onload = () => res(src);
          im.onerror = () => res(null);
          im.src = src;
        });
      })
    ).then((list) => alive && setImgs(list.filter(Boolean)));
    return () => { alive = false; };
  }, []);

  // drift loop + scroll boost + cursor dim
  useEffect(() => {
    if (!imgs || imgs.length < 3) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rows = trackRefs.current.filter(Boolean);
    const state = rows.map((el, i) => ({
      el,
      x: i * 173,                        // desync the loops
      dir: i % 2 === 0 ? -1 : 1,         // left, right, left, right
      speed: BASE_SPEEDS[i % BASE_SPEEDS.length],
      half: Math.max(1, el.scrollWidth / 2),
    }));

    let boost = 0;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      boost = Math.min(MAX_BOOST, boost + Math.abs(y - lastY) * SCROLL_PUSH);
      lastY = y;
    };

    // dim spot follows the cursor, measured relative to THIS field's
    // own box — so it lands right whether the field sits at the top
    // of the page or further down behind another section.
    const onPointer = (e) => {
      const el = fieldRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };

    let raf, last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      boost *= Math.exp(-dt * 2.4); // ease the scroll push back down
      for (const s of state) {
        s.x += (s.speed + boost) * dt;
        const mod = s.x % s.half;
        s.el.style.transform = `translate3d(${s.dir === -1 ? -mod : mod - s.half}px, 0, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };

    if (!reduced) {
      window.addEventListener("scroll", onScroll, { passive: true });
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [imgs]);

  if (!imgs || imgs.length < 3) return null;

  // Fixed row count so the band fills the whole host section top to
  // bottom (rows that overflow just clip). Each row is an offset
  // slice of the pool so neighbouring rows never line up the same
  // images, and each row varies tile-to-tile even with few uploads.
  const rows = Array.from({ length: ROW_COUNT }, (_, r) =>
    Array.from({ length: TILES_PER_ROW }, (_, k) => imgs[(r * 3 + k) % imgs.length])
  );

  return (
    <div className="banner-field" ref={fieldRef} aria-hidden="true">
      <div className="bf-inner">
        {rows.map((row, i) => (
          <div className="bf-row" key={i}>
            <div className="bf-track" ref={(el) => (trackRefs.current[i] = el)}>
              {[...row, ...row].map((src, k) => (
                <img src={src} alt="" key={k} loading="lazy" decoding="async" draggable={false} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bf-fade" />
    </div>
  );
}
