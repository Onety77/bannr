// ============================================================
// ONE POST, ON ITS OWN PAGE — what Share links to.
//
// A SERVER component, deliberately, and that is the whole point of the
// feature. Share exists to bring people who have never been here, and
// they arrive through a link pasted into a chat — so the page has to
// carry Open Graph tags that an unfurler can read without running any
// JavaScript. A client-rendered page unfurls as a bare URL, which is a
// link nobody clicks.
//
// Readable signed out. Liking is not: that is the one thing worth
// signing in for, and it is the reason this page is worth building.
// ============================================================
import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { getPost } from "@/lib/feed";
import SinglePost from "@/components/SinglePost";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const post = await getPost(params.id).catch(() => null);
  if (!post) return { title: "Banner not found — bannr" };

  const label = post.ticker || post.name || "A banner";
  const by = post.handle ? ` by @${post.handle}` : "";
  const title = `${label} — made with bannr`;
  const description = post.styleName
    ? `${post.styleName}${by}. Make your own in seconds.`
    : `Made with bannr${by}. Make your own in seconds.`;

  // A path, resolved against metadataBase in the root layout.
  const image = `/api/feed/${params.id}/image`;
  // Declared, not assumed. A post pairing the logo with the banner is
  // taller than 3:1, and an unfurl told the wrong height letterboxes
  // or crops it — on somebody else's timeline, where we never see it.
  const w = 900;
  const h = Math.round(w / (post.ratio || 3));

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: w, height: h }], type: "article" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function PostPage({ params }) {
  // Reading headers opts this out of any static treatment, which it
  // must be — a like count baked at build time would be a lie.
  headers();
  const post = await getPost(params.id).catch(() => null);
  if (!post) notFound();

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>{post.ticker || post.name || "A banner"}</h1>
        <p>
          Made with bannr{post.handle ? <> by <b>@{post.handle}</b></> : null}.
        </p>
      </div>

      <div className="feed feed-single">
        <SinglePost post={post} />
      </div>

      <div className="feed-more">
        <Link className="btn primary" href="/create">Make your own</Link>
        <Link className="btn" href="/feed">See the feed</Link>
      </div>
    </main>
  );
}
