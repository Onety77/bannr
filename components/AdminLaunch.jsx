// ============================================================
// ADMIN — is this ready, and what is left.
//
// The checklist this replaces lived in a markdown file, and a
// checklist in a markdown file has one failure mode: it goes stale
// while describing a system that has moved on, and nothing tells you.
// This reads the deployed config, so it cannot be out of date.
//
// ══ BLOCKERS FIRST, AND NOTHING ELSE COMPETES WITH THEM ══
//
// Sorted by severity, not by section, because the question is never
// "what is in the payments group" — it is "what will hurt me". A
// ceiling left unlimited and a hold-for-hours left at zero are not
// the same kind of problem and must not read as the same kind of row.
//
// ══ AND EVERY ROW SAYS WHERE TO GO ══
//
// A checklist that reports a problem and not its location is a
// checklist you have to already know the answer to. Each row carries
// the exact panel and field.
// ============================================================
"use client";
import { useEffect, useState } from "react";

const RANK = { blocker: 0, launch: 1, later: 2 };
const LABEL = { blocker: "Blocker", launch: "Before launch", later: "Later" };

export default function AdminLaunch({ user }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/launch", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) return setErr(d.error || "Failed to load.");
      setErr(null);
      setData(d);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  if (!data) return <div className="panel"><span className="spinner" /></div>;

  const c = data.counts;
  // Unresolved first, then by severity, then done. Something already
  // ticked has nothing to tell you and should not sit above something
  // that does.
  const items = [...data.items].sort((a, b) => {
    const done = (x) => (x.ok === true ? 1 : 0);
    return done(a) - done(b) || RANK[a.severity] - RANK[b.severity];
  });

  return (
    <div className="launch">
      {err && <div className="notice error">{err}</div>}

      <div className="admin-stats">
        <div className="admin-stat">
          <b>{c.blockers}</b><span>blockers</span>
        </div>
        <div className="admin-stat">
          <b>{c.remaining}</b><span>unresolved</span>
        </div>
        <div className="admin-stat">
          <b>{c.total - c.remaining - c.unknown}</b><span>done</span>
        </div>
        <button className="btn small" onClick={load} disabled={busy}>
          {busy ? <span className="spinner" /> : "Re-check"}
        </button>
      </div>

      {/* One sentence, and only the honest one. "You are ready" is a
          claim this page cannot make — the rehearsal item is a
          judgement nothing here can read. */}
      {c.blockers > 0 ? (
        <div className="notice error">
          {c.blockers === 1 ? "One blocker" : `${c.blockers} blockers`} — these cost money or fail
          silently. Everything else can wait.
        </div>
      ) : c.remaining > 0 ? (
        <div className="notice">No blockers. {c.remaining} left before announcing.</div>
      ) : null}

      <div className="launch-list">
        {items.map((i) => (
          <div className={`lx ${i.ok === true ? "ok" : i.ok === null ? "unknown" : i.severity}`} key={i.id}>
            <span className="lx-mark" aria-hidden="true">
              {i.ok === true ? "✓" : i.ok === null ? "?" : "!"}
            </span>
            <div className="lx-body">
              <div className="lx-head">
                <b>{i.label}</b>
                {i.ok !== true && <span className="lx-sev">{LABEL[i.severity]}</span>}
              </div>
              <p className="lx-detail">{i.detail}</p>
              {/* Only when there is something to do. A "fix" line under
                  a ticked row is noise that makes the ticked rows look
                  like work. */}
              {i.ok !== true && <p className="lx-fix">{i.fix}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
