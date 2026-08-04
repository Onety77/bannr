// GET /api/feed/{id}/image — the banner as an actual image file.
//
// Exists for one reason: Open Graph. A post is stored as a data URL
// inside a Firestore document, and no unfurler — Telegram, X, Discord,
// iMessage — will fetch a data URL out of a meta tag. They need a real
// URL returning real bytes, so this decodes one on request.
//
// Public and cacheable. It only ever serves something its author chose
// to publish, and an unfurler will hit it repeatedly for the same link
// across every chat it is pasted into.
import { getPost } from "@/lib/feed";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const post = await getPost(params?.id).catch(() => null);
  // getPost already returns null for a hidden post, so a moderated
  // banner stops unfurling the moment it is taken down rather than
  // living on in every chat it was ever shared into.
  if (!post?.src) return new Response("Not found", { status: 404 });

  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(post.src);
  if (!m) return new Response("Not found", { status: 404 });

  const body = Buffer.from(m[2], "base64");
  return new Response(body, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(body.length),
      // A post's image never changes — editing is not a thing here, and
      // a new banner is a new post with a new id.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
