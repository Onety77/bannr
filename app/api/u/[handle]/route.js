// GET /api/u/{handle} — a public profile.
//
// Open, like the feed it mirrors. Hidden posts are filtered out here
// (unlike your own profile, which labels them) because a stranger has
// no business seeing what a moderator removed.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { accountForHandle, handlesFor } from "@/lib/handles";
import { postsByAccount } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const session = requireUser(req);
  try {
    const accountId = await accountForHandle(params?.handle);
    if (!accountId) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const [who, posts] = await Promise.all([
      handlesFor([accountId]),
      postsByAccount(accountId, { viewer: session?.accountId || null, own: false }),
    ]);
    return NextResponse.json(
      {
        handle: who[accountId]?.handle || null,
        photo: who[accountId]?.photo || null,
        // Their own total, which is the number a "most liked today"
        // board will eventually be built on.
        likes: posts.reduce((n, p) => n + (p.likes || 0), 0),
        posts,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[u/handle]", e);
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
