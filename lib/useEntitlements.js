// ============================================================
// WHAT THIS BROWSER IS ALLOWED TO OFFER.
//
// The mirror of lib/entitlements.js, which answers the same question
// on the server. Both reduce to entitlementsOf() in lib/tiers.js, and
// that shared bottom is the point: a locked field that still works, or
// an unlocked field the server strips, are the two bugs this exists to
// make impossible.
//
// Assembled from two things the app already has open:
//
//   useToken()  the public tier table and the free tier, cached at
//               module level, one fetch for the whole session
//   useAuth()   this account's rung, as an id
//
// So it costs no request of its own, and the account's standing is
// never recomputed in the browser — the id was decided server-side by
// a signature-verified balance read and is only being looked up here.
//
// ══ LOCKED IS THE LOADING STATE ══
//
// Before /api/token answers, entitlementsOf() falls back to the free
// tier's defaults, so everything gated reads as locked for a moment.
// That is the right way round: showing a field and then taking it away
// as the answer arrives would lose whatever had been typed into it.
// ============================================================
"use client";
import { useToken } from "@/lib/useToken";
import { useAuth } from "@/lib/useAuth";
import { entitlementsOf, tierById } from "@/lib/tiers";

export function useEntitlements() {
  const t = useToken();
  const auth = useAuth();
  const gate = { free: t?.free, tiers: t?.tiers || [] };
  const base = entitlementsOf(gate, tierById(auth.user?.tierId, gate.tiers));

  // ══ THE SERVER'S OWN ANSWER WINS WHEN IT HAS ONE ══
  //
  // Resolving `tierId` against the PUBLIC table works for a holder,
  // and fails for an account an admin GAVE a tier to before launch:
  // that table is empty while the tiers are off, the lookup finds
  // nothing, and the page would lock fields the server is perfectly
  // happy to accept. A locked control that still works is exactly the
  // disagreement this file exists to prevent.
  //
  // `entitlements` is the resolved answer the last verdict cached —
  // computed by the server FROM the same table, not a second copy of
  // the rules. Merged over the top rather than replacing, so anything
  // it does not carry still comes from the shared function.
  const cached = auth.user?.entitlements;
  if (!cached) return base;
  return {
    ...base,
    styles: Boolean(cached.styles),
    direction: Boolean(cached.direction),
    advanced: Boolean(cached.advanced),
    discount: cached.discount || base.discount,
    tierName: cached.tierName || base.tierName,
  };
}
