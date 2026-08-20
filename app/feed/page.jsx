// ============================================================
// /feed — banners people chose to make public.
//
// Readable signed out, on purpose. This is the front of the funnel:
// someone arriving from a link should see the work before they are
// asked for anything, and the only thing a session changes here is
// whether the hearts are filled in.
//
// FILTERED BY STYLE, and the filter lives in the URL. That makes a
// filtered feed a thing you can link to and come back to — /feed?style
// =tech is a page about Tek banners, not a temporary state of this
// one. It also means the back button does what it looks like it does.
//
// Optimistic likes. The heart moves on tap and is put back if the
// server disagrees — a like is not worth a spinner, and a feed that
// waits on the network to acknowledge a tap feels broken on a phone.
// ============================================================
"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FeedCard from "@/components/FeedCard";
import FeedRail from "@/components/FeedRail";
import { useAuth } from "@/lib/useAuth";
import { readFeed, writeFeed, mergeFresh, STALE_MS } from "@/lib/feedCache";
import { useRestoreScroll } from "@/lib/useRestoreScroll";
import { STYLES, AUTO_ID, AUTO_NAME } from "@/lib/styles";

function FeedInner() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const style = (params.get("style") || "").trim();
  const qs = style ? `&style=${encodeURIComponent(style)}` : "";

  // Read synchronously in the initialiser, so the first render is
  // already the feed you left rather than skeletons that get replaced
  // a frame later. Keyed by filter: the cache for Tek is not the cache
  // for everything.
  const cached = typeof window === "undefined" ? null : readFeed(style);
  const [posts, setPosts] = useState(cached?.posts ?? null);
  const [cursor, setCursor] = useState(cached?.cursor ?? 0);
  const [done, setDone] = useState(cached?.done ?? false);
  const [busy, setBusy] = useState(false);
  // Closed by default, and not remembered. See the panel below.
  const [help, setHelp] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (before = 0) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/feed?before=${before || 0}${qs}`, { cache: "no-store" });
      const d = await r.json();
      setPosts((prev) => {
        const next = before ? [...(prev || []), ...(d.posts || [])] : d.posts || [];
        writeFeed({ posts: next, cursor: d.cursor || 0, done: Boolean(d.done), at: Date.now() }, style);
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
  }, [qs, style]);

  // Quietly re-read the first page and fold it in. No skeletons, no
  // spinner, nothing moves under the reader: anything new appears
  // above where they are, and posts already on screen keep their place
  // while taking the server's like count.
  const revalidate = useCallback(async () => {
    try {
      const r = await fetch(`/api/feed?before=0${qs}`, { cache: "no-store" });
      const d = await r.json();
      if (!d?.posts) return;
      setPosts((prev) => {
        const next = mergeFresh(prev, d.posts);
        writeFeed({ posts: next, at: Date.now() }, style);
        return next;
      });
    } catch {
      // The cached feed is still on screen and still fine.
    }
  }, [qs, style]);

  // Re-runs when the filter changes, because `style` is in the deps.
  // A warm cache for that filter paints instantly; a cold one loads.
  useEffect(() => {
    const c = readFeed(style);
    if (!c?.posts?.length) {
      setPosts(null);
      setDone(false);
      setCursor(0);
      load(0);
      return;
    }
    setPosts(c.posts);
    setCursor(c.cursor || 0);
    setDone(Boolean(c.done));
    if (Date.now() - (c.at || 0) > STALE_MS) revalidate();
  }, [style, load, revalidate]);

  // Keyed by filter too, so switching back to a style returns you to
  // where you were in it rather than to the top.
  useRestoreScroll(`feed:${style}`, Boolean(posts?.length));

  function pick(next) {
    if (next === style) return;
    router.push(next ? `/feed?style=${encodeURIComponent(next)}` : "/feed", { scroll: false });
  }

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
      setPosts((list) => {
        const next = list.map((p) => (p.id === post.id ? { ...p, liked: d.liked, likes: d.likes } : p));
        writeFeed({ posts: next }, style);
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

  const chips = [["", "All"], [AUTO_ID, AUTO_NAME], ...STYLES.map((s) => [s.id, s.name])];

  return (
    <main className="wrap feed-page">
      <div className="page-head">
        <h1>Feed</h1>
        <p>What people are shipping.</p>
        {/* ══ THE RULES, WHERE THE RULES APPLY ══
            A credit back for posting and a daily prize are worth
            nothing if nobody knows they exist, and a paragraph under
            the heading would be read once and then be in the way
            forever. Closed by default, one tap, remembers nothing —
            the people who need it are new, and the people who do not
            never open it. */}
        <button
          type="button"
          className="feed-help-btn"
          aria-expanded={help}
          onClick={() => setHelp((v) => !v)}
        >
          {help ? "Close" : "How this works"}
        </button>
      </div>

      {help && (
        <div className="feed-help">
          <div className="feed-help-row">
            <b>A credit back for posting</b>
            <p>
              Post a banner you made and a credit returns to your balance.
              Once per run, three times a day. After that you can still
              post — it just stops paying.
            </p>
          </div>
          <div className="feed-help-row">
            <b>The day&apos;s most liked</b>
            <p>
              Whichever banner ends the day with the most likes is featured,
              and its maker is rewarded. Likes are one per account.
            </p>
          </div>
          <div className="feed-help-row">
            <b>More to come</b>
            {/* Named as coming rather than described. A roadmap on a
                public page is a promise, and this one is not written
                yet. */}
            <p>There is more planned for the feed. It will show up here.</p>
          </div>
        </div>
      )}

      {/* Scrolls sideways on a phone rather than wrapping to three
          lines and pushing the feed off the screen. */}
      <div className="feed-filters" role="tablist" aria-label="Filter by style">
        {chips.map(([id, label]) => (
          <button
            key={id || "all"}
            role="tab"
            aria-selected={style === id}
            className={`feed-chip${style === id ? " on" : ""}`}
            onClick={() => pick(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="notice error">{error}</div>}

      {/* Two columns centred TOGETHER, not a column with a rail bolted
          to its right — that leaves the pair sitting left of middle. */}
      <div className="feed-layout">
        <div className="feed-main">
          {posts === null ? (
            /* The shape of the thing, not a spinner. A feed that arrives
               as its own outline feels faster than one that arrives as a
               dot, because the layout stops moving when the data lands. */
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
                <div className="dims">
                  {style ? "Nothing in this style yet" : "Nothing here yet"}
                </div>
                <div className="sub">
                  {style
                    ? "Be the first — make one and post it."
                    : "Make a banner and post it — the feed starts with whoever goes first."}
                </div>
                <Link className="btn primary" href={style ? `/create?style=${style}` : "/create"} style={{ marginTop: 14 }}>
                  Create a banner
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="feed">
                {posts.map((p) => (
                  <FeedCard key={p.id} post={p} signedIn={Boolean(auth.user)} onLike={like} />
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
        </div>
        <FeedRail />
      </div>
    </main>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<main className="wrap feed-page"><div className="page-head"><h1>Feed</h1></div></main>}>
      <FeedInner />
    </Suspense>
  );
}
