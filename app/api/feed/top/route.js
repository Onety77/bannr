// GET /api/feed/top — the most-liked posts of the last day.
//
// Feeds the desktop rail, and is the query the daily most-liked board
// will be built on when that arrives.
//
// Public and cached for a minute: it changes slowly, it is requested
// on every feed load, and a rail that is sixty seconds stale is not
// wrong in any way anyone can feel.
import { NextResponse } from "next/server";
import { topPosts } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const posts = await topPosts({ hours: 24, limit: 5 });
    return NextResponse.json({ posts }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (e) {
    console.error("[feed/top]", e);
    // A missing rail is a quieter failure than a broken feed.
    return NextResponse.json({ posts: [] });
  }
}
