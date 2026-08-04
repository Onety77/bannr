// GET /api/token — what anyone is allowed to know about $BANNR.
//
// Public and unauthenticated, because the contract address has to be
// readable by someone who has not signed in and may never sign in —
// that is the whole point of publishing it.
//
// It returns publicGate(), NOT the raw config. The daily ceiling and
// the recheck window stay server-side: they are the levers holding the
// bill down, and publishing them tells anyone farming the gate exactly
// what they are working against and how fast it resets.
//
// The mint is withheld until `announced` is set, so this route can
// exist, be linked and be styled well before there is a token — and
// cannot leak the address early by accident.
import { NextResponse } from "next/server";
import { getGate, publicGate } from "@/lib/tokenGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await getGate();
    return NextResponse.json(publicGate(gate), {
      // Short, not none. The CA is the one field where a stale answer
      // is actively harmful — someone copies an address that changed —
      // but this is hit on most page loads, so a few seconds of shared
      // cache is worth having.
      headers: { "Cache-Control": "public, max-age=15" },
    });
  } catch {
    // Never an error state on the client. No token yet and a broken
    // lookup should look identical: nothing to show.
    return NextResponse.json({ live: false, announced: false, mint: "", symbol: "BANNR" });
  }
}
