// ============================================================
// /u/{handle} — someone's profile, as anyone sees it.
//
// The feed shipped with handles that pointed nowhere: you could see
// that @someone made something good and had no way to see anything
// else they made. This is where a handle goes.
//
// It is also the share surface that is not ours — people post THEIR
// link, not the product's, and that is how a feed spreads without us
// doing anything.
//
// Hidden posts are filtered out here, unlike on your own /you page
// where they are shown and labelled. A stranger has no business
// seeing what a moderator removed.
// ============================================================
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import FeedCard from "@/components/FeedCard";
import { useAuth } from "@/lib/useAuth";
import { useRestoreScroll } from "@/lib/useRestoreScroll";

export default function ProfilePage() {
  const { handle } = useParams();
  const auth = useAuth();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`/api/u/${encodeURIComponent(handle)}`, { cache: "no-store" });
        if (!r.ok) { if (live) setMissing(true); return; }
        const d = await r.json();
        if (live) setData(d);
      } catch {
        if (live) setMissing(true);
      }
    })();
    return () => { live = false; };
  }, [handle]);

  useRestoreScroll(`u:${handle}`, Boolean(data));

  async function like(post) {
    if (!auth.user) return;
    const was = post.liked;
    setData((d) => ({
      ...d,
      posts: d.posts.map((p) =>
        p.id === post.id ? { ...p, liked: !was, likes: Math.max(0, p.likes + (was ? -1 : 1)) } : p
      ),
    }));
    try {
      const r = await fetch("/api/feed/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error();
      setData((prev) => ({
        ...prev,
        posts: prev.posts.map((p) => (p.id === post.id ? { ...p, liked: d.liked, likes: d.likes } : p)),
      }));
    } catch {
      setData((prev) => ({
        ...prev,
        posts: prev.posts.map((p) =>
          p.id === post.id ? { ...p, liked: was, likes: Math.max(0, p.likes + (was ? 1 : -1)) } : p
        ),
      }));
    }
  }

  function report(post) {
    fetch("/api/feed/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id }),
    }).catch(() => {});
  }

  if (missing) {
    return (
      <main className="wrap">
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">No such handle</div>
            <div className="sub">Nobody is posting under @{String(handle)}.</div>
            <div className="empty-cta">
              <Link href="/feed" className="btn primary small">Back to the feed</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap you-wrap">
      <div className="you-head">
        <Avatar handle={data?.handle || String(handle)} photo={data?.photo} size={64} />
        <div className="you-who">
          <h1>@{data?.handle || String(handle)}</h1>
          <span className="you-sub">
            {data ? `${data.posts.length} post${data.posts.length === 1 ? "" : "s"} · ${data.likes} likes` : "…"}
          </span>
        </div>
      </div>

      {!data ? (
        <div className="empty-canvas page-gap"><div className="dims">LOADING…</div></div>
      ) : data.posts.length === 0 ? (
        <div className="empty-canvas page-gap">
          <div><div className="dims">Nothing posted yet</div></div>
        </div>
      ) : (
        <div className="feed">
          {data.posts.map((p) => (
            <FeedCard
              key={p.id}
              post={p}
              signedIn={Boolean(auth.user)}
              onLike={like}
              onReport={report}
            />
          ))}
        </div>
      )}
    </main>
  );
}
