// GET /api/feed/{id}/logo — the small square logo a card lays over its
// banner. Same rules as ./image: public, cached, and nothing for a
// hidden post.
import { postPicture } from "@/lib/feed";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const pic = await postPicture(params?.id, "logo").catch(() => null);
  if (!pic) return new Response("Not found", { status: 404 });

  return new Response(pic.body, {
    headers: {
      "Content-Type": pic.type,
      "Content-Length": String(pic.body.length),
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
