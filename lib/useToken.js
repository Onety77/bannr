// The gate config, for client components. The homepage is a server
// component and calls getGate() directly instead — no fetch, no flash
// of the wrong offer.
//
// CACHED AT MODULE LEVEL, because several components ask on the same
// page and the answer is identical for all of them. Next keeps the JS
// context alive across client navigation, so it survives to the next
// page too. In flight requests are shared rather than duplicated.
//
// See lib/offer.js for turning the result into a sentence.
"use client";
import { useEffect, useState } from "react";

let cache = null;
let inflight = null;

async function load() {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/token")
      .then((r) => r.json())
      .then((d) => { cache = d || {}; return cache; })
      .catch(() => ({}))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useToken() {
  const [t, setT] = useState(cache);
  useEffect(() => {
    let live = true;
    load().then((d) => { if (live) setT(d); });
    return () => { live = false; };
  }, []);
  return t;
}
