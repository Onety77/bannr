// ============================================================
// ADMIN — the funnel.
//
// Above the tabs rather than inside one, because it is the thing you
// want the moment the page opens and it is three numbers wide. A tab
// would mean choosing to look, and nobody chooses to look at metrics.
//
// The two RATES are the whole point; the counts are just how they are
// arrived at. They separate the two failures that look identical from
// the inside:
//
//   low landed → started   the site is not convincing anyone to try
//   low started → made     people try and something stops them
//
// Different problems, opposite fixes, and until now we have been
// guessing which one we had.
//
// See lib/stats.js for what is counted and what deliberately is not.
// ============================================================
"use client";
import { useEffect, useState } from "react";

const pct = (n, of) => (of > 0 ? Math.round((n / of) * 100) : null);
const rate = (n, of) => {
  const p = pct(n, of);
  return p === null ? "—" : `${p}%`;
};

export default function AdminFunnel({ user }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      try {
        const token = await user.getIdToken();
        const r = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (!live) return;
        if (!r.ok) { setErr(true); return; }
        setData(d);
      } catch {
        if (live) setErr(true);
      }
    })();
    return () => { live = false; };
  }, [user]);

  if (err) return null;

  // No skeleton. It is one row of small numbers at the top of a page
  // full of images — a shimmering placeholder for it would draw more
  // attention than the thing it stands in for.
  if (!data) return null;

  const t = data.today || { landed: 0, started: 0, generated: 0 };
  const s = data.sum || t;
  const days = data.days || [];
  // Scaled to the busiest day in the window, so the shape of the last
  // fortnight is readable even while the numbers are tiny.
  const peak = Math.max(1, ...days.map((d) => d.landed));

  const steps = [
    ["landed", t.landed, "opened the site"],
    ["started", t.started, "typed a name or pasted a CA"],
    ["made one", t.generated, "pressed Generate and got it"],
  ];

  return (
    <section className="funnel">
      <div className="funnel-head">
        <h2>Today</h2>
        <span className="hint">
          {s.landed} landed · {rate(s.started, s.landed)} started · {rate(s.generated, s.started)} of those
          finished <em>— last 14 days</em>
        </span>
      </div>

      <div className="funnel-row">
        {steps.map(([label, n, why], i) => (
          <div className="funnel-step" key={label}>
            {/* The rate sits BETWEEN the two numbers it relates, not
                under one of them, because it belongs to neither. */}
            {i > 0 && (
              <span className="funnel-arrow" aria-hidden="true">
                {rate(n, steps[i - 1][1])}
              </span>
            )}
            <div className="funnel-cell">
              <b>{n}</b>
              <span>{label}</span>
              <em>{why}</em>
            </div>
          </div>
        ))}
      </div>

      {days.length > 0 && (
        <div className="funnel-days" aria-hidden="true">
          {days.map((d) => (
            <div
              className="funnel-day"
              key={d.day}
              title={`${d.day} — ${d.landed} landed, ${d.started} started, ${d.generated} made`}
            >
              <div className="funnel-bar" style={{ height: `${(d.landed / peak) * 100}%` }}>
                {/* Made-a-banner drawn INSIDE landed rather than beside
                    it: the useful read is how much of the day's traffic
                    converted, which a second bar makes you compute. */}
                <div
                  className="funnel-bar-made"
                  style={{ height: `${d.landed ? (d.generated / d.landed) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
