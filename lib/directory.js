// ============================================================
// TOKENS MADE WITH BANNR — the proof, as opposed to the pitch.
//
// Not a second feed. The feed is people showing work, including work
// for tokens that do not exist yet, and it is sorted by what is new
// and what is liked. This is the subset that HAS A CONTRACT ADDRESS,
// enriched with live market data and sorted by size — which turns a
// wall of pictures into a list of real projects a trader can open.
//
// Same posts, different question. Nobody submits anything twice.
//
// ══ WHAT IT CLAIMS, AND WHAT IT DOES NOT ══
//
// It claims the banner was MADE here, which is true — the post exists
// because someone made it. It does NOT claim DEX Screener is
// currently displaying it. Proving that would mean fetching each
// token's live header and comparing images, which would be wrong
// often enough to embarrass us: headers change, plenty of people
// never upload, and a false claim on the one page meant to be
// believed is worse than a weaker true one.
//
// ══ THE FLOOR IS LIQUIDITY, NOT MARKET CAP ══
//
// Market cap lies. A $20K cap with $400 of liquidity is a corpse
// wearing a big number, and putting it on the proof page argues
// against us. Liquidity is the honest "is this real and tradeable"
// signal, so it is the filter; market cap is only the sort order.
//
// A market-cap floor would also empty the page at launch, when most
// real users are small — and small-but-alive is exactly who we want
// on it.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

// Enough liquidity to be tradeable at all. Deliberately low: the job
// is excluding corpses, not curating winners.
const MIN_LIQUIDITY_USD = 2_000;
// A highlight reel, not a census.
export const MAX_ROWS = 12;
// How far back through the feed to look for addresses.
const SCAN = 300;

// DexScreener takes up to 30 comma-separated addresses per call, so a
// full page costs one upstream request.
const BATCH = 30;

async function marketData(addresses) {
  const out = new Map();
  for (let i = 0; i < addresses.length; i += BATCH) {
    const chunk = addresses.slice(i, i + BATCH);
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
        { cache: "no-store" }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const p of data?.pairs || []) {
        const addr = p.baseToken?.address;
        if (!addr) continue;
        // A token trades on several pairs; the deepest one is the
        // honest read of its price and liquidity.
        const prev = out.get(addr);
        const liq = Number(p.liquidity?.usd || 0);
        if (prev && prev.liquidity >= liq) continue;
        out.set(addr, {
          address: addr,
          symbol: p.baseToken?.symbol || "",
          name: p.baseToken?.name || "",
          chain: p.chainId || "solana",
          priceUsd: Number(p.priceUsd || 0),
          marketCap: Number(p.marketCap || p.fdv || 0),
          volume24h: Number(p.volume?.h24 || 0),
          liquidity: liq,
          url: p.url || "",
        });
      }
    } catch {
      // One failed chunk should not empty the page.
    }
  }
  return out;
}

export async function directory() {
  const db = getAdminDb();
  if (!db) return { tokens: [], scanned: 0 };

  // TWO SOURCES, and the second is not the smaller one.
  //
  //   posts        someone published a banner and gave an address.
  //   generations  an admin recognised a banner on a token's page and
  //                attached the address by hand.
  //
  // Most banners are never posted at all — they are downloaded and
  // put straight on DEX Screener — and the projects least likely to
  // stop and post are the real launches, who are busy launching. Read
  // from posts alone this page would quietly under-represent exactly
  // the tokens worth showing. See /api/admin/attach.
  let posts = [], gens = [];
  try {
    // No where() on `ca` plus an orderBy on ts — that is a composite
    // index, and a missing one throws at runtime. Over-fetch and
    // filter in memory, as everywhere else in this codebase.
    [posts, gens] = await Promise.all([
      db.collection("posts").orderBy("ts", "desc").limit(SCAN).get().then((s) => s.docs),
      db.collection("generations").orderBy("ts", "desc").limit(SCAN).get().then((s) => s.docs),
    ]);
  } catch {
    return { tokens: [], scanned: 0 };
  }

  // One row per TOKEN, not per banner. A project with six options is
  // one project, and the newest banner represents it.
  //
  // Posts are read FIRST so a published banner wins over an attached
  // one for the same token — if someone chose what to show, that is
  // the one to show.
  const byCa = new Map();
  const take = (docs, kind) => {
    for (const doc of docs) {
      const p = doc.data();
      if (!p?.ca || p.hidden) continue;
      if (byCa.has(p.ca)) continue;
      byCa.set(p.ca, {
        ca: p.ca,
        // A generation stores its image under `src` too, but older
        // ones only kept a thumbnail.
        src: p.src || p.thumb || "",
        ticker: p.ticker || "",
        from: kind,
      });
    }
  };
  take(posts, "post");
  take(gens, "attached");

  for (const [ca, t] of byCa) if (!t.src) byCa.delete(ca);
  if (!byCa.size) return { tokens: [], scanned: 0 };

  const market = await marketData([...byCa.keys()]);

  const tokens = [...byCa.values()]
    .map((t) => {
      const m = market.get(t.ca);
      return m ? { ...t, ...m } : null;
    })
    // Never traded, or not tradeable now. Either way not proof.
    .filter((t) => t && t.liquidity >= MIN_LIQUIDITY_USD)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, MAX_ROWS);

  return { tokens, scanned: byCa.size };
}
