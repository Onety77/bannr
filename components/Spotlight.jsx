// THE SHOWCASE STAGE — a deck of real banners you flip through.
//
// The previous version called itself a stacked deck but crossfaded
// between images, so it never read as cards at all — a rectangle
// that quietly swapped its contents while a progress bar ticked
// beside it. And the card ignored clicks, which is the first thing
// anyone tries.
//
// Now the deck behaves like one: the front card lifts and rotates
// away, the card behind rises into its place, and the whole stack
// steps forward. Click, swipe or arrow-key to advance; hovering
// pauses the timer so it never moves out from under you mid-look.
//
// Pulled from /api/spotlight — only generations an admin has
// flagged "Highlight" on /admin7731 ever show here. Nothing is
// generated to fill it: a homepage visitor is signed out and
// generation costs real credits.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const ROTATE_MS = 6000;
const SWIPE_PX = 45;

export default function Spotlight() {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(null); // index mid-flight
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const touchRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/spotlight");
        const d = await r.json();
        if (d.hero?.length) setItems(d.hero);
      } catch {}
    })();
  }, []);

  // `leaving` holds the outgoing card so it can animate away while the
  // next one rises. Cleared on a timer rather than transitionend,
  // which never fires if the tab is backgrounded mid-animation.
  const advance = useCallback(
    (dir = 1) => {
      setItems((list) => {
        if (list.length < 2) return list;
        setLeaving({ i: idx, dir });
        setIdx((i) => (i + dir + list.length) % list.length);
        setTimeout(() => setLeaving(null), 620);
        return list;
      });
    },
    [idx]
  );

  useEffect(() => {
    clearInterval(timerRef.current);
    if (items.length < 2 || paused) return;
    timerRef.current = setInterval(() => advance(1), ROTATE_MS);
    return () => clearInterval(timerRef.current);
  }, [items.length, paused, advance]);

  // Arrow keys work only once the deck has focus, so they never fight
  // with the rest of the page.
  function onKeyDown(e) {
    if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      advance(1);
    }
    if (e.key === "ArrowLeft") { e.preventDefault(); advance(-1); }
  }

  function onTouchStart(e) { touchRef.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchRef.current;
    touchRef.current = null;
    if (Math.abs(dx) > SWIPE_PX) advance(dx < 0 ? 1 : -1);
  }

  const n = items.length;
  const current = items[idx];

  if (!current) {
    return (
      <div className="showcase-wrap">
        <div className="showcase">
          <div className="sc-card sc-empty">
            <span>Featured banners land here.</span>
          </div>
        </div>
      </div>
    );
  }

  // Three visible layers: the front card and the two behind it. More
  // than that is invisible depth nobody perceives.
  const at = (o) => items[(idx + o + n) % n];

  return (
    <div className="showcase-wrap">
      <div
        className="showcase"
        role="button"
        tabIndex={0}
        aria-label="Featured banners — click or swipe for the next"
        onClick={() => advance(1)}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        // pointerType-gated on purpose: onMouseEnter fires on tap on
        // many touch devices while onMouseLeave never does, which
        // would leave the deck paused forever on a phone — exactly
        // where auto-advance matters most.
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setPaused(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setPaused(false); }}
      >
        {n > 2 && <div className="sc-card sc-deck sc-deck-2" aria-hidden="true"><img src={at(2).src} alt="" /></div>}
        {n > 1 && <div className="sc-card sc-deck sc-deck-1" aria-hidden="true"><img src={at(1).src} alt="" /></div>}

        {leaving && (
          <div className={`sc-card sc-leaving ${leaving.dir < 0 ? "back" : ""}`} aria-hidden="true">
            <img src={items[leaving.i].src} alt="" />
          </div>
        )}

        <div className="sc-card sc-front" key={current.ts}>
          <img src={current.src} alt={current.ticker ? `${current.ticker} banner` : "Banner made with bannr"} />
          <span className="sc-live"><i />LIVE</span>
          {current.ticker && (
            <span className="spot-label">
              <b>{current.ticker}</b> · {current.template}
            </span>
          )}
        </div>

        {n > 1 && <span className="sc-hint" aria-hidden="true">Tap for the next</span>}
      </div>

      {n > 1 && (
        <div className="sc-dots" role="tablist" aria-label="Choose a banner">
          {items.map((it, i) => (
            <button
              key={it.ts + "-" + i}
              className={`sc-dot ${i === idx ? "on" : ""}`}
              aria-label={`Banner ${i + 1} of ${n}`}
              aria-selected={i === idx}
              role="tab"
              onClick={(e) => { e.stopPropagation(); setLeaving(null); setIdx(i); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
