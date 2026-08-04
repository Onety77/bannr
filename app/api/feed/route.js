// GET  /api/feed?before=<ts>   one page of public banners
// POST /api/feed                publish one
//
// GET is deliberately open. The feed is the front of the funnel and
// has to be readable by someone who has not signed in and may never —
// that is the entire point of it being public. The viewer's session is
// used only to fill in which posts they have already liked, and its
// absence is normal rather than an error.
//
// POST is the opposite: signed in, handle required, rate limited,
// deduped, and never implicit. See the note at the top of lib/feed.js
// for why publishing can never be a side effect of anything else.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listPosts, publish } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = requireUser(req);
  const before = Number(new URL(req.url).searchParams.get("before") || 0);

  try {
    const data = await listPosts({
      before: Number.isFinite(before) && before > 0 ? before : 0,
      viewer: session?.accountId || null,
    });
    // no-store: a hidden post has to be gone on the next load, not
    // whenever a cache decides. Same reasoning as /api/spotlight.
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[feed] list", e);
    return NextResponse.json({ posts: [], done: true, cursor: 0 });
  }
}

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  try {
    const res = await publish(session.accountId, body);
    if (!res.ok) {
      // 409 for a duplicate, 429 for the daily cap, 400 otherwise —
      // the client shows different copy for each and should not have
      // to parse the message to tell them apart.
      const status = res.code === "duplicate" ? 409 : res.code === "rate" ? 429 : 400;
      return NextResponse.json({ error: res.error, code: res.code }, { status });
    }
    return NextResponse.json(res);
  } catch (e) {
    console.error("[feed] publish", e);
    return NextResponse.json({ error: "Couldn't post that — try again." }, { status: 500 });
  }
}
