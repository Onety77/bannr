// ============================================================
// ADMIN — money that arrived and reached nobody.
//
// An ALARM, not a machine. Crediting someone by hand is already a
// thirty-second job in Give credits directly below this; the part that
// could not be improvised was knowing there was anyone to credit. A
// payment that cannot be attributed is written down with no account
// against it and then mentioned nowhere — not in a billing history,
// not here — and the first anybody hears of it is a customer saying
// they paid.
//
// ══ SILENT WHEN THERE IS NOTHING ══
//
// It renders NOTHING at zero, which is almost always. A row saying
// "0 unclaimed payments" is a thing to read and dismiss every time
// this tab is opened, and a warning that is always there stops being
// read at all. It appears when it has something to say.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";

const short = (s) => (s && s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s || "");
const when = (ts) => (ts ? new Date(ts).toLocaleString() : "");

export default function AdminUnclaimed({ user }) {
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/admin/unclaimed", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setData(await r.json());
    } catch {
      // Leaves the panel absent. This sits beside the real money tools
      // and must never be the reason the tab fails to render.
    }
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (!data?.count) return null;

  return (
    <div className="panel page-gap-top">
      <div className="panel-head">
        <h3>
          {data.count} payment{data.count === 1 ? "" : "s"} not credited
        </h3>
      </div>
      {/* Says what to do, once, and does not explain the mechanism.
          Whoever is reading this wants to know who to pay and how
          much — both are in the rows. */}
      <p className="hint">
        Money that arrived with nothing naming an account. Credit it below
        with Give credits, using the transaction as the reason.
      </p>
      <div className="unclaimed">
        {data.rows.map((r) => (
          <div className="unclaimed-row" key={r.signature}>
            <span className="mono unclaimed-sig">{short(r.signature)}</span>
            <span className="unclaimed-amt">
              {r.sol} SOL{r.credits ? ` · ${r.credits} credits` : ""}
            </span>
            <span className="unclaimed-meta">
              {r.wallet ? short(r.wallet) : "—"} · {r.status} · {when(r.ts)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
