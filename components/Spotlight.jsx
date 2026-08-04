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
// ones come out of this", which is the claim the section is for.
//
// THE FAN IS THE SCROLL. Nothing to tap, nothing to discover: how
// centred the stage is in the viewport IS how far open it is. It
// spreads as you come down to it, reaches full width the moment it
// sits dead centre, and folds back as it leaves — the same in reverse
// coming up, because the mapping is a pure function of position
// rather than a sequence with a beginning and an end.
//
// That is why there is no open/closed state anywhere in this file.
// There is one number, --f, derived from geometry every frame.
//
// An earlier version made this a tap-to-open toggle. The motion is
// far better as something the page does while you read it than as
// something you have to ask it for.
//
// Identical on desktop and phone. There was never a reason for a
// cursor to get different choreography from a finger.
//
// Only generations an admin has flagged "Highlight" on /admin7731
// appear here. Nothing is generated to fill it: a homepage visitor is
// signed out and generation costs real credits.
"use client";
import { useEffect, useRef, useState } from "react";
import { useScrollFocus } from "@/lib/useScrollFocus";

const MAX_CARDS = 3;
const TILT = 9; // degrees the group turns toward the cursor

export default function Spotlight() {
  const [items, setItems] = useState([]);
  const stageRef = useRef(null);
  const animTimer = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/spotlight", { cache: "no-store" });
        const d = await r.json();
        if (d.hero?.length) setItems(d.hero.slice(0, MAX_CARDS));
      } catch {}
    })();
  }, []);

  // The whole interaction is one number, --f, derived from where this
  // stage sits relative to the middle of the screen. It used to live
  // inline here; it moved to lib/useScrollFocus.js when the X teaser
  // needed the same behaviour, because two copies of scroll geometry
  // is two copies that drift.
  useScrollFocus(stageRef, items.length > 0);

  // Cursor tilt. Written straight to the element, same as --f: this
  // fires on every mouse move, and a re-render per frame would cost
  // far more than it buys.
  function onPointerMove(e) {
    const el = stageRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", (-py * TILT).toFixed(2) + "deg");
    el.style.setProperty("--ry", (px * TILT).toFixed(2) + "deg");
  }
  function reset() {
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  useEffect(() => () => clearTimeout(animTimer.current), []);

  // Tapping no longer opens anything — scrolling does that. It steps
  // the order along instead, so a visitor who wants a different banner
  // in front when the set is folded can have one.
  //
  // Reordering is the ONE thing here that needs a transition: the
  // plates swap places, and without one they teleport. Everything else
  // must stay untransitioned so it tracks the scroll exactly — hence a
  // class switched on for the length of the move and off again.
  function advance() {
    if (items.length < 2) return;
    const el = stageRef.current;
    el?.classList.add("animating");
    clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => el?.classList.remove("animating"), 700);
    setItems((list) => {
      const next = [...list];
      next.unshift(next.pop());
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
        onClick={advance}
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
                className={`plate p${i}${isFront ? " front" : ""}`}
                key={it.ts}
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
