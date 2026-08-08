// ============================================================
// THE LADDER — what you get for free, and what holding adds.
//
// Four standings, and every one of them is a row in the same table:
//
//   free   signed in, holding nothing
//   t1     holding something
//   t2     holding more
//   t3     the top
//
// Free is a real standing, not the absence of one. It has a daily
// allowance like the others and it is switched on whether or not a
// token exists — see FREE IS NOT PART OF THE PROMOTION below.
//
// ══ WHY THRESHOLDS ARE IN TOKENS AND NEVER IN DOLLARS ══
//
// A dollar threshold is the obvious idea and it is a trap. "$200 to
// reach t3" means the number of TOKENS required shrinks as the price
// rises, which does two things, both bad:
//
//   1. Buy pressure from the ladder falls exactly as the ladder starts
//      working. The mechanism weakens on success.
//   2. Every existing holder becomes over-qualified on a pump and can
//      sell the excess with nothing lost. A dollar threshold is a
//      standing instruction to take profit into strength.
//
// Tokens are a ratchet instead: the position that qualified you still
// qualifies you, and you cannot trim it without dropping a rung.
// Nobody is ever demoted by the chart, only by selling — which is also
// what makes the ladder safe to enter.
//
// Set them FROM a dollar figure in the admin panel (there is a
// calculator there, at admin time, where a dead price feed is a blank
// field rather than an outage) and store the tokens.
//
// ══ WHY THIS FILE IS NEITHER "server-only" NOR "use client" ══
//
// The same table decides what the API enforces and what the UI offers,
// and those two disagreeing is the whole class of bug this file
// exists to prevent — a locked field that still works, or an unlocked
// field the server strips. Pure functions, no imports, both sides.
// ============================================================

// Fixed ids. The array is ordered ascending and callers rely on that,
// but nothing stored anywhere references a POSITION — a config written
// before a tier was renamed still resolves.
export const TIER_IDS = ["t1", "t2", "t3"];

// ══ NO FEATURE IS EVER TOKEN-GATED ══
//
// There was a CAPS list here — styles, direction, advanced — and each
// tier switched them on. It was wrong, and the way it was wrong is
// worth keeping written down.
//
// The moment a tier locks a FEATURE, somebody who pays you $79 ranks
// below somebody holding $20 of a token they can sell in one click.
// The person handing you cash is your best user and the product told
// them they could not pick a style. It also broke at the exact moment
// that matters: burn the free run, like it, buy credits to continue,
// discover the thing you were reaching for is still not there.
//
// It argued with the discount, too. A discount is worth nothing
// unless somebody buys, and gating features made buying worth less.
//
// So: EVERYTHING IN THE APP IS BUYABLE WITH CREDITS, full stop. A
// tier is better economics — more free runs, a cheaper pack — plus
// status. Never a bigger app. One rule instead of two ladders, and
// nothing a paying customer could feel robbed of.
//
// If a tier ever needs to feel more exclusive, the answer is status
// that costs a customer nothing: a badge, early access to a surface
// before general release. Not a lock.

// ══ PERKS ══
//
// Held here so the ladder is described in one place, but NOT enforced
// anywhere in the pipeline, because neither of them is a switch:
// early access is a decision about when a surface ships, and a custom
// style is somebody sitting down and writing a director. They are
// displayed, and they are honoured by hand.
export const PERKS = ["earlyAccess", "customStyle"];

// ══ THE DEFAULT LADDER ══
//
// Free compute climbs slowly and the discount climbs fast, and that
// asymmetry is the entire design. A free run costs real money whether
// or not it leads anywhere, and every one of them is a run somebody
// did not buy; a discount costs nothing until a purchase happens and
// is worth nothing unless one does. So the top of the ladder is
// bought for the discount and the status, not for the compute.
//
// The tempting version — big allowances at the top — recreates the
// problem the ladder was built to escape: the best holders stop being
// customers, and the people most invested in the token generate the
// least revenue to buy it back.
//
// minTokens is 0 here on purpose. A ladder cannot have real numbers
// before there is a price to set them from, and 0 means "unset" —
// cleanGate() refuses to arm the gate until they are filled in.
//
// A rung is two numbers and two badges. With features no longer
// gated, EVERY RUNG MUST GIVE MORE RUNS THAN THE ONE BELOW IT or its
// only difference is the discount — so the first rung starts at 2
// against the free tier's 1, rather than matching it.
export const DEFAULT_TIERS = [
  { id: "t1", name: "Holder",  minTokens: 0, dailyRuns: 2, discount: 10, earlyAccess: false, customStyle: false },
  { id: "t2", name: "Insider", minTokens: 0, dailyRuns: 3, discount: 25, earlyAccess: true,  customStyle: false },
  { id: "t3", name: "Founder", minTokens: 0, dailyRuns: 5, discount: 40, earlyAccess: true,  customStyle: true  },
];

// ══ FREE IS NOT PART OF THE PROMOTION ══
//
// One run a day, and the WHOLE app for that run. It is the trial —
// the thing that lets someone see real output on their own logo before
// being asked for money — and it therefore has to work before the
// token launches, which means it CANNOT live behind gate.enabled.
// Everything else in the gate config is inert until a mint is set;
// this is the exception, and entitlementsOf() below is where that is
// made true.
//
// One is the number because it is a taste rather than a supply. Three
// options off one logo is enough to know whether this is any good, and
// nowhere near enough to launch a project on. Limiting the AMOUNT is
// what makes a trial; limiting what it can DO would just be a demo of
// a worse product.
export const DEFAULT_FREE = { dailyRuns: 1 };

const int = (v, min, max, fallback) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

// Normalise one tier row off whatever was stored. Every field is
// clamped rather than trusted: this document is edited by hand in an
// admin panel, and a stray keystroke in the discount field should not
// be able to sell credits for nothing.
export function cleanTier(raw, i) {
  const d = DEFAULT_TIERS[i] || DEFAULT_TIERS[0];
  const out = {
    id: TIER_IDS[i] || d.id,
    name: String(raw?.name ?? d.name).trim().slice(0, 24) || d.name,
    minTokens: int(raw?.minTokens, 0, 1e15, d.minTokens),
    dailyRuns: int(raw?.dailyRuns, 0, 500, d.dailyRuns),
    // Capped at 90, not 100. A 100% discount is a free pack, which is
    // a different feature with different accounting, and reaching it
    // by holding down a key in a number field is not how it should
    // arrive.
    discount: int(raw?.discount, 0, 90, d.discount),
  };
  for (const p of PERKS) out[p] = raw?.[p] === undefined ? d[p] : Boolean(raw[p]);
  return out;
}

// ══ THE LADDER MUST ONLY EVER GO UP ══
//
// Three rows edited independently in a form can easily be saved with
// t2 cheaper than t1, or t3 paying less than t2 — and either one is a
// ladder that punishes climbing it. Rather than validating and
// refusing (which loses the edit and is maddening while you are
// mid-way through typing three thresholds), each row is raised to at
// least the one below it. The panel shows the result, so a correction
// is visible immediately instead of being reported as an error.
export function cleanTiers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = TIER_IDS.map((id, i) => cleanTier(list.find((t) => t?.id === id) || list[i], i));
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    out[i].minTokens = Math.max(out[i].minTokens, prev.minTokens);
    out[i].dailyRuns = Math.max(out[i].dailyRuns, prev.dailyRuns);
    out[i].discount = Math.max(out[i].discount, prev.discount);
  }
  return out;
}

export function cleanFree(raw) {
  return { dailyRuns: int(raw?.dailyRuns, 0, 50, DEFAULT_FREE.dailyRuns) };
}

// The highest tier this balance reaches, or null for none.
//
// A tier with minTokens 0 is UNSET, never "everybody qualifies". The
// difference matters on the day the panel is half filled in: a 0 read
// as a threshold would hand the whole ladder to every signed-in
// account the moment the gate was armed.
export function tierFor(balance, tiers) {
  const n = Number(balance);
  if (!Number.isFinite(n) || n <= 0) return null;
  let found = null;
  for (const t of tiers || []) {
    if (t.minTokens > 0 && n >= t.minTokens) found = t;
  }
  return found;
}

export function tierById(id, tiers) {
  return (tiers || []).find((t) => t.id === id) || null;
}

// ══ WHAT ONE ACCOUNT CAN ACTUALLY DO ══
//
// The single answer both sides read. `tier` is the row from tierFor(),
// or null.
//
// The free row is the floor, not the fallback: a tier never returns
// FEWER runs than free, because an admin who sets t1 to 0 runs while
// free has 1 would otherwise have built a ladder whose first rung is a
// step down.
export function entitlementsOf(gate, tier) {
  const free = cleanFree(gate?.free);
  if (!tier) {
    return {
      tierId: null,
      tierName: "",
      dailyRuns: free.dailyRuns,
      discount: 0,
      earlyAccess: false,
      customStyle: false,
    };
  }
  return {
    tierId: tier.id,
    tierName: tier.name,
    dailyRuns: Math.max(tier.dailyRuns, free.dailyRuns),
    discount: tier.discount,
    earlyAccess: Boolean(tier.earlyAccess),
    customStyle: Boolean(tier.customStyle),
  };
}

// ══ A TIER GIVEN RATHER THAN EARNED ══
//
// Competition winners, partners, someone owed a favour, a project
// being courted. Until this existed the only way to have a tier was to
// hold tokens, which meant the answer to "can you just give them
// access" was no.
//
// Shaped as `{ tier, until, by, reason, at }` on the account.
//
// THE ONE THING IT MUST NOT DO IS TAKE ANYTHING AWAY. Granting t1 to
// somebody already holding enough for t3 has to leave them on t3, so
// the caller takes the BETTER of granted and earned — see
// resolveEntitlements. A grant is a floor, never a ceiling, or handing
// out a reward would quietly demote your biggest holder.
//
// `until: 0` means no expiry. Supported because a partner or a
// teammate is a permanent arrangement, and a date invented to satisfy
// a required field is a date that surprises somebody in six months.
// Everything else expires on its own — an admin who forgets is the
// normal case, not the exception.
export function activeGrant(user, now = Date.now()) {
  const g = user?.tierGrant;
  if (!g || !g.tier) return null;
  if (g.until && g.until <= now) return null;
  return g;
}

export function cleanGrant(raw, by = "") {
  const tier = TIER_IDS.includes(raw?.tier) ? raw.tier : null;
  if (!tier) return null;
  const days = Math.min(Math.max(Math.floor(Number(raw?.days) || 0), 0), 3650);
  return {
    tier,
    // Stored as an absolute moment, not as a duration. A duration has
    // to be measured from something, and "granted 30 days ago for 30
    // days" is a subtraction somebody will get wrong at midnight.
    until: days > 0 ? Date.now() + days * 86_400_000 : 0,
    days,
    reason: String(raw?.reason || "").trim().slice(0, 120),
    by: String(by || "admin").slice(0, 120),
    at: Date.now(),
  };
}

// The next rung up and how far away it is, or null at the top.
//
// This is the only place in the product where holding the token and
// spending money are the same sentence, which is why it is computed
// server-side and handed to the page rather than left to the page to
// work out from two numbers it would have to fetch separately.
export function nextTier(balance, tiers) {
  const n = Number(balance) || 0;
  for (const t of tiers || []) {
    if (t.minTokens > 0 && n < t.minTokens) {
      return { ...t, away: t.minTokens - n };
    }
  }
  return null;
}
