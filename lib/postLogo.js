// ============================================================
// THE SOURCE PICTURE, KEPT WITH THE POST.
//
// A wall of finished banners shows what the place produces. It does
// not show what the place DOES, and only the second explains why
// anyone would upload anything. So a post carries the logo its banner
// grew from, and the feed card shows the two together.
//
// NOTHING IS COMPOSITED. An earlier version painted the logo into the
// image on a taller canvas, which meant every post carried a strip of
// dead colour above the artwork — and the artwork is the whole point.
// The banner stays exactly 1500×500, byte for byte what was made, and
// the card places the logo over it in CSS: half on the banner, half
// on the card's own background.
//
// That is better in every direction. No band, no wasted pixels, the
// feed keeps its single 3:1 reservation, and the overlay can be sized
// and positioned per screen instead of being frozen into a JPEG.
//
// All this file does is make the logo small and square.
// ============================================================
"use client";

// 256 is the display size at 2× on the widest card, and about 20KB of
// base64 — small enough to sit in the post document beside the banner
// without arguing with it.
const SIZE = 256;

export const MAX_LOGO = 60_000; // base64 chars; a 256px jpeg is ~15-25k

// Center-cropped to a square, the rule CSS object-fit: cover uses.
// Token logos are usually square already; the ones that are not would
// otherwise arrive squashed, in a post whose entire argument is that
// we are good at pictures.
export function squareLogo(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = SIZE;
        c.height = SIZE;
        const ctx = c.getContext("2d");
        if (!ctx) { resolve(null); return; }
        const scale = Math.max(SIZE / img.width, SIZE / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
        const out = c.toDataURL("image/jpeg", 0.82);
        // Better no picture than a post that fails to save because of
        // one. The banner is what someone came to publish.
        resolve(out && out.length <= MAX_LOGO ? out : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
