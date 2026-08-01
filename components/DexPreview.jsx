// ============================================================
// DEX PREVIEW — the banner where it actually lands.
//
// Modelled on a real token page: top bar, token row, pair header,
// then the banner FULL-BLEED across the width, then the action
// buttons and the dense stat tiles that follow it.
//
// Two things that version one got wrong, both learned from a real
// screenshot: the banner is edge to edge with no margin or rounding,
// and what sits under it is a wall of numbers, not a chart. Both
// change how a banner reads — a design with important content near
// the left or right edge runs straight into the frame, and one with
// a busy lower half competes with the tiles beneath it.
//
// Deliberately a MOCK, not a clone. Every label is generic, every
// value is a grey placeholder, and there is no logo, wordmark or
// colour borrowed from anyone. It exists to judge scale and
// placement against, and must never read as the real site.
//
// Portrait on purpose: the phone layout is the tighter constraint,
// so a banner that survives here survives anywhere.
// ============================================================
"use client";

export default function DexPreview({ src, ticker }) {
  const name = (ticker || "TOKEN").replace(/^\$/, "").toUpperCase();

  return (
    <div className="dexp" aria-label="Preview of this banner on a token page">
      {/* top bar */}
      <div className="dexp-top">
        <span className="dexp-avatar sq" />
        <span className="dexp-pill w40" />
        <span className="dexp-ico" />
        <span className="dexp-ico" />
      </div>

      {/* token row */}
      <div className="dexp-tokenrow">
        <span className="dexp-avatar" />
        <span className="dexp-tokenname">{titleCase(name)}</span>
        <span className="dexp-kebab">⋮</span>
      </div>

      {/* pair header */}
      <div className="dexp-pair">
        <b>{name}</b><span className="dexp-slash">/</span><b className="dim">WETH</b>
      </div>
      <div className="dexp-venue">
        <span className="dexp-dot" /><span className="dexp-line w70" />
        <span className="dexp-caret">›</span>
        <span className="dexp-dot" /><span className="dexp-line w60" />
      </div>

      {/* THE BANNER — full bleed, no margin, no rounding. This is the
          only real thing on the page. */}
      <div className="dexp-banner">
        <img src={src} alt="Your banner in context" />
      </div>

      {/* actions */}
      <div className="dexp-actions">
        <span className="dexp-btn"><i />Website</span>
        <span className="dexp-btn"><i />Twitter</span>
        <span className="dexp-btn narrow">⌄</span>
      </div>

      {/* stats */}
      <div className="dexp-stats two">
        <Tile label="PRICE USD" />
        <Tile label="PRICE" />
      </div>
      <div className="dexp-stats three">
        <Tile label="LIQUIDITY" small />
        <Tile label="FDV" small />
        <Tile label="MKT CAP" small />
      </div>

      <div className="dexp-periods">
        {["5M", "1H", "6H", "24H"].map((p, i) => (
          <span className={`dexp-period ${i === 3 ? "on" : ""}`} key={p}>
            <b>{p}</b><span className="dexp-line w50" />
          </span>
        ))}
      </div>

      <div className="dexp-txns">
        <div><span className="dexp-k">TXNS</span><span className="dexp-line w40" /></div>
        <div><span className="dexp-k">BUYS</span><span className="dexp-line w50" /></div>
        <div className="right"><span className="dexp-k">SELLS</span><span className="dexp-line w50" /></div>
      </div>
      <div className="dexp-bar"><i /><b /></div>
    </div>
  );
}

function Tile({ label, small }) {
  return (
    <div className={`dexp-tile ${small ? "sm" : ""}`}>
      <span className="dexp-k">{label}</span>
      <span className="dexp-v" />
    </div>
  );
}

function titleCase(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
