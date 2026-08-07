// MY BANNERS — every downloaded banner, with its brief intact.
//
// Follows the ACCOUNT: entries live under users/{account}/history and
// show up on every device you sign into. Anything stranded in this
// browser from the localStorage era is swept up to the account on
// first load (the server dedupes). What is stored is the card — brief,
// style, thumbnail; the full-resolution archive is still G5b.
"use client";
import Link from "next/link";
import PostButton from "@/components/PostButton";
import { useAuth } from "@/lib/useAuth";
import ConnectButton from "@/components/ConnectButton";
import { readHistory, writeHistory, patchHistory, STALE_MS } from "@/lib/historyCache";
import { useRestoreScroll } from "@/lib/useRestoreScroll";
import { useEffect, useState } from "react";
import { loadHistory, deleteFromHistory } from "@/lib/credits";
import { saveImage, bannerFilename } from "@/lib/download";

// The page promises "re-run any brief with one click", so the link has
// to carry the ENTIRE brief — not just the style, which was all it used
// to pass while the card sat there displaying the ticker it was about
// to throw away.
function rerunHref(it) {
  const q = new URLSearchParams();
  if (it.templateId) q.set("style", it.templateId);
  for (const k of ["name", "ticker", "tagline", "vibe"]) {
    const v = it.brief?.[k];
    if (v) q.set(k, v);
  }
  return `/create?${q.toString()}`;
}

export default function HistoryPage() {
  // Read synchronously in the initialiser, so coming back from
  // another tab paints the list you left instead of a spinner that
  // is replaced a frame later.
  const cached = typeof window === "undefined" ? null : readHistory();
  const [items, setItems] = useState(cached?.items ?? null); // null = still loading
  const [confirming, setConfirming] = useState(null);
  // The card being looked at full size, or null. Holds the whole item
  // rather than an id so the viewer can name the banner and save it
  // under the right filename without looking anything up.
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  // Only so the post button knows whether to ask for sign-in first.
  // The page itself already requires a session to have any history.
  const auth = useAuth();

  useEffect(() => {
    let live = true;
    const c = readHistory();
    // Warm and recent: leave it alone. loadHistory is not a plain
    // read — it also pushes anything stranded in localStorage up to
    // the server — so calling it on every tab switch is a burst of
    // writes to answer a question already answered.
    if (c?.items && Date.now() - c.at < STALE_MS) return () => { live = false; };
    loadHistory().then((list) => {
      if (!live) return;
      setItems(list);
      writeHistory(list);
    });
    return () => { live = false; };
  }, []);

  useRestoreScroll("history", Boolean(items?.length));

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>My banners</h1>
        <p>Every run, saved with its brief.</p>
      </div>

      {/* Signed out is not the same as having made nothing, and it
          used to render as an empty shelf offering a Create button
          that would only ask them to sign in anyway. */}
      {!auth.loading && !auth.user ? (
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">Not signed in</div>
            <div className="empty-cta">
              <ConnectButton auth={auth} label="Sign in" />
            </div>
          </div>
        </div>
      ) : items === null ? (
        <div className="empty-canvas page-gap"><div className="dims">LOADING…</div></div>
      ) : items.length === 0 ? (
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">NOTHING PRINTED YET</div>
            <div className="sub">Your first banner is three fields away.</div>
            <div className="empty-cta">
              <Link href="/create" className="btn primary small">Create a banner</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="history-grid">
          {items.map((it) => (
            <div className="history-card" key={it.id}>
              {/* ══ THE PICTURE IS THE CONTROL ══

                  It was an <img> and nothing else, which on a page
                  full of banners is the one thing everybody tries to
                  tap. It opens the full-resolution file now — the real
                  one out of the archive, not the 900×300 card thumb —
                  and that is where re-downloading lives.

                  A card with no stored file is still just a picture:
                  anything downloaded before the archive existed has a
                  thumbnail and nothing behind it, and offering a view
                  that could only show a blurry copy would be a worse
                  answer than offering none. */}
              {it.thumb && (it.hasFile ? (
                <button
                  type="button"
                  className="history-open"
                  onClick={() => setViewing(it)}
                  aria-label={`View ${it.brief?.ticker || it.brief?.name || "banner"} full size`}
                >
                  <img src={it.thumb} alt="" />
                  <span className="history-open-hint">View</span>
                </button>
              ) : (
                <img src={it.thumb} alt={`${it.brief?.ticker || it.brief?.name || "Banner"} preview`} />
              ))}
              <div className="meta">
                <b>{it.brief?.ticker || it.brief?.name || "Untitled"}</b>
                <span>
                  {/* templateName already reads "Tech x3" when a run
                      produced three of one style, so "3 options" after
                      it was the same fact twice — and the third of
                      three things fighting for one narrow line. */}
                  {it.templateName} · {new Date(it.ts).toLocaleDateString()}
                </span>
                <div className="history-actions">
                  <Link href={rerunHref(it)} className="btn small">Re-run brief</Link>
                  {/* Posting an OLD banner is the same deliberate act
                      as posting a new one, so it is the same button.
                      `prepared` because what is stored here is already
                      the feed size, and `sig` because it was computed
                      from the full-resolution original — using the
                      stored one is what stops the same banner being
                      posted twice, once from each page. */}
                  <PostButton
                    variant={{
                      dataUrl: it.thumb,
                      templateId: (it.templateId || "").split(",")[0],
                      templateName: it.templateName,
                      concept: it.concept,
                    }}
                    brief={it.brief}
                    prepared
                    sig={it.sig || ""}
                    signedIn={Boolean(auth.user)}
                  />
                  {/* Two-step: these can't be recovered, and a stray tap
                      on a phone shouldn't destroy a saved run. */}
                  {confirming === it.id ? (
                    <>
                      <button
                        className="btn small danger"
                        onClick={async () => {
                          setItems((l) => {
                            const next = l.filter((h) => h.id !== it.id);
                            // Or the cache repaints it on the way back.
                            patchHistory(next);
                            return next;
                          });
                          setConfirming(null);
                          await deleteFromHistory(it.id);
                        }}
                      >
                        Delete
                      </button>
                      <button className="btn small" onClick={() => setConfirming(null)}>Keep</button>
                    </>
                  ) : (
                    <button className="history-del" onClick={() => setConfirming(it.id)} aria-label="Delete this run">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ THE VIEWER ══

          Deliberately not the create page's Lightbox. That one carries
          editing, undo, redo, hold-to-compare and the X conversion,
          all of which need a live run behind them — a saved banner has
          no variants to compare against and no session to charge. Two
          things belong here: see it properly, and get the file.

          The image is the signed archive URL, so this is the first
          place in the product where a banner is genuinely re-served at
          full resolution. */}
      {viewing && (
        <div
          className="hview"
          role="dialog"
          aria-modal="true"
          aria-label={`${viewing.brief?.ticker || viewing.brief?.name || "Banner"} full size`}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="hview-inner">
            {/* Same-origin, so no CORS and no signed URL in the page.
                Ownership is re-checked on this request rather than
                trusted from when the list was drawn. */}
            <img src={`/api/archive/${viewing.id}`} alt="" />
            <div className="hview-bar">
              <span className="hview-name">
                <b>{viewing.brief?.ticker || viewing.brief?.name || "Untitled"}</b>
                <em>1500 × 500</em>
              </span>
              <button
                className="btn small primary"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  // Fetched and saved rather than linked. A signed URL
                  // opened in a tab is a picture to long-press, not a
                  // download — and on iOS that is the difference
                  // between getting the file and getting a screenshot.
                  const label = viewing.brief?.ticker || viewing.brief?.name || "banner";
                  const res = await saveImage(`/api/archive/${viewing.id}`, bannerFilename(label, 0, ""));
                  setSaving(false);
                  if (res?.error) setViewing((v) => ({ ...v, err: res.error }));
                }}
              >
                {saving ? <span className="spinner" /> : "Download PNG"}
              </button>
              <button className="btn small" onClick={() => setViewing(null)}>Close</button>
            </div>
            {viewing.err && <div className="notice error">{viewing.err}</div>}
          </div>
        </div>
      )}
    </main>
  );
}
