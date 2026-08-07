// ============================================================
// MEMES — the teaser.
//
// Same job and shape as XComingSoon: one line of promise and three
// examples, enough to make someone want a thing that is not built.
// The argument belongs on the page that eventually sells it.
//
// STATIC FILES, not the spotlight feed. The X teaser pulls real
// banners because real banners exist; nothing in the product has ever
// made a meme, so there is nothing to pull and a fallback to banner
// art would show three 3:1 strips under a heading promising 3:2
// memes. Three committed images, shipped in public/memes, are the
// honest version — and they are what the section is claiming it can
// do, so they should be judged as a claim rather than as decoration.
//
// A meme is roughly 3:2 rather than exactly, because that is what
// memes are: whatever shape the picture arrived in. The cards fix the
// ratio so the row reads as a set; the product will not.
// ============================================================
"use client";
import { useRef } from "react";
import { useScrollFocus } from "@/lib/useScrollFocus";

const SHOTS = [
  { src: "/memes/pepe.jpg", label: "Pepe" },
  { src: "/memes/wojak.jpg", label: "Wojak" },
  { src: "/memes/chad.jpg", label: "Chad" },
];

export default function MemesComingSoon() {
  // The same scroll-driven --f the other stages run on: closed as it
  // enters, open at dead centre, closed on the way out. A static
  // teaser for something unshipped reads as an abandoned screenshot.
  const stage = useRef(null);
  useScrollFocus(stage, true);

  return (
    <div className="mcs">
      <div className="xcs-head">
        <span className="xcs-badge">Coming soon</span>
        <h2>Memes.</h2>
        <p>The joke, rendered properly.</p>
      </div>

      <div className="mcs-row" ref={stage}>
        {SHOTS.map((s, i) => (
          <figure className={`mcs-card p${i}`} key={s.src}>
            <img src={s.src} alt={`${s.label} meme example`} loading="lazy" />
            <figcaption>{s.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
