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
import { useWallet, short } from "@/lib/wallet";
import { newReference, transferUrl, savePending, readPending, clearPending } from "@/lib/solanaPay";

const NUM = (n) => (Number(n) || 0).toLocaleString("en-US");

// Every row the ladder compares, in the order they matter.
//
// The three capability rows that used to be here are gone: no feature
// is token-gated any more, so listing "Pick a style — Yes" against
// every rung including Free was four identical ticks pretending to be
// a comparison. What a tier actually buys is economics and status.
const LADDER_ROWS = [
  ["dailyRuns", "Free runs"],
  ["discount", "Off credits"],
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
  const [claiming, setClaiming] = useState(false);
  // A transfer request that has been opened in a wallet and not yet
  // seen on chain. { reference, pack } — the reference is what finds
  // it, since nothing comes back through the browser.
  const [watching, setWatching] = useState(null);
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

    // ══ A PHONE PAYS BY TRANSFER REQUEST ══
    //
    // No wallet in a phone browser, so the wallet APP is handed the
    // intent — pay this address this much — and builds, signs and
    // sends the transaction itself. See lib/solanaPay.js for why this
    // replaced the two-hop signing dance: WE used to choose the
    // blockhash, a blockhash lives about a minute, and the round trip
    // through the wallet is not ours to compress. Now there is no
    // deadline at all.
    //
    // Nothing comes back through the URL. The reference is how the
    // payment is found afterwards, and it is stored before we navigate
    // because this tab may be backgrounded for minutes.
    //
    // Synchronous, and the last thing to run: the navigation has to
    // happen inside this tap or iOS opens the wallet's WEBSITE.
    if (auth.needsDeeplink) {
      try {
        const reference = newReference();
        const url = transferUrl({
          treasury: process.env.NEXT_PUBLIC_TREASURY_WALLET,
          sol: pack.sol,
          reference,
          accountId: auth.user.accountId,
          message: `${pack.credits} credits`,
        });
        // `since` bounds the search so an earlier payment from a
        // previous attempt is never handed back as if it were this one.
        const since = Date.now();
        savePending({ reference, packId: pack.id, sol: pack.sol, since });
        setWatching({ since, pack });
        window.location.href = url;
      } catch (e) {
        setErr(e?.message || "Couldn't open your wallet app.");
      }
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

  // ---------- the transfer-request half ----------

  // ══ PICK THE WATCH BACK UP ON LOAD ══
  //
  // Opening a `solana:` URL switches apps, and iOS may discard the tab
  // behind it. So a page that finds a saved reference resumes watching
  // for it, whether it was backgrounded for ten seconds or reloaded
  // from nothing.
  useEffect(() => {
    if (watching || !packs.length) return;
    const p = readPending();
    if (!p) return;
    const pack = packs.find((x) => x.id === p.packId) || null;
    setWatching({ since: p.since || p.at || 0, pack });
  }, [packs, watching]);

  // ══ THE PAYMENT ARRIVES ON THE CHAIN, NOT IN THE BROWSER ══
  //
  // A transfer request gives no redirect and no signature — the wallet
  // builds and sends on its own. What we have is the reference we
  // attached, which is an account key, and account keys are
  // searchable. So this asks "has anything referencing this landed
  // yet" until something has, then hands the signature to the same
  // claim that every other payment path uses.
  //
  // No deadline anywhere in here. That is the entire point of the
  // rewrite: the old flow had about sixty seconds from building a
  // transaction to broadcasting it, and the part in the middle — a
  // person reading a warning about their own money — was never ours
  // to hurry.
  useEffect(() => {
    if (!watching?.since || claiming) return;
    let live = true;
    let tries = 0;

    const stop = (patch) => {
      clearPending();
      if (!live) return;
      setWatching(null);
      if (patch) patch();
    };

    const tick = async () => {
      if (!live) return;
      tries += 1;
      try {
        const r = await fetch(
          `/api/solana/find?since=${encodeURIComponent(watching.since)}`,
          { cache: "no-store" }
        );
        const d = await r.json();
        if (!live) return;

        if (d.signature) {
          setClaiming(true);
          setMsg("Payment received. Confirming…");
          const out = await claim(d.signature);
          if (!live) return;
          if (out.error) { setErr(out.error); setMsg(null); }
          else {
            setUser(out.user);
            setMsg(`${out.credits} credits added. Thank you.`);
          }
          setClaiming(false);
          stop();
          return;
        }
      } catch {
        // A dropped request while the phone was switching apps is
        // normal. Keep watching rather than declaring failure.
      }

      // Thirty minutes at two seconds. Generous on purpose: the cost
      // of giving up early is someone paying and being told nothing
      // happened, which is far worse than a page that waits.
      if (tries > 900) {
        stop(() => setErr(
          "Haven't seen that payment yet. If you approved it, your credits will appear on their own."
        ));
      }
    };

    const id = setInterval(tick, 2000);
    tick();
    return () => { live = false; clearInterval(id); };
  }, [watching, claiming]);

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
      // ══ 202 IS CHECKED FIRST BECAUSE 202 IS "ok" ══
      //
      // Response.ok is true for anything from 200 to 299, so a 202 was
      // being caught by the r.ok line below and returned on the very
      // first pass. The retry underneath it had never once run: the
      // page asked whether the payment had landed, was told "still
      // confirming", treated that as the final answer and displayed it
      // as an error — which is precisely what it looks like from the
      // outside, a payment stuck on "Still confirming" forever.
      //
      // Everything else, ok or not, is a real answer.
      if (r.status === 202) {
        await new Promise((res) => setTimeout(res, 3000));
        continue;
      }
      if (r.ok) return d;
      return { error: d.error || "Couldn't confirm that payment." };
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

      {/* WAITING ON A PHONE PURCHASE.
          The wallet has the request and will send the payment itself.
          Nothing redirects back, so this says plainly that coming
          back is the user's move — a panel that implied otherwise
          would leave someone sitting in Phantom waiting for a hop
          that is never going to happen. */}
      {watching && (
        <div className="wcont page-gap-top">
          <span className="wcont-lead">
            <b className="wcont-step">Waiting</b>
            {watching.pack
              ? `${watching.pack.credits} credits for ${watching.pack.sol} SOL`
              : "Approve the payment in your wallet"}
          </span>
          <p className="hint">
            Approve it in your wallet, then come back here. Credits land on
            their own — this page is watching for the payment.
          </p>
          <div className="wcont-row">
            <button
              className="btn small"
              onClick={() => { clearPending(); setWatching(null); setMsg(null); }}
            >
              Stop waiting
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
            {/* ══ NEVER "YOUR PLAN" ══
                It said that before the tiers were armed, sitting
                directly under three purchase buttons and above a card
                marked "You" — which is a purchase-tier layout, and
                "plan" is SaaS language for the thing you buy. Aminu
                designed this ladder and still read it as "buy a pack,
                change your plan". If he read it that way, everyone
                will.

                The verb carries the whole distinction, so the verb is
                in the heading in both states. */}
            <h3>{armed ? `Hold ${sym}` : `Holding ${sym}`}</h3>
            {/* ONE control, not one per card. The point of opening
                this is comparing the rungs, and four separate toggles
                makes comparison a sequence of taps — on a phone, the
                two rows you want to weigh against each other end up on
                different screens. */}
            <button className="panel-collapse" onClick={() => setOpenLadder((v) => !v)}>
              {openLadder ? "Hide" : "What each gets"}
            </button>
          </div>
          {/* The axis, in one line, because the packs above are the
              other axis and the two were reading as one. States the
              fact and stops — no explanation of why the token works
              this way, which is our reasoning and not theirs. */}
          <p className="lad-axis">Separate from credits. Nothing to buy.</p>
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
                    {t.earlyAccess && <li>New surfaces first</li>}
                    {t.customStyle && <li>A style of your own</li>}
                    {/* A rung whose entire list is falsy would render
                        an empty card, and an empty card reads as a
                        loading state rather than as an answer. */}
                    {!t.dailyRuns && !t.discount && <li className="lad-none">Credits only</li>}
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
