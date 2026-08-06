// ============================================================
// HEADERS FOR X — the teaser.
//
// A teaser, not a pitch. One line of promise and three banners shown
// as profiles; the argument for why X headers are their own problem
// belongs on the page that actually sells them, not on a placeholder.
//
// The three sit as a loose scatter in perspective rather than a row —
// a row of three equal rectangles is a table of contents, and this is
// meant to make someone want the thing that is not built yet.
//
// Which three is an admin decision: flag "X teaser" on /admin7731.
// Its own flag rather than reusing the homepage highlight set, because
// those are chosen to work in a dark carousel and these are judged
// inside a profile mockup — different job, different picks.
//
// The mockup is deliberately generic: grey placeholders, no borrowed
// logo, wordmark, colour or domain. It shows where an avatar lands and
// where a header gets cropped, and could never be mistaken for the
// real site.
// ============================================================
"use client";
import { useEffect, useRef, useState } from "react";
import { useScrollFocus } from "@/lib/useScrollFocus";

export default function XComingSoon() {
  const [shots, setShots] = useState([]);
  // Same scroll-driven --f the homepage stage runs on: closed as it
  // enters, open at dead centre, closed again on the way out. The
  // three profiles were static here, which made a teaser for a
  // product that has not shipped look like a screenshot of one that
  // has been abandoned.
  const stage = useRef(null);
  useScrollFocus(stage, true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/spotlight", { cache: "no-store" });
        const d = await r.json();
        // Falls back to the homepage highlights until anything has been
        // flagged for the teaser, so this is never three empty cards.
        const picks = (d.x?.length ? d.x : [...(d.hero || []), ...(d.wall || [])]).slice(0, 3);
        setShots(picks);
      } catch {}
    })();
  }, []);

  return (
    <div className="xcs">
      <div className="xcs-head">
        <span className="xcs-badge">Coming soon</span>
        <h2>
          Headers for <span className="xcs-x">𝕏</span>.
        </h2>
        <p>
          Designed for X, not resized for it.
        </p>
      </div>

      <div className="xcs-scatter" ref={stage}>
        {[0, 1, 2].map((i) => (
          <XProfile key={shots[i]?.ts ?? i} shot={shots[i]} pos={i} />
        ))}
      </div>
    </div>
  );
}

function XProfile({ shot, pos }) {
  return (
    <div className={`xp p${pos}`}>
      <div className="xp-header">
        {shot ? (
          <img src={shot.src} alt={shot.ticker ? `${shot.ticker} as a profile header` : "A banner shown as a profile header"} loading="lazy" />
        ) : (
          <div className="xp-empty" />
        )}
        {/* Drawn where they actually land: the slices X trims on a
            phone, and the avatar that covers the bottom-left. */}
        <span className="xp-crop left" aria-hidden="true" />
        <span className="xp-crop right" aria-hidden="true" />
      </div>
      <div className="xp-body">
        <span className="xp-avatar" aria-hidden="true" />
        <div className="xp-actions" aria-hidden="true">
          <span className="xp-follow" />
        </div>
        <div className="xp-lines" aria-hidden="true">
          <span className="xp-line w45" />
          <span className="xp-line w30 dim" />
          <span className="xp-line w80 dim" />
        </div>
      </div>
    </div>
  );
}
