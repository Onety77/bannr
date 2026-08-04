// GET /api/me/posts — your own posts, for the You tab.
//
// Includes hidden ones, labelled. A post that vanished with no
// explanation is worse than one you can see was taken down: the first
// looks like a bug in our product, the second looks like moderation,
// and only one of those is true.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { postsByAccount } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ posts: [] });
  try {
    const posts = await postsByAccount(session.accountId, {
      viewer: session.accountId,
      own: true,
    });
    return NextResponse.json({ posts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[me/posts]", e);
    return NextResponse.json({ posts: [] });
  }
}
