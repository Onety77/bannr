// ============================================================
// AVATAR — a face, or the next best thing.
//
// A feed of identical grey circles is a feed of strangers, so the
// fallback does real work here rather than being a placeholder: the
// first letter of the handle on a tint DERIVED from that handle. The
// same person is the same colour on every post, forever, without
// storing anything — which means the feed reads as several people
// even when nobody has connected a photo.
//
// The photo itself is Google's URL, used directly rather than copied.
// If it rotates or 404s the img simply fails, and onError falls back
// to the letter — the same thing every wallet-only account sees.
// ============================================================
"use client";
import { useState } from "react";

// Spread around the wheel rather than a fixed palette: any number of
// people, no two adjacent handles landing on the same swatch, and
// nothing to maintain. Saturation and lightness are fixed so every
// avatar carries the same weight next to the artwork it sits beside —
// this is a name tag, not a second thing to look at.
function tint(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 42%)`;
}

export default function Avatar({ handle, photo, size = 34 }) {
  const [broken, setBroken] = useState(false);
  const name = handle || "?";
  const style = { width: size, height: size };

  if (photo && !broken) {
    return (
      <img
        className="av"
        style={style}
        src={photo}
        alt={`@${name}`}
        loading="lazy"
        // Google's photo URLs are signed and do rotate. A broken image
        // on every post is worse than never having had one.
        onError={() => setBroken(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      className="av av-letter"
      style={{ ...style, background: tint(name), fontSize: Math.round(size * 0.42) }}
      aria-label={`@${name}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
