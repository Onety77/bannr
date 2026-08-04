// GET /api/feed/{id} — one post, as JSON.
//
// For "make one like this", which needs the banner itself (to hand to
// the new run as a reference) and enough about the post to say whose
// work it is. Public, like the page it mirrors, and hidden posts
// return 404 through the same getPost guard.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getPost } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const session = requireUser(req);
  try {
    const post = await getPost(params?.id, session?.accountId || null);
    if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ post }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
