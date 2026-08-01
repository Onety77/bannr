// ============================================================
// CREDIT PACKS — the single source of pricing.
//
// This list used to be duplicated in the credits page and in the
// Helius webhook. Two copies of a price is a bug waiting to happen:
// edit one and the site advertises a number the payment handler
// doesn't honour. Both import from here now.
// ============================================================

export const PACKS = [
  { id: "starter", name: "Starter", sol: 0.05, credits: 15,  gens: 5 },
  { id: "builder", name: "Builder", sol: 0.12, credits: 45,  gens: 15, featured: true },
  { id: "degen",   name: "Degen",   sol: 0.35, credits: 160, gens: 53 },
];

// Within 2% of a listed price counts as buying that pack, which
// absorbs rounding and fee dust without letting a materially
// different amount claim the tier.
const TOLERANCE = 0.02;

// How many credits a payment of `sol` is worth.
//
// The old rule credited anything off-tier at the STARTER rate, which
// produced two genuinely unfair outcomes:
//
//   0.35 SOL -> 160 credits   but   0.36 SOL -> 108 credits
//   0.70 SOL (2x Degen) -> 320  but  1.00 SOL -> 300
//
// Paying more could get you less. Now an off-tier payment is credited
// at the rate of the best pack it qualifies for, so the value never
// goes backwards as the amount goes up, and overpaying is never
// punished. Anything below the smallest pack uses the starter rate.
export function creditsForSol(sol) {
  if (!(sol > 0)) return { id: "custom", credits: 0 };

  for (const p of PACKS) {
    if (Math.abs(sol - p.sol) / p.sol < TOLERANCE) {
      return { id: p.id, credits: p.credits };
    }
  }

  const best = [...PACKS].reverse().find((p) => sol >= p.sol) || PACKS[0];
  const rate = best.credits / best.sol;
  return { id: "custom", credits: Math.floor(sol * rate), ratedAs: best.id };
}
