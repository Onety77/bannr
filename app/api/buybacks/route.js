// GET /api/buybacks — public.
//
// The point of the page this feeds is that nothing on it has to be
// believed, so this returns the raw rows rather than a summary: every
// entry carries its signature and can be opened on an explorer.
//
// Returns nothing at all until there is something worth showing. A
// counter reading "0 SOL" is worse than no counter — it advertises
// that the flywheel exists and is not turning.
import { NextResponse } from "next/server";
import { ledger, productRevenue } from "@/lib/buybacks";
import { getGate, publicGate } from "@/lib/tokenGate";
import { directory } from "@/lib/directory";
import { madeTotal } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [{ entries, totals }, revenue, gate, dir, made] = await Promise.all([
      ledger(100),
      productRevenue(),
      getGate(),
      directory(),
      madeTotal(),
    ]);
    const t = publicGate(gate);
    return NextResponse.json({
      // Real tokens using the product, and how much has been made
      // with it. Both are proof rather than pitch, and both live
      // here so the page someone pastes carries all of it.
      tokens: dir.tokens,
      made,
      // The address is withheld until announced, exactly as elsewhere —
      // this route must not become the leak.
      symbol: t.symbol,
      mint: t.mint,
      live: entries.length > 0,
      entries,
      totals,
      revenue,
    }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ live: false, entries: [], totals: null, revenue: null, tokens: [], made: 0 });
  }
}
