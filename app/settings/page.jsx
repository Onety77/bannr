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
// Metadata only — see the note in lib/styles.js.
import { STYLES as TEMPLATES, AUTO_ID, AUTO_NAME } from "@/lib/styles";
import { countTouched } from "@/lib/advanced";
import { useAuth } from "@/lib/useAuth";
import { short, useWallet } from "@/lib/wallet";
import AdvancedPanel from "@/components/AdvancedPanel";
import ConnectButton from "@/components/ConnectButton";
import { useToken } from "@/lib/useToken";
import { offerLine } from "@/lib/offer";
import WalletContinue from "@/components/WalletContinue";

const EMPTY = { defaults: {}, avoid: "", styles: [], variants: 3 };

export default function SettingsPage() {
  const auth = useAuth();
  const wallet = useWallet();
  const offer = offerLine(useToken());
  const [settings, setSettings] = useState(EMPTY);
  const [payments, setPayments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [theme, setTheme] = useState(null);
  // Kept separate from auth.user: the id of each identity is needed to
  // remove one, and publicUser deliberately doesn't expose them.
  const [identities, setIdentities] = useState(null);

  const loadIdentities = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/identities");
      if (!r.ok) return;
      const d = await r.json();
      setIdentities(d.identities || []);
    } catch {}
  }, []);

  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);

  // Only once signed in — the endpoint 401s otherwise.
  useEffect(() => { if (auth.user) loadIdentities(); }, [auth.user?.accountId, loadIdentities]);

  // A wallet linked by deeplink finishes on a fresh page load, so
  // there is no promise here to await — the click that started it
  // happened two navigations ago. The flag is how this page learns
  // the list it is showing has just gone stale.
  useEffect(() => {
    if (!auth.linked) return;
    loadIdentities();
    auth.clearLinked();
  }, [auth.linked, loadIdentities]);

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
        <div className="page-head"><h1>Settings</h1><p>Sign in to see your account.</p></div>
        <div className="panel set-signin">
          <ConnectButton auth={auth} size="" block label="Sign in" />
        </div>
      </main>
    );
  }

  const pickable = [{ id: AUTO_ID, name: AUTO_NAME }, ...TEMPLATES];

  // The wallet that PROVES what this account holds. One, not a list.
  const linkedWallet = (identities || []).find((i) => i.type === "wallet") || null;
  // Green only when the browser's connected wallet IS that one.
  // Linked-but-not-open is the normal state and says so, rather than
  // showing a dot that quietly means nothing.
  const walletLive = Boolean(linkedWallet && wallet.address === linkedWallet.id);

  return (
    <main className="wrap set-wrap">
      {/* Settings is reached FROM the profile now, so it needs a way
          back. Without it this is a dead end on a phone, where there
          is no browser chrome to lean on. */}
      <Link href="/you" className="set-back">← You</Link>
      <div className="page-head">
        <h1>Settings</h1>
        <p>Saved to your account.</p>
      </div>

      {/* ---------- account ---------- */}
      <div className="panel">
        <div className="panel-head"><h3>Account</h3></div>
        <div className="set-acct">
          <div>
            <span className="set-k">Signed in as</span>
            <span className="set-v mono">
              {auth.user.email || (auth.user.wallet ? short(auth.user.wallet) : "—")}
            </span>
          </div>
          {/* Only once there is something to report. Populated by
              PAYING, not by linking — so before a first purchase the
              row said "none yet — any wallet works", which is a whole
              sentence squeezed into a value slot to tell someone that
              nothing has happened yet. Nothing to say, nothing shown. */}
          {/* THE WALLET, stated plainly and where someone would look
              for it. It was only reachable under "ways to sign in",
              which is a true description and the wrong heading —
              nobody hunting for where to connect a wallet reads that
              as the answer.

              The LINKED one is what matters: signature-proven,
              exclusive to this account, and the only list the token
              gate reads. The paying-wallets array that used to sit
              here is payment attribution, and a list of every address
              you ever paid from answers a question nobody asked. */}
          <div>
            <span className="set-k">Wallet</span>
            <span className="set-v">
              {linkedWallet ? (
                <span className="wal">
                  {/* The dot alone. The sentence beside it explained a
                      distinction nobody had asked about and made the
                      row read like a warning — and it was wrong more
                      often than not, because a wallet withholds its
                      address until asked. See useWallet. */}
                  <i
                    className={`wal-dot${walletLive ? " on" : ""}`}
                    title={walletLive ? "Connected in this browser" : "Not open in this browser"}
                  />
                  <span className="mono">{short(linkedWallet.id)}</span>
                </span>
              ) : (
                <span className="wal">
                  <span className="wal-none">None linked</span>
                  {/* ALWAYS a way through. This was hidden behind
                      walletAvailable, which is false in mobile Safari
                      — no injected provider — so on the device most
                      people are holding, the row said "None linked"
                      and offered nothing.

                      A phone browser cannot see a wallet app, but it
                      can ASK one: the deeplink opens Phantom, the user
                      approves, and the browser comes back here with a
                      signature. Same button, same page, no second
                      browser and no session to carry across. */}
                  {auth.pendingSign ? (
                    <WalletContinue auth={auth} />
                  ) : auth.needsDeeplink ? (
                    <button
                      className="btn small"
                      disabled={auth.busy}
                      onClick={() => auth.startWalletDeeplink("link")}
                    >
                      {auth.busy ? "Opening…" : "Connect a wallet"}
                    </button>
                  ) : auth.walletAvailable ? (
                    <button
                      className="btn small"
                      disabled={auth.busy}
                      onClick={async () => { if ((await auth.linkWallet())?.ok) loadIdentities(); }}
                    >
                      Connect a wallet
                    </button>
                  ) : (
                    <em className="wal-note">No wallet on this device</em>
                  )}
                </span>
              )}
            </span>
            {/* ITS OWN LINE, spanning the row. Inside the value cell
                it sat in a right-aligned column beside the "Wallet"
                label, wrapped to two lines and had its second line
                clipped by the row below. A sentence does not belong
                in a cell sized for a value. */}
            {/* WHY the row exists, for anyone already signed in with
                Google and wondering why a wallet is being asked for
                too. It is not a second login — it is the only way to
                see what you hold. Shown only when there is something
                to gain by it. */}
            {!linkedWallet && !auth.pendingSign && offer && (
              <em className="wal-note-2">{offer} We check the wallet you connect.</em>
            )}
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
        {/* ---------- ways in ----------
            Adding is the useful half. Every account that existed before
            identities was created with a wallet, so signing in meant an
            extension and a miserable time on a phone; linking Google
            gives those people the easy door without abandoning their
            credits. Removing is here mostly so linking feels safe. */}
        <div className="set-ident">
          <span className="set-k">Ways to sign in</span>
          <ul className="ident-list">
            {(identities || []).map((i) => (
              <li key={i.type + i.id}>
                <span className="ident-what">
                  <b>{i.type === "google" ? "Google" : "Wallet"}</b>
                  <span className="mono">{i.type === "wallet" ? short(i.id) : auth.user.email || "linked"}</span>
                </span>
                {identities.length > 1 && (
                  <button
                    className="btn small"
                    disabled={auth.busy}
                    onClick={async () => {
                      const ok = await auth.unlinkIdentity(i.type, i.id);
                      if (ok) loadIdentities();
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="set-row-actions">
            {!identities?.some((i) => i.type === "google") && (
              <button className="btn small" disabled={auth.busy}
                onClick={async () => { if (await auth.linkGoogle()) loadIdentities(); }}>
                Add Google
              </button>
            )}
            {auth.walletAvailable && (
              <button className="btn small" disabled={auth.busy}
                onClick={async () => { if ((await auth.linkWallet())?.ok) loadIdentities(); }}>
                Add a wallet
              </button>
            )}
          </div>
          <p className="hint">
            {identities?.length > 1
              ? "Either one opens this account."
              : "You can't remove the last one."}
          </p>
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
          <span className="hint">Tap one to open the transaction.</span>
        </div>
        {payments.length === 0 ? (
          <p className="hint">No purchases yet.</p>
        ) : (
          <div className="set-bills">
            {payments.map((p) => (
              <div className="set-bill" key={p.signature}>
                {/* Dollars lead, because dollars are what the pack was
                    priced in and what the page quoted. The SOL is what
                    left the wallet and is the figure that matches the
                    transaction, so it stays — just second. Payments
                    from before the move have no `usd` and show the SOL
                    alone rather than a fabricated conversion. */}
                <b>{p.usd != null ? `$${p.usd}` : p.amountSol != null ? `${p.amountSol} SOL` : "—"}</b>
                {p.usd != null && p.amountSol != null && (
                  <span className="set-bill-sol">{p.amountSol} SOL</span>
                )}
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
          <span className="hint">Every style, every run</span>
        </div>
        <input
          type="text"
          className="adv-text"
          maxLength={300}
          placeholder="no people, never use red"
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
          <span className="hint">Set once instead of every run</span>
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

      {/* The "Local data" panel used to live here, explaining that
          history was stuck in this browser. It is not — banners now
          follow the account (see /api/history) — so a panel describing
          the limitation would be describing something that no longer
          exists. Deleting saved banners lives where the banners are:
          each card on the My banners page. */}

      <div className="set-save">
        <button className="btn primary" disabled={saving || !loaded} onClick={save}>
          {saving ? <span className="spinner" /> : saved ? "Saved ✓" : "Save settings"}
        </button>
      </div>
    </main>
  );
}
