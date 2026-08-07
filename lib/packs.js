// ============================================================
// CREDIT PACKS — the single source of pricing.
//
// This list used to be duplicated in the credits page and in the
// Helius webhook. Two copies of a price is a bug waiting to happen:
// edit one and the site advertises a number the payment handler
// doesn't honour. Both import from here now.
//
// ══ PRICED IN DOLLARS, PAID IN SOL ══
//
// These used to be SOL amounts — 0.05, 0.12, 0.35 — and that was a
// real defect rather than a stylistic choice. They were set when SOL
// was around $150 and never edited; SOL fell to roughly $72 and the
// packs silently became $3.63, $8.71 and $25.42, about half what was
// intended, with nobody having touched a price. A product priced in a
// volatile asset re-prices itself daily and tells no one.
//
// So `usd` is the price. lib/solPrice.js converts at the moment of
// quoting, and the same conversion runs again at claim time against
// what actually arrived. Nothing in this file knows the rate — it is
// passed in — which is what keeps this importable by the credits page
// as well as the server.
//
// ══ THE DISCOUNT IS PART OF THE PRICE, NOT A DEDUCTION AFTER IT ══
//
// A holder's pack costs less, so the SOL they are asked to send is
// less, so the amount that arrives on chain is less — and the matcher
// below has to already know that or it will grade a discounted Launch
// payment as an off-tier amount and credit it at the Starter rate.
// That would hand a holder FEWER credits per dollar than a non-holder,
// which is the exact opposite of the intent and would be silent.
// Every function here that touches an amount takes the discount.
// ============================================================

export const PACKS = [
  { id: "starter", name: "Starter", usd: 9,  credits: 15,  gens: 5,  featured: false },
  { id: "launch",  name: "Launch",  usd: 29, credits: 60,  gens: 20, featured: true  },
  { id: "studio",  name: "Studio",  usd: 79, credits: 200, gens: 66, featured: false },
];

// Payments from before the USD move carry ids that no longer exist.
// Billing history reads them, and a row saying "degen" is better than
// a row saying nothing — history is not rewritten, it is translated.
const LEGACY_NAMES = { builder: "Builder", degen: "Degen" };

export function packLabel(id) {
  const p = PACKS.find((x) => x.id === id);
  if (p) return p.name;
  return LEGACY_NAMES[id] || (id === "custom" ? "Custom" : id || "—");
}

export function getPack(id) {
  return PACKS.find((p) => p.id === id) || null;
}

// What this pack costs THIS person, in dollars.
//
// Rounded to whole cents. A discount that produces $26.099999 is not a
// price, and the number shown on the page has to be the number the
// matcher expects — deriving them separately is how a 1-cent drift
// puts a payment outside its own tolerance band.
export function priceUsd(pack, discount = 0) {
  const d = Math.min(Math.max(Number(discount) || 0, 0), 90);
  return Math.round(pack.usd * (100 - d)) / 100;
}

// ══ THE TOLERANCE BAND ══
//
// Was 2%, which was fine when the price was a fixed SOL amount and the
// only drift was fee dust. It is not fine now: the quote is struck at
// one SOL price and the transaction confirms at another, and the gap
// between those two is real market movement, not rounding.
//
// 8% is set against how far SOL actually moves in the seconds-to-
// minutes between approving a payment and it landing — generously,
// because the cost of the band being too TIGHT is a correct payment
// graded into the tier below, and the cost of it being too LOOSE is a
// few percent of credits. Those are not symmetric.
//
// The bands cannot overlap: $9, $29 and $79 are more than 8% apart at
// every gap, and the ladder is checked from the top down so the
// closest match wins regardless.
export const TOLERANCE = 0.08;

// How many credits a payment is worth.
//
//   sol       what actually arrived, off the chain
//   rate      USD per SOL at the time of grading
//   discount  this account's tier discount, 0 for everyone else
//
// Returns { id, credits, usd, ratedAs? }. A null rate means we could
// not price it, and the caller must hold the payment rather than
// guess — see the note in lib/solPrice.js about why there is no
// fallback rate.
//
// The old rule credited anything off-tier at the STARTER rate, which
// produced two genuinely unfair outcomes:
//
//   0.35 SOL -> 160 credits   but   0.36 SOL -> 108 credits
//   0.70 SOL (2x Degen) -> 320  but  1.00 SOL -> 300
//
// Paying more could get you less. An off-tier payment is credited at
// the rate of the best pack it qualifies for instead, so the value
// never goes backwards as the amount goes up and overpaying is never
// punished. Anything below the smallest pack uses the starter rate.
export function creditsForPayment(sol, rate, discount = 0) {
  if (!(rate > 0)) return null;
  const usd = Number(sol) * rate;
  if (!(usd > 0)) return { id: "custom", credits: 0, usd: 0 };

  // Highest first: a payment sitting between two tiers should be read
  // as the bigger one it nearly matches, not the smaller one it
  // comfortably clears.
  for (let i = PACKS.length - 1; i >= 0; i--) {
    const p = PACKS[i];
    const want = priceUsd(p, discount);
    if (want > 0 && Math.abs(usd - want) / want <= TOLERANCE) {
      return { id: p.id, credits: p.credits, usd };
    }
  }

  const best = [...PACKS].reverse().find((p) => usd >= priceUsd(p, discount)) || PACKS[0];
  const perDollar = best.credits / priceUsd(best, discount);
  return { id: "custom", credits: Math.floor(usd * perDollar), usd, ratedAs: best.id };
}
