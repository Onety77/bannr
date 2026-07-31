// ============================================================
// DEX PREVIEW — the banner where it actually lands.
//
// A banner judged full-width on a laptop is judged at roughly four
// times the size it ships at. Type that reads beautifully here can
// be mush in the slot it was made for, and a subject pushed to one
// edge can end up behind page furniture.
//
// So this drops the real banner into a mock token page at honest
// proportions: header, chart, trade panel, stats. Everything around
// it is deliberately grey and unlabelled — it's scaffolding to judge
// the banner against, not a pixel-accurate clone of anyone's site,
// and it must never read as one.
// ============================================================
"use client";

export default function DexPreview({ src, ticker }) {
  const name = ticker || "TOKEN";

  return (
    <div className="dexp" aria-label="Preview of how this banner appears on a token page">
      <div className="dexp-chrome">
        <span className="dexp-dot" /><span className="dexp-dot" /><span className="dexp-dot" />
        <span className="dexp-url">token page preview</span>
      </div>

      <div className="dexp-body">
        {/* The banner in its slot — the only real thing on this page. */}
        <div className="dexp-banner">
          <img src={src} alt="Your banner in context" />
        </div>

        <div className="dexp-idbar">
          <span className="dexp-avatar" />
          <span className="dexp-name">{name}</span>
          <span className="dexp-price" />
          <span className="dexp-chip" />
          <span className="dexp-chip" />
        </div>

        <div className="dexp-cols">
          <div className="dexp-chart">
            <svg viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points="0,96 24,88 48,92 72,70 96,76 120,54 144,60 168,38 192,46 216,26 240,32 264,16 300,22"
                fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <div className="dexp-axis"><i /><i /><i /><i /></div>
          </div>
          <div className="dexp-side">
            <span className="dexp-btn" />
            <span className="dexp-line" /><span className="dexp-line short" />
            <span className="dexp-line" /><span className="dexp-line short" />
            <span className="dexp-line" />
          </div>
        </div>
      </div>
    </div>
  );
}
