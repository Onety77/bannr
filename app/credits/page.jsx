// CREDITS — packs, wallet connect, SOL payment (Phase 2 wiring
// already live; falls back to demo top-up until env configured).
"use client";
import { useEffect, useState } from "react";
import { setUser } from "@/lib/credits";
import { PACKS } from "@/lib/packs";
import { useAuth } from "@/lib/useAuth";
import { useWallet, short } from "@/lib/wallet";


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
    if (!auth.user) return setErr("Sign in first.");

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
    // Connecting happens HERE, at the moment of paying, and not a
    // moment before. It is the only step in the whole product that
    // needs a wallet — signing in, generating and editing all work
    // without one.
    if (!wallet.address) {
      const c = await wallet.connect();
      if (c?.error) return setErr(c.error);
    }

    // The account id is stamped into the transaction as a memo, which
    // is what lets any wallet pay for this account without being
    // registered to it first. See /api/pay/claim.
    const res = await wallet.payTreasury(pack.sol, auth.user.accountId);
    if (res.error) return setErr(res.error);

    setMsg(`Payment sent (${res.signature.slice(0, 12)}…). Confirming…`);
    const out = await claim(res.signature);
    if (out.error) return setErr(out.error);
    setUser(out.user);
    setMsg(`${out.credits} credits added. Thank you.`);
  }

  // Poll the claim endpoint until the transaction lands. The webhook
  // is still running as a backstop, and both paths write the same
  // payments/{signature} document, so whichever gets there first wins
  // and the other becomes a no-op. Closing the tab mid-poll therefore
  // costs nothing.
  async function claim(signature) {
    for (let i = 0; i < 20; i++) {
      const r = await fetch("/api/pay/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature }),
      });
      const d = await r.json();
      if (r.ok) return d;
      // 202 means "not confirmed yet" — the only status worth waiting
      // on. Everything else is a real answer.
      if (r.status !== 202) return { error: d.error || "Couldn't confirm that payment." };
      await new Promise((res) => setTimeout(res, 3000));
    }
    return {
      error: "Still confirming. Your credits will appear automatically — no need to pay again.",
    };
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
          <b>TEST MODE</b> — instant credit top-ups.
        </div>
      )}

      {/* This used to lead with "Connect wallet", which is now both
          unnecessary and misleading: picking a pack connects one for
          you, and any wallet works because the payment carries the
          account id. So the panel states the balance, and mentions the
          wallet only when one happens to be connected. */}
      <div className="panel page-gap-top">
        <h3>Balance</h3>
        <div className="wallet-row">
          <span className="wallet-balance">
            <b>{credits}</b> credits
          </span>
          {wallet.address && (
            <>
              <span className="addr">{short(wallet.address)}</span>
              <button className="btn small" onClick={wallet.disconnect}>Disconnect</button>
            </>
          )}
        </div>
        <p className="hint">
          {wallet.address
            ? "Connected. Pick a pack to pay — or disconnect and pay from a different wallet, it makes no difference to your account."
            : "Pick a pack and your wallet opens for approval. Any wallet works, and you can use a different one every time."}
        </p>
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
