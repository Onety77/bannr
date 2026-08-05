// ============================================================
// THE SOURCE LOGO, PINNED TO THE BANNER.
//
// A wall of finished banners shows what the place produces. It does
// not show what the place DOES, and only the second explains why
// anyone would upload anything. So a post carries the picture it grew
// from, and the pair says it without a caption.
//
// THE BANNER IS NOT TOUCHED. Full size, full width, its own position,
// nothing cropped and nothing scaled. An earlier version put it in a
// box beside the logo at ~63% width, which made every post an
// advertisement for a smaller version of the work. The artwork is the
// argument; it does not give up room to the thing explaining it.
//
// Instead the frame grows. A band above the banner holds the logo,
// which straddles the seam — part of it over the artwork where there
// is usually room on the left, part of it in the band above.
//
//   ┌───────────────────────────────┐
//   │        ╭───╮                  │  ← band, tinted from the banner
//   ├────────┤   ├──────────────────┤
//   │        ╰───╯                  │
//   │           the banner, intact  │
//   └───────────────────────────────┘
//
// WHY STRADDLING, RATHER THAN INSIDE. A logo placed within the frame
// reads as part of the composition — someone would think we put it
// there, or that the banner came out with two logos. Breaking the top
// edge is the one position nothing inside an image can occupy, and it
// is the profile-picture-over-a-cover-photo arrangement everybody has
// already learned to read. The ring cut in the band colour and the
// shadow under it finish the job: it sits ABOVE, it is not IN.
//
// It will often cover the logo the banner has of its own, on the
// left. That is fine and deliberate — the source picture is the point
// of the post.
//
// NOT 3:1. Every plain banner post is, and the feed reserves that
// ratio before an image decodes so scroll restoration lands on the
// right row. A post made here carries its ratio to the feed so the
// reservation stays exact for a taller card too — see BA_RATIO.
// ============================================================
"use client";

const BANNER_W = 1500;
const BANNER_H = 500;
// The band above. Enough to hold half a logo with air over it, and no
// more — dead space at the top of every post is a tax on the feed.
const BAND = 130;
const LOGO = 220;
const LOGO_X = 62;
// The cut around the logo, in the band's own colour. This is what
// separates it from the artwork underneath.
const RING = 9;

export const BA_W = BANNER_W;
export const BA_H = BANNER_H + BAND;
export const BA_RATIO = BA_W / BA_H;

const load = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

// Average colour of an image, via a 1×1 downscale. The browser does
// the averaging in C; reading a million pixels in JS to get the same
// number would be the slowest part of this whole function.
function averageOf(img) {
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, 1, 1);
    const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  } catch {
    return { r: 20, g: 20, b: 22 };
  }
}

// Center-crop, the same rule CSS object-fit: cover uses. Logos arrive
// square most of the time but not always, and a squashed logo in a
// post about how good the output looks would be its own argument.
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Returns a JPEG data URL, or null if either image failed to load —
// in which case the caller posts the banner on its own. The pairing
// is a nicety; never let it be the reason a post does not happen.
export async function composeBeforeAfter(logoSrc, bannerSrc) {
  if (!logoSrc || !bannerSrc) return null;
  const [logo, banner] = await Promise.all([load(logoSrc), load(bannerSrc)]);
  if (!logo || !banner) return null;

  const c = document.createElement("canvas");
  c.width = BA_W;
  c.height = BA_H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  // --- the band ---
  // The banner's own average colour pushed down near black, so the
  // strip belongs to whatever it is holding rather than fighting it.
  // Floored above pure black, which reads as a failed render.
  const avg = averageOf(banner);
  const g = (v) => Math.max(11, Math.round(v * 0.22));
  const ground = `rgb(${g(avg.r)}, ${g(avg.g)}, ${g(avg.b)})`;
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, BA_W, BA_H);

  // --- the banner, exactly as it was made ---
  ctx.drawImage(banner, 0, BAND, BANNER_W, BANNER_H);

  const cx = LOGO_X + LOGO / 2;
  const cy = BAND; // dead on the seam: half above, half over the art

  // --- the cut ---
  // Drawn as a filled disc in the band colour BEFORE the logo, with a
  // shadow, so the logo appears to sit in a hole punched through the
  // artwork rather than to be painted on top of it.
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.arc(cx, cy, LOGO / 2 + RING, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- the logo ---
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, LOGO / 2, 0, Math.PI * 2);
  ctx.clip();
  drawCover(ctx, logo, cx - LOGO / 2, cy - LOGO / 2, LOGO, LOGO);
  ctx.restore();

  // A hairline, so a logo whose own edge matches the band does not
  // dissolve into it — common, because plenty of PFPs are dark.
  ctx.beginPath();
  ctx.arc(cx, cy, LOGO / 2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return c.toDataURL("image/jpeg", 0.82);
}
