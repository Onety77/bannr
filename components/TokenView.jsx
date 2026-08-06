// ============================================================
// /token — where the money goes.
//
// The argument this page makes, in one line: money from OUTSIDE the
// token buys the token back.
//
// Which is why the two sources are never summed. Trading fees are
// traders' own money coming back to them, every launch promises it,
// and everyone has learned to discount it — correctly, because it
// stops the week volume does. Banner sales are somebody who is not a
// holder paying for a thing they wanted. That line is smaller and it
// is the headline, because it is the one that still moves on a day
// when the chart does nothing.
//
// NOTHING HERE ASKS TO BE BELIEVED. Every row opens on Solscan. That
// is the whole design; a number nobody can check is marketing, and
// this audience has seen enough of it.
//
// Shows nothing until there is something to show — see the note in
// /api/buybacks about what a zero on this page would advertise.
// ============================================================
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TokenBar from "@/components/TokenBar";

const fmt = (n, dp = 2) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp });

const big = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(v % 1_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return fmt(v, 0);
};

// Market figures, at the precision anyone actually reads them: $312K,
// not $312,481.
const usd = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "K";
  return "$" + Math.round(v);
};

const day = (ts) =>
  new Date(ts || 0).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function TokenView() {
  const [d, setD] = useState(null);
  // "money" is the default because the buybacks are the reason this
  // page is pasted anywhere.
  const [view, setView] = useState("money");

  useEffect(() => {
    let live = true;
    fetch("/api/buybacks")
      .then((r) => r.json())
      .then((x) => { if (live) setD(x); })
      .catch(() => { if (live) setD({ live: false }); });
    return () => { live = false; };
  }, []);

  const sym = d?.symbol ? `$${d.symbol}` : "$BANNR";
  const product = d?.totals?.product;
  const fees = d?.totals?.fees;
  const hasTokens = d?.tokens?.length >= 4;

  return (
    <main className="wrap tok-wrap">
      <div className="page-head">
        <h1>{sym}</h1>
      </div>

      <TokenBar />

      {/* TWO VIEWS, not one long page. The buybacks are why this page
          exists, so they open — and stacking the token list above them
          pushed the reason for the page below the fold, which was the
          wrong way round. The list is only offered once there is one. */}
      {hasTokens && (
        <div className="surface-tabs" role="tablist" aria-label="What to show">
          <button
            role="tab"
            aria-selected={view === "money"}
            className={view === "money" ? "on" : ""}
            onClick={() => setView("money")}
          >
            Buybacks &amp; burns
          </button>
          <button
            role="tab"
            aria-selected={view === "tokens"}
            className={view === "tokens" ? "on" : ""}
            onClick={() => setView("tokens")}
          >
            Performing tokens
          </button>
        </div>
      )}

      {hasTokens && view === "tokens" ? (
        <div className="page-gap-top">
          <div className="tok-head">
            <h2>Performing tokens</h2>
            {d.made > 0 && <span className="hint">{d.made.toLocaleString("en-US")} banners made</span>}
          </div>
          {/* States the bar, so a project that is missing knows why
              rather than assuming favouritism. */}
          <p className="tok-note">
            Live tokens made with bannr, above {usd(d.floor || 15000)} market cap.
            They drop off below it and come back if they recover.
          </p>
          <div className="tok-grid">
            {d.tokens.map((t) => (
              <a
                className="tok-tok"
                key={t.address}
                href={t.url || `https://dexscreener.com/${t.chain}/${t.address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={t.src} alt="" aria-hidden="true" />
                <span className="tok-tok-meta">
                  <b>${t.symbol || t.ticker?.replace(/^\$/, "") || "—"}</b>
                  <em>{usd(t.marketCap)} mcap · {usd(t.volume24h)} 24h</em>
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : d?.live ? (
        <>
          <div className="tok-lines page-gap-top">
            {/* Product first, and given the weight, even though it is
                the smaller number. It is the one that is hard to copy. */}
            {/* Burned is the headline when there is any, because that
                is the supply that is gone. Before the first burn it
                says bought instead of standing there reading zero —
                the tokens are real either way, they are just still in
                a wallet. */}
            <div className="tok-line tok-line-lead">
              <span className="tok-src">From banners sold</span>
              <b>
                {product?.burned
                  ? <>{big(product.burned)} {sym} burned</>
                  : <>{big(product?.bought)} {sym} bought</>}
              </b>
              <em>
                {fmt(product?.sol)} SOL spent
                {d.revenue?.sol ? ` · ${fmt(d.revenue.sol)} SOL earned from ${d.revenue.count} purchases` : ""}
              </em>
            </div>
            <div className="tok-line">
              <span className="tok-src">From trading fees</span>
              <b>
                {fees?.burned
                  ? <>{big(fees.burned)} {sym} burned</>
                  : <>{big(fees?.bought)} {sym} bought</>}
              </b>
              <em>{fmt(fees?.sol)} SOL spent</em>
            </div>
          </div>

          <p className="tok-note">
            Burned tokens go to the incinerator and cannot come back.
            Every line below opens on-chain.
          </p>

          <div className="tok-log">
            {d.entries.map((e) => (
              <a
                className="tok-row"
                key={e.signature}
                href={`https://solscan.io/tx/${e.signature}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="tok-when">{day(e.ts)}</span>
                <span className={`tok-tag${e.source === "product" ? " on" : ""}`}>
                  {e.source === "product" ? "banners" : "fees"}
                </span>
                {/* Each row says what ITS transaction did. A swap and
                    a burn are usually two of them, and a row claiming
                    "0 SOL → 2.8M" or "12 SOL → 0" reads like a fault
                    rather than like half of a pair. */}
                <span className="tok-amt">
                  {e.kind === "burn"
                    ? <>{big(e.burned)} {sym} burned</>
                    : e.kind === "both"
                      ? <>{fmt(e.sol)} SOL → {big(e.burned)} {sym} burned</>
                      : <>{fmt(e.sol)} SOL → {big(e.bought)} {sym}</>}
                </span>
                <span className="tok-go" aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">Nothing burned yet</div>
            <div className="empty-cta">
              <Link href="/create" className="btn primary small">Make a banner</Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
