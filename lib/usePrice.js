// Live $BANNR market cap, polled every 5 seconds.
//
// ONE POLLER FOR THE WHOLE PAGE. Module state, not per-component:
// the token bar and the token page can both be mounted, and two
// components each running their own interval would double the
// requests to say the same number twice. Subscribers share one timer,
// and it stops when the last one unmounts.
//
// It also stops when the tab is hidden. Nobody is reading a price on
// a background tab, and a phone left open for an hour would otherwise
// spend the whole hour asking.
"use client";
import { useEffect, useState } from "react";

const EVERY = 5000;

let data = null;
let timer = null;
const subs = new Set();

async function tick() {
  try {
    const r = await fetch("/api/token/price");
    // 204 until the token is announced — nothing to show, and no
    // reason to render zeroes.
    if (r.status === 204) { push(null); return; }
    if (!r.ok) return;
    push(await r.json());
  } catch {
    // A dropped request keeps the last figure rather than blanking
    // it. A price that flickers to nothing looks like a fault.
  }
}

function push(next) {
  data = next;
  for (const fn of subs) fn(next);
}

function start() {
  if (timer) return;
  tick();
  timer = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    tick();
  }, EVERY);
}

function stop() {
  if (!subs.size && timer) { clearInterval(timer); timer = null; }
}

export function usePrice() {
  const [p, setP] = useState(data);
  useEffect(() => {
    subs.add(setP);
    start();
    // Catch up immediately when a tab comes back, rather than showing
    // a stale number for up to five seconds.
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      subs.delete(setP);
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, []);
  return p;
}
