// ============================================================
// MEMES — the teaser.
//
// Same job as XComingSoon: one line of promise and a handful of
// examples, enough to make someone want a thing that is not built.
// The argument belongs on the page that eventually sells it.
//
// STATIC FILES, not the spotlight feed. The X teaser pulls real
// banners because real banners exist; nothing in the product has ever
// made a meme, so there is nothing to pull. Committed images, shipped
// in public/memes, are the honest version — and they are what the
// section is claiming it can do, so they should be judged as a claim
// rather than as decoration. Aminu picked these six.
//
// ══ EACH MEME KEEPS ITS OWN SHAPE ══
//
// The row used to crop every card to 3:2 so it read as a set. That
// was fine for three landscape pictures and wrong for these: square,
// tall and wide, with the joke in a caption at the top or a label at
// the bottom — exactly the parts a crop takes. A meme is whatever shape
// the picture arrived in, so the cards are a masonry of columns and
// every image is shown whole. Width and height are given so the column
// is laid out before the pictures load, rather than jumping as they do.
// ============================================================
"use client";
import { useRef } from "react";
import { useScrollFocus } from "@/lib/useScrollFocus";

const SHOTS = [
  { src: "/memes/pepe.jpg", label: "Pepe", w: 900, h: 600 },
  { src: "/memes/bag.jpg", label: "Paper bag", w: 800, h: 800 },
  { src: "/memes/last-buyer.jpg", label: "Last buyer wins", w: 791, h: 1019 },
  { src: "/memes/longcat.jpg", label: "Longcat", w: 510, h: 601 },
  { src: "/memes/pup.jpg", label: "Pup", w: 800, h: 800 },
  { src: "/memes/winrar.jpg", label: "How rich are you?", w: 800, h: 873 },
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
            <img src={s.src} alt={`${s.label} meme example`} width={s.w} height={s.h} loading="lazy" />
            <figcaption>{s.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
