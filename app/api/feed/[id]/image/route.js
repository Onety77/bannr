// GET /api/feed/{id}/image — the banner as an actual image file.
//
// Two jobs now. It began as the Open Graph image: a post is stored as a
// data URL inside a Firestore document, and no unfurler — Telegram, X,
// Discord, iMessage — will fetch a data URL out of a meta tag.
//
// It is also how EVERY list shows a banner. Lists used to carry the
// picture inline, which made a feed page megabytes of JSON that no CDN
// could cache — see the top of lib/feed.js. Here it is an ordinary
// image, cached at the edge and fetched once per region.
//
// Public and cacheable. It only ever serves something its author chose
// to publish.
import { postPicture } from "@/lib/feed";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  // Null for a hidden post, so a moderated banner stops being served.
  const pic = await postPicture(params?.id, "src").catch(() => null);
  if (!pic) return new Response("Not found", { status: 404 });

  return new Response(pic.body, {
    headers: {
      "Content-Type": pic.type,
      "Content-Length": String(pic.body.length),
      // An hour, not a week. The bytes never change, so a week would be
      // safe for the image — but not for moderation: a post taken down
      // would go on being served from the edge until it expired. An
      // hour bounds that and still means one read per region per hour.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
