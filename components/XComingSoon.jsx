// ============================================================
// HEADERS FOR X — the teaser.
//
// A coming-soon page that says something rather than nothing. "Coming
// soon" on its own is a dead end; this uses the space to explain why
// an X header is a different problem from a token banner, which is
// also the argument for why it will be worth paying for.
//
// The real problem, and the thing the section will exist to solve:
// X crops a header differently on every device, and the avatar sits
// over the bottom-left corner on all of them. Most headers are made
// at 1500x500 and then quietly ruined — the logo half-eaten, the
// tagline cut off on a phone. Designing around that is the product.
//
// Live banners are shown INSIDE a profile mockup rather than as flat
// rectangles, for the same reason /create previews a banner on a token
// page: a header is only judged in the place it lands. The mockup is
// deliberately generic — no borrowed logo, wordmark or colour — so it
// can never read as the real site.
// ============================================================
"use client";
import { useEffect, useState } from "react";

export default function XComingSoon() {
  const [shots, setShots] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/spotlight", { cache: "no-store" });
        const d = await r.json();
        // Real work first; the section is a teaser, not a mock-up gallery.
        setShots([...(d.hero || []), ...(d.wall || [])].slice(0, 3));
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
          Your profile header is the biggest thing on your page, and the hardest
          to get right. We&apos;re building a section for it.
        </p>
      </div>

      <div className="xcs-stage" aria-hidden={shots.length === 0}>
        <XProfile shot={shots[0]} />
      </div>

      <div className="xcs-why">
        {[
          {
            n: "01",
            h: "The avatar eats the corner",
            p: "Your picture sits on top of the bottom-left of the header, on every device. Anything you put there is gone. Headers designed as flat rectangles lose a logo to it constantly.",
          },
          {
            n: "02",
            h: "Every device crops it differently",
            p: "X shows a different slice of the same image on a phone, a tablet and a desktop. One safe area has to survive all three, and it is smaller than people think.",
          },
          {
            n: "03",
            h: "It is not a token banner",
            p: "A DEX header sells a coin in one glance to someone scrolling past. A profile header says who you are to someone who already stopped. Different job, different design.",
          },
        ].map((f) => (
          <div className="xcs-point" key={f.n}>
            <span className="xcs-n">{f.n}</span>
            <h3>{f.h}</h3>
            <p>{f.p}</p>
          </div>
        ))}
      </div>

      {shots.length > 1 && (
        <div className="xcs-strip">
          {shots.slice(1).map((s, i) => (
            <figure className="xcs-card" key={s.ts || i}>
              <img src={s.src} alt={s.ticker ? `${s.ticker} banner` : "Banner made with bannr"} loading="lazy" />
              <figcaption>{s.ticker || "bannr"}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="xcs-foot">
        In the meantime, every banner you make here already downloads at exact
        DEX Screener dimensions — and converts to X Community size in one click.
      </p>
    </div>
  );
}

// A generic profile mockup. Greys and placeholders only: this exists to
// show where a header gets cropped and where the avatar lands, not to
// imitate anyone's interface.
function XProfile({ shot }) {
  return (
    <div className="xp">
      <div className="xp-header">
        {shot ? (
          <img src={shot.src} alt="A banner shown as a profile header" />
        ) : (
          <div className="xp-empty" />
        )}
        {/* The two things that ruin a header, drawn where they land. */}
        <span className="xp-crop left" aria-hidden="true" />
        <span className="xp-crop right" aria-hidden="true" />
        <span className="xp-cropnote" aria-hidden="true">cropped on mobile</span>
      </div>
      <div className="xp-body">
        <span className="xp-avatar" aria-hidden="true" />
        <div className="xp-actions" aria-hidden="true">
          <span className="xp-dot" />
          <span className="xp-follow" />
        </div>
        <div className="xp-lines" aria-hidden="true">
          <span className="xp-line w45" />
          <span className="xp-line w30 dim" />
          <span className="xp-line w80 dim" />
          <span className="xp-line w60 dim" />
        </div>
      </div>
    </div>
  );
}
