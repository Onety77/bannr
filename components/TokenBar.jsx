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

export default function TokenBar({ compact = false }) {
  const [t, setT] = useState(null);
  const [copied, setCopied] = useState(false);

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
    </div>
  );
}
