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

// The offer, or NULL when there is nothing to offer.
//
// NULL IS THE IMPORTANT RETURN. Before the token is announced, and
// any time the gate is switched off, there is no free tier at all —
// and a page still promising one is worse than a page that says
// nothing. Every caller has to handle it.
export function offerLine(t) {
  if (!t?.live || !t.dailyRuns) return null;
  const runs = t.dailyRuns;
  const banners = `${runs} free banner${runs === 1 ? "" : "s"} a day`;
  const sym = t?.symbol ? `$${t.symbol}` : "the token";
  if (!t.minTokens) return `Hold ${sym} for ${banners}.`;
  return `Hold ${tokenAmount(t.minTokens)} ${sym} for ${banners}.`;
}
