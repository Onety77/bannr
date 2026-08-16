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
import { entitlementsOf, tierById, nextTier, activeGrant } from "@/lib/tiers";
import { getUser, gateStateOf, setGateVerdict, todayKey } from "@/lib/users";
import { linkedWallets } from "@/lib/identities";

export async function resolveEntitlements(accountId, { refresh = false, verify = false, gate: given = null } = {}) {
  const gate = given || (await getGate());

  if (!accountId) {
    return { gate, tier: null, ent: entitlementsOf(gate, null), balance: 0, reason: "no-account", next: null, granted: null };
  }

  const u = await getUser(accountId);

  // ══ AN ADMIN GRANT IS CHECKED BEFORE ANYTHING ELSE ══
  //
  // Above the `gate.enabled` test on purpose. "Give this person access
  // even though we have not launched" is the main reason to grant a
  // tier at all, and putting it after that check would have made the
  // feature useless in exactly the situation it exists for.
  //
  // It also skips the balance read entirely — there is nothing to ask
  // the chain about — so a granted account costs no RPC call.
  const grant = activeGrant(u);
  const granted = grant ? tierById(grant.tier, gate.tiers) : null;

  // Not enabled means no ladder to climb — but the free tier is not
  // part of the ladder and is owed regardless, and a grant stands on
  // its own. entitlementsOf() with a null tier returns the free tier,
  // which is why there is no early return that skips it.
  if (!gate.enabled) {
    const ent = entitlementsOf(gate, granted);

    // ══ AND THE VERDICT HAS TO BE RECORDED HERE TOO ══
    //
    // This branch used to return without writing one, and the result
    // was a tier that half worked: /api/pricing computes entitlements
    // live, so the discount appeared correctly, while /create locks
    // its fields from the CACHED copy the verdict writes — which
    // therefore did not exist. Granted the top tier, shown the free
    // one, with a working 40% discount on the next page as proof it
    // had been applied. The most confusing shape a bug can take.
    //
    // The browser cannot fall back to resolving the tier id itself
    // here: the public tier table is empty while the tiers are off,
    // which is precisely the situation a grant exists for.
    //
    // Written only when it would change something, so this stays a
    // read on every request that needs no write.
    if (granted) {
      const stale = u?.gateDate !== todayKey() || u?.gateTier !== granted.id;
      if (stale) {
        await setGateVerdict(accountId, ent, { tier: granted, reason: "granted", balance: 0 }).catch(() => {});
      }
    }

    return {
      gate,
      tier: granted,
      ent,
      balance: 0,
      reason: granted ? "granted" : "off",
      next: null,
      granted: grant || null,
    };
  }

  const st = gateStateOf(u, gate);

  // ══ THE BETTER OF GIVEN AND EARNED, NEVER THE LATER OF THE TWO ══
  //
  // A grant is a floor. Somebody already holding enough for t3 who
  // then wins a t1 prize must stay on t3 — replacing the earned tier
  // would turn a reward into a demotion, and it would happen silently,
  // to the biggest holders, who are the last people to deserve it.
  const best = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    return gate.tiers.indexOf(a) >= gate.tiers.indexOf(b) ? a : b;
  };

  // ══ VERIFY ON THE MOMENTS THAT SPEND SOMETHING ══
  //
  // A tier reached today is not re-read again that day, which means
  // selling is only noticed at UTC midnight — up to 24 hours of free
  // runs and discounted packs after the tokens are gone. Buying is
  // seen in ten minutes; selling was not seen at all.
  //
  // `verify` closes that on the events where it costs us: starting a
  // generation, and pricing a pack. Both are the moment a benefit is
  // actually taken, which is the only moment worth paying an RPC call
  // to be sure about.
  //
  // Only for accounts that CURRENTLY HOLD a tier. Someone with nothing
  // has nothing to lose by being cached, and they are already re-read
  // every recheckMinutes — so this adds a balance read for holders at
  // the point of spending, and nothing at all for everybody else.
  const holding = Boolean(st.tierId);
  if (!refresh && !(verify && holding) && !st.needsCheck) {
    const earned = tierById(st.tierId, gate.tiers);
    const tier = best(earned, granted);
    const balance = Number.isFinite(u?.gateBalance) ? u.gateBalance : 0;
    return {
      gate, tier,
      ent: entitlementsOf(gate, tier),
      balance,
      reason: u?.gateReason || "",
      next: nextTier(balance, gate.tiers),
      granted: grant || null,
    };
  }

  // Never fatal. A dead RPC resolves to no tier, which falls through
  // to the free tier and then to credits — the site keeps working and
  // nobody is handed a discount on the strength of a failed lookup.
  //
  // A GRANT SURVIVES THAT FAILURE, because it never depended on the
  // chain: the balance read can time out and the granted tier still
  // stands.
  const proven = await linkedWallets(accountId).catch(() => []);
  const verdict = await evaluate(accountId, proven, gate).catch(() => ({
    qualified: false, tier: null, reason: "unknown", balance: 0,
  }));
  const tier = best(verdict.tier || null, granted);
  const ent = entitlementsOf(gate, tier);
  // The RESOLVED tier is recorded, not the one the balance earned, so
  // the rest of the day reads back what was actually given.
  await setGateVerdict(accountId, ent, { ...verdict, tier }).catch(() => {});

  return {
    gate, tier, ent,
    balance: verdict.balance || 0,
    reason: verdict.reason || "",
    next: nextTier(verdict.balance || 0, gate.tiers),
    granted: grant || null,
  };
}
