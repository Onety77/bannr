// ============================================================
// ADMIN — the token gate.
//
// One panel for every number that decides who generates for free and
// what that costs. Nothing here is a code constant, because the week
// this launches is the week the numbers will be wrong, and "redeploy
// to change the daily allowance" is not a plan.
//
// Two things are given more room than their field size suggests:
//
//   THE CEILING, shown in dollars as you type. A count is abstract;
//   "500 runs ≈ $36/day" is a decision. It is the only number that
//   guarantees the bill regardless of who games what, so it should be
//   the number that is hardest to set carelessly.
//
//   THE THRESHOLD, typed in dollars and stored in tokens. Storing
//   dollars would put a price feed on the critical path — a dead API
//   or a thirty-second wick would decide whether someone can generate.
//   The calculator lives here, at admin time, where a failure is a
//   blank field rather than an outage.
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
  const [usd, setUsd] = useState("20");

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
      setForm(d.gate);
      setSaved(true);
    } catch {
      setErr("Network error saving.");
    } finally {
      setBusy(false);
    }
  }

  if (!form) return <div className="admin-gate"><span className="spinner" /></div>;

  const cost = data?.usage?.costPerRun ?? 0.073;
  const ceilingSpend = form.dailyGlobalRuns > 0 ? form.dailyGlobalRuns * cost : null;
  const perHolder = form.dailyRuns * cost;
  const price = data?.price?.usd || 0;
  const tokensForUsd = price > 0 ? Math.ceil(Number(usd || 0) / price) : 0;

  return (
    <div className="admin-token">
      {err && <div className="notice error">{err}</div>}

      {/* Today's actual spend, first thing, before any field. The
          question you open this panel with is what the promotion is
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

        {/* ---- who qualifies ---- */}
        <section className="tk-card">
          <h3>Who qualifies</h3>
          <label className="tk-f">
            <span>Minimum holding, in whole tokens</span>
            <input
              type="number" min={0}
              value={form.minTokens}
              onChange={(e) => set("minTokens", e.target.value)}
            />
          </label>
          {price > 0 && (
            <div className="tk-calc">
              <span>Set it from a dollar value:</span>
              <div className="tk-row">
                <input
                  className="tk-usd" type="number" min={0}
                  value={usd} onChange={(e) => setUsd(e.target.value)}
                />
                <button className="btn small" type="button" onClick={() => set("minTokens", tokensForUsd)}>
                  = {NUM(tokensForUsd)} tokens
                </button>
              </div>
              <em>
                Stored as tokens, not dollars. A dollar threshold would put a price
                feed in the middle of every generation, and someone sitting at $20.00
                would gain and lose access on every wick.
              </em>
            </div>
          )}
          <label className="tk-f">
            <span>Hold-for hours before it counts</span>
            <input
              type="number" min={0} max={720}
              value={form.maturityHours}
              onChange={(e) => set("maturityHours", e.target.value)}
            />
            <em>
              A wallet must sit at or above the minimum this long before it pays out,
              and the clock restarts if it drops below. <b>0 disables it.</b> This is
              the only thing stopping one bag of tokens being passed between fresh
              wallets to farm an allowance per account — leaving it at 0 is a
              reasonable launch-day choice for the hype, but the ceiling below is then
              your only protection.
            </em>
          </label>
        </section>

        {/* ---- what they get ---- */}
        <section className="tk-card">
          <h3>What they get</h3>
          <label className="tk-f">
            <span>Free runs per holder, per day</span>
            <input
              type="number" min={0} max={500}
              value={form.dailyRuns}
              onChange={(e) => set("dailyRuns", e.target.value)}
            />
            <em>≈ ${perHolder.toFixed(2)} a day each, about ${(perHolder * 30).toFixed(0)} a month per qualifying holder.</em>
          </label>
          <label className="tk-f">
            <span>Daily ceiling across everyone</span>
            <input
              type="number" min={0}
              value={form.dailyGlobalRuns}
              onChange={(e) => set("dailyGlobalRuns", e.target.value)}
            />
            <em>
              {ceilingSpend !== null
                ? <>Caps the promotion at <b>${ceilingSpend.toFixed(2)} a day</b>, whatever anyone tries. Past it, holders fall back to credits rather than being blocked.</>
                : <><b>0 means unlimited.</b> This is the only number that guarantees what the promotion can cost — with it unset, the bill is whatever the internet decides.</>}
            </em>
          </label>
          <label className="tk-f">
            <span>Re-check a non-holder every N minutes</span>
            <input
              type="number" min={1} max={1440}
              value={form.recheckMinutes}
              onChange={(e) => set("recheckMinutes", e.target.value)}
            />
            <em>Someone who buys at noon should be generating at noon. Qualifying accounts are not re-read at all for the rest of the day.</em>
          </label>
          <label className="tk-f">
            <span>One line shown to holders (optional)</span>
            <input value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={200} />
          </label>
        </section>
      </div>

      <div className="tk-arm">
        <label className="tk-check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          <span>
            <b>Free generations are live</b>
            <em>
              Needs a valid CA, a minimum above 0 and an allowance above 0. Off, every
              generation is charged in credits exactly as it is today.
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
