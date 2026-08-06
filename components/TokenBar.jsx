// ============================================================
// $BANNR — the contract address, and what holding it gets you.
//
// RENDERS NOTHING until an admin ticks "announced". Not a placeholder,
// not a "coming soon" — nothing. A token that does not exist yet
// should take up no space, and the moment it does exist this appears
// everywhere it has been placed without a deploy.
//
// The address is the whole point, so it is built for the one thing
// anyone does with it: copy it. Tapping ANYWHERE on the row copies —
// not a 24px icon at the end of a string, which on a phone is a
// coin-flip. The visible text is middle-truncated to fit; what lands
// on the clipboard is always the full address.
//
// It is written in a monospace face with the ends emphasised, because
// that is how people actually verify an address: first four, last
// four. A proportional font makes that check harder for no reason.
// ============================================================
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrice } from "@/lib/usePrice";

// $312K, not $312,481 — the precision anyone actually reads.
const usd = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2).replace(/\.00$/, "") + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "K";
  return "$" + Math.round(v);
};

export default function TokenBar({ compact = false }) {
  const [t, setT] = useState(null);
  const [copied, setCopied] = useState(false);
  const price = usePrice();

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch("/api/token");
        const d = await r.json();
        if (live && d?.announced && d?.mint) setT(d);
      } catch {}
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    const text = t?.mint;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Wallet in-app browsers routinely block the async clipboard
      // API, and they are a large share of the people who want this
      // address. The old path still works in all of them.
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:absolute;left:-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
      } catch {}
    }
  }

  if (!t) return null;

  const m = t.mint;
  const short = m.length > 16 ? `${m.slice(0, 6)}…${m.slice(-6)}` : m;

  return (
    <div className={`tbar${compact ? " compact" : ""}`}>
      <button
        className="tbar-ca"
        onClick={copy}
        title="Tap to copy the full contract address"
        aria-label={`Copy the ${t.symbol} contract address`}
      >
        <span className="tbar-tick">${t.symbol}</span>
        {/* Both are rendered; CSS picks one by width, so the full
            address is there to be selected by hand on desktop. */}
        <span className="tbar-mint full">{m}</span>
        <span className="tbar-mint short">{short}</span>
        <span className={`tbar-copy${copied ? " done" : ""}`}>{copied ? "Copied" : "Copy"}</span>
      </button>

      {/* LIVE, every five seconds. The bar already means "the token";
          a number that moves makes it a thing happening rather than a
          string to copy — and this is the one component that is
          already on the homepage, the feed rail and /token.

          Absent entirely until there is a price, so nothing renders a
          zero while the market data is still on its way. */}
      {price?.marketCap > 0 && (
        <a
          className="tbar-live"
          href={price.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <b>{usd(price.marketCap)}</b>
          <span className="tbar-live-k">mcap</span>
          {Number.isFinite(price.change24h) && price.change24h !== 0 && (
            <span className={`tbar-chg${price.change24h > 0 ? " up" : " down"}`}>
              {price.change24h > 0 ? "+" : ""}{price.change24h.toFixed(1)}%
            </span>
          )}
        </a>
      )}

      {/* Only when the gate is actually live. Announcing the token and
          switching on free generations are separate decisions, and the
          promise must never appear before it can be kept. */}
      {t.live && t.dailyRuns > 0 && (
        <p className="tbar-perk">
          Hold <b>{Number(t.minTokens).toLocaleString("en-US")} ${t.symbol}</b> and get{" "}
          <b>{t.dailyRuns} free banners a day</b>.
          {t.maturityHours > 0 ? ` Counts after ${t.maturityHours}h of holding.` : ""}
          {t.note ? ` ${t.note}` : ""}
        </p>
      )}

      {/* BESIDE the address, never wrapping it. Tapping anywhere on
          that row copies — the whole reason the bar is a button rather
          than a link — and making the container navigate would take
          the one action it was built for and give it to a page. */}
      <Link className="tbar-more" href="/token">Buybacks and burns</Link>
    </div>
  );
}
