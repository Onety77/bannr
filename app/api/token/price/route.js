// GET /api/token/price — what $BANNR is worth right now.
//
// Split from /api/token, which serves the gate config and is cached
// for minutes. This moves every block, so it gets its own route and
// its own cache window.
//
// ══ WHY POLLING THIS IS CHEAP ══
//
// Every open tab asks every 5 seconds, but the CDN answers almost all
// of them: s-maxage=5 means at most one upstream call per 5 seconds
// no matter how many people are watching. Twelve requests a minute to
// DexScreener, against a limit of three hundred — and it does not
// grow with traffic, which is the property that matters on a launch
// day.
//
// Returns 204 until the token is announced. Nothing to price, and a
// route that answers with zeroes invites a UI that renders them.
import { NextResponse } from "next/server";
import { getGate, publicGate } from "@/lib/tokenGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const t = publicGate(await getGate());
    if (!t.announced || !t.mint) return new NextResponse(null, { status: 204 });

    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${t.mint}`, {
      cache: "no-store",
    });
    if (!res.ok) return new NextResponse(null, { status: 204 });
    const data = await res.json();

    // A token trades on several pairs; the deepest is the honest read.
    let best = null;
    for (const p of data?.pairs || []) {
      if (p.baseToken?.address !== t.mint) continue;
      if (!best || Number(p.liquidity?.usd || 0) > Number(best.liquidity?.usd || 0)) best = p;
    }
    if (!best) return new NextResponse(null, { status: 204 });

    return NextResponse.json(
      {
        symbol: t.symbol,
        priceUsd: Number(best.priceUsd || 0),
        marketCap: Number(best.marketCap || best.fdv || 0),
        change24h: Number(best.priceChange?.h24 || 0),
        volume24h: Number(best.volume?.h24 || 0),
        url: best.url || `https://dexscreener.com/solana/${t.mint}`,
      },
      { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" } }
    );
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
