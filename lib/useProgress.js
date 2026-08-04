// ============================================================
// A PROGRESS BAR FOR SOMETHING THAT REPORTS NO PROGRESS.
//
// The image API sends nothing between "asked" and "here it is". There
// is no percentage to read, and there never will be — so any bar we
// draw is an estimate, and the only question is whether it estimates
// honestly.
//
// THE DISHONEST VERSION is a linear bar that reaches 100% after N
// seconds. It is worse than a spinner: a spinner promises nothing,
// while a full bar promises the thing is finished. When it fills and
// nothing happens, the wait feels broken rather than long.
//
// THIS ONE APPROACHES BUT NEVER ARRIVES. It moves quickly at first,
// slows as it goes, and is capped short of full until the real result
// lands. So it always has somewhere left to go, and the slowing is
// itself the honest signal: still working, past the easy part.
//
//   p = CEIL x (1 - e^(-t/TAU))
//
// TAU is derived from the median duration so the curve is around 85%
// when a typical run finishes — far enough to feel nearly there, with
// visible room left so nobody reads it as stuck at the end.
//
// Never animates to 100%. Completion is announced by the banners
// appearing, which is a better signal than any bar, and racing a
// flourish against a re-render only produces a flicker.
// ============================================================
"use client";
import { useEffect, useState } from "react";

// Short of full, always. The gap is the point.
const CEIL = 0.94;

// Solving the curve for p = 0.85 x CEIL at t = median gives this.
const SHAPE = 2.25;

const TICK_MS = 250;

export function useProgress(active, medianMs = 45_000) {
  const [p, setP] = useState(0);

  useEffect(() => {
    if (!active) {
      setP(0);
      return;
    }
    const started = Date.now();
    const tau = Math.max(1000, medianMs / SHAPE);

    // Set once immediately so the bar is already moving on the frame
    // the button changes, rather than sitting at zero for a beat.
    const tick = () => setP(CEIL * (1 - Math.exp(-(Date.now() - started) / tau)));
    tick();

    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [active, medianMs]);

  return p;
}
