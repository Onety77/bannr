// ============================================================
// THE RAIL — what fills a wide screen beside the feed.
//
// A 3:1 banner is the product, so the obvious desktop fix — more
// columns — is the wrong one: three columns means banners a third the
// size, and the artwork is the thing people came for. The column
// stays, and gets WIDER, so the work is seen closer to true size.
//
// What was actually wrong is that the space beside it held nothing.
// A feed on a wide screen fills its sides with context, and there was
// context worth putting there:
//
//   MOST LIKED TODAY — the thing the whole feed is for, and the
//   groundwork for the daily board. Also the only part of this page
//   that gives a reason to come back tomorrow.
//   BROWSE BY STYLE — every one of these is a run someone might start.
//   THE TOKEN — already a component, and this is where people look.
//
// Hidden below 1100px. On anything narrower the feed IS the page, and
// pushing a rail into it would take width from the artwork to show a
// list — the exact trade this exists to avoid.
// ============================================================
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TokenBar from "@/components/TokenBar";

const railUsd = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "K";
  return "$" + Math.round(v);
};

export default function FeedRail() {
  const [top, setTop] = useState(null);
  const [tokens, setTokens] = useState([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch("/api/feed/top");
        const d = await r.json();
        if (live) setTop(d.posts || []);
      } catch {
        if (live) setTop([]);
      }
    })();
    // Same endpoint the /token page reads, so the two can never
    // disagree about which projects are live.
    (async () => {
      try {
        const r = await fetch("/api/buybacks");
        const d = await r.json();
        if (live) setTokens(d.tokens || []);
      } catch {}
    })();
    return () => { live = false; };
  }, []);

  return (
    <aside className="rail" aria-label="More">
      {/* Only when there is something to rank. An empty leaderboard
          says the place is empty, which is the last thing a new feed
          should be announcing about itself. */}
      {top?.length > 0 && (
        <section className="rail-card">
          <h3>Most liked today</h3>
          <ol className="rail-top">
            {top.map((p, i) => (
              <li key={p.id}>
                <Link href={`/feed/${p.id}`}>
                  <span className="rail-rank">{i + 1}</span>
                  <img src={p.src} alt="" aria-hidden="true" />
                  <span className="rail-meta">
                    <b>{p.ticker || p.name || "Untitled"}</b>
                    <em>{p.handle ? `@${p.handle}` : "someone"} · {p.likes} ♥</em>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* THE SAME PROOF, compact. Not a second tab and not a second
          page — the rail exists to fill space beside a single column,
          and "real tokens are using this" is worth more there than
          another list of links. Five, then a way through to the rest. */}
      {tokens.length >= 4 && (
        <section className="rail-card">
          <h3>Live tokens</h3>
          <ol className="rail-top rail-toks">
            {tokens.slice(0, 5).map((t) => (
              <li key={t.address}>
                <a href={t.url || `https://dexscreener.com/${t.chain}/${t.address}`} target="_blank" rel="noopener noreferrer">
                  <img src={t.src} alt="" aria-hidden="true" />
                  <span className="rail-meta">
                    <b>${t.symbol || "—"}</b>
                    <em>{railUsd(t.marketCap)} mcap</em>
                  </span>
                </a>
              </li>
            ))}
          </ol>
          <Link className="rail-more" href="/token">All of them</Link>
        </section>
      )}

      {/* The style chips moved to the top of the feed, where they
          FILTER it — which is what everyone assumed they did here. A
          second copy of the same control pointing somewhere else is
          the kind of thing that teaches people not to trust either. */}
      <section className="rail-card rail-cta">
        <h3>Your turn</h3>
        <p>Paste a contract address and get three options in about a minute.</p>
        <Link className="btn primary block" href="/create">Make a banner</Link>
      </section>

      {/* Renders nothing until the token is announced. */}
      <TokenBar compact />
    </aside>
  );
}
