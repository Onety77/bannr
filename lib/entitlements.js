// ============================================================
// ONE ANSWER TO "WHAT DOES THIS ACCOUNT GET", for the server.
//
// Three routes need it and they must not disagree:
//
//   /api/generate  which fields are allowed, and how many free runs
//   /api/pay/claim what this pack cost them, so the payment matches
//   /api/pricing   what to put on the page
//
// The dangerous pair is the middle one against the last. The credits
// page quotes a discounted price and the payer sends exactly that; if
// the claim route computed a different discount, the amount that
// arrived would fall outside its own pack's tolerance band and be
// graded down. The person would have paid the right money and been
// given fewer credits than the page promised, silently. So both call
// this.
//
// ══ THE BALANCE READ IS ONCE A DAY, NOT ONCE A REQUEST ══
//
// gateStateOf decides. An account that reached a tier today is not
// re-read at all; one that did not is re-read every recheckMinutes, so
// buying at noon works at noon. `refresh: true` forces it, which the
// credits page uses on an explicit "check again" — the one place
// someone is entitled to demand a fresh answer, because they are
// standing in front of a price that depends on it.
// ============================================================
import "server-only";
import { getGate, evaluate } from "@/lib/tokenGate";
import { entitlementsOf, tierById, nextTier } from "@/lib/tiers";
import { getUser, gateStateOf, setGateVerdict } from "@/lib/users";
import { linkedWallets } from "@/lib/identities";

export async function resolveEntitlements(accountId, { refresh = false, gate: given = null } = {}) {
  const gate = given || (await getGate());

  // Not enabled means no ladder at all — but the free tier is not part
  // of the ladder and is owed regardless. entitlementsOf() with a null
  // tier returns exactly that, which is why there is no early return
  // that skips it.
  if (!gate.enabled || !accountId) {
    return { gate, tier: null, ent: entitlementsOf(gate, null), balance: 0, reason: gate.enabled ? "no-account" : "off", next: null };
  }

  const u = await getUser(accountId);
  const st = gateStateOf(u, gate);

  if (!refresh && !st.needsCheck) {
    const tier = tierById(st.tierId, gate.tiers);
    const balance = Number.isFinite(u?.gateBalance) ? u.gateBalance : 0;
    return {
      gate, tier,
      ent: entitlementsOf(gate, tier),
      balance,
      reason: u?.gateReason || "",
      next: nextTier(balance, gate.tiers),
    };
  }

  // Never fatal. A dead RPC resolves to no tier, which falls through
  // to the free tier and then to credits — the site keeps working and
  // nobody is handed a discount on the strength of a failed lookup.
  const proven = await linkedWallets(accountId).catch(() => []);
  const verdict = await evaluate(accountId, proven, gate).catch(() => ({
    qualified: false, tier: null, reason: "unknown", balance: 0,
  }));
  const tier = verdict.tier || null;
  const ent = entitlementsOf(gate, tier);
  await setGateVerdict(accountId, ent.dailyRuns, verdict).catch(() => {});

  return {
    gate, tier, ent,
    balance: verdict.balance || 0,
    reason: verdict.reason || "",
    next: nextTier(verdict.balance || 0, gate.tiers),
  };
}
