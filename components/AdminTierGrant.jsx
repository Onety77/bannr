// ============================================================
// ADMIN — giving someone a tier they did not buy.
//
// Competition winners, partners, a project worth courting, someone
// owed a favour. Until this existed the only way to have a tier was
// to hold tokens, so "can you just give them access" had no answer.
//
// Deliberately a SEPARATE panel from Give credits rather than another
// field on it. They are two different ladders — one is a balance, one
// is a standing — and a single form that could top up a balance and
// change a standing in the same submit is a form somebody will use
// wrong at speed.
//
// Same discipline as the credits tool next door: a named recipient, a
// reason, and every grant AND revocation written down. An account with
// capabilities nobody can explain is how the last unaudited grant
// tool went unnoticed for weeks.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";

const when = (ms) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function AdminTierGrant({ user }) {
  const [to, setTo] = useState("");
  const [tier, setTier] = useState("t3");
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [log, setLog] = useState([]);
  const [tiers, setTiers] = useState([]);

  const load = useCallback(async () => {
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/tier", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        setLog(d.grants || []);
        setTiers(d.tiers || []);
      }
    } catch {}
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function send(method, body, query = "") {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const token = await user.getIdToken();
      const r = await fetch(`/api/admin/tier${query}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "That didn't work."); return false; }
      await load();
      return true;
    } catch {
      setErr("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function give(e) {
    e.preventDefault();
    if (!to.trim()) return setErr("Who is it for?");
    const okDone = await send("POST", { to, tier, days, reason });
    if (okDone) {
      const name = tiers.find((t) => t.id === tier)?.name || tier;
      setMsg(
        Number(days) > 0
          ? `${to} is on ${name} for ${days} days.`
          : `${to} is on ${name}, with no expiry.`
      );
      setTo(""); setReason("");
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Give a tier</h3>
        <span className="hint">Regardless of what they hold</span>
      </div>

      <form className="bb-add grant-add" onSubmit={give}>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="@handle"
          spellCheck={false}
        />
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          {(tiers.length ? tiers : [{ id: "t3", name: "Top tier" }]).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <input
          className="grant-amt"
          type="number" min="0" max="3650"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          title="Days. 0 never expires."
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why (won the daily, partner…)"
          maxLength={120}
        />
        <button className="btn small primary" disabled={busy}>
          {busy ? <span className="spinner" /> : "Give"}
        </button>
      </form>
      {/* Said once, under the field it belongs to. 0 is a real choice
          — a partner is a permanent arrangement — and a date invented
          to satisfy a required field is a date that surprises somebody
          in six months. */}
      <div className="hint">Days. <b>0 never expires.</b> A tier given is never a downgrade — someone already higher stays where they are.</div>

      {msg && <div className="notice money">{msg}</div>}
      {err && <div className="notice error">{err}</div>}

      <div className="tok-log">
        {log.map((g) => (
          <div className="tok-row" key={g.id}>
            <span className="tok-when">{when(g.ts)}</span>
            <span className={`tok-tag${g.live ? " on" : ""}`}>
              {g.handle ? `@${g.handle}` : g.accountId?.slice(0, 8)}
            </span>
            <span className="tok-amt">
              {/* The ledger holds what was DONE; `live` reconciles it
                  against the account. A grant later revoked or
                  replaced shows as history rather than as a promise
                  still standing. */}
              {g.reason === "revoked"
                ? "revoked"
                : `${tiers.find((t) => t.id === g.tier)?.name || g.tier}${g.until ? ` · to ${when(g.until)}` : " · no expiry"}`}
            </span>
            <span className="grant-why">{g.reason === "revoked" ? "" : g.reason || "—"}</span>
            {g.live && (
              <button
                className="btn small"
                disabled={busy}
                onClick={() => send("DELETE", null, `?to=${encodeURIComponent(g.accountId)}`)}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
