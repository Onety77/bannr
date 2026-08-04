// POST /api/feed/like — toggle a like. Body: { id }
//
// Signed in, because a like has to belong to somebody or it is just a
// number anyone can raise. The row and the counter move together in
// one transaction, so a double-tap can never leave them disagreeing.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toggleLike } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in to like banners." }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const id = String(body?.id || "").slice(0, 64);
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  try {
    const res = await toggleLike(session.accountId, id);
    if (!res.ok) return NextResponse.json({ error: res.error || "That didn't work." }, { status: 400 });
    return NextResponse.json(res);
  } catch (e) {
    console.error("[feed] like", e);
    return NextResponse.json({ error: "That didn't work — try again." }, { status: 500 });
  }
}
