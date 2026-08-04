// ============================================================
// ADMIN — the public feed.
//
// Opens on REPORTED rather than on everything, because the question
// you come here with is "what needs looking at", not "what exists".
// The count on that chip is the only number on this panel that should
// ever make you act.
//
// A post auto-hides once enough people report it (see AUTOHIDE_REPORTS
// in lib/feed.js). That is a deliberate trade against brigading — a
// small group can hide a post that broke no rule — so anything hidden
// that way is labelled as such, and restoring it clears the reports so
// it cannot be immediately re-hidden by the same people.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";

export default function AdminFeed({ user }) {
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState("reported");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async (f) => {
    setItems(null);
    try {
      const token = await user.getIdToken();
      const r = await fetch(`/api/admin/feed?filter=${f}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Failed to load the feed."); return; }
      setItems(d.items || []);
      setCounts(d.counts || {});
    } catch {
      setErr("Network error loading the feed.");
    }
  }, [user]);

  useEffect(() => { if (user) load(filter); }, [user, filter, load]);

  async function toggle(post) {
    setBusy(post.id);
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: post.id, hidden: !post.hidden }),
      });
      if (!r.ok) { setErr("That didn't work."); return; }
      setItems((list) =>
        list.map((p) => (p.id === post.id ? { ...p, hidden: !p.hidden, reports: p.hidden ? 0 : p.reports } : p))
      );
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-feed">
      {err && <div className="notice error">{err}</div>}

      <div className="admin-filters">
        {[["reported", "Needs review", "reported"], ["all", "Everything", "all"], ["hidden", "Hidden", "hidden"]].map(
          ([key, label, ck]) => (
            <button
              key={key}
              className={`admin-filter${filter === key ? " on" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              {counts[ck] !== undefined && <span className="admin-badge">{counts[ck]}</span>}
            </button>
          )
        )}
      </div>

      {!items ? (
        <div className="admin-gate"><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">
              {filter === "reported" ? "Nothing reported" : filter === "hidden" ? "Nothing hidden" : "No posts yet"}
            </div>
          </div>
        </div>
      ) : (
        <div className="admin-grid">
          {items.map((p) => (
            <div className={`admin-tile ${p.hidden ? "is-hidden" : ""}`} key={p.id}>
              <img src={p.src} alt={p.ticker || "post"} />
              <div className="admin-tile-body">
                <div className="admin-tile-meta">
                  <b>{p.handle ? `@${p.handle}` : "—"} {p.ticker ? `· ${p.ticker}` : ""}</b>
                  <span>
                    {p.styleName} · {new Date(p.ts).toLocaleString()}
                    {p.likes ? ` · ${p.likes} likes` : ""}
                  </span>
                  {(p.reports || 0) > 0 && (
                    <span className="admin-warn">
                      {p.reports} report{p.reports === 1 ? "" : "s"}
                      {p.autoHidden ? " · auto-hidden" : ""}
                    </span>
                  )}
                </div>
                <div className="admin-tile-flags">
                  <button
                    className={`admin-flag ${p.hidden ? "on" : ""}`}
                    disabled={busy === p.id}
                    onClick={() => toggle(p)}
                  >
                    {p.hidden ? "Restore" : "Hide"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
