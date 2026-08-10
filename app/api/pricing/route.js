// ============================================================
// GET /api/pricing — the whole credits page, priced for whoever asks.
//
// One route rather than three, because the credits page needs the
// packs, the SOL rate and this account's standing at the same moment
// and they have to agree with each other. Fetched separately they
// would arrive at slightly different times and the page would render a
// discount against a rate struck before it applied.
//
// It also means the page does no arithmetic. Every number it shows is
// computed here, by the same functions the payment matcher uses — see
// lib/entitlements.js for why that identity matters.
//
// ══ WORKS SIGNED OUT ══
//
// No session is not an error. It returns list prices with no discount
// and no standing, which is exactly what someone should see before
// they sign in — the page is a price list first and an account page
// second.
//
// ══ AND IT CAN RETURN NO PRICE AT ALL ══
//
// `solUsd` is null when the rate is not trustworthy. The page must
// then show dollars and say it cannot quote SOL, rather than falling
// back to a number. There is no safe default rate; see lib/solPrice.js.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { armIntents } from "@/lib/payIntents";
import { PACKS, priceUsd } from "@/lib/packs";
import { solUsd, solForUsd } from "@/lib/solPrice";
import { resolveEntitlements } from "@/lib/entitlements";
import { getGate } from "@/lib/tokenGate";
import { entitlementsOf } from "@/lib/tiers";
import { GENERATION_COST, getUser, todayKey } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Free runs remaining today. Zero means spent; the fallback covers an
// account whose balance has never been checked, where the stored
// figures are absent rather than zero.
function runsLeftToday(u, ent) {
  if (!u || u.gateDate !== todayKey()) return ent.dailyRuns;
  return Math.max(0, (u.gateAllowance || 0) - (u.gateUsed || 0));
}

export async function GET(req) {
  const session = requireUser(req);
  // An explicit re-check, from the button on the credits page. It is
  // the one place someone is entitled to force a balance read: they
  // are looking at a price that depends on it, having just bought
  // tokens, and "wait ten minutes" is not an answer there.
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  let gate, ent, balance = 0, next = null, reason = "", me = null;
  try {
    if (session) {
      ({ gate, ent, balance, next, reason } = await resolveEntitlements(session.accountId, { refresh }));
      // Read AFTER resolveEntitlements, never before: that call is
      // what writes today's verdict on a first visit, and reading the
      // account first would report yesterday's figures.
      me = await getUser(session.accountId).catch(() => null);
    } else {
      gate = await getGate();
      ent = entitlementsOf(gate, null);
    }
  } catch {
    // Never an error page. Falling back to list prices with no
    // standing is wrong in the customer's favour and still sells.
    gate = { tiers: [], symbol: "BANNR", enabled: false, free: null };
    ent = entitlementsOf(gate, null);
  }

  const rate = await solUsd();
  const discount = ent.discount || 0;

  const packs = PACKS.map((p) => {
    const usd = priceUsd(p, discount);
    return {
      id: p.id,
      name: p.name,
      credits: p.credits,
      gens: p.gens,
      featured: p.featured,
      // Both prices travel, so the page can strike through the list
      // price without knowing how a discount works.
      listUsd: p.usd,
      usd,
      sol: rate === null ? null : solForUsd(usd, rate),
    };
  });

  // ══ RESERVE THE EXACT AMOUNTS, HERE, BEFORE ANYONE TAPS ══
  //
  // A wallet cannot be relied on to carry anything into the
  // transaction — Phantom discards the memo and the reference from a
  // transfer request and sends a bare transfer — so the amount is the
  // only thing left that can name an account. See lib/payIntents.js.
  //
  // It happens in THIS route rather than its own because the tap that
  // opens the wallet may not await anything, so the number has to
  // already exist by the time a pack is chosen; because this route is
  // what the page loads first anyway; and because arming anywhere else
  // risks reserving an amount that disagrees with the price shown one
  // line above.
  //
  // Signed out, nothing is armed. There is no account to bind to, and
  // the page cannot buy anything in that state either.
  let payable = packs;
  if (session?.accountId && rate !== null) {
    try {
      const armed = await armIntents(session.accountId, packs);
      payable = packs.map((p) =>
        armed[p.id]
          ? // `sol` becomes the EXACT figure the wallet will be asked
            // for, so what is displayed, what is approved and what is
            // matched are one number rather than three.
            { ...p, sol: armed[p.id] / 1e9, lamports: armed[p.id] }
          : p
      );
    } catch (e) {
      // Selling at a round number beats not selling. The payment then
      // needs the memo or a linked wallet to be matched, which is
      // where this started — degraded, not broken.
      console.error("[pricing] arm", e.message);
    }
  }

  return NextResponse.json(
    {
      solUsd: rate,
      generationCost: GENERATION_COST,
      packs: payable,
      discount,
      // ══ THE LADDER, AND WHY FREE IS PART OF IT ══
      //
      // `free` is sent unconditionally and in the same shape as a
      // tier, because it IS one — a standing with an allowance and a
      // set of capabilities, not the absence of a standing. It used to
      // be a clause in the balance row ("+1 free run a day"), which
      // put the bottom of the ladder somewhere you could not compare
      // it to the rest, and left the section rendering nothing at all
      // before the tiers are armed.
      //
      // The holder rungs stay empty until the gate is live. That is
      // still right — a threshold nobody can meet yet is not an offer
      // — but it now degrades to a one-rung ladder rather than to
      // blank space.
      symbol: gate.symbol || "BANNR",
      free: {
        id: "free",
        name: "Free",
        minTokens: 0,
        dailyRuns: ent.tierId ? (gate.free?.dailyRuns ?? 0) : ent.dailyRuns,
        discount: 0,
        styles: Boolean(gate.free?.styles),
        direction: Boolean(gate.free?.direction),
        advanced: Boolean(gate.free?.advanced),
        earlyAccess: false,
        customStyle: false,
      },
      tiers: gate.enabled ? gate.tiers : [],
      you: session
        ? {
            tierId: ent.tierId,
            tierName: ent.tierName,
            dailyRuns: ent.dailyRuns,
            // What is actually left today, which is what the balance
            // panel shows. The fallback is the first-visit case: no
            // gate record exists yet, so the stored figure is 0 while
            // the ladder in fact owes them the full allowance. Told
            // apart by whether an allowance was ever recorded, not by
            // the number being zero — "never checked" and "checked,
            // and you have none" are different answers.
            runsLeft: runsLeftToday(me, ent),
            balance,
            reason,
            // The only place in the product where holding the token
            // and spending money are the same sentence.
            next: next ? { id: next.id, name: next.name, minTokens: next.minTokens, away: next.away, discount: next.discount } : null,
          }
        : null,
    },
    // Never cached at the edge: it is per-account and carries a
    // discount. A shared cache here would serve one person's price to
    // the next visitor.
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
