// ============================================================
// CREDITS — packs, the ladder, and paying in SOL.
//
// ══ PRICED IN DOLLARS ══
//
// The packs used to be SOL amounts written into lib/packs.js. They
// were set when SOL was about $150 and never touched; SOL fell to
// around $72 and the three packs quietly became $3.63, $8.71 and
// $25.42 — half what anyone intended, with nobody having edited a
// price. So the price is nine dollars and the SOL underneath it is
// today's conversion, struck when the page loaded.
//
// EVERY NUMBER ON THIS PAGE COMES FROM /api/pricing. Not because
// fetching is tidier, but because the discount applied here has to be
// the same one the payment matcher applies at claim time — computed
// separately they would drift, and a holder would pay the price we
// showed and be credited at the tier below it. One source, one answer.
//
// ══ AND IT CAN REFUSE TO QUOTE ══
//
// `solUsd` comes back null when the rate is not trustworthy. The page
// then shows dollars and disables buying rather than falling back to a
// number, because a wrong rate does not break anything visible — it
// sells $79 of credits for whatever the bad number worked out to.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";
import { setUser } from "@/lib/credits";
import { useAuth } from "@/lib/useAuth";
import { useWallet, short, buildTreasuryTx } from "@/lib/wallet";

const NUM = (n) => (Number(n) || 0).toLocaleString("en-US");

// Every row the ladder compares, in the order they matter. Named here
// rather than derived from CAPS so the wording is the reader's — the
// server calls it `direction`, a person calls it telling us what they
// want — and so the two perks that are honoured by hand sit in the
// same table as the ones the pipeline enforces. To the person reading
// it there is no difference, and there should not be.
const LADDER_ROWS = [
  ["dailyRuns", "Free runs"],
  ["discount", "Off credits"],
  ["styles", "Pick a style"],
  ["direction", "Say what you want"],
  ["advanced", "Advanced settings"],
  ["earlyAccess", "New surfaces first"],
  ["customStyle", "A style of your own"],
];
// Whole tokens, written the way people say them.
const tokens = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(v % 1_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return NUM(v);
};

export default function CreditsPage() {
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [checking, setChecking] = useState(false);
  // Closed by default. The three-line summary on each card answers
  // "what do I get" for almost everyone; the full table answers "what
  // would climbing buy me", which is a question you only ask once.
  const [openLadder, setOpenLadder] = useState(false);
  // A transaction built and waiting for the tap that carries it to
  // the wallet app, and whether a broadcast one is being confirmed.
  const [tx, setTx] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const auth = useAuth();
  const wallet = useWallet();
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

  const loadPricing = useCallback(async (refresh = false) => {
    try {
      const r = await fetch(`/api/pricing${refresh ? "?refresh=1" : ""}`);
      const d = await r.json();
      if (r.ok) setPricing(d);
    } catch {
      // Leaves whatever was already on screen. A failed refresh should
      // not blank a page that was rendering fine a second ago.
    }
  }, []);

  // Re-read when the account changes: the discount is per account, so
  // signing in has to re-price the page rather than leave list prices
  // sitting there.
  useEffect(() => { loadPricing(); }, [loadPricing, auth.user?.accountId]);

  async function recheck() {
    setChecking(true);
    await loadPricing(true);
    setChecking(false);
  }

  const packs = pricing?.packs || [];
  const quotable = pricing ? pricing.solUsd !== null : true;
  const you = pricing?.you || null;

  async function buy(pack) {
    setErr(null); setMsg(null);
    if (!auth.user) return setErr("Sign in first.");
    if (!treasuryConfigured) return setErr("Payments aren't switched on yet.");
    if (!pack?.sol) return setErr("Can't quote a price right now. Try again in a moment.");

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
  //
  // WAITS FOR PRICING. The amount is no longer a constant that came
  // with the bundle — it is today's conversion, and building a
  // transaction before it arrives would send whatever `undefined`
  // rounds to.
  useEffect(() => {
    const p = auth.pendingPay;
    if (!p || tx || !packs.length) return;
    let live = true;
    (async () => {
      const pack = packs.find((x) => x.id === p.payload?.packId);
      if (!pack) { setErr("Couldn't tell which pack that was — pick it again."); return; }
      if (!pack.sol) { setErr("Can't quote a price right now. Try again in a moment."); return; }
      const built = await buildTreasuryTx(pack.sol, auth.user?.accountId, p.address);
      if (!live) return;
      if (built.error) { setErr(built.error); return; }
      setTx({ transaction: built.transaction, pack });
    })();
    return () => { live = false; };
  }, [auth.pendingPay, auth.user?.accountId, tx, packs]);

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

  const sym = pricing?.symbol ? `$${pricing.symbol}` : "$BANNR";
  // ══ FREE IS THE FIRST RUNG, NOT A FOOTNOTE ══
  //
  // It used to be a clause in the balance row — "+1 free run a day" —
  // which is the bottom of the ladder printed somewhere you cannot
  // compare it to the rest of the ladder. A standing with an allowance
  // and a set of capabilities is a rung; it renders as one.
  //
  // It is also what keeps this section alive before the tiers are
  // armed: publicGate withholds the holder rungs until then, and a
  // section that renders nothing is a section nobody knows exists.
  const ladder = pricing ? [pricing.free, ...(pricing.tiers || [])].filter(Boolean) : [];
  const armed = (pricing?.tiers || []).length > 0;

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>Credits</h1>
        <p>1 run = {pricing?.generationCost ?? 3} credits = up to 4 banner options.</p>
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
          {/* The allowance used to be stated here as "+1 free run a
              day". It says what is LEFT now, and the allowance itself
              moved into the Free card in the ladder below where it can
              be read against the rungs above it. A balance panel
              should carry balances; an entitlement is not one. */}
          {you && you.runsLeft > 0 && (
            <span className="wallet-free">
              {you.runsLeft} free {you.runsLeft === 1 ? "run" : "runs"} left today
            </span>
          )}
          {wallet.address && (
            <>
              <span className="addr">{short(wallet.address)}</span>
              <button className="btn small" onClick={wallet.disconnect}>Disconnect</button>
            </>
          )}
        </div>
      </div>

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

      {/* One line, and only when there is one. A discount nobody has
          is not worth a row of chrome. */}
      {pricing?.discount > 0 && (
        <div className="notice money page-gap-top">
          {pricing.discount}% off, as {you?.tierName || "a holder"}.
        </div>
      )}

      <div className="packs page-gap-top">
        {(packs.length ? packs : [null, null, null]).map((p, i) => (
          <div key={p?.id || i} className={`pack ${p?.featured ? "featured" : ""}`}>
            {p ? (
              <>
                <div className="name">{p.name}</div>
                <div className="price">
                  {p.usd < p.listUsd && <s className="price-was">${p.listUsd}</s>}
                  ${p.usd}
                </div>
                {/* The SOL is the amount that will actually leave the
                    wallet, so it is stated exactly rather than
                    rounded for looks. Absent when we cannot quote. */}
                <div className="price-sol">{p.sol ? `${p.sol} SOL` : "—"}</div>
                <div className="gens">{p.credits} credits · ~{p.gens} runs</div>
                <button
                  className="btn primary small block"
                  disabled={!quotable || !p.sol}
                  onClick={() => buy(p)}
                >
                  Buy {p.name}
                </button>
              </>
            ) : (
              <div className="pack-skel" />
            )}
          </div>
        ))}
      </div>

      {!quotable && (
        <div className="notice page-gap-top">
          Can't quote SOL right now. Prices are in dollars; try again in a minute.
        </div>
      )}

      {/* ---- THE LADDER ----
          Under the packs, not above them. Above, it reads as a reason
          not to buy the thing you came here for; under, it is the
          answer to "and what if I hold". */}
      {ladder.length > 0 && (
        <section className="ladder page-gap">
          <div className="panel-head">
            <h3>{armed ? `Hold ${sym}` : "Your plan"}</h3>
            {/* ONE control, not one per card. The point of opening
                this is comparing the rungs, and four separate toggles
                makes comparison a sequence of taps — on a phone, the
                two rows you want to weigh against each other end up on
                different screens. */}
            <button className="panel-collapse" onClick={() => setOpenLadder((v) => !v)}>
              {openLadder ? "Hide" : "What each gets"}
            </button>
          </div>
          <div className={`ladder-grid ${armed ? "" : "solo"}`}>
            {ladder.map((t) => {
              const mine = (you?.tierId || "free") === t.id;
              return (
                <div className={`lad ${mine ? "mine" : ""}`} key={t.id}>
                  <div className="lad-h">
                    <b>{t.name}</b>
                    {mine && <span className="lad-you">You</span>}
                  </div>
                  <div className="lad-hold">
                    {t.id === "free" ? "Signed in" : `${tokens(t.minTokens)} ${sym}`}
                  </div>
                  <ul className="lad-perks">
                    {t.dailyRuns > 0 && <li>{t.dailyRuns} free {t.dailyRuns === 1 ? "run" : "runs"} a day</li>}
                    {t.discount > 0 && <li>{t.discount}% off credits</li>}
                    {t.styles && <li>Every style</li>}
                    {t.earlyAccess && <li>New surfaces first</li>}
                    {t.customStyle && <li>A style of your own</li>}
                    {/* A rung whose entire list is falsy would render
                        an empty card, and an empty card reads as a
                        loading state rather than as an answer. */}
                    {!t.dailyRuns && !t.discount && !t.styles && <li className="lad-none">Credits only</li>}
                  </ul>

                  {/* ══ EVERYTHING, INCLUDING WHAT IT DOES NOT GET ══
                      The list above is the pitch and skips the misses,
                      which is right for a pitch and useless for a
                      decision: what you are actually working out is
                      what climbing BUYS you, and that is only legible
                      when the gaps are on the page next to the gains.
                      So this shows every row for every rung, with the
                      absences marked rather than dropped. */}
                  {openLadder && (
                    <dl className="lad-all">
                      {LADDER_ROWS.map(([key, label]) => {
                        const v = t[key];
                        const on = key === "dailyRuns" || key === "discount" ? v > 0 : Boolean(v);
                        return (
                          <div className={`lad-row ${on ? "" : "off"}`} key={key}>
                            <dt>{label}</dt>
                            <dd>
                              {key === "dailyRuns" ? (v > 0 ? `${v} a day` : "—")
                                : key === "discount" ? (v > 0 ? `${v}%` : "—")
                                : on ? "Yes" : "—"}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>

          {/* Said once, under the ladder, and only while the rungs
              above Free do not exist yet. Without it a one-card ladder
              looks like the whole offer rather than the start of one. */}
          {!armed && (
            <p className="lad-soon">The holding tiers arrive with {sym}.</p>
          )}

          {/* ══ THE ONE PLACE HOLDING AND BUYING ARE THE SAME SENTENCE ══
              It sits directly under the ladder and directly above
              nothing else, because it is a call to action and putting
              it beside the packs would have it compete with them.
              Absent at the top of the ladder, and absent when we do
              not know the balance. */}
          {you?.next && (
            <div className="lad-next">
              <span>
                <b>{tokens(you.next.away)} {sym}</b> from {you.next.name}
              </span>
              <button className="btn small" onClick={recheck} disabled={checking}>
                {checking ? <span className="spinner" /> : "Check again"}
              </button>
            </div>
          )}
          {you && !you.next && you.tierId && (
            <div className="lad-next">
              <span>Top of the ladder.</span>
              <button className="btn small" onClick={recheck} disabled={checking}>
                {checking ? <span className="spinner" /> : "Check again"}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
