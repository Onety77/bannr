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
import { STYLES, AUTO_ID, AUTO_NAME } from "@/lib/styles";

export default function FeedRail() {
  const [top, setTop] = useState(null);

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

      <section className="rail-card">
        <h3>Start from a style</h3>
        <div className="rail-styles">
          <Link href={`/create?style=${AUTO_ID}`}>{AUTO_NAME}</Link>
          {STYLES.map((s) => (
            <Link key={s.id} href={`/create?style=${s.id}`}>{s.name}</Link>
          ))}
        </div>
      </section>

      {/* Renders nothing until the token is announced. */}
      <TokenBar compact />
    </aside>
  );
}
