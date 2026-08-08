// ============================================================
// ADMIN — the ladder.
//
// One panel for every number that decides who generates for free, what
// they can reach for, what they pay, and what it costs us. Nothing
// here is a code constant, because the week this launches is the week
// the numbers will be wrong, and "redeploy to change the daily
// allowance" is not a plan.
//
// Four things are given more room than their field size suggests:
//
//   THE CEILING, shown in dollars as you type. A count is abstract;
//   "500 runs ≈ $41/day" is a decision. It is the only number that
//   guarantees the bill regardless of who games what, so it should be
//   the number that is hardest to set carelessly.
//
//   THE THRESHOLDS, typed in dollars and stored in tokens. Storing
//   dollars would put a price feed on the critical path — a dead API
//   or a thirty-second wick would decide whether someone can generate
//   — and it would also mean every holder becomes over-qualified on a
//   pump and can sell the excess for free. See lib/tiers.js.
//
//   THE FREE TIER, first, above the token entirely. It is the only
//   part of this panel that is live before there is a coin, it applies
//   to every signed-in account rather than to holders, and it is
//   therefore the single largest exposure on the page.
//
//   THE MONTHLY COST PER HOLDER, under every allowance field. Runs a
//   day is the wrong unit for judging generosity; dollars a month is
//   the unit the decision is actually made in.
// ============================================================
"use client";
import { useEffect, useState } from "react";

const NUM = (n) => (Number(n) || 0).toLocaleString("en-US");


export default function AdminToken({ user }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  // One dollar box per tier, so all three can be worked out in one
  // sitting without the calculator resetting between them.
  const [usd, setUsd] = useState({ t1: "20", t2: "100", t3: "250" });

  async function load() {
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/token", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) return setErr(d.error || "Failed to load token settings.");
      setData(d);
      setForm(d.gate);
    } catch {
      setErr("Network error loading token settings.");
    }
  }

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
  const setFree = (k, v) => { setForm((f) => ({ ...f, free: { ...f.free, [k]: v } })); setSaved(false); };
  const setTier = (i, k, v) => {
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
    setSaved(false);
  };

  async function save() {
    setBusy(true); setErr(null); setSaved(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Save failed."); return; }
      setData((prev) => ({ ...prev, gate: d.gate, usage: d.usage || prev.usage }));
      // Taken from the RESPONSE, not from what was typed. cleanTiers
      // raises any rung that was saved below the one under it, and the
      // panel has to show the correction immediately — a form that
      // keeps displaying a number the server rejected is a form that
      // lies to the next person who opens it.
      setForm(d.gate);
      setSaved(true);
    } catch {
      setErr("Network error saving.");
    } finally {
      setBusy(false);
    }
  }

  if (!form) return <div className="admin-gate"><span className="spinner" /></div>;

  const cost = data?.usage?.costPerRun ?? 0.081;
  const ceilingSpend = form.dailyGlobalRuns > 0 ? form.dailyGlobalRuns * cost : null;
  const price = data?.price?.usd || 0;
  const tokensFor = (v) => (price > 0 ? Math.ceil((Number(v) || 0) / price) : 0);
  // The other direction, which is the one that was missing: what a
  // threshold already saved is worth today. Two decimals under $10,
  // whole dollars above — nobody is setting a tier to $247.31.
  const usdOf = (tokens) => {
    const v = (Number(tokens) || 0) * price;
    return v < 10 ? v.toFixed(2) : NUM(Math.round(v));
  };
  // What one account on this rung costs a month if they take every run
  // they are owed. Full use, not average use, because the average is a
  // guess and the ceiling is set against the worst case.
  const monthly = (runs) => (Number(runs) || 0) * cost * 30;

  return (
    <div className="admin-token">
      {err && <div className="notice error">{err}</div>}

      {/* Today's actual spend, first thing, before any field. The
          question you open this panel with is what all of this is
          costing right now. */}
      <div className="tk-usage">
        <div>
          <b>{NUM(data?.usage?.runs)}</b>
          <span>free runs today</span>
        </div>
        <div>
          <b>${(data?.usage?.spend ?? 0).toFixed(2)}</b>
          <span>cost so far today</span>
        </div>
        <div>
          <b>{form.dailyGlobalRuns > 0 ? NUM(form.dailyGlobalRuns) : "∞"}</b>
          <span>{form.dailyGlobalRuns > 0 ? "daily ceiling" : "no ceiling set"}</span>
        </div>
        <button className="btn small" onClick={load} disabled={busy}>Refresh</button>
      </div>

      {/* ---- the free tier ----
          Above the token, because it does not depend on one. */}
      <section className="tk-card tk-free">
        <h3>Everyone</h3>
        <div className="tk-row">
          <label className="tk-f">
            <span>Free runs a day, signed in</span>
            <input
              type="number" min={0} max={50}
              value={form.free.dailyRuns}
              onChange={(e) => setFree("dailyRuns", e.target.value)}
            />
            <em>
              ≈ ${monthly(form.free.dailyRuns).toFixed(2)} a month <b>per active account</b>, and
              this one is live whether or not the tiers below are. Every signed-in
              account gets it, so the ceiling is what bounds it — not the threshold.
            </em>
          </label>
        </div>
      </section>

      <div className="tk-grid">
        {/* ---- the token itself ---- */}
        <section className="tk-card">
          <h3>The token</h3>
          <label className="tk-f">
            <span>Contract address</span>
            <input
              value={form.mint}
              onChange={(e) => set("mint", e.target.value.trim())}
              placeholder="Paste the CA once it launches"
              spellCheck={false}
            />
          </label>
          <div className="tk-row">
            <label className="tk-f">
              <span>Ticker</span>
              <input value={form.symbol} onChange={(e) => set("symbol", e.target.value)} maxLength={12} />
            </label>
            <label className="tk-f">
              <span>Name (optional)</span>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={40} />
            </label>
          </div>
          <label className="tk-check">
            <input type="checkbox" checked={form.announced} onChange={(e) => set("announced", e.target.checked)} />
            <span>
              <b>Show the contract address publicly</b>
              <em>Until this is on, the CA is not sent to the browser at all — so the panel can be filled in before launch without leaking it.</em>
            </span>
          </label>
          {data?.price ? (
            <p className="tk-note">
              Live price <b>${price < 0.01 ? price.toPrecision(3) : price.toFixed(4)}</b>
              {data.price.liquidity ? ` · $${NUM(Math.round(data.price.liquidity))} liquidity` : ""}
            </p>
          ) : form.mint ? (
            <p className="tk-note">No market found for this address yet.</p>
          ) : null}
        </section>

        {/* ---- the limits ---- */}
        <section className="tk-card">
          <h3>Limits</h3>
          <label className="tk-f">
            <span>Daily ceiling across everyone</span>
            <input
              type="number" min={0}
              value={form.dailyGlobalRuns}
              onChange={(e) => set("dailyGlobalRuns", e.target.value)}
            />
            <em>
              {ceilingSpend !== null
                ? <>Caps free generation at <b>${ceilingSpend.toFixed(2)} a day</b>, whatever anyone tries. Past it, everyone falls back to credits rather than being blocked.</>
                : <><b>0 means unlimited.</b> This is the only number that guarantees what free generation can cost, and it now covers the free tier as well as the holders — with it unset, the bill is whatever the internet decides.</>}
            </em>
          </label>
          <label className="tk-f">
            <span>Hold-for hours before a tier counts</span>
            <input
              type="number" min={0} max={720}
              value={form.maturityHours}
              onChange={(e) => set("maturityHours", e.target.value)}
            />
            <em>
              A wallet must sit at or above the first tier this long before it pays
              out, and the clock restarts if it drops below. <b>0 disables it.</b> It
              is the only thing stopping one bag of tokens being passed between fresh
              wallets to farm a tier per account. Measured against the first rung
              only — topping up to a higher tier takes effect immediately.
            </em>
          </label>
          <label className="tk-f">
            <span>Re-check a non-holder every N minutes</span>
            <input
              type="number" min={1} max={1440}
              value={form.recheckMinutes}
              onChange={(e) => set("recheckMinutes", e.target.value)}
            />
            <em>Someone who buys at noon should be generating at noon. Accounts already on a tier are not re-read at all for the rest of the day.</em>
          </label>
          <label className="tk-f">
            <span>Minimum market cap for the public list</span>
            <input
              type="number" min={0}
              value={form.dirMinMarketCap}
              onChange={(e) => set("dirMinMarketCap", e.target.value)}
            />
            <em>
              Tokens under this drop off <b>/token</b> and come back if they recover —
              it is checked live, nothing is stored. Set it too low and a dead coin
              represents you; too high and the page is empty.
            </em>
          </label>
          <label className="tk-f">
            <span>% of banner revenue to buybacks</span>
            <input
              type="number" min={0} max={100}
              value={form.buybackPct}
              onChange={(e) => set("buybackPct", e.target.value)}
            />
            <em>
              Published on <b>/token</b> with the arithmetic beside it — what it
              obliges so far, what has actually been spent, and the gap. The gap is
              shown even when you are behind, which is what makes it a commitment
              rather than a claim. <b>0 publishes nothing at all</b>, which is the
              honest setting until you intend to honour a number.
              {form.buybackPct > 0 && <> Trading fees do not count toward it.</>}
            </em>
          </label>
          {form.buybackPct > 0 && (
            <label className="tk-f">
              <span>Buy back every N SOL earned</span>
              <input
                type="number" min={0.01} step={0.01}
                value={form.buybackEverySol}
                onChange={(e) => set("buybackEverySol", e.target.value)}
              />
              <em>
                Flags a buyback as due once <b>{(Number(form.buybackEverySol || 0) * form.buybackPct / 100).toFixed(3)} SOL</b> is
                owed — {form.buybackEverySol} SOL earned at {form.buybackPct}%. Not a calendar:
                a weekly reminder fires on a quiet week with nothing to buy and stays
                quiet through a busy Tuesday. Never published — it is the size and
                timing of the next market order.
              </em>
            </label>
          )}
          <label className="tk-f">
            <span>One line shown to holders (optional)</span>
            <input value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={200} />
          </label>
        </section>
      </div>

      {/* ---- the three rungs ----
          The note sits once above all three rather than inside each
          card. It is the same sentence three times otherwise, and a
          rule repeated on every card reads as boilerplate nobody
          finishes. */}
      <p className="tk-ladder-note">
        Thresholds are stored in <b>tokens</b>, never dollars — set from a dollar value,
        then fixed. A dollar threshold shrinks the tokens needed as the price rises, so
        every holder becomes over-qualified on a pump and can sell the excess for
        nothing. Lower them by hand if entry gets expensive; lowering never costs
        anyone their tier.
      </p>
      <div className="tk-tiers">
        {form.tiers.map((t, i) => (
          <section className={`tk-card tk-tier ${i === form.tiers.length - 1 ? "top" : ""}`} key={t.id}>
            <div className="tk-tier-h">
              <input
                className="tk-tier-name"
                value={t.name}
                maxLength={24}
                onChange={(e) => setTier(i, "name", e.target.value)}
              />
              <span className="tk-tier-id">{t.id}</span>
            </div>

            <label className="tk-f">
              <span>Holding, in whole tokens</span>
              <input
                type="number" min={0}
                value={t.minTokens}
                onChange={(e) => setTier(i, "minTokens", e.target.value)}
              />
              {/* WHAT THE SAVED NUMBER IS ACTUALLY WORTH.
                  This did not exist, and its absence is why the box
                  below looked like nonsense: a threshold in tokens and
                  a calculator in dollars, with nothing connecting
                  them. You cannot tell whether 250,000 is a $2 tier or
                  a $200 one by looking at it, and that is the only
                  question anyone is asking. */}
              {price > 0 && t.minTokens > 0 && (
                <em>≈ ${usdOf(t.minTokens)} at today&apos;s price</em>
              )}
            </label>
            {price > 0 && (
              <div className="tk-calc">
                {/* The label was here and I dropped it rebuilding this
                    for three tiers, leaving an unlabelled number box
                    next to a button. It is a scratch pad, not a field:
                    nothing is applied until the button is pressed. */}
                <span>Set it from a dollar value</span>
                <div className="tk-row">
                  <input
                    className="tk-usd" type="number" min={0}
                    value={usd[t.id] ?? ""}
                    onChange={(e) => setUsd((u) => ({ ...u, [t.id]: e.target.value }))}
                  />
                  <button
                    className="btn small" type="button"
                    onClick={() => setTier(i, "minTokens", tokensFor(usd[t.id]))}
                  >
                    = {NUM(tokensFor(usd[t.id]))} tokens
                  </button>
                </div>
                <em>Press it to use that number above.</em>
              </div>
            )}

            <div className="tk-row">
              <label className="tk-f">
                <span>Free runs a day</span>
                <input
                  type="number" min={0} max={500}
                  value={t.dailyRuns}
                  onChange={(e) => setTier(i, "dailyRuns", e.target.value)}
                />
                <em>≈ ${monthly(t.dailyRuns).toFixed(2)}/mo each</em>
              </label>
              <label className="tk-f">
                <span>Pack discount %</span>
                <input
                  type="number" min={0} max={90}
                  value={t.discount}
                  onChange={(e) => setTier(i, "discount", e.target.value)}
                />
                <em>costs nothing until they buy</em>
              </label>
            </div>

            {/* Honoured by hand, and the label says so. Neither of
                these is a switch in the pipeline — early access is a
                decision about when a surface ships, and a custom style
                is somebody sitting down and writing a director. They
                are here so the ladder is described in one place and so
                the credits page can list them. */}
            <div className="tk-caps tk-perks">
              <span className="tk-caps-h">Shown on the ladder, done by hand</span>
              <label className="tk-check small">
                <input type="checkbox" checked={Boolean(t.earlyAccess)} onChange={(e) => setTier(i, "earlyAccess", e.target.checked)} />
                <span><b>Early access</b></span>
              </label>
              <label className="tk-check small">
                <input type="checkbox" checked={Boolean(t.customStyle)} onChange={(e) => setTier(i, "customStyle", e.target.checked)} />
                <span><b>A style of their own</b></span>
              </label>
            </div>
          </section>
        ))}
      </div>

      <div className="tk-arm">
        <label className="tk-check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          <span>
            <b>The holder tiers are live</b>
            <em>
              Needs a valid CA, a holding above 0 on the first tier, and at least one
              tier granting runs or a discount. Off, every generation is charged in
              credits and there are no discounts — the free tier above keeps running
              either way.
            </em>
          </span>
        </label>
        <div className="tk-actions">
          {saved && <span className="tk-saved">Saved</span>}
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? <span className="spinner" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
