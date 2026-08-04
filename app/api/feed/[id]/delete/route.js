// POST /api/feed/{id}/delete — take your own post down.
//
// A POST rather than DELETE because every other mutation in this app
// is one, and consistency at the call site is worth more here than
// verb purity. The guard is what matters, and it lives inside the
// transaction in lib/feed.js: ownership is checked against the
// SESSION, never the request. An id is guessable, and a delete that
// trusts its caller is a delete for everyone's posts.
//
// Missing and not-yours return the same answer, so this cannot be used
// to discover which post ids exist.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteOwnPost } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const res = await deleteOwnPost(session.accountId, params?.id);
    if (!res.ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[feed/delete]", e);
    return NextResponse.json({ error: "Couldn't remove that." }, { status: 500 });
  }
}
