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
// THE FAN. A tap or click throws the set open — plates bigger than
// they rest at, sweeping past both edges at three angles and depths.
// It then STAYS open. It closes only when the visitor decides it
// closes: another tap, or scrolling it off the screen.
//
// The scroll close is not a timer, it is scrubbed. How far the stage
// has left the viewport IS how far the plates have returned to the
// stack, so the moment it is fully out of sight is the moment it is
// fully closed. Scroll back mid-way and it opens again, because the
// mapping is continuous in both directions.
//
// Identical on desktop and phone. There is no reason for a cursor to
// get different choreography from a finger, and the earlier
// pointer-type branching only made two things to maintain.
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
  const [open, setOpen] = useState(false);
  const stageRef = useRef(null);
  const hoverIdx = useRef(-1);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/spotlight");
        const d = await r.json();
        if (d.hero?.length) setItems(d.hero.slice(0, MAX_CARDS));
      } catch {}
    })();
  }, []);

  // --f is the single number the whole arrangement is built from:
  // 0 is stacked, 1 is fanned wide open, and every value between is a
  // real position. Written straight to the element rather than held in
  // state, because scrolling sets it every frame and a re-render per
  // frame would cost far more than it buys.
  const setFan = useCallback((v) => {
    stageRef.current?.style.setProperty("--f", String(v));
  }, []);

  // Cursor tilt, same reasoning — no state, no re-render.
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
    hoverIdx.current = -1;
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  // SCROLLING CLOSES IT, in proportion. r.bottom is how much of the
  // stage is still below the top edge of the screen, so dividing by
  // its height gives exactly "how much of this is left to see" — 1
  // while it is fully below, 0 the instant it clears the top. Feeding
  // that straight into --f means the set finishes closing at the same
  // moment it finishes leaving.
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const node = stageRef.current;
        if (!node) return;
        const r = node.getBoundingClientRect();
        const f = Math.max(0, Math.min(1, r.bottom / Math.max(r.height, 1)));
        // Transitions have to be off while scrubbing or the plates lag
        // behind the finger instead of tracking it.
        node.classList.add("scrub");
        setFan(f);
        // Fully gone: drop out of the open state, so scrolling back up
        // finds it stacked rather than silently re-opening something
        // the visitor already scrolled past.
        if (f <= 0.002) setOpen(false);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open, setFan]);

  // Plates are painted back to front, so "front" means last. Stepping
  // the whole order along rotates the set rather than swapping two, so
  // the arrangement re-forms instead of flickering.
  const advance = useCallback(() => {
    setItems((list) => {
      if (list.length < 2) return list;
      const next = [...list];
      next.unshift(next.pop());
      return next;
    });
  }, []);

  function toggle() {
    if (items.length < 2) return;
    const el = stageRef.current;
    // A tap is a decision, so it animates — scrubbing turned the
    // transition off and this turns it back on.
    el?.classList.remove("scrub");

    if (open) {
      // Closing by choice also brings the next banner to the front, so
      // repeated taps walk through the set. Closing by SCROLLING does
      // not: leaving something behind is not a request for the next one.
      advance();
      setOpen(false);
      setFan(0);
    } else {
      setOpen(true);
      setFan(1);
    }
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
        className={`stage n${items.length}${open ? " open" : ""}`}
        ref={stageRef}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
        onClick={toggle}
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
                onPointerEnter={() => { hoverIdx.current = i; }}
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

        {/* One control for the whole stage, so the interaction is
            reachable by keyboard and announced properly. The plates
            themselves are decorative to a screen reader — they carry
            their own alt text and nothing else to activate. */}
        <button
          type="button"
          className="stage-toggle"
          aria-pressed={open}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
        >
          {open ? "Close the set" : "See all three"}
        </button>

        <span className="stage-live"><i />LIVE</span>
      </div>
    </div>
  );
}
