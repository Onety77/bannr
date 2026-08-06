// ============================================================
// ADMIN — giving credits to someone.
//
// The airdrop tool: the daily most-liked post, whoever is actually
// working on X, anyone worth rewarding. Buying credits with our own
// SOL to hand out would be circular — the money lands in our own
// treasury — so a reward is simply credits granted, and the real cost
// is the generation spend they represent either way.
//
// Every grant asks WHO and WHY, and both are written down. The
// version this replaces credited whoever called it and recorded
// nothing, which is how it went unnoticed.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";

export default function AdminGrant({ user }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(45);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [log, setLog] = useState([]);

  const load = useCallback(async () => {
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/grant", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setLog((await r.json()).grants || []);
    } catch {}
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function give(e) {
    e?.preventDefault();
    if (!to.trim()) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: to.trim(), amount, reason: reason.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Couldn't grant that."); return; }
      setMsg(`${d.granted} credits to ${d.to} — they now have ${d.credits}.`);
      setTo(""); setReason("");
      load();
    } catch {
      setErr("Network error.");
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Give credits</h3></div>

      <form className="bb-add grant-add" onSubmit={give}>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="@handle"
          spellCheck={false}
        />
        <input
          className="grant-amt"
          type="number"
          min="1"
          max="500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why (most liked today, X posts…)"
          maxLength={120}
        />
        <button className="btn small primary" disabled={busy}>
          {busy ? <span className="spinner" /> : "Give"}
        </button>
      </form>
      {msg && <div className="notice money">{msg}</div>}
      {err && <div className="notice error">{err}</div>}

      <div className="tok-log">
        {log.map((g) => (
          <div className="tok-row" key={g.id}>
            <span className="tok-when">{new Date(g.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span className="tok-tag on">{g.handle ? `@${g.handle}` : g.accountId?.slice(0, 8)}</span>
            <span className="tok-amt">+{g.amount}</span>
            <span className="grant-why">{g.reason || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
