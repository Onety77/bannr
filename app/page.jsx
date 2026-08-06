// LANDING v5 "CUPERTINO" — the design disappears, the product
// sells. Giant type, one floating product visual, one feature
// showcase card + a boxless feature list, the highlight wall,
// a horizontal styles gallery, one quiet CTA.
import Link from "next/link";
import Spotlight from "@/components/Spotlight";
import Socials from "@/components/Socials";
import Highlights from "@/components/Highlights";
import BannerField from "@/components/BannerField";
import TokenBar from "@/components/TokenBar";
import HeroStart from "@/components/HeroStart";
import { getGate, publicGate } from "@/lib/tokenGate";
import { offerLine } from "@/lib/offer";
// Metadata only. This page is a server component, but it renders
// client components that pull the same module into their bundle.
import { STYLES as TEMPLATES } from "@/lib/styles";

const FEATURES = [
  {
    title: "2–4 options per run",
    body: "Never one take-it-or-leave-it result — every run creates distinct options on the same brief.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="13" height="13" rx="3" />
        <path d="M8 21h10a3 3 0 0 0 3-3V8" />
      </svg>
    ),
  },
  {
    title: "Type that belongs to the art",
    body: "No slapped-on label — your name and ticker are rendered natively, in a typeface and placement chosen for this piece alone.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 6V4h14v2M12 4v16M9 20h6" />
      </svg>
    ),
  },
  {
    title: "Six tuned styles",
    body: "Each one built and refined until it stopped looking like everything else.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a2.5 2.5 0 0 0-1.8 4.2c.4.5.3 1.3-.6 1.3H12z" />
        <circle cx="7.8" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="16.2" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: "X Communities too",
    body: "One click re-frames any banner to 1300×500 for X — re-framed, never cropped.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 2v16a2 2 0 0 0 2 2h14" />
        <path d="M18 22V6a2 2 0 0 0-2-2H2" />
      </svg>
    ),
  },
  {
    title: "Pay in SOL",
    body: "Credited the moment the transaction confirms.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 5h12l-2.5 3.5H4.5L7 5zM17 19H5l2.5-3.5h12L17 19zM4.5 10.5h12L19 14H7l-2.5-3.5z" />
      </svg>
    ),
  },
  // The one card whose promise is a config an admin can change. Its
  // words are filled in from the live gate below; everything else in
  // this list is a fact about the product and stays put.
  {
    id: "offer",
    title: "Free for holders",
    body: "",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="8" width="18" height="13" rx="2.5" />
        <path d="M3 12h18M12 8v13M12 8c-1.5 0-4.5-.8-4.5-3A1.9 1.9 0 0 1 9.4 3c2.2 0 2.6 3.4 2.6 5zM12 8c1.5 0 4.5-.8 4.5-3A1.9 1.9 0 0 0 14.6 3C12.4 3 12 6.4 12 8z" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    title: "Drop your assets",
    body: "Logo or mascot, ticker, name. A line about the project if you have one.",
  },
  {
    title: "Pick a style",
    body: "Six to choose from, or leave it on Default and let bannr decide.",
  },
  {
    title: "Download and ship",
    body: "Two to four finished options at exact dimensions. Pick one and upload it.",
  },
];

export default async function Landing() {
  // Read here rather than in the browser: this page is a server
  // component, so the right offer is in the HTML instead of arriving
  // a moment later and replacing the wrong one.
  const token = publicGate(await getGate().catch(() => ({})));
  const offer = offerLine(token);

  return (
    <main>
      {/* ============ HERO ============ */}
      <section className="hero">
        <BannerField />
        <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
        <div className="wrap">
          <h1 className="reveal">
            First impressions<br /><span className="shimmer">perfected.</span>
          </h1>
          <p className="lede reveal d1">
            Professional banners, built around your project&apos;s identity.
          </p>
          {/* An input, not a button. A button asks someone to go
              somewhere and begin work; this asks them to paste one
              thing already in their clipboard, and it is the same
              request. The pricing and from-scratch links moved
              inside it as text, so nothing competes with the one
              obvious move. */}
          <HeroStart />
          {/* The offer, or NOTHING. Before the token is announced
              there is no free tier to describe, and the line that used
              to sit here — "pay per banner in SOL, no subscription, no
              seats" — was answering a pricing objection nobody had
              reached yet, three seconds into the page. */}
          {offer && <p className="hero-note reveal d2">{offer}</p>}
          {/* Renders nothing until the token is announced, so the hero
              is unchanged until the day it isn't. */}
          <div className="reveal d2"><TokenBar /></div>
        </div>

        <div className="visual-stage reveal d3">
          <div className="wrap">
            <Spotlight />
            <p className="visual-caption">
              Made with bannr, moments ago.
            </p>
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section className="section" data-sr>
        <div className="wrap">
          <div className="sec-head">
            <h2>Everything a launch needs.</h2>
            <p className="sub">
              Composition, dimensions, typography — the parts that separate a
              banner from a picture with a name on it.
            </p>
          </div>

          <div className="feature-hero">
            <div className="fh-copy">
              <h3>Exact by default.</h3>
              <p>
                Every banner ships at precise DEX Screener dimensions —
                1500×500, every time. No stretching, no bad crops, no
                rejected uploads.
              </p>
            </div>
            <div className="fh-visual" aria-hidden="true">
              <div className="fh-frame">1500 × 500</div>
            </div>
          </div>

          <div className="feature-list">
            {FEATURES.map((f) => {
              // Dropped entirely when there is no offer, rather than
              // softened into something vague. A card headed "Free for
              // holders" with nothing under it is worse than five
              // cards.
              if (f.id === "offer" && !offer) return null;
              return (
                <div className="feat" key={f.title}>
                  {f.icon}
                  <h3>{f.title}</h3>
                  <p>{f.id === "offer" ? offer : f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ HIGHLIGHT WALL ============ */}
      <section className="section field-host" data-sr>
        <BannerField />
        <div className="wrap">
          <div className="sec-head">
            <h2>Straight off the press.</h2>
            <p className="sub">
              Real banners made with bannr. The line never stops.
            </p>
          </div>
          <Highlights />
        </div>
      </section>

      {/* ============ STEPS ============ */}
      <section className="section" data-sr>
        <div className="wrap">
          <div className="sec-head">
            <h2>Three steps. No designer.</h2>
          </div>
          <div className="steps3">
            {STEPS.map((s, i) => (
              <div className="step3" key={i}>
                <div className="num">{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ STYLES GALLERY ============ */}
      <section className="section" data-sr>
        <div className="sec-head wrap">
          <h2>Find your look.</h2>
          <p className="sub">
            {TEMPLATES.length} styles, each with its own art direction and
            typography. Every one below is real output.
          </p>
        </div>
        <div className="gallery">
          {TEMPLATES.map((t) => (
            <div className="g-card" key={t.id} style={{ "--sw": t.accent }}>
              {/* Same files the style picker uses, so the homepage and
                  /create can never show different art for a style.
                  Painted as a background layer rather than an <img>:
                  this is a server component, so it can't carry an
                  onError handler — and a missing file simply lets the
                  accent gradient underneath show through, which is a
                  better fallback than a broken-image icon anyway. */}
              <div className="g-art">
                {t.thumb && (
                  <span
                    className="g-thumb"
                    role="img"
                    aria-label={`${t.name} style example`}
                    style={{ backgroundImage: `url(/styles/${t.thumb})` }}
                  />
                )}
              </div>
              <div className="g-body">
                <h3>{t.name}</h3>
                <p>{t.tagline}</p>
                <Link href={`/create?style=${t.id}`} className="link-cta">Try it</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ CTA BAND ============ */}
      <section className="section" data-sr>
        <div className="wrap">
          <div className="band">
            <h2>Ready when you are.</h2>
            <p>
              {offer ? offer + " " : ""}Your first banner is three fields
              and thirty seconds away.
            </p>
            <Link href="/create" className="btn primary large">Create your banner</Link>
            <div className="band-socials">
              <Socials />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
