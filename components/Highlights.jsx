// THE PRESS LINE — banners running off the press, continuously.
//
// This used to be five fixed slots in a grid that swapped their
// contents every twelve seconds: a static shape where things
// occasionally blinked. The section's own copy promises "fresh
// banners as they come off the press", and a grid can't say that.
//
// Now it's a belt. Prints travel the full width and leave at the
// edge, running without pause. Two rows at different speeds and
// opposite directions give the band depth and stop the loop from
// being legible. Hovering slows it to a crawl rather than freezing —
// a stopped belt reads as broken — and lifts the print under the
// cursor.
//
// Only generations an admin has flagged "Fresh wall" on /admin7731
// appear. Style posters pad the belt while curation is thin, so it
// is never half-empty.
"use client";
import { useEffect, useMemo, useState } from "react";
// Metadata only — see the note in lib/styles.js.
import { STYLES as TEMPLATES } from "@/lib/styles";

// Enough copies that the belt is always wider than any viewport. The
// track is duplicated once more in the markup for a seamless wrap,
// so the join never lands on screen.
const MIN_PER_ROW = 7;

export default function Highlights() {
  const [real, setReal] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/spotlight");
        const d = await r.json();
        setReal(
          (d.wall || []).map((it) => ({
            kind: "img", src: it.src, ticker: it.ticker, template: it.template, key: `img-${it.ts}`,
          }))
        );
      } catch {}
    })();
  }, []);

  const rows = useMemo(() => {
    const posters = TEMPLATES.map((t) => ({
      kind: "poster", accent: t.accent, ticker: t.name, template: t.tagline, key: `poster-${t.id}`,
    }));
    // Real work leads; posters exist to fill gaps, not to headline.
    const pool = [...real, ...posters];

    const grow = (offset) => {
      const out = [];
      let i = offset;
      while (out.length < MIN_PER_ROW) {
        out.push({ ...pool[i % pool.length], slot: out.length });
        i++;
      }
      return out;
    };
    // The second row starts further along the pool so the two rows
    // never show the same banner side by side.
    return [grow(0), grow(Math.ceil(pool.length / 2))];
  }, [real]);

  return (
    <div className="press">
      {rows.map((row, r) => (
        <div className={`press-row r${r}`} key={r}>
          <div className="press-track">
            {[0, 1].map((dup) =>
              row.map((item) => (
                <Print key={`${r}-${dup}-${item.key}-${item.slot}`} item={item} />
              ))
            )}
          </div>
        </div>
      ))}
      <span className="press-edge left" aria-hidden="true" />
      <span className="press-edge right" aria-hidden="true" />
    </div>
  );
}

function Print({ item }) {
  return (
    <div className="press-print">
      {item.kind === "img" ? (
        <img
          src={item.src}
          alt={item.ticker ? `${item.ticker} banner` : "Banner made with bannr"}
          loading="lazy"
        />
      ) : (
        <div className="press-poster" style={{ "--pa": item.accent }}>
          <b>{item.ticker}</b>
          <span>{item.template}</span>
        </div>
      )}
      <span className="press-tag">
        {item.ticker}
        {item.kind === "img" && item.template ? ` · ${item.template}` : ""}
      </span>
    </div>
  );
}
