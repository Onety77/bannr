// POST /api/track — the two funnel events a browser is allowed to
// report. See lib/stats.js for what this is and what it deliberately
// is not.
//
// UNAUTHENTICATED ON PURPOSE. The whole point is to count people who
// have not signed in — that population IS the top of the funnel, and
// requiring a session would count only the ones who already got past
// the step we are trying to measure.
//
// Which means anyone can inflate landed and started. That is an
// accepted cost: they are counters with no per-person rows behind
// them, nothing is spent, nothing is granted, and there is nothing to
// steal. `generated` — the number the other two are judged against —
// is counted inside the generate route where a browser cannot reach
// it, so the ratio that matters cannot be moved from out here.
import { NextResponse } from "next/server";
import { bump, CLIENT_EVENTS } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let event = null;
  try {
    ({ event } = await req.json());
  } catch {
    // A beacon fired during unload can arrive with a torn body. Not
    // worth a 400; it is one count.
  }

  if (!CLIENT_EVENTS.includes(event)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await bump(event);
  // Always ok, even when the write failed. The caller cannot do
  // anything useful with the difference, and a beacon that retries is
  // a beacon that double-counts.
  return NextResponse.json({ ok: true });
}
