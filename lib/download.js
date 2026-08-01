// ============================================================
// SAVING A BANNER — harder on a phone than it looks.
//
// The old approach was `<a download href="data:image/png;...">`.
// That works on desktop and does NOTHING inside an in-app browser:
// iOS WKWebView — which is what Phantom and Solflare embed — doesn't
// honour the `download` attribute, so the click silently no-ops. The
// anchor also wasn't in the document, which some browsers require
// before a synthetic click counts.
//
// So there are two real paths:
//
//   Phones  → the Web Share sheet with a real File. "Save Image" is
//             the native idiom there, and it works inside WKWebView.
//   Desktop → a Blob object URL and a real anchor in the DOM. Blob
//             URLs also dodge the size limits large data: URLs hit.
// ============================================================
"use client";

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head)?.[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Returns { ok } or { error } so the caller can say something useful
// rather than leaving a dead button — the original failure mode.
export async function saveImage(dataUrl, filename) {
  if (!dataUrl) return { error: "Nothing to save." };

  let blob;
  try {
    blob = dataUrlToBlob(dataUrl);
  } catch {
    return { error: "Couldn't prepare that image." };
  }

  const file = new File([blob], filename, { type: blob.type });

  // Share sheet first where it can take files. On a phone this is the
  // only route that reliably ends with the image in the camera roll.
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return { ok: true, via: "share" };
    } catch (e) {
      // Dismissing the sheet is a choice, not a failure.
      if (e?.name === "AbortError") return { ok: true, via: "cancelled" };
      // Anything else: fall through and try the anchor.
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);   // required by some browsers
    a.click();
    a.remove();
    // Give the download a beat to start before the URL dies.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true, via: "download" };
  } catch {
    return { error: "Your browser blocked the download. Try long-pressing the banner to save it." };
  }
}

export function bannerFilename(label, i, suffix = "") {
  const t = String(label || "banner").replace(/[^a-z0-9$ ]/gi, "").replace(/ /g, "-") || "banner";
  return `bannr-${t}-v${i + 1}${suffix}.png`;
}
