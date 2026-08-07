// ============================================================
// THE FULL-RESOLUTION ARCHIVE.
//
// A banner used to exist at full quality only as long as the browser
// tab that made it. History kept a 900×300 JPEG and the feed a 760px
// one, both because localStorage caps at ~5MB and a Firestore document
// at 1MB — neither can physically hold a 1500×500 PNG. So downloading
// on a phone and wanting the file on a desktop the next day meant it
// was gone, and re-running the brief produces a DIFFERENT banner
// rather than that one again.
//
// This keeps the real file.
//
// ══ ONLY WHAT SOMEBODY KEPT ══
//
// Written at the moment of DOWNLOAD, never at generation. That is not
// a cost optimisation, though it is much cheaper — it is the same rule
// history has always followed, and it means a banner you looked at and
// rejected is never stored anywhere. Four options render, one gets
// kept, three are forgotten completely.
//
// ══ THE PATH IS UNGUESSABLE, AND OWNERSHIP IS STILL CHECKED ══
//
// A banner can be built from an unreleased logo for a token that has
// not launched. The object name carries a random component so it
// cannot be walked, AND every read goes through a signed URL minted
// only after the caller is shown to own the history entry pointing at
// it. Either alone would be weaker than it looks: unguessable names
// leak through any log or referrer that ever sees one, and an
// ownership check on a predictable path is one enumeration away.
//
// ══ AND IT DEGRADES TO NOTHING ══
//
// No bucket configured, or an upload that fails, returns null. The
// caller keeps the thumbnail it already had and the product behaves
// exactly as it did before any of this existed. An archive that could
// break a download would be worse than no archive.
// ============================================================
import "server-only";
import { randomUUID } from "crypto";
import { getAdminBucket } from "@/lib/firebaseAdmin";

// Long enough to open the page, look at a banner, and download it
// without the link dying mid-click; short enough that a URL copied out
// of devtools and pasted somewhere is not a permanent handle.
const SIGNED_TTL_MS = 60 * 60 * 1000;

const PATH_RE = /^banners\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.png$/;

// Ours, and shaped the way we write them. Anything else is refused
// before it reaches the bucket — this string arrives from a Firestore
// document, and a document is only ever as trustworthy as everything
// that has ever written to it.
export function isArchivePath(p) {
  return typeof p === "string" && PATH_RE.test(p);
}

export function archivePath(accountId) {
  // The account id scopes it; the uuid is what makes it unguessable.
  return `banners/${String(accountId).replace(/[^A-Za-z0-9_-]/g, "")}/${randomUUID()}.png`;
}

// Store one PNG. Returns the path, or null if anything at all went
// wrong — callers must treat null as "no archive" and carry on.
export async function putBanner(accountId, png) {
  const bucket = getAdminBucket();
  if (!bucket || !accountId || !png?.length) return null;
  const path = archivePath(accountId);
  try {
    await bucket.file(path).save(png, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        // Immutable: the bytes at a path never change, because a new
        // banner is a new uuid. A year is safe and means a re-download
        // of something already seen costs nothing.
        cacheControl: "private, max-age=31536000, immutable",
      },
    });
    return path;
  } catch (e) {
    console.error("[archive] put failed", e.message);
    return null;
  }
}

// A time-limited read URL, or null. The caller is responsible for
// having established ownership FIRST — this function cannot know who
// is asking and does not pretend to.
export async function signedUrl(path) {
  const bucket = getAdminBucket();
  if (!bucket || !isArchivePath(path)) return null;
  try {
    const [url] = await bucket.file(path).getSignedUrl({
      action: "read",
      expires: Date.now() + SIGNED_TTL_MS,
    });
    return url;
  } catch (e) {
    console.error("[archive] sign failed", e.message);
    return null;
  }
}

// Best-effort. A delete that fails must not stop the history entry
// going away: a card the user asked to remove staying on screen is a
// visible broken promise, where an orphaned object is a cost nobody
// can see. Logged loudly so orphans are findable rather than silent.
export async function removeBanner(path) {
  const bucket = getAdminBucket();
  if (!bucket || !isArchivePath(path)) return false;
  try {
    await bucket.file(path).delete({ ignoreNotFound: true });
    return true;
  } catch (e) {
    console.error("[archive] ORPHANED OBJECT", path, e.message);
    return false;
  }
}
