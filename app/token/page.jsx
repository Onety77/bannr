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

const day = (ts) =>
  new Date(ts || 0).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function TokenPage() {
  const [d, setD] = useState(null);

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

  return (
    <main className="wrap tok-wrap">
      <div className="page-head">
        <h1>{sym}</h1>
        <p>Where the money goes.</p>
      </div>

      <TokenBar />

      {d?.live ? (
        <>
          <div className="tok-lines page-gap-top">
            {/* Product first, and given the weight, even though it is
                the smaller number. It is the one that is hard to copy. */}
            <div className="tok-line tok-line-lead">
              <span className="tok-src">From banners sold</span>
              <b>{big(product?.burned)} {sym} burned</b>
              <em>
                {fmt(product?.sol)} SOL spent
                {d.revenue?.sol ? ` · ${fmt(d.revenue.sol)} SOL earned from ${d.revenue.count} purchases` : ""}
              </em>
            </div>
            <div className="tok-line">
              <span className="tok-src">From trading fees</span>
              <b>{big(fees?.burned)} {sym} burned</b>
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
                <span className="tok-amt">
                  {fmt(e.sol)} SOL → {big(e.burned || e.bought)} {sym}
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
