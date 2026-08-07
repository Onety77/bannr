// ============================================================
// SHRINK IT BEFORE IT LEAVES THE BROWSER.
//
// A PFP run failed on production with a bare "Something went wrong",
// no server log line, and no credits charged — because the function
// never ran. The platform rejects a request body over ~4.5MB with a
// 413 before any of our code sees it, and the PFP maker was uploading
// up to five untouched phone photos.
//
// Banners survived by luck rather than by design: a logo is usually a
// small PNG. The same 413 was always one large upload away, and the
// banner form takes five reference images too.
//
// ══ THE SERVER WAS THROWING THIS AWAY ANYWAY ══
//
// Both routes downscale to 1024px with sharp the moment the file
// lands. So every byte above that was uploaded, paid for in transfer,
// and discarded — on a phone, over mobile data, in front of somebody
// waiting. Doing it here is not a workaround for the limit, it is
// where the work belonged.
//
// ══ AND WHY JPEG IS SAFE HERE ══
//
// Transparency is lost, which would matter if anything downstream
// kept it. Nothing does: both routes call .flatten({ background:
// "#ffffff" }) before they encode, so a transparent logo is already
// being composited onto white server-side. This just does it earlier.
//
// FAILS OPEN. If a browser cannot decode the file — an exotic format,
// a corrupt image, a canvas the OS refused — the original is returned
// untouched and the server deals with it exactly as it does today. A
// helper that made an upload impossible would be worse than the size
// it was written to fix.
// ============================================================
"use client";

// 1024 matches what both routes resize to, so nothing is lost that
// would have survived. Quality 0.86 against sharp's 0.85/0.88 — the
// same picture, at a size that fits several of them in one request.
const MAX_EDGE = 1024;
const QUALITY = 0.86;

// Below this, re-encoding costs more than it saves and risks making a
// small clean PNG bigger. An icon-sized logo is left exactly as it is.
const SKIP_UNDER_BYTES = 400 * 1024;

function decode(file) {
  // createImageBitmap is the fast path and honours EXIF orientation in
  // current browsers. Safari has historically not had it for Blobs, so
  // the <img> path stays as the fallback rather than the exception.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => decodeViaImg(file));
  }
  return decodeViaImg(file);
}

function decodeViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

export async function downscaleFile(file, maxEdge = MAX_EDGE) {
  try {
    if (!file || typeof file.arrayBuffer !== "function") return file;
    if (file.size <= SKIP_UNDER_BYTES) return file;

    const bmp = await decode(file);
    const w = bmp.width;
    const h = bmp.height;
    if (!w || !h) return file;

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // White first. Drawing a transparent PNG onto a fresh canvas and
    // encoding as JPEG turns every transparent pixel BLACK, which on a
    // logo with a knocked-out background is the whole logo.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(bmp, 0, 0, tw, th);
    if (typeof bmp.close === "function") bmp.close();

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob) return file;
    // Only if it actually helped. A photo of a flat colour can encode
    // larger at 1024 JPEG than it was as a small PNG.
    if (blob.size >= file.size) return file;

    const name = (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export async function downscaleAll(files, maxEdge = MAX_EDGE) {
  return Promise.all([...files].map((f) => downscaleFile(f, maxEdge)));
}

// What the platform will accept in one request body, minus room for
// the rest of the form. Used to refuse a set that is still too big
// AFTER shrinking, with a sentence that names the problem — rather
// than letting it become a 413 nobody can read.
export const REQUEST_BUDGET_BYTES = 4 * 1024 * 1024;

export function totalBytes(files) {
  return [...files].reduce((n, f) => n + (f?.size || 0), 0);
}
