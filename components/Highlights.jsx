// THE FRESH WALL — five prints pinned to a board, arriving one at
// a time every ~12 seconds. Only generations an admin has flagged
// "Fresh wall" on /admin7731 show here; while nothing's curated
// yet, CSS posters (one per template style) hold the wall so it
// never looks empty. Once all five slots are filled, the oldest
// print gets replaced.
"use client";
import { useEffect, useRef, useState } from "react";
import { TEMPLATES } from "@/lib/templates";

const SLOT_COUNT = 5;
const ARRIVE_MS = 12_000;
const SLOTS = ["s1", "s2", "s3", "s4", "s5"];

export default function Highlights() {
  const [slots, setSlots] = useState(Array(SLOT_COUNT).fill(null));
  const pool = useRef([]);       // upcoming items, cycled
  const cursor = useRef(0);      // next item in pool
  const nextSlot = useRef(0);    // next slot to fill/replace

  useEffect(() => {
    let timer;
    let alive = true;

    async function buildPool() {
      let real = [];
      try {
        const r = await fetch("/api/spotlight");
        const d = await r.json();
        real = (d.wall || []).map((it) => ({
          kind: "img", src: it.src, ticker: it.ticker, template: it.template, key: `img-${it.ts}`,
        }));
      } catch {}
      const posters = TEMPLATES.map((t) => ({
        kind: "poster", accent: t.accent, ticker: "$BANNR", template: t.name, key: `poster-${t.id}`,
      }));
      // real banners first, posters pad the rotation
      pool.current = [...real, ...posters];
    }

    function pinNext() {
      if (!alive || pool.current.length === 0) return;
      const item = pool.current[cursor.current % pool.current.length];
      const slot = nextSlot.current % SLOT_COUNT;
      cursor.current += 1;
      nextSlot.current += 1;
      setSlots((prev) => {
        const next = [...prev];
        // stamp uniquely so React re-runs the pin animation on replace
        next[slot] = { ...item, stamp: `${item.key}-${cursor.current}` };
        return next;
      });
    }

    (async () => {
      await buildPool();
      if (!alive) return;
      pinNext(); // first print immediately, the rest arrive on cadence
      timer = setInterval(pinNext, ARRIVE_MS);
    })();

    return () => { alive = false; clearInterval(timer); };
  }, []);

  return (
    <div className="wall-grid">
      {slots.map((item, i) => (
        <div key={SLOTS[i]} className={`wall-slot ${SLOTS[i]} ${item ? "filled" : "empty"}`}>
          {item ? (
            <div className="wall-item" key={item.stamp}>
              {item.kind === "img" ? (
                <img src={item.src} alt={item.ticker ? `${item.ticker} banner` : "Banner example"} />
              ) : (
                <div className="wall-poster" style={{ "--pa": item.accent }}>
                  <b>{item.ticker}</b>
                  <span>{item.template}</span>
                </div>
              )}
              {item.ticker && <span className="wall-tag">{item.ticker} · {item.template}</span>}
            </div>
          ) : (
            <span><i />next print</span>
          )}
        </div>
      ))}
    </div>
  );
}
