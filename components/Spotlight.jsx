// THE SHOWCASE — the hero product visual, directly under the CTA.
//
// A banner is wide, flat and static, so a card that simply swaps its
// contents has nothing to say. Two earlier attempts proved it: a
// crossfade, then a card deck. Both were containers with a picture
// inside, and the eye reads them as one still image.
//
// So the interest comes from the CHANGE itself. The banner is cut
// into vertical blades and the next one arrives blade by blade, left
// to right — a split-flap board turning over. It's mechanical,
// deliberate, and it makes the point the section exists to make:
// there is always another banner behind this one.
//
// Advances on its own, and on click. No instructions printed on it.
//
// Only generations an admin has flagged "Highlight" on /admin7731
// appear here. Nothing is generated to fill it: a homepage visitor is
// signed out and generation costs real credits.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const BLADES = 12;
const ROTATE_MS = 5200;
const BLADE_STAGGER = 34;     // ms between blades starting
const BLADE_MS = 520;         // must match the sc-flip duration in CSS
// The overlay is only removed once the LAST blade has landed —
// (BLADES-1) staggers plus one full turn — otherwise the base image
// swaps underneath a blade still mid-flip and the final column pops.
const FLIP_MS = (BLADES - 1) * BLADE_STAGGER + BLADE_MS + 60;
const SWIPE_PX = 45;

export default function Spotlight() {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [incoming, setIncoming] = useState(null);  // banner mid-flip
  const [paused, setPaused] = useState(false);
  const flipping = useRef(false);
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

  const go = useCallback(
    (dir = 1) => {
      if (flipping.current) return;           // let a turn finish
      setItems((list) => {
        if (list.length < 2) return list;
        const next = (idx + dir + list.length) % list.length;
        flipping.current = true;
        setIncoming({ item: list[next], next });
        // Settled on a timer rather than animationend: the last blade's
        // event never fires if the tab is backgrounded mid-flip, which
        // would wedge `flipping` true forever.
        setTimeout(() => {
          setIdx(next);
          setIncoming(null);
          flipping.current = false;
        }, FLIP_MS);
        return list;
      });
    },
    [idx]
  );

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setInterval(() => go(1), ROTATE_MS);
    return () => clearInterval(t);
  }, [items.length, paused, go]);

  function onKeyDown(e) {
    if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  }
  function onTouchStart(e) { touchRef.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchRef.current;
    touchRef.current = null;
    if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1);
  }

  const current = items[idx];

  if (!current) {
    return (
      <div className="showcase-wrap">
        <div className="showcase"><div className="sc-empty"><span>Featured banners land here.</span></div></div>
      </div>
    );
  }

  return (
    <div className="showcase-wrap">
      <div
        className="showcase"
        role="button"
        tabIndex={0}
        aria-label="Featured banners"
        onClick={() => go(1)}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        // pointerType-gated: onMouseEnter fires on tap on many touch
        // devices while onMouseLeave never does, which would pause
        // the rotation forever on a phone.
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setPaused(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setPaused(false); }}
      >
        <img className="sc-base" src={current.src} alt={current.ticker ? `${current.ticker} banner` : "Banner made with bannr"} />

        {/* Each blade paints the same image with a shifted background
            position, so together they reconstruct it exactly. They
            turn in sequence, so the new banner assembles across the
            frame rather than appearing all at once. */}
        {incoming && (
          <div className="sc-blades" aria-hidden="true">
            {Array.from({ length: BLADES }, (_, i) => (
              <span
                key={i}
                className="sc-blade"
                style={{
                  backgroundImage: `url(${incoming.item.src})`,
                  backgroundSize: `${BLADES * 100}% 100%`,
                  backgroundPositionX: `${(i / (BLADES - 1)) * 100}%`,
                  animationDelay: `${i * BLADE_STAGGER}ms`,
                }}
              />
            ))}
          </div>
        )}

        <span className="sc-live"><i />LIVE</span>
        {current.ticker && (
          <span className="spot-label"><b>{current.ticker}</b> · {current.template}</span>
        )}
      </div>

      {items.length > 1 && (
        <div className="sc-dots" role="tablist" aria-label="Choose a banner">
          {items.map((it, i) => (
            <button
              key={it.ts + "-" + i}
              className={`sc-dot ${i === idx ? "on" : ""}`}
              role="tab"
              aria-selected={i === idx}
              aria-label={`Banner ${i + 1} of ${items.length}`}
              onClick={(e) => {
                e.stopPropagation();
                if (i !== idx && !flipping.current) go(i > idx ? 1 : -1);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
