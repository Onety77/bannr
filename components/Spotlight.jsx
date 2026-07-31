// THE SHOWCASE STAGE — hero carousel of banners made with bannr.
// A stacked deck: two rotated "ghost" cards peek out behind the
// current one, the front card tilts subtly toward the cursor,
// and a segmented progress bar (click to jump, auto-fills on a
// timer) replaces a plain "changing every N seconds" crossfade.
// Pulled from /api/spotlight — only generations an admin has
// flagged "Highlight" on /admin7731 ever show here. Nothing is
// generated to fill it: a homepage visitor is signed out and
// generation costs real credits.
"use client";
import { useEffect, useRef, useState } from "react";

const ROTATE_MS = 10_000;
const MAX_SEGMENTS = 8;
const TILT_MAX = 7; // degrees

export default function Spotlight() {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);
  const frontRef = useRef(null);

  async function load() {
    try {
      const r = await fetch("/api/spotlight");
      const d = await r.json();
      if (d.hero?.length) {
        setItems(d.hero);
        return true;
      }
    } catch {}
    return false;
  }

  useEffect(() => {
    // Curated generations only. This used to self-seed by calling
    // /api/generate when nothing was featured yet — which no longer
    // works, and shouldn't: generation now requires a signed-in
    // account and spends real credits, so a logged-out visitor
    // landing on the homepage must never trigger one. The wall fills
    // itself as real runs get flagged on /admin7731.
    load();
  }, []);

  function goTo(i) {
    setIdx(i);
    restartTimer();
  }

  function restartTimer() {
    clearInterval(timerRef.current);
    if (items.length < 2) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, ROTATE_MS);
  }

  useEffect(() => {
    restartTimer();
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  function onPointerMove(e) {
    const el = frontRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateX(${(-py * TILT_MAX).toFixed(2)}deg) rotateY(${(px * TILT_MAX).toFixed(2)}deg)`;
  }
  function onPointerLeave() {
    if (frontRef.current) frontRef.current.style.transform = "";
  }

  const current = items[idx];
  const segments = items.slice(0, MAX_SEGMENTS);
  const prev = items.length > 1 ? items[(idx - 1 + items.length) % items.length] : null;
  const next = items.length > 1 ? items[(idx + 1) % items.length] : null;

  return (
    <div className="showcase-wrap">
      <div className="showcase" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
        {prev && (
          <div className="sc-card sc-ghost sc-prev" aria-hidden="true">
            <img src={prev.src} alt="" />
          </div>
        )}
        {next && (
          <div className="sc-card sc-ghost sc-next" aria-hidden="true">
            <img src={next.src} alt="" />
          </div>
        )}
        <div className="sc-card sc-front" ref={frontRef}>
          {current ? (
            <>
              {items.map((it, i) => (
                <img
                  key={it.ts + "-" + i}
                  src={it.src}
                  alt={it.ticker ? `${it.ticker} banner` : "Banner example"}
                  className="spot-img"
                  style={{ opacity: i === idx ? 1 : 0 }}
                />
              ))}
              <span className="sc-live"><i />LIVE</span>
              {current.ticker && (
                <span className="spot-label">
                  <b>{current.ticker}</b> · {current.template} · made today
                </span>
              )}
            </>
          ) : (
            /* Honest empty state — nothing is loading, there is simply
               nothing curated yet. A spinner here would imply work
               that isn't happening. */
            <div className="spot-wait">
              <span>Featured banners land here.</span>
            </div>
          )}
        </div>
      </div>

      {segments.length > 1 && (
        <div className="sc-progress">
          {segments.map((it, i) => (
            <button
              key={it.ts + "-" + i}
              className={`sc-seg ${i < idx ? "done" : ""} ${i === idx ? "active" : ""}`}
              style={i === idx ? { "--dur": `${ROTATE_MS}ms` } : undefined}
              onClick={() => goTo(i)}
              aria-label={`Show banner ${i + 1}`}
            >
              <i />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
