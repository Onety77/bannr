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
  return entitlementsOf(gate, tierById(auth.user?.tierId, gate.tiers));
}
