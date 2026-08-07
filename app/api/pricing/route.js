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
import { PACKS, priceUsd } from "@/lib/packs";
import { solUsd, solForUsd } from "@/lib/solPrice";
import { resolveEntitlements } from "@/lib/entitlements";
import { getGate } from "@/lib/tokenGate";
import { entitlementsOf } from "@/lib/tiers";
import { GENERATION_COST } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = requireUser(req);
  // An explicit re-check, from the button on the credits page. It is
  // the one place someone is entitled to force a balance read: they
  // are looking at a price that depends on it, having just bought
  // tokens, and "wait ten minutes" is not an answer there.
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  let gate, ent, balance = 0, next = null, reason = "";
  try {
    if (session) {
      ({ gate, ent, balance, next, reason } = await resolveEntitlements(session.accountId, { refresh }));
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

  return NextResponse.json(
    {
      solUsd: rate,
      generationCost: GENERATION_COST,
      packs,
      discount,
      // The ladder, for the tier table under the packs. Empty until the
      // gate is armed, which is what makes the section disappear
      // rather than advertise an offer that does not exist yet.
      symbol: gate.symbol || "BANNR",
      tiers: gate.enabled ? gate.tiers : [],
      free: ent.tierId ? null : { dailyRuns: ent.dailyRuns, styles: ent.styles, direction: ent.direction, advanced: ent.advanced },
      you: session
        ? {
            tierId: ent.tierId,
            tierName: ent.tierName,
            dailyRuns: ent.dailyRuns,
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
