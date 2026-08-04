// GET  /api/handle   what am I called
// POST /api/handle   claim or change it. Body: { handle }
//
// The account is taken from the SESSION, never the request body —
// otherwise "set this handle on that account" is a request anyone
// could make about anyone.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { claimHandle, handleOf } from "@/lib/handles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ handle: null });
  return NextResponse.json({ handle: await handleOf(session.accountId) });
}

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  try {
    const res = await claimHandle(session.accountId, body?.handle);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 });
    return NextResponse.json(res);
  } catch (e) {
    console.error("[handle]", e);
    return NextResponse.json({ error: "Couldn't set that — try again." }, { status: 500 });
  }
}
