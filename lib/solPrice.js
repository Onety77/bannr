// ============================================================
// WHAT A SOL IS WORTH, IN DOLLARS.
//
// This exists because the packs used to be priced in SOL. They were
// set when SOL was around $150 and never touched again; SOL fell to
// roughly $72 and the three packs quietly became $3.63, $8.71 and
// $25.42 — about half what anyone intended, with nobody having edited
// a price. A product priced in a volatile asset re-prices itself every
// day and tells no one.
//
// So the price list is in USD (lib/packs.js) and this is the only
// place that converts. A pack costs nine dollars; how much SOL that is
// depends on when you ask.
//
// ══ WHY A FAILURE HERE MUST NOT BE A NUMBER ══
//
// Every function returns null when the price is not known, and callers
// must render "we can't quote right now" rather than falling back to
// anything. The alternative is worse than an outage: a stale or wrong
// rate does not break the page, it sells $79 of credits for whatever
// the bad number worked out to, silently, and the first symptom is the
// treasury. There is no safe default price, so there is no default.
//
// ══ AND WHY THERE IS A SANITY BAND ══
//
// The upstream is a public aggregator returning whatever pools exist.
// A thin or manipulated pair can report SOL at $0.004. FLOOR and
// CEILING below are not a guess at the market, they are the range
// outside which we assume the FEED is broken rather than the market
// having moved — wide enough to never be reached by a real price, tight
// enough that a garbage read is refused instead of honoured.
// ============================================================
import "server-only";

// Wrapped SOL. The canonical mint, and what every Solana DEX quotes
// against — reading the native asset's price means reading this.
export const WSOL = "So11111111111111111111111111111111111111112";

// Stablecoin mints, so a SOL/BONK pool can never set the dollar price.
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const STABLE = new Set([USDC, USDT]);

const FLOOR = 1;
const CEILING = 10_000;

// 60 seconds. Long enough that a burst of people opening the credits
// page costs one upstream call; short enough that a quote and the
// payment it leads to are struck against roughly the same market.
const CACHE_MS = 60_000;
const TIMEOUT_MS = 5000;

let cache = { at: 0, usd: null };

export function clearSolPriceCache() {
  cache = { at: 0, usd: null };
}

// Exported for the tests, which should not have to reach the network
// to prove that a $0.004 read is thrown away.
export function pickSolUsd(pairs) {
  let best = null;
  for (const p of pairs || []) {
    if (p?.baseToken?.address !== WSOL) continue;
    if (!STABLE.has(p?.quoteToken?.address)) continue;
    const usd = Number(p?.priceUsd);
    if (!Number.isFinite(usd) || usd < FLOOR || usd > CEILING) continue;
    // Deepest liquidity wins. The first pair in the array is not the
    // real market — it is just the first one the aggregator listed.
    if (!best || Number(p?.liquidity?.usd || 0) > Number(best?.liquidity?.usd || 0)) best = p;
  }
  return best ? Number(best.priceUsd) : null;
}

export async function solUsd({ fresh = false } = {}) {
  if (!fresh && cache.usd !== null && Date.now() - cache.at < CACHE_MS) return cache.usd;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WSOL}`, {
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) return staleOrNull();
    const data = await res.json();
    const usd = pickSolUsd(data?.pairs);
    if (usd === null) return staleOrNull();
    cache = { at: Date.now(), usd };
    return usd;
  } catch {
    return staleOrNull();
  } finally {
    clearTimeout(timer);
  }
}

// A BRIEF outage falls back to the last good price rather than taking
// payments offline, because SOL does not move far in a few minutes and
// a page that cannot quote is a page that cannot sell. Past the grace
// window it returns null and the caller has to say so — an hour-old
// rate is a real risk and one worth refusing.
const STALE_GRACE_MS = 10 * 60_000;
function staleOrNull() {
  if (cache.usd !== null && Date.now() - cache.at < STALE_GRACE_MS) return cache.usd;
  return null;
}

// Dollars to SOL, at a given rate.
//
// Rounded to 4 decimals — about a hundredth of a cent at any realistic
// SOL price, and short enough to read in a wallet's confirmation
// screen. Rounded UP, so rounding never leaves a payment a hair under
// its own pack and lands it in the tier below.
export function solForUsd(usd, rate) {
  if (!(rate > 0) || !(usd > 0)) return null;
  return Math.ceil((usd / rate) * 10_000) / 10_000;
}

// SOL to dollars. The direction used at claim time: the chain says how
// much SOL arrived, and what matters is what that was worth.
export function usdForSol(sol, rate) {
  if (!(rate > 0) || !(sol > 0)) return null;
  return sol * rate;
}
