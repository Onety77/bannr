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

// Touch fan-out. HOLD is how long the spread arrangement sits open
// before folding back; BACK is the fold itself. Both are mirrored in
// the CSS transition on .plate, so change them together.
const FAN_HOLD_MS = 1150;
const FAN_BACK_MS = 560; // ≥ the 0.55s transform transition on .plate

export default function Spotlight() {
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const stageRef = useRef(null);
  const expanding = useRef(false);   // locks out taps mid-animation
  const timers = useRef([]);
  const lastPointer = useRef("mouse");
  // Which plate the cursor is over. The click is resolved from THIS
  // rather than from the event target: the plates overlap heavily
  // inside a preserve-3d context, so where a click actually lands is
  // unpredictable, whereas hover is unambiguous — the pointed-at
  // plate visibly lifts, so the user already knows which one is armed.
  const hoverIdx = useRef(-1);

  // A tap that lands while these are pending would otherwise fire
  // after unmount and warn.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

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
    hoverIdx.current = -1;
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  // One handler for the whole stage, so a click can never fall into a
  // gap between plates and do nothing.
  function onStageClick() {
    if (items.length < 2) return;
    if (lastPointer.current !== "mouse") { fanAndAdvance(); return; }
    // Pointed at a plate: that one. Pointed at nothing: step the
    // stack along, which is the only thing a click there could mean.
    const i = hoverIdx.current;
    bringForward(i >= 0 ? i : items.length - 2);
    // The plate under the cursor just became the front one. Its DOM
    // node moved but the pointer never left it, so pointerenter will
    // not fire again — without this, a second click without moving
    // the mouse would act on whatever else landed at the old index.
    if (i >= 0) hoverIdx.current = items.length - 1;
  }

  // Plates are painted back to front, so "front" means last. Moving
  // the chosen one to the end rotates the others back a place rather
  // than swapping two — the whole arrangement re-forms, which is what
  // makes it read as picking a print out of a stack.
  function bringForward(i) {
    setItems((list) => {
      if (i < 0 || i >= list.length || i === list.length - 1) return list;
      const next = [...list];
      next.push(next.splice(i, 1)[0]);
      return next;
    });
  }

  // TOUCH: there is no cursor to point with, so tapping anywhere fans
  // the whole set out flat — every banner fully visible, nothing
  // overlapping — holds a moment, then folds back with the next one
  // in front. Tap again and it walks on through the set.
  function fanAndAdvance() {
    if (expanding.current || items.length < 2) return;
    expanding.current = true;
    setExpanded(true);
    timers.current.push(
      setTimeout(() => {
        setItems((list) => {
          const next = [...list];
          next.unshift(next.pop());   // step the whole order along
          return next;
        });
        setExpanded(false);
      }, FAN_HOLD_MS),
      setTimeout(() => { expanding.current = false; }, FAN_HOLD_MS + FAN_BACK_MS)
    );
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
        className={`stage n${items.length} ${expanded ? "fan" : ""}`}
        ref={stageRef}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
        onPointerDown={(e) => { lastPointer.current = e.pointerType || "mouse"; }}
        onClick={onStageClick}
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
                onPointerEnter={() => { hoverIdx.current = i; }}
                // The click itself is handled by the stage, which reads
                // hoverIdx — see onStageClick.
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
