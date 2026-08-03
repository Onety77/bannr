// MY BANNERS — every downloaded banner, with its brief intact.
//
// Follows the ACCOUNT: entries live under users/{account}/history and
// show up on every device you sign into. Anything stranded in this
// browser from the localStorage era is swept up to the account on
// first load (the server dedupes). What is stored is the card — brief,
// style, thumbnail; the full-resolution archive is still G5b.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadHistory, deleteFromHistory } from "@/lib/credits";

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
  const [items, setItems] = useState(null); // null = still loading
  const [confirming, setConfirming] = useState(null);

  useEffect(() => {
    let live = true;
    loadHistory().then((list) => { if (live) setItems(list); });
    return () => { live = false; };
  }, []);

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>My banners</h1>
        <p>Every run, saved with its brief. Re-run any of them with one click.</p>
      </div>

      {items === null ? (
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
              {it.thumb && <img src={it.thumb} alt={`${it.brief?.ticker || it.brief?.name || "Banner"} preview`} />}
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
                  {/* Two-step: these can't be recovered, and a stray tap
                      on a phone shouldn't destroy a saved run. */}
                  {confirming === it.id ? (
                    <>
                      <button
                        className="btn small danger"
                        onClick={async () => {
                          setItems((l) => l.filter((h) => h.id !== it.id));
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
    </main>
  );
}
