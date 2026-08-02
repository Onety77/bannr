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
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_CARDS = 3;
const TILT = 9; // degrees the group turns toward the cursor

export default function Spotlight() {
  const [items, setItems] = useState([]);
  const stageRef = useRef(null);
  const animTimer = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/spotlight");
        const d = await r.json();
        if (d.hero?.length) setItems(d.hero.slice(0, MAX_CARDS));
      } catch {}
    })();
  }, []);

  // The whole interaction, in one function.
  //
  // Distance from the centre of the stage to the centre of the screen,
  // measured against the distance at which the stage would be exactly
  // touching a viewport edge. So: 0 while it is entering or leaving, 1
  // when it is dead centre, and symmetric — scrolling up through it
  // looks the same as scrolling down.
  //
  // Smoothstepped rather than linear, because a straight ramp spends
  // too long being almost-open at both ends and reads as sluggish.
  const update = useCallback(() => {
    const node = stageRef.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const distance = Math.abs(r.top + r.height / 2 - vh / 2);
    const range = (vh + r.height) / 2;
    const t = Math.max(0, Math.min(1, 1 - distance / range));
    node.style.setProperty("--f", (t * t * (3 - 2 * t)).toFixed(4));
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !items.length) return;

    // Someone who has asked for less motion should not be handed a rig
    // that breathes at them as they scroll. It stays stacked.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      el.style.setProperty("--f", "0");
      return;
    }

    let raf = 0;
    let listening = false;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; update(); });
    };
    const listen = (on) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
      } else {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    };

    // Only measure while it is near the screen. This runs on the
    // homepage, and a scroll listener doing geometry for a section
    // nobody can see is pure waste.
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
      listen(false);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items.length, update]);

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
