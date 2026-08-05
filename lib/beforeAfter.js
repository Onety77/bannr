// ============================================================
// BEFORE AND AFTER — the logo they gave us, beside what we made.
//
// A wall of finished banners shows what the place produces. It does
// not show what the place DOES, and those are different pitches: the
// second one is the only one that explains why anyone would bother
// uploading anything. One image, no caption needed — a plain PFP, an
// arrow, a banner.
//
// THREE TO ONE, LIKE EVERY OTHER POST. The feed reserves 3:1 on every
// card before its image decodes, and that reservation is what makes
// scroll restoration land on the right row. A composite with its own
// aspect ratio would either be cropped by object-fit or force the
// card to measure itself, and the second one breaks going back.
//
// So the banner gives up width rather than the layout giving up its
// guarantee. It renders at about 64% of the card instead of 100% —
// which is the trade, and it is the right way round, because a post
// like this is an argument about the product rather than a delivery
// of the artwork. The full-size download is untouched.
//
// The ground is TINTED BY THE BANNER ITSELF — its own average colour
// pushed down near black. A fixed grey works against half the
// banners; this one belongs to whatever it is framing, and costs one
// downscale to 1×1 to compute.
// ============================================================
"use client";

export const BA_W = 1500;
export const BA_H = 500;

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

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

function drawArrow(ctx, x, y, len, color) {
  const head = 15;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + len - head, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + len, y);
  ctx.lineTo(x + len - head, y - head * 0.72);
  ctx.lineTo(x + len - head, y + head * 0.72);
  ctx.closePath();
  ctx.fill();
}

// Returns a JPEG data URL, or null if either image failed to load —
// in which case the caller posts the banner on its own. A composite
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

  // --- the ground ---
  const avg = averageOf(banner);
  // A quarter of the banner's own average, floored so it never goes
  // pure black — a flat #000 ground makes the whole thing look like a
  // failed render rather than a deliberate frame.
  const g = (v) => Math.max(11, Math.round(v * 0.22));
  ctx.fillStyle = `rgb(${g(avg.r)}, ${g(avg.g)}, ${g(avg.b)})`;
  ctx.fillRect(0, 0, BA_W, BA_H);

  // --- the logo ---
  const LOGO = 300;
  const lx = 62;
  const ly = (BA_H - LOGO) / 2;
  ctx.save();
  roundRect(ctx, lx, ly, LOGO, LOGO, 62);
  ctx.clip();
  drawCover(ctx, logo, lx, ly, LOGO, LOGO);
  ctx.restore();
  // A hairline so a logo whose own background matches the ground does
  // not dissolve into it — common, because plenty of PFPs are dark.
  ctx.save();
  roundRect(ctx, lx + 0.5, ly + 0.5, LOGO - 1, LOGO - 1, 62);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // --- the arrow ---
  drawArrow(ctx, lx + LOGO + 34, BA_H / 2, 58, "rgba(255,255,255,0.42)");

  // --- the banner ---
  const bx = lx + LOGO + 34 + 58 + 34; // 488
  const bw = BA_W - bx - 62;           // 950
  const bh = Math.round(bw / 3);       // 317, since a banner is 3:1
  const by = Math.round((BA_H - bh) / 2);
  ctx.save();
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.clip();
  ctx.drawImage(banner, bx, by, bw, bh);
  ctx.restore();

  return c.toDataURL("image/jpeg", 0.82);
}
