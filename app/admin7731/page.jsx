// /admin7731 — unlinked anywhere on purpose. Gated by Firebase
// Google Sign-In restricted to ADMIN_EMAIL; every mutating call is
// re-verified server-side (see lib/adminAuth.js) since the client
// check below is UX only, not the real security boundary.
"use client";
import { useEffect, useRef, useState } from "react";
import { getFirebase } from "@/lib/firebaseClient";
import { ADMIN_EMAIL } from "@/lib/admin";
import AdminToken from "@/components/AdminToken";
import AdminFeed from "@/components/AdminFeed";
import AdminFunnel from "@/components/AdminFunnel";

const FLAGS = [
  ["featuredWall", "Fresh wall"],
  ["featuredHero", "Highlight"],
  // Picks the three banners shown in the X teaser on /create. Its own
  // flag rather than reusing the hero set, because that set is chosen
  // to look good on a dark homepage carousel and these are judged
  // inside a profile mockup — different job, different picks.
  ["featuredX", "X teaser"],
  ["hidden", "Hide"],
];

export default function AdminPage() {
  const [status, setStatus] = useState("loading"); // loading | no-config | signed-out | unauthorized | authorized
  const [user, setUser] = useState(null);
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null); // `${id}:${field}`
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("generations"); // generations | refusals | token | feed
  const [refusals, setRefusals] = useState(null);
  // all = the 60 most recent. The rest ask "what is live right now",
  // which is a different question and the only one that can reach a
  // banner featured long enough ago to have fallen off the list.
  const [filter, setFilter] = useState("all");
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const app = getFirebase();
    if (!app) {
      setStatus("no-config");
      return;
    }
    let unsub = () => {};
    (async () => {
      const { getAuth, onAuthStateChanged, signOut } = await import("firebase/auth");
      const auth = getAuth(app);
      unsub = onAuthStateChanged(auth, (u) => {
        if (!u) {
          setStatus("signed-out");
          setUser(null);
        } else if (u.email !== ADMIN_EMAIL) {
          signOut(auth);
          setStatus("unauthorized");
          setUser(null);
        } else {
          setUser(u);
          setStatus("authorized");
        }
      });
    })();
    return () => unsub();
  }, []);

  useEffect(() => {
    if (status !== "authorized" || !user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/generations?filter=${filter}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        if (!res.ok) return setError(d.error || "Failed to load generations.");
        setItems(d.items);
        setCounts(d.counts || {});
      } catch {
        setError("Network error loading generations.");
      }
    })();
  }, [status, user, filter]);

  // Loaded on first visit to the tab, then cached for the session.
  useEffect(() => {
    if (status !== "authorized" || !user || tab !== "refusals" || refusals) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/refusals", { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        if (!res.ok) return setError(d.error || "Failed to load refusals.");
        setRefusals(d);
      } catch {
        setError("Network error loading refusals.");
      }
    })();
  }, [status, user, tab, refusals]);

  async function signIn() {
    setError(null);
    const app = getFirebase();
    const { getAuth, GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    try {
      await signInWithPopup(getAuth(app), new GoogleAuthProvider());
    } catch (e) {
      setError(e.message || "Sign-in failed.");
    }
  }

  async function doSignOut() {
    const app = getFirebase();
    const { getAuth, signOut } = await import("firebase/auth");
    await signOut(getAuth(app));
  }

  // Hand-placed banners: any image an admin uploads joins the same
  // list with the same flags, so featuring it is the same two clicks
  // as featuring a generated one.
  const [upBusy, setUpBusy] = useState(false);
  const [upTicker, setUpTicker] = useState("");
  const upRef = useRef(null);

  async function uploadBanner(file) {
    if (!file || upBusy) return;
    setUpBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.set("image", file);
      if (upTicker.trim()) fd.set("ticker", upTicker.trim());
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) return setError(d.error || "Upload failed.");
      setItems((l) => [d.item, ...(l || [])]);
      setUpTicker("");
    } catch {
      setError("Network error uploading.");
    } finally {
      setUpBusy(false);
      if (upRef.current) upRef.current.value = "";
    }
  }

  async function toggle(item, field) {
    const key = `${item.id}:${field}`;
    setBusy(key);
    setError(null);
    const next = !item[field];
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: item.id, field, value: next }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || "Toggle failed.");
      setItems((prev) =>
        prev
          .map((it) => (it.id === item.id ? { ...it, [field]: next } : it))
          // In a filtered view, un-featuring something means it no
          // longer belongs in the list being looked at. Leaving it
          // sitting there greyed out invites a second click on a
          // banner that is already gone.
          .filter((it) => {
            const f = { wall: "featuredWall", hero: "featuredHero", hidden: "hidden" }[filter];
            return !f || it[f];
          })
      );
      setCounts((c) => {
        const k = { featuredWall: "wall", featuredHero: "hero", hidden: "hidden" }[field];
        if (!k || c[k] === undefined) return c;
        return { ...c, [k]: Math.max(0, c[k] + (next ? 1 : -1)) };
      });
    } catch (e) {
      setError(e.message || "Toggle failed.");
    } finally {
      setBusy(null);
    }
  }

  if (status === "loading") return <main className="wrap admin-gate"><span className="spinner" /></main>;

  if (status === "no-config") {
    return (
      <main className="wrap admin-gate">
        <div className="panel admin-card">
          <h3>Admin</h3>
          <p className="hint">
            Firebase client isn't configured yet — set the NEXT_PUBLIC_FIREBASE_* vars
            in .env.local to enable sign-in.
          </p>
        </div>
      </main>
    );
  }

  if (status === "signed-out" || status === "unauthorized") {
    return (
      <main className="wrap admin-gate">
        <div className="panel admin-card">
          <h3>Admin</h3>
          {status === "unauthorized" && (
            <div className="notice error">That Google account isn't authorized for this page.</div>
          )}
          {error && <div className="notice error">{error}</div>}
          <button className="btn primary block" onClick={signIn}>Sign in with Google</button>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap admin-wrap">
      <div className="admin-bar">
        <h1>Admin</h1>
        <div className="admin-bar-right">
          <span className="hint">{user.email}</span>
          <button className="btn small" onClick={doSignOut}>Sign out</button>
        </div>
      </div>

      {/* Above the tabs, so it is seen rather than visited. */}
      <AdminFunnel user={user} />

      <div className="admin-tabs">
        <button className={tab === "generations" ? "on" : ""} onClick={() => setTab("generations")}>
          Generations
        </button>
        <button className={tab === "refusals" ? "on" : ""} onClick={() => setTab("refusals")}>
          Refused briefs
          {refusals?.stats?.last24h ? <span className="admin-badge">{refusals.stats.last24h}</span> : null}
        </button>
        <button className={tab === "token" ? "on" : ""} onClick={() => setTab("token")}>
          Token
        </button>
        <button className={tab === "feed" ? "on" : ""} onClick={() => setTab("feed")}>
          Feed
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      {tab === "generations" && (
        <div className="admin-filters">
          {[
            ["all", "Recent", null],
            ["wall", "On the fresh wall", "wall"],
            ["hero", "In the highlight", "hero"],
            ["x", "In the X teaser", "x"],
            ["hidden", "Hidden", "hidden"],
          ].map(([key, label, countKey]) => (
            <button
              key={key}
              className={`admin-filter${filter === key ? " on" : ""}`}
              onClick={() => { if (filter !== key) { setItems(null); setFilter(key); } }}
            >
              {label}
              {countKey && counts[countKey] !== undefined && (
                <span className="admin-badge">{counts[countKey]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {tab === "generations" && filter === "all" && (
        <div className="admin-upload">
          <input
            ref={upRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            id="admin-up"
            onChange={(e) => uploadBanner(e.target.files?.[0])}
          />
          <input
            className="admin-up-ticker"
            placeholder="$TICKER (optional)"
            value={upTicker}
            onChange={(e) => setUpTicker(e.target.value)}
            maxLength={24}
          />
          <label htmlFor="admin-up" className={`btn small primary${upBusy ? " is-busy" : ""}`}>
            {upBusy ? "Uploading…" : "Upload a banner"}
          </label>
          <span className="hint">
            Lands unlisted — feature it with the same buttons as any generation.
          </span>
        </div>
      )}

      {tab === "token" && <AdminToken user={user} />}
      {tab === "feed" && <AdminFeed user={user} />}

      {tab === "generations" ? (
        !items ? (
          <div className="admin-gate"><span className="spinner" /></div>
        ) : items.length === 0 ? (
          <div className="empty-canvas page-gap">
            <div>
              <div className="dims">
                {filter === "all" ? "No generations yet"
                  : filter === "wall" ? "Nothing on the fresh wall"
                  : filter === "hero" ? "Nothing in the highlight"
                  : "Nothing hidden"}
              </div>
              {filter !== "all" && (
                <div className="sub">Feature a banner from Recent and it appears here.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="admin-grid">
            {items.map((it) => (
              <div className={`admin-tile ${it.hidden ? "is-hidden" : ""}`} key={it.id}>
                <img src={it.src} alt={it.ticker || "banner"} />
                <div className="admin-tile-body">
                  <div className="admin-tile-meta">
                    <b>{it.ticker || "—"}</b>
                    <span>{it.template} · {new Date(it.ts).toLocaleString()}</span>
                  </div>
                  <div className="admin-tile-flags">
                    {FLAGS.map(([field, label]) => (
                      <button
                        key={field}
                        className={`admin-flag ${it[field] ? "on" : ""}`}
                        disabled={busy === `${it.id}:${field}`}
                        onClick={() => toggle(it, field)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab !== "refusals" ? null : !refusals ? (
        <div className="admin-gate"><span className="spinner" /></div>
      ) : refusals.items.length === 0 ? (
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">No refusals recorded</div>
            <div className="sub">Nothing has been turned down by the content filter yet.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="admin-stats">
            {[
              ["Last 24h", refusals.stats.last24h],
              ["Last 7 days", refusals.stats.last7d],
              ["From generating", refusals.stats.generate],
              ["From editing", refusals.stats.edit],
            ].map(([label, n]) => (
              <div className="admin-stat" key={label}>
                <b>{n}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>

          {refusals.commonWords.length > 0 && (
            <div className="panel admin-words">
              <h3>What refused briefs have in common</h3>
              <div className="hint">
                Words appearing in more than one refused brief. A word near the top
                is a candidate to soften in the prompt — or to warn about up front.
              </div>
              <div className="admin-wordlist">
                {refusals.commonWords.map((w) => (
                  <span className="admin-word" key={w.word}>
                    {w.word} <b>{w.count}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="admin-refusals">
            {refusals.items.map((r) => (
              <div className="admin-refusal" key={r.id}>
                <div className="admin-refusal-head">
                  <span className={`admin-kind ${r.kind}`}>{r.kind === "edit" ? "EDIT" : "GENERATE"}</span>
                  <b>{r.name || "—"}</b>
                  {r.ticker ? <span className="admin-tick">{r.ticker}</span> : null}
                  {/* what the probe blamed + what the image API itself
                      admitted (e.g. "sexual") — the tuning signal */}
                  {r.diagnosis && r.diagnosis !== "unknown" ? (
                    <span className="admin-tick">blamed: {r.diagnosis}</span>
                  ) : null}
                  {r.violations ? <span className="admin-tick">flagged: {r.violations}</span> : null}
                  <span className="admin-when">{new Date(r.ts).toLocaleString()}</span>
                </div>
                {r.instruction && <p className="admin-refusal-body"><i>Asked for:</i> {r.instruction}</p>}
                {r.tagline && <p className="admin-refusal-body"><i>Tagline:</i> {r.tagline}</p>}
                {r.vibe && <p className="admin-refusal-body"><i>About:</i> {r.vibe}</p>}
                {r.detail && <details className="admin-detail"><summary>Raw response</summary><code>{r.detail}</code></details>}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
