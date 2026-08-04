// ============================================================
// ONE POST.
//
// Built as a social post rather than a picture with a caption, in this
// order: who made it, what it is for, the work, what you can do with
// it. A feed of bare banners reads as a gallery — impressive once and
// boring by the third scroll — because there is nobody in it. The
// avatar and handle at the top are what turn a wall of images into a
// place where people are.
//
// THE CONTRACT ADDRESS SITS ABOVE THE ARTWORK and links out to
// DexScreener. It is optional, because plenty of banners are made
// before a token exists, and when it is there it is the difference
// between admiring a banner and being able to go and look at the coin.
//
// "Make one like this" is the loop this whole feature exists for, and
// Share is how the loop reaches people who have never been here — a
// link to one post, readable signed out, likeable only signed in.
//
// Report sits alone in the header. It has to be reachable and must
// never be the thing your thumb finds while going for Like.
// ============================================================
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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

export default function FeedCard({ post, signedIn, onLike, onReport }) {
  const [reported, setReported] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!shared) return;
    const id = setTimeout(() => setShared(false), 1800);
    return () => clearTimeout(id);
  }, [shared]);

  const label = post.ticker || post.name || "";

  async function share() {
    const url = `${window.location.origin}/feed/${post.id}`;
    const title = label ? `${label} banner on bannr` : "A banner on bannr";
    // The native sheet where it exists — on a phone that is AirDrop,
    // Telegram, X, everything — and the clipboard everywhere else.
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelled, or refused. Fall through to copying rather than
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
          <span className="fcard-handle">{post.handle ? `@${post.handle}` : "someone"}</span>
          <span className="fcard-sub">
            {post.styleName ? `${post.styleName} · ` : ""}{ago(post.ts)}
          </span>
        </div>
        {!post.mine && (
          <button
            className="fcard-report"
            disabled={reported}
            onClick={() => { setReported(true); onReport(post); }}
            title="Report this post"
          >
            {reported ? "Reported" : "Report"}
          </button>
        )}
      </header>

      {/* Above the artwork, because it says what you are looking at. */}
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

      <div className="fcard-shot">
        <img src={post.src} alt={label ? `Banner for ${label}` : "A banner"} loading="lazy" />
      </div>

      <div className="fcard-actions">
        <button
          className={`fcard-like${post.liked ? " on" : ""}`}
          onClick={() => onLike(post)}
          aria-pressed={post.liked}
          aria-label={post.liked ? "Unlike" : "Like"}
          title={signedIn ? "" : "Sign in to like"}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M10 16.5S3 12.3 3 7.9A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 7 1.9c0 4.4-7 8.6-7 8.6z"
              fill={post.liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          {post.likes > 0 && <span>{post.likes}</span>}
        </button>

        <button className="fcard-share" onClick={share} aria-label="Share this banner">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 11.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4.5"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {shared ? "Link copied" : "Share"}
        </button>

        <Link className="fcard-reuse" href={`/create?style=${encodeURIComponent(post.styleId || "")}`}>
          Make one like this
        </Link>
      </div>
    </article>
  );
}
