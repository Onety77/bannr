// ============================================================
// ONE POST.
//
// Order: who made it, what coin it is for, the work, what you can do
// with it. A wall of bare banners reads as a gallery — impressive once
// and boring by the third scroll — because there is nobody in it. The
// avatar and handle are what make it a place rather than an archive.
//
// THE ARTWORK IS THE POINT and everything else defers to it. The card
// carries almost no chrome of its own: the banner runs edge to edge,
// and the two rows around it are quiet enough that scrolling reads as
// a run of images rather than a run of boxes.
//
// DOUBLE-TAP THE BANNER TO LIKE IT. That is the gesture every feed has
// trained people to expect, and it is the difference between a page
// you look at and one you touch. The button is still there for anyone
// who does not know the gesture — which is the deal with gestures:
// they are a shortcut, never the only way.
//
// Share is how the loop reaches people who have never been here.
//
// No report button. It was on every card and it is one more thing to
// read on a page whose job is to be looked at. Taking a post down is
// still possible — /admin7731 has the whole feed with a Hide on each
// one — and the reporting endpoint and its auto-hide threshold are
// untouched on the server, so this is a display decision that can be
// undone without a migration.
//
// The trade, stated: nobody but an admin can now flag a scam, so
// bad posts are found by looking rather than by being told.
// ============================================================
"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : new Date(ts).toLocaleDateString();
}

const shortCa = (ca) => (ca.length > 14 ? `${ca.slice(0, 5)}…${ca.slice(-5)}` : ca);

const Heart = ({ filled }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M10 16.5S3 12.3 3 7.9A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 7 1.9c0 4.4-7 8.6-7 8.6z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export default function FeedCard({ post, signedIn, onLike }) {
  const [shared, setShared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [burst, setBurst] = useState(0);
  const [pop, setPop] = useState(0);
  const lastTap = useRef(0);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!shared) return;
    const id = setTimeout(() => setShared(false), 1800);
    return () => clearTimeout(id);
  }, [shared]);

  // A cached image can be complete before React ever attaches onLoad,
  // which would leave it faded out forever.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  const label = post.ticker || post.name || "";

  function like() {
    setPop((n) => n + 1);
    onLike(post);
  }

  // Double-tap. Deliberately only ever LIKES, never unlikes: a stray
  // second tap taking a like away is the one outcome nobody wants, and
  // unliking is what the button is for.
  function onImageTap() {
    const now = Date.now();
    const isDouble = now - lastTap.current < 300;
    lastTap.current = now;
    if (!isDouble) return;
    setBurst((n) => n + 1);
    if (!post.liked) like();
  }

  async function share() {
    const url = `${window.location.origin}/feed/${post.id}`;
    const title = label ? `${label} banner on bannr` : "A banner on bannr";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelled or refused — fall through to copying rather than
        // leaving the tap having done nothing.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.cssText = "position:absolute;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setShared(true);
    }
  }

  return (
    <article className="fcard">
      <header className="fcard-top">
        <Avatar handle={post.handle} photo={post.photo} />
        <div className="fcard-id">
          {post.handle ? (
            <Link className="fcard-handle" href={`/u/${post.handle}`}>@{post.handle}</Link>
          ) : (
            <span className="fcard-handle">someone</span>
          )}
          <span className="fcard-sub">
            {post.styleName ? `${post.styleName} · ` : ""}{ago(post.ts)}
          </span>
        </div>
      </header>

      {(label || post.ca) && (
        <div className="fcard-coin">
          {label && <span className="fcard-tick">{label}</span>}
          {post.ca && (
            <a
              className="fcard-ca"
              href={`https://dexscreener.com/${post.chain || "solana"}/${post.ca}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title="Open on DexScreener"
            >
              {shortCa(post.ca)}
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M5 2h7v7M12 2 5.5 8.5M9 11.5H2.5V5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>
      )}

      <div className="fcard-shot" onPointerUp={onImageTap}>
        <img
          ref={imgRef}
          className={loaded ? "in" : ""}
          src={post.src}
          alt={label ? `Banner for ${label}` : "A banner"}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          draggable={false}
        />
        {/* Keyed on a counter so the animation restarts on every tap
            rather than only playing the first time. */}
        {burst > 0 && (
          <span className="fcard-burst" key={burst} aria-hidden="true">
            <Heart filled />
          </span>
        )}
      </div>

      <div className="fcard-actions">
        <button
          className={`fcard-like${post.liked ? " on" : ""}`}
          key={`like-${pop}`}
          onClick={like}
          aria-pressed={post.liked}
          aria-label={post.liked ? "Unlike" : "Like"}
          title={signedIn ? "" : "Sign in to like"}
        >
          <Heart filled={post.liked} />
          {post.likes > 0 && <span>{post.likes}</span>}
        </button>

        <button className="fcard-share" onClick={share} aria-label="Share this banner">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 11.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4.5"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {shared ? "Link copied" : "Share"}
        </button>

        {/* `from` is what makes this mean anything. The style alone
            is a no-op for a Default post — /create?style=auto IS the
            page's resting state — and Default is most of the feed.
            The banner itself goes along as a reference. */}
        <Link
          className="fcard-reuse"
          href={`/create?style=${encodeURIComponent(post.styleId || "")}&from=${encodeURIComponent(post.id)}`}
        >
          Make one like this
        </Link>
      </div>
    </article>
  );
}
