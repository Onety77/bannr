// THE SHOWCASE — the hero product visual, directly under the CTA.
//
// NOT A CAROUSEL. Three earlier versions were all the same format —
// one rectangle whose contents changed — which is what every tool in
// this category ships, and no transition makes that format feel like
// anything other than a slideshow.
//
// So the banners are shown ALL AT ONCE, floating in perspective
// space at a shared angle: a portfolio laid out, not a reel played.
// The claim changes from "here is a banner" to "look how many good
// ones come out of this", which is the claim the section is actually
// for.
//
// Nothing plays on a timer. It is alive because it answers the
// cursor — the whole group turns toward it, and a card you point at
// rises out of the arrangement. Movement you cause, rather than
// movement you wait through.
//
// Only generations an admin has flagged "Highlight" on /admin7731
// appear here. Nothing is generated to fill it: a homepage visitor is
// signed out and generation costs real credits.
"use client";
import { useEffect, useRef, useState } from "react";

const MAX_CARDS = 3;
const TILT = 9; // degrees the group turns toward the cursor

export default function Spotlight() {
  const [items, setItems] = useState([]);
  const stageRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/spotlight");
        const d = await r.json();
        if (d.hero?.length) setItems(d.hero.slice(0, MAX_CARDS));
      } catch {}
    })();
  }, []);

  // Written straight to CSS custom properties rather than through
  // state: this fires on every mouse move, and a re-render per frame
  // would cost far more than it buys.
  function onPointerMove(e) {
    const el = stageRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-py * TILT).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * TILT).toFixed(2)}deg`);
  }
  function reset() {
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  // Plates are painted back to front, so "front" means last. Moving
  // the tapped one to the end rotates the others back a place rather
  // than swapping two — the whole arrangement re-forms, which is what
  // makes it read as picking a print out of a stack.
  function bringForward(i) {
    setItems((list) => {
      if (i === list.length - 1) return list;
      const next = [...list];
      next.push(next.splice(i, 1)[0]);
      return next;
    });
  }

  if (!items.length) {
    return (
      <div className="showcase-wrap">
        <div className="stage">
          <div className="stage-empty"><span>Featured banners land here.</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="showcase-wrap">
      <div
        className={`stage n${items.length}`}
        ref={stageRef}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
      >
        <div className="stage-inner">
          {/* Painted back to front so the nearest card is last in the
              DOM — stacking then needs no z-index bookkeeping. */}
          {items.map((it, i) => {
            const isFront = i === items.length - 1;
            return (
              // Key is the item, NOT the index: on reorder React must
              // move the same DOM node into the new position so its
              // transform transitions there. Keying by index would
              // swap the images instead and the plates would jump.
              <figure
                className={`plate p${i} ${isFront ? "front" : ""}`}
                key={it.ts}
                role={isFront ? undefined : "button"}
                tabIndex={isFront ? -1 : 0}
                aria-label={isFront ? undefined : `Bring ${it.ticker || "this banner"} to the front`}
                onClick={() => bringForward(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bringForward(i); }
                }}
              >
                <img
                  src={it.src}
                  alt={it.ticker ? `${it.ticker} banner made with bannr` : "Banner made with bannr"}
                  loading={isFront ? "eager" : "lazy"}
                />
                {it.ticker && (
                  <figcaption>
                    <b>{it.ticker}</b>
                    {it.template ? <span>{it.template}</span> : null}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
        <span className="stage-live"><i />LIVE</span>
      </div>
    </div>
  );
}
