// The contract address you found a banner on.
//
// Sits on every generation tile. Most banners never reach the feed —
// people download them and put them straight on DEX Screener — so the
// directory would otherwise miss exactly the projects worth showing.
// See /api/admin/attach for the rule about when to use it.
"use client";
import { useState } from "react";

export default function AttachCa({ item, user }) {
  const [ca, setCa] = useState(item.ca || "");
  const [saved, setSaved] = useState(Boolean(item.ca));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function save(e) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: item.id, ca: ca.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Couldn't attach that."); return; }
      setSaved(Boolean(d.ca));
    } catch {
      setErr("Network error.");
    } finally { setBusy(false); }
  }

  return (
    <form className="attach" onSubmit={save}>
      <input
        value={ca}
        onChange={(e) => { setCa(e.target.value.trim()); setSaved(false); }}
        placeholder="Live on DEX as… (contract address)"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <button className={`btn small${saved ? "" : " primary"}`} disabled={busy}>
        {busy ? <span className="spinner" /> : saved ? "Attached" : "Attach"}
      </button>
      {err && <span className="attach-err">{err}</span>}
    </form>
  );
}
