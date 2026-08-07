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
import { ledger, productRevenue, commitment, lastSevenDays } from "@/lib/buybacks";
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
    // The commitment reads the whole ledger rather than the hundred
    // rows above, so a promise cannot read as unmet just because the
    // display was paginated. Only computed when a percentage has been
    // published — before that there is no promise to measure against
    // and a zeroed one would invent a claim nobody made.
    const promise = t.buybackPct > 0 ? await commitment(t.buybackPct) : null;
    const week = await lastSevenDays(entries);
    return NextResponse.json({
      // Real tokens using the product, and how much has been made
      // with it. Both are proof rather than pitch, and both live
      // here so the page someone pastes carries all of it.
      tokens: dir.tokens,
      // The bar, so the page can state it. A missing project should
      // be able to read why rather than assume favouritism.
      floor: dir.floor || 0,
      made,
      // The address is withheld until announced, exactly as elsewhere —
      // this route must not become the leak.
      symbol: t.symbol,
      mint: t.mint,
      live: entries.length > 0,
      entries,
      totals,
      revenue,
      // The promise and the arithmetic behind it. Null until a
      // percentage is published.
      promise,
      // The figure to lead with. A percentage has no denominator and
      // invites people to imagine a number; a weekly amount is a claim
      // that can be checked, and reads as a standing bid rather than a
      // policy.
      week,
    }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ live: false, entries: [], totals: null, revenue: null, promise: null, week: null, tokens: [], made: 0 });
  }
}
