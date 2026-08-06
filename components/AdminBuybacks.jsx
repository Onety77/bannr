// ============================================================
// ADMIN — logging a buyback.
//
// Paste a signature, say which wallet it came from, done. The amounts
// are read off the chain, never typed: a figure someone could type is
// a figure nobody has to believe, and the public page's entire value
// is that it can be checked.
//
// Buying stays MANUAL on purpose. Automating it would mean a treasury
// private key sitting in an environment variable with real money
// behind it, reachable by anything that can read the env — a bad
// trade for saving five minutes a week.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 4 });

export default function AdminBuybacks({ user }) {
  const [data, setData] = useState(null);
  const [sig, setSig] = useState("");
  const [source, setSource] = useState("product");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/buyback", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setData(await r.json());
    } catch {}
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function add(e) {
    e?.preventDefault();
    if (!sig.trim()) return;
    setBusy(true); setErr(null);
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/buyback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signature: sig.trim(), source }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Couldn't read that transaction."); return; }
      setSig("");
      setData(d);
    } catch {
      setErr("Network error.");
    } finally { setBusy(false); }
  }

  async function drop(signature) {
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/buyback", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signature }),
      });
      if (r.ok) setData(await r.json());
    } catch {}
  }

  const t = data?.totals;

  return (
    <div className="panel">
      <div className="panel-head"><h3>Buybacks</h3></div>

      <div className="admin-stats">
        <div className="admin-stat">
          <b>{fmt(t?.product?.sol)}</b><span>SOL · from banners</span>
        </div>
        <div className="admin-stat">
          <b>{fmt(t?.fees?.sol)}</b><span>SOL · from fees</span>
        </div>
        <div className="admin-stat">
          <b>{fmt((t?.product?.burned || 0) + (t?.fees?.burned || 0))}</b><span>tokens burned</span>
        </div>
        <div className="admin-stat">
          <b>{data?.entries?.length || 0}</b><span>logged</span>
        </div>
      </div>

      <form className="bb-add" onSubmit={add}>
        <input
          value={sig}
          onChange={(e) => setSig(e.target.value.trim())}
          placeholder="Transaction signature"
          spellCheck={false}
        />
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="product">From banners (treasury)</option>
          <option value="fees">From trading fees (dev wallet)</option>
        </select>
        <button className="btn small primary" disabled={busy}>
          {busy ? <span className="spinner" /> : "Log it"}
        </button>
      </form>
      {err && <div className="notice error">{err}</div>}
      {/* Both transactions, and it is worth saying which is which:
          the burn is the supply that is gone, the swap is where the
          SOL came from. Only the burn and the money is unexplained;
          only the swap and the tokens could still come back. */}
      <p className="hint">
        Log the swap and the burn separately — they are usually two transactions.
        Amounts are read from the chain, and the same signature twice does nothing.
      </p>

      <div className="tok-log">
        {(data?.entries || []).map((e) => (
          <div className="tok-row" key={e.signature}>
            <span className={`tok-tag${e.source === "product" ? " on" : ""}`}>
              {e.source === "product" ? "banners" : "fees"}
            </span>
            <span className="tok-amt">
              {e.kind === "burn"
                ? `${fmt(e.burned)} burned`
                : e.kind === "both"
                  ? `${fmt(e.sol)} SOL → ${fmt(e.burned)} burned`
                  : `${fmt(e.sol)} SOL → ${fmt(e.bought)}`}
            </span>
            <a
              className="tok-go"
              href={`https://solscan.io/tx/${e.signature}`}
              target="_blank"
              rel="noopener noreferrer"
            >↗</a>
            <button className="btn small" onClick={() => drop(e.signature)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
