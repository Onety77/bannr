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
  // What the chain says this transaction did, read BEFORE anything is
  // recorded. Whether it was a swap or a burn is detected rather than
  // chosen, so this is the only chance to see that it was understood
  // correctly — without it you find out from the list afterwards.
  const [look, setLook] = useState(null);
  const [looking, setLooking] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/buyback", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setData(await r.json());
    } catch {}
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  // Re-read whenever the signature or the SOURCE changes — the source
  // decides which wallet's balance is inspected, so the same
  // transaction reads differently under each.
  useEffect(() => {
    const s = sig.trim();
    setLook(null);
    setErr(null);
    if (s.length < 80 || !user) return;
    let live = true;
    setLooking(true);
    const id = setTimeout(async () => {
      try {
        const token = await user.getIdToken();
        const r = await fetch(`/api/admin/buyback?sig=${encodeURIComponent(s)}&source=${source}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        if (!live) return;
        if (!r.ok) setErr(d.error || "Couldn't read that transaction.");
        else setLook(d);
      } catch {
        if (live) setErr("Couldn't reach the network.");
      } finally {
        if (live) setLooking(false);
      }
    }, 350);
    return () => { live = false; clearTimeout(id); };
  }, [sig, source, user]);

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
      setLook(null);
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
  // Below the state it reads. `promise` is null until a percentage is
  // set in the Token panel, and the row simply does not render.
  const p = data?.promise;

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

      {/* ══ WHAT TO BUY NEXT ══

          The four figures above are what already happened. This is the
          only number that answers the question you opened this panel
          to ask, and it is deliberately given a whole row: a promise
          measured only by its running total rots quietly upward, and
          nobody notices it is behind until somebody else does the
          subtraction in public.

          Absent until a percentage is published in the Token panel —
          before that there is no promise to be behind on. */}
      {p && (
        <div className={`bb-owed ${p.outstandingSol > 0 ? "short" : "ok"}`}>
          {p.outstandingSol > 0 ? (
            <>
              <b>{fmt(p.outstandingSol)} SOL to buy</b>
              <em>
                {p.pct}% of {fmt(p.revenueSol)} SOL earned is {fmt(p.owedSol)}; {fmt(p.spentSol)} spent.
              </em>
            </>
          ) : (
            <>
              <b>Commitment met</b>
              <em>
                {p.pct}% of {fmt(p.revenueSol)} SOL earned is {fmt(p.owedSol)}; {fmt(p.spentSol)} spent
                {p.aheadSol > 0 ? `, ${fmt(p.aheadSol)} ahead.` : "."}
              </em>
            </>
          )}
        </div>
      )}

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
        <button className="btn small primary" disabled={busy || looking || !look || look.already}>
          {busy ? <span className="spinner" /> : "Log it"}
        </button>
      </form>

      {/* What the chain says, before it is committed. The kind is
          DETECTED — a swap and a burn are different transactions and
          nobody chooses which this was — so this is the one moment to
          see that it was read the way you meant. */}
      {looking && <p className="bb-read">Reading the transaction…</p>}
      {look && (
        <p className={`bb-read${look.already ? " bb-read-dupe" : " on"}`}>
          {look.already ? (
            <>Already logged — nothing to do.</>
          ) : look.kind === "burn" ? (
            <><b>Burn</b> · {fmt(look.burned)} tokens destroyed</>
          ) : look.kind === "both" ? (
            <><b>Swap and burn</b> · {fmt(look.sol)} SOL → {fmt(look.burned)} tokens, burned</>
          ) : (
            <>
              <b>Swap</b> · {fmt(look.sol)} SOL → {fmt(look.bought)} tokens
              {look.sol === 0 && " — 0 SOL means that wallet didn't pay; check the source above"}
            </>
          )}
        </p>
      )}
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
