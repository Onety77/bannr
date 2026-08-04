// ============================================================
// ONE POST.
//
// The banner leads, at full width, because that is what someone came
// to look at. Everything else is subordinate to it: who made it, what
// it was for, and — where the style had a director — the idea behind
// it, which is the thing that makes this a feed worth reading rather
// than a wall of pictures.
//
// "Make one like this" is the whole point of the feed existing. It is
// a link, not a button, so it opens in a new tab on a middle-click and
// is crawlable — someone browsing on a phone should be able to keep
// scrolling and come back to it.
//
// Report sits alone on the right, quiet and unlabelled until hover.
// It has to be reachable and must never be the second thing your
// thumb finds.
// ============================================================
"use client";
import Link from "next/link";
import { useState } from "react";

// The concept is still stored on every post and in history — removing
// the display, not the data, so it can come back without a migration.
// It was cut because only some styles have a director, so it appeared
// on some cards and not others with no way for a reader to know why.

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

export default function FeedCard({ post, signedIn, onLike, onReport }) {
  const [reported, setReported] = useState(false);

  const label = post.ticker || post.name || "";

  return (
    <article className="fcard">
      <div className="fcard-shot">
        <img src={post.src} alt={label ? `Banner for ${label}` : "A banner"} loading="lazy" />
      </div>

      <div className="fcard-body">
        <div className="fcard-who">
          <span className="fcard-handle">{post.handle ? `@${post.handle}` : "someone"}</span>
          {label && <span className="fcard-tick">{label}</span>}
          {post.styleName && <span className="fcard-style">{post.styleName}</span>}
          <span className="fcard-ago">{ago(post.ts)}</span>
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

          {/* The loop: see something good, make yours. Carries the
              style, which is the only part that transfers — the brief
              is theirs and stays theirs. */}
          <Link className="fcard-reuse" href={`/create?style=${encodeURIComponent(post.styleId || "")}`}>
            Make one like this
          </Link>

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
        </div>
      </div>
    </article>
  );
}
