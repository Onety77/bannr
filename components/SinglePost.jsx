// ============================================================
// The interactive half of a shared post page.
//
// The page around this is a server component so the link unfurls; this
// is the small client island that makes the heart work. Same FeedCard
// the feed uses — a shared banner and a scrolled one should not be two
// different objects, or they drift.
//
// Liking here requires signing in, and that is the point of the page
// existing: someone arrives from a link, wants to press the heart, and
// has a reason to have an account.
// ============================================================
"use client";
import { useState } from "react";
import Link from "next/link";
import FeedCard from "@/components/FeedCard";
import { useAuth } from "@/lib/useAuth";

export default function SinglePost({ post: initial }) {
  const auth = useAuth();
  const [post, setPost] = useState(initial);
  const [msg, setMsg] = useState(null);

  async function like() {
    if (!auth.user) {
      setMsg("signin");
      return;
    }
    const was = post.liked;
    setPost((p) => ({ ...p, liked: !was, likes: Math.max(0, p.likes + (was ? -1 : 1)) }));
    try {
      const r = await fetch("/api/feed/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error();
      setPost((p) => ({ ...p, liked: d.liked, likes: d.likes }));
    } catch {
      setPost((p) => ({ ...p, liked: was, likes: Math.max(0, p.likes + (was ? 1 : -1)) }));
    }
  }

  return (
    <>
      {msg === "signin" && (
        <div className="notice">
          <Link href="/create">Sign in</Link> to like this one — it takes a tap.
        </div>
      )}
      <FeedCard post={post} signedIn={Boolean(auth.user)} onLike={like} />
    </>
  );
}
