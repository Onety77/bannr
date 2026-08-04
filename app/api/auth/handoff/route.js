// POST /api/auth/handoff — a token that carries this session elsewhere.
//
// Needed because a wallet's in-app browser is a DIFFERENT browser with
// none of this one's cookies. Without it, linking a wallet from a
// phone signs you in as nobody and quietly makes a second account.
// See lib/handoff.js.
//
// Requires a session, obviously: this mints something that grants one.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mintHandoff } from "@/lib/handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const token = await mintHandoff(session.accountId);
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[handoff]", e);
    return NextResponse.json({ error: "Couldn't start that." }, { status: 500 });
  }
}
