// ============================================================
// /feed — banners people chose to make public.
//
// Readable signed out, on purpose. This is the front of the funnel:
// someone arriving from a link should see the work before they are
// asked for anything, and the only thing a session changes here is
// whether the hearts are filled in.
//
// Optimistic likes. The heart moves on tap and is put back if the
// server disagrees — a like is not worth a spinner, and a feed that
// waits on the network to acknowledge a tap feels broken on a phone.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import FeedCard from "@/components/FeedCard";
import { useAuth } from "@/lib/useAuth";
import { readFeed, writeFeed, mergeFresh, STALE_MS } from "@/lib/feedCache";
import { useRestoreScroll } from "@/lib/useRestoreScroll";

export default function FeedPage() {
  const auth = useAuth();
  // Read synchronously in the initialiser, so the first render is
  // already the feed you left rather than skeletons that get
  // replaced a frame later.
  const cached = typeof window === "undefined" ? null : readFeed();
  const [posts, setPosts] = useState(cached?.posts ?? null);
  const [cursor, setCursor] = useState(cached?.cursor ?? 0);
  const [done, setDone] = useState(cached?.done ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (before = 0) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/feed${before ? `?before=${before}` : ""}`, { cache: "no-store" });
      const d = await r.json();
      setPosts((prev) => {
        const next = before ? [...(prev || []), ...(d.posts || [])] : d.posts || [];
        writeFeed({ posts: next, cursor: d.cursor || 0, done: Boolean(d.done), at: Date.now() });
        return next;
      });
      setCursor(d.cursor || 0);
      setDone(Boolean(d.done));
    } catch {
      setError("Couldn't load the feed. Try again in a moment.");
      if (!before) setPosts([]);
    } finally {
      setBusy(false);
    }
  }, []);

  // Quietly re-read the first page and fold it in. No skeletons, no
  // spinner, nothing moves under the reader: anything new appears
  // above where they are, and posts they can already see keep their
  // place while taking the server's like count.
  const revalidate = useCallback(async () => {
    try {
      const r = await fetch("/api/feed", { cache: "no-store" });
      const d = await r.json();
      if (!d?.posts) return;
      setPosts((prev) => {
        const next = mergeFresh(prev, d.posts);
        writeFeed({ posts: next, at: Date.now() });
        return next;
      });
    } catch {
      // The cached feed is still on screen and still fine.
    }
  }, []);

  useEffect(() => {
    const c = readFeed();
    if (!c?.posts?.length) { load(0); return; }
    if (Date.now() - (c.at || 0) > STALE_MS) revalidate();
  }, [load, revalidate]);

  // Saving and restoring the position is identical on every cached
  // list, so both pages call the same hook rather than keeping two
  // copies that drift into disagreeing.
  useRestoreScroll("feed", Boolean(posts?.length));

  async function like(post) {
    if (!auth.user) { setError("Sign in to like banners."); return; }
    const was = post.liked;
    // Move first, reconcile after.
    setPosts((list) =>
      list.map((p) =>
        p.id === post.id ? { ...p, liked: !was, likes: Math.max(0, p.likes + (was ? -1 : 1)) } : p
      )
    );
    try {
      const r = await fetch("/api/feed/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error();
      // The server's count is authoritative — someone else may have
      // liked the same post while this one was in the air.
      setPosts((list) => {
        const next = list.map((p) => (p.id === post.id ? { ...p, liked: d.liked, likes: d.likes } : p));
        writeFeed({ posts: next });
        return next;
      });
    } catch {
      setPosts((list) =>
        list.map((p) =>
          p.id === post.id ? { ...p, liked: was, likes: Math.max(0, p.likes + (was ? 1 : -1)) } : p
        )
      );
    }
  }

  function report(post) {
    // Fire and forget, and the card says "Reported" either way. See the
    // note in the route for why the outcome is never disclosed.
    fetch("/api/feed/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id }),
    }).catch(() => {});
  }

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>Feed</h1>
        <p>Banners people made and chose to share. Tap any style to make your own.</p>
      </div>

      {error && <div className="notice error">{error}</div>}

      {posts === null ? (
        /* The shape of the thing, not a spinner. A feed that arrives as
           its own outline feels faster than one that arrives as a dot,
           because the layout stops moving the moment the data lands. */
        <div className="feed">
          {[0, 1, 2].map((i) => (
            <div className="fskel" key={i}>
              <div className="fskel-top">
                <span className="fskel-dot" />
                <span className="fskel-lines">
                  <span className="fskel-line w40" />
                  <span className="fskel-line w22" />
                </span>
              </div>
              <div className="fskel-art" />
              <div className="fskel-foot" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">Nothing here yet</div>
            <div className="sub">
              Make a banner and post it — the feed starts with whoever goes first.
            </div>
            <Link className="btn primary" href="/create" style={{ marginTop: 14 }}>
              Create a banner
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="feed">
            {posts.map((p) => (
              <FeedCard
                key={p.id}
                post={p}
                signedIn={Boolean(auth.user)}
                onLike={like}
                onReport={report}
              />
            ))}
          </div>

          {!done && (
            <div className="feed-more">
              <button className="btn" disabled={busy} onClick={() => load(cursor)}>
                {busy ? <span className="spinner" /> : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
