// SETTINGS — saved preferences, and the account screen on mobile.
//
// Doubles as the phone's account page: the top nav has no room for
// wallet controls at 375px, so on mobile the "You" tab lands here
// instead of squeezing a dropdown into a 52px bar.
//
// Style defaults reuse the very same AdvancedPanel as /create, so a
// control can never exist in one place and not the other.
"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TEMPLATES, AUTO_ID, AUTO_NAME } from "@/lib/templates";
import { countTouched } from "@/lib/advanced";
import { useAuth } from "@/lib/useAuth";
import { getHistory } from "@/lib/credits";
import { short } from "@/lib/wallet";
import AdvancedPanel from "@/components/AdvancedPanel";
import ConnectButton from "@/components/ConnectButton";

const EMPTY = { defaults: {}, avoid: "", styles: [], variants: 3 };

export default function SettingsPage() {
  const auth = useAuth();
  const [settings, setSettings] = useState(EMPTY);
  const [payments, setPayments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [theme, setTheme] = useState(null);

  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);

  useEffect(() => {
    if (!auth.user) return;
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const d = await res.json();
        if (d.ok) { setSettings({ ...EMPTY, ...d.settings }); setPayments(d.payments || []); }
      } catch {}
      setLoaded(true);
    })();
  }, [auth.user]);

  // "Saved" only clears on the next edit, so the confirmation doesn't
  // vanish before it's been read.
  const patch = useCallback((next) => { setSettings((s) => ({ ...s, ...next })); setSaved(false); }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const d = await res.json();
      if (d.ok) { setSettings({ ...EMPTY, ...d.settings }); setSaved(true); }
    } catch {}
    setSaving(false);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("bannr.theme", next); } catch {}
  }

  if (auth.loading) {
    return <main className="wrap"><div className="admin-gate"><span className="spinner" /></div></main>;
  }

  if (!auth.user) {
    return (
      <main className="wrap">
        <div className="page-head"><h1>Settings</h1><p>Connect your wallet to see your account.</p></div>
        <div className="panel set-signin"><ConnectButton auth={auth} size="" block /></div>
      </main>
    );
  }

  const pickable = [{ id: AUTO_ID, name: AUTO_NAME }, ...TEMPLATES];

  return (
    <main className="wrap set-wrap">
      <div className="page-head">
        <h1>Settings</h1>
        <p>Saved to your wallet, so they follow you to any device.</p>
      </div>

      {/* ---------- account ---------- */}
      <div className="panel">
        <div className="panel-head"><h3>Account</h3></div>
        <div className="set-acct">
          <div>
            <span className="set-k">Wallet</span>
            <span className="set-v mono">{short(auth.user.wallet)}</span>
          </div>
          <div>
            <span className="set-k">Credits</span>
            <span className="set-v">{auth.user.credits}</span>
          </div>
          <div>
            <span className="set-k">Free edits left today</span>
            <span className="set-v">{auth.user.freeEditsLeft}</span>
          </div>
        </div>
        <div className="set-row-actions">
          <Link href="/credits" className="btn small primary">Buy credits</Link>
          <button className="btn small" onClick={toggleTheme}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button className="btn small" onClick={auth.signOut}>Sign out</button>
        </div>
      </div>

      {/* ---------- billing ---------- */}
      <div className="panel">
        <div className="panel-head">
          <h3>Billing</h3>
          <span className="hint">Every purchase is on-chain — these link to the transaction.</span>
        </div>
        {payments.length === 0 ? (
          <p className="hint">No purchases yet.</p>
        ) : (
          <div className="set-bills">
            {payments.map((p) => (
              <div className="set-bill" key={p.signature}>
                <b>{p.amountSol != null ? `${p.amountSol} SOL` : "—"}</b>
                <span>+{p.credits} credits</span>
                <span className="set-when">{p.ts ? new Date(p.ts).toLocaleDateString() : ""}</span>
                {p.status !== "credited" && <span className="set-flag">{p.status}</span>}
                <a
                  href={`https://solscan.io/tx/${p.signature}`}
                  target="_blank" rel="noopener noreferrer" className="link-quiet"
                >
                  View ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- universal avoid ---------- */}
      <div className="panel">
        <div className="panel-head">
          <h3>Never include</h3>
          <span className="hint">Applied to every style, on every run</span>
        </div>
        <input
          type="text"
          className="adv-text"
          maxLength={300}
          placeholder="e.g. no people, nothing religious, never use red…"
          value={settings.avoid}
          onChange={(e) => patch({ avoid: e.target.value })}
        />
        <p className="hint set-note">
          Saves repeating the same rule in each style&apos;s Advanced panel. A
          per-run Avoid adds to this rather than replacing it.
        </p>
      </div>

      {/* ---------- run defaults ---------- */}
      <div className="panel">
        <div className="panel-head">
          <h3>Start every run with</h3>
          <span className="hint">Pre-selects these on Create</span>
        </div>
        <div className="set-chips">
          {pickable.map((t) => {
            const on = settings.styles.includes(t.id);
            return (
              <button
                key={t.id}
                className={`adv-opt ${on ? "on" : ""}`}
                onClick={() =>
                  patch({
                    styles: on
                      ? settings.styles.filter((s) => s !== t.id)
                      : [...settings.styles, t.id],
                  })
                }
              >
                {t.name}
              </button>
            );
          })}
        </div>
        <div className="set-variants">
          <span className="set-k">Options per run</span>
          <div className="variant-picker">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                className={settings.variants === n ? "on" : ""}
                disabled={n < settings.styles.length}
                onClick={() => patch({ variants: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- per-style defaults ---------- */}
      <div className="panel">
        <div className="panel-head">
          <h3>Style defaults</h3>
          <span className="hint">Set a style once instead of every run</span>
        </div>
        <div className="set-styles">
          {pickable.map((t) => {
            const touched = countTouched(t.id, settings.defaults[t.id]);
            return (
              <div className={`set-style ${expanded === t.id ? "open" : ""}`} key={t.id}>
                <button
                  className="adv-toggle"
                  aria-expanded={expanded === t.id}
                  onClick={() => setExpanded((e) => (e === t.id ? null : t.id))}
                >
                  {t.name}
                  {touched > 0 && <span className="adv-count">{touched}</span>}
                  <span className="adv-caret" aria-hidden="true">›</span>
                </button>
                {expanded === t.id && (
                  <AdvancedPanel
                    styleId={t.id}
                    settings={settings.defaults[t.id] || {}}
                    touched={touched}
                    onChange={(next) => patch({ defaults: { ...settings.defaults, [t.id]: next } })}
                    onReset={() => {
                      const d = { ...settings.defaults };
                      delete d[t.id];
                      patch({ defaults: d });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- danger ---------- */}
      <div className="panel">
        <div className="panel-head"><h3>Local data</h3></div>
        <p className="hint set-note">
          {getHistory().length} run{getHistory().length === 1 ? "" : "s"} stored in this
          browser. History isn&apos;t on your account yet, so it doesn&apos;t follow you
          between devices.
        </p>
        <button
          className="btn small"
          onClick={() => {
            try { localStorage.removeItem("bannr.history"); } catch {}
            location.reload();
          }}
        >
          Clear history on this device
        </button>
      </div>

      <div className="set-save">
        <button className="btn primary" disabled={saving || !loaded} onClick={save}>
          {saving ? <span className="spinner" /> : saved ? "Saved ✓" : "Save settings"}
        </button>
      </div>
    </main>
  );
}
