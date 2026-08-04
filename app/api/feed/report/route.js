// POST /api/feed/report — flag a post. Body: { id, reason }
//
// The response is deliberately identical whether this was the first
// report, a repeat, or the one that crossed the auto-hide threshold.
// Telling a reporter what their report DID is telling anyone probing
// how many more they need, and on a feed attached to a token launch
// that is a number worth not publishing.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { reportPost } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in to report a post." }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const id = String(body?.id || "").slice(0, 64);
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  try {
    await reportPost(session.accountId, id, String(body?.reason || ""));
  } catch (e) {
    // Even a failure reports success. A reporter who is told their
    // report failed will simply send it again, and the honest answer
    // costs us more than the silence does.
    console.error("[feed] report", e);
  }
  return NextResponse.json({ ok: true });
}
