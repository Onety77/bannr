// CREDITS — packs, wallet connect, SOL payment (Phase 2 wiring
// already live; falls back to demo top-up until env configured).
"use client";
import { useEffect, useState } from "react";
import { setUser } from "@/lib/credits";
import { PACKS } from "@/lib/packs";
import TokenBar from "@/components/TokenBar";
import { useToken } from "@/lib/useToken";
import { offerLine } from "@/lib/offer";
import { useAuth } from "@/lib/useAuth";
import { useWallet, short, buildTreasuryTx } from "@/lib/wallet";


export default function CreditsPage() {
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  // A transaction built and waiting for the tap that carries it to
  // the wallet app, and whether a broadcast one is being confirmed.
  const [tx, setTx] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const auth = useAuth();
  const wallet = useWallet();
  const offer = offerLine(useToken());
  // No test mode any more. It existed so credits could be topped up
  // before payments worked, and it did that by calling /api/dev/grant
  // — a route gated by an environment flag and a hardcoded list of
  // four emails, which minted 1,404 credits across eight accounts
  // against zero real payments before anyone noticed.
  //
  // The same need is served properly from /admin7731 now: an admin
  // grants credits to a NAMED person, with a reason, written down.
  const treasuryConfigured = Boolean(process.env.NEXT_PUBLIC_TREASURY_WALLET);
  const credits = auth.user?.credits ?? 0;

  async function buy(pack) {
    setErr(null); setMsg(null);
    if (!auth.user) return setErr("Sign in first.");
    if (!treasuryConfigured) return setErr("Payments aren't switched on yet.");

    // A phone browser cannot see a wallet, so it asks the app by
    // deeplink instead. The pack goes with the request, because this
    // page will be GONE by the time the answer arrives — the redirect
    // lands in a new tab, on a fresh load, that never saw the tap.
    //
    // Synchronous, and the last thing to run: the navigation has to
    // happen inside this tap or iOS opens phantom.app in the browser.
    if (auth.needsDeeplink) {
      auth.startWalletDeeplink("buy", "phantom", { packId: pack.id });
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

  // ---------- the deeplink half ----------
  // Resumed in whatever tab the redirect landed in, which is not the
  // one the pack was chosen in. Everything it needs came back through
  // localStorage; see lib/walletFlow.

  // The wallet named an address: build the transaction NOW, on page
  // load, where an await costs nothing. It has to be ready before the
  // tap, because fetching a blockhash inside the tap would spend the
  // gesture and land the user on phantom.app instead of in Phantom.
  useEffect(() => {
    const p = auth.pendingPay;
    if (!p || tx) return;
    let live = true;
    (async () => {
      const pack = PACKS.find((x) => x.id === p.payload?.packId);
      if (!pack) { setErr("Couldn't tell which pack that was — pick it again."); return; }
      const built = await buildTreasuryTx(pack.sol, auth.user?.accountId, p.address);
      if (!live) return;
      if (built.error) { setErr(built.error); return; }
      setTx({ transaction: built.transaction, pack });
    })();
    return () => { live = false; };
  }, [auth.pendingPay, auth.user?.accountId, tx]);

  // The wallet broadcast it. All that is left is waiting for the
  // chain, which the existing claim poll already does.
  useEffect(() => {
    const p = auth.paid;
    if (!p?.signature || claiming) return;
    setClaiming(true);
    setTx(null);
    setMsg(`Payment sent (${p.signature.slice(0, 12)}…). Confirming…`);
    (async () => {
      const out = await claim(p.signature);
      if (out.error) { setErr(out.error); setMsg(null); }
      else {
        setUser(out.user);
        setMsg(`${out.credits} credits added. Thank you.`);
      }
      // Ends the flow either way. A confirmed payment is not something
      // to retry, and a failed one has a signature the user can be
      // told about rather than a loop to sit in.
      auth.finishFlow();
      setClaiming(false);
    })();
  }, [auth.paid, claiming]);

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
        {/* No sentence here. It used to narrate the mechanic — "pick a
            pack and your wallet opens for approval" — to people who
            have approved a thousand transactions. Explaining a wallet
            to someone holding one reads as talking down, and the only
            genuinely non-obvious fact (any wallet can pay, it need not
            be the linked one) is not worth raising the question. */}
      </div>

      {/* Above the packs on purpose: for anyone holding enough, this
          IS the pricing, and finding it under the packs would mean
          finding it after deciding to pay. */}
      <TokenBar />

      {msg && <div className="notice money page-gap-top">{msg}</div>}
      {err && <div className="notice error page-gap-top">{err}</div>}

      {/* THE SECOND HOP OF A PHONE PURCHASE.
          The pack was chosen in a different tab, which iOS left
          behind; this one came back from the wallet knowing only an
          address. The transaction is already built — building it
          needs a blockhash, and fetching one inside the tap would
          spend the gesture that lets the link reach the app. */}
      {auth.pendingPay && (
        <div className="wcont page-gap-top">
          <span className="wcont-lead">
            <b className="wcont-step">Step 2 of 2</b>
            Paying from <span className="mono">{short(auth.pendingPay.address)}</span>
          </span>
          <p className="hint">
            {tx
              // States the deal and stops. Contrasting it with the
              // signing step ("this one DOES move funds") only
              // reopened the question of whether the other one did.
              ? `${tx.pack.credits} credits for ${tx.pack.sol} SOL.`
              : "Preparing the payment…"}
          </p>
          <div className="wcont-row">
            <button
              className="btn small primary"
              disabled={!tx || auth.busy}
              onClick={() => auth.payWithDeeplink(tx.transaction)}
            >
              {!tx || auth.busy ? <span className="spinner" /> : "Approve payment"}
            </button>
            <button
              className="btn small"
              onClick={() => { setTx(null); auth.cancelWalletDeeplink(); auth.finishFlow(); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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

      {/* The offer, read live, or nothing at all.
          It used to be hardcoded — "get 3 free runs every day" — while
          the real number is a config an admin can change, so it was
          one edit away from being a lie. And it ended "holder checks
          run live via Helius at generation time", which is a sentence
          about our infrastructure that nobody buying credits has any
          use for. */}
      {offer && <div className="notice page-gap">{offer}</div>}
    </main>
  );
}
