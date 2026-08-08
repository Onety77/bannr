// ============================================================
// WHAT HOLDING $BANNR GETS YOU, in one sentence.
//
// The offer used to be a constant — "12 free credits" — written into
// the homepage, the sign-in note and a feed card. It is a config an
// admin can change without a deploy now: how many tokens, how many
// runs a day, whether the gate is on at all. Copy that hardcodes any
// of that becomes a lie the first time one is edited, and the worst
// kind: confidently specific and wrong.
//
// NEITHER "use client" NOR "server-only", deliberately. The homepage
// is a server component and reads the gate directly; the sign-in note
// and the feed are client components and read it through useToken.
// Both need this function, so it belongs to neither side.
// ============================================================

// Whole tokens, written the way people say them: 250K, not 250,000.
export function tokenAmount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(v % 1_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return String(v);
}

// ══ WHAT EVERYONE GETS, WITH NO TOKEN INVOLVED ══
//
// offerLine below returns null until the tiers are armed, which is
// right — it describes holding $BANNR and there is nothing to hold
// yet. But the FREE tier is live today and has nothing to do with the
// token, and because that was the only sentence-generator on the
// homepage, the site never said it was free at all. The single
// strongest thing the product offers was invisible.
//
// Separate function, separate condition. It survives the tiers being
// off because it was never part of them.
//
// It says what it is and stops. No "try it free", no "no card
// required" — that answers a pricing objection nobody has reached
// three seconds into the page, which is exactly why the line that
// used to sit in this slot was removed.
export function freeLine(t) {
  const runs = Number(t?.free?.dailyRuns) || 0;
  if (runs < 1) return null;
  return runs === 1 ? "One free banner a day." : `${runs} free banners a day.`;
}

// The offer, or NULL when there is nothing to offer.
//
// NULL IS THE IMPORTANT RETURN. Before the token is announced, and
// any time the tiers are switched off, there is nothing to hold for —
// and a page still promising something is worse than a page that says
// nothing. Every caller has to handle it.
//
// ══ IT DESCRIBES THE FIRST RUNG, NOT THE BEST ONE ══
//
// The obvious version pairs the cheapest threshold with the biggest
// allowance, because publicGate publishes both as flat numbers and
// they read as one offer. They are not: `minTokens` is the entry bar
// and `dailyRuns` is the TOP tier's grant. Advertising "hold 250K for
// 3 a day" when 250K buys 1 a day is not a rounding error, it is a
// promise the product will not keep. So the entry tier is found and
// both halves come from it.
function entryTier(t) {
  const tiers = (t?.tiers || []).filter((x) => x?.minTokens > 0);
  if (!tiers.length) return null;
  return tiers.reduce((a, b) => (b.minTokens < a.minTokens ? b : a));
}

// ══ IT ADVERTISES WHAT YOU GAIN, NOT WHAT THE TIER HAS ══
//
// The obvious version lists the entry tier's benefits, and it is wrong
// the moment the free tier grants anything. With one free run a day
// for everyone and one for the first rung, "hold 1K $BANNR for 1 free
// banner a day" describes something the reader already has — which
// reads either as a con or as us not knowing our own product.
//
// So the sentence is built from the DELTA against the free tier. Extra
// runs if there are any; the discount; and the capabilities the rung
// unlocks, which for a first rung matched to free on runs is usually
// the entire reason to climb it.
export function offerLine(t) {
  if (!t?.live) return null;
  const tier = entryTier(t);
  if (!tier) return null;
  const free = t.free || {};
  const sym = t?.symbol ? `$${t.symbol}` : "the token";

  const gains = [];
  const extra = (tier.dailyRuns || 0) - (free.dailyRuns || 0);
  if (extra > 0) gains.push(`${extra} more free banner${extra === 1 ? "" : "s"} a day`);
  // Styles is the loud one and goes first when runs did not move —
  // it is the whole product opening up rather than more of the same.
  if (tier.styles && !free.styles) gains.unshift("every style");
  if (tier.direction && !free.direction) gains.push("your own direction");
  if (tier.discount > 0) gains.push(`${tier.discount}% off credits`);

  if (!gains.length) return null;
  const list =
    gains.length === 1 ? gains[0] : `${gains.slice(0, -1).join(", ")} and ${gains[gains.length - 1]}`;
  return `Hold ${tokenAmount(tier.minTokens)} ${sym} for ${list}.`;
}
