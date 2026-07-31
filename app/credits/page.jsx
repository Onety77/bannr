// CREDITS — packs, wallet connect, SOL payment (Phase 2 wiring
// already live; falls back to demo top-up until env configured).
"use client";
import { useEffect, useState } from "react";
import { setUser } from "@/lib/credits";
import { useAuth } from "@/lib/useAuth";
import { useWallet, short } from "@/lib/wallet";

const PACKS = [
  { id: "starter", name: "Starter", sol: 0.05, credits: 15, gens: 5 },
  { id: "builder", name: "Builder", sol: 0.12, credits: 45, gens: 15, featured: true },
  { id: "degen",   name: "Degen",   sol: 0.35, credits: 160, gens: 53 },
];

export default function CreditsPage() {
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const auth = useAuth();
  const wallet = useWallet();
  // Test mode is explicit and loud. Without it, a configured treasury
  // means the Buy button moves REAL SOL — which, before the Helius
  // webhook exists, would take payment and credit nothing.
  const testMode = process.env.NEXT_PUBLIC_ENABLE_TEST_CREDITS === "1";
  const treasuryConfigured = Boolean(process.env.NEXT_PUBLIC_TREASURY_WALLET) && !testMode;
  const credits = auth.user?.credits ?? 0;

  async function buy(pack) {
    setErr(null); setMsg(null);
    if (!auth.user) return setErr("Connect your wallet first.");

    if (!treasuryConfigured) {
      // Nothing is paid in test mode. The grant happens SERVER-side and
      // only where it has been explicitly enabled — the client can no
      // longer mint credits for itself, which is the whole point of
      // moving balances to the account.
      const res = await fetch("/api/dev/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: pack.credits }),
      });
      const d = await res.json();
      if (!res.ok) return setErr(d.error || "Top-up failed.");
      setUser(d.user);
      setMsg(`TEST TOP-UP — ${pack.credits} credits added, no SOL moved. With payments live this sends ${pack.sol} SOL to the treasury and Helius credits you automatically.`);
      return;
    }
    if (!wallet.address) return setErr("Connect a wallet first.");
    const res = await wallet.payTreasury(pack.sol);
    if (res.error) return setErr(res.error);
    setMsg(`Payment sent (${res.signature.slice(0, 12)}…). Credits land automatically the moment it confirms — no refresh ritual required.`);
  }

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>Credits</h1>
        <p>1 run = 3 credits = up to 4 banner options. Pay in SOL.</p>
      </div>

      {/* Impossible to mistake for the real thing — the whole risk of a
          test flag is forgetting it's on. */}
      {testMode && (
        <div className="notice test-mode">
          <b>TEST MODE</b> — these packs top you up instantly and no SOL is
          moved. Remove <code>NEXT_PUBLIC_ENABLE_TEST_CREDITS</code> to switch
          real payments on.
        </div>
      )}

      <div className="panel page-gap-top">
        <h3>Wallet</h3>
        <div className="wallet-row">
          {wallet.address ? (
            <>
              <span className="addr">{short(wallet.address)}</span>
              <button className="btn small" onClick={wallet.disconnect}>Disconnect</button>
            </>
          ) : (
            <button
              className="btn small"
              onClick={async () => {
                const r = await wallet.connect();
                if (r.error) setErr(r.error);
              }}
            >
              Connect wallet (Phantom / Solflare)
            </button>
          )}
          <span className="hint wallet-balance">
            Balance: <b>{credits} credits</b>
          </span>
        </div>
      </div>

      {msg && <div className="notice money page-gap-top">{msg}</div>}
      {err && <div className="notice error page-gap-top">{err}</div>}

      <div className="packs">
        {PACKS.map((p) => (
          <div key={p.id} className={`pack ${p.featured ? "featured" : ""}`}>
            <div className="name">{p.name}</div>
            <div className="price">{p.sol} <small>SOL</small></div>
            <div className="gens">{p.credits} credits · ~{p.gens} runs</div>
            <button className="btn primary small block" onClick={() => buy(p)}>
              Buy {p.name}
            </button>
          </div>
        ))}
      </div>

      <div className="notice page-gap">
        COMING WITH $BANNR — hold the token, get 3 free runs every day.
        Holder checks run live via Helius at generation time.
      </div>
    </main>
  );
}
