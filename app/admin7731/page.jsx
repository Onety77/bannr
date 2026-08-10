// /admin7731 — unlinked anywhere on purpose. Gated by Firebase
// Google Sign-In restricted to ADMIN_EMAIL; every mutating call is
// re-verified server-side (see lib/adminAuth.js) since the client
// check below is UX only, not the real security boundary.
"use client";
import { useEffect, useRef, useState } from "react";
import { getFirebase } from "@/lib/firebaseClient";
import { ADMIN_EMAIL } from "@/lib/admin";
import AdminLaunch from "@/components/AdminLaunch";
import AdminToken from "@/components/AdminToken";
import AdminFeed from "@/components/AdminFeed";
import AdminFunnel from "@/components/AdminFunnel";
import AdminBuybacks from "@/components/AdminBuybacks";
import AdminUnclaimed from "@/components/AdminUnclaimed";
import AdminGrant from "@/components/AdminGrant";
import AdminTierGrant from "@/components/AdminTierGrant";
import AttachCa from "@/components/AttachCa";
import { saveImage, bannerFilename } from "@/lib/download";

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
  const [tab, setTab] = useState("generations"); // generations | refusals | token | feed | money
  const [refusals, setRefusals] = useState(null);
  // The commitment, but only when a buyback is actually due. Null the
  // rest of the time, so every consumer is a plain truthiness check
  // and there is no way to render the nudge when it is not owed.
  const [due, setDue] = useState(null);
  // Blockers only — the count on the Launch tab. Loaded on arrival for
  // the same reason as `due`: a badge that appears once you open the
  // tab cannot tell you to open the tab.
  const [blockers, setBlockers] = useState(0);
  // all = the 60 most recent. The rest ask "what is live right now",
  // which is a different question and the only one that can reach a
  // banner featured long enough ago to have fallen off the list.
  const [filter, setFilter] = useState("all");
  const [counts, setCounts] = useState({});
  // The tile being looked at, or null. Holds the whole item so the
  // viewer can name the file and know whether a real one exists.
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  // ══ AN <img src> CANNOT SEND A BEARER TOKEN ══
  //
  // Every /api/admin route is guarded by requireAdmin, which reads the
  // Authorization header and nothing else — no cookie, deliberately.
  // So pointing an <img> straight at /api/admin/banner/{id} gets a
  // 401 and a broken picture, and no amount of markup fixes it.
  //
  // The file is fetched WITH the header and held as an object URL,
  // which the image and the download both read. The alternative —
  // accepting a token in the query string — would put a credential in
  // every log, referrer and screenshot of the address bar.
  const [fullUrl, setFullUrl] = useState(null);

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

  // ══ THE BUYBACK NUDGE, LOADED ON ARRIVAL ══
  //
  // Not lazily on the Money tab, unlike everything else here, and the
  // difference is the whole point: a badge that only appears after you
  // have opened the tab cannot tell you to open the tab. This is the
  // one number on the page that is meant to bring you to it.
  //
  // Silent on failure. A nudge that cannot load should show nothing
  // rather than an error on a page you came to for something else.
  useEffect(() => {
    if (status !== "authorized" || !user) return;
    let live = true;
    (async () => {
      try {
        const token = await user.getIdToken();
        const auth = { headers: { Authorization: `Bearer ${token}` } };
        // Both in one pass, both silent on failure. Neither is the
        // reason you came to this page, and an error banner for a
        // background check would sit on top of whatever is.
        const [pay, launch] = await Promise.all([
          fetch("/api/admin/buyback", auth).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/admin/launch", auth).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (!live) return;
        setDue(pay?.promise?.due ? pay.promise : null);
        setBlockers(launch?.counts?.blockers || 0);
      } catch {}
    })();
    return () => { live = false; };
  }, [status, user]);

  // Below the state it reads. Fetches the real file when a tile with
  // one is opened, and revokes the object URL on the way out — each
  // one pins a couple of megabytes until it is released.
  useEffect(() => {
    if (!viewing?.hasFile || !user) { setFullUrl(null); return; }
    let live = true;
    let url = null;
    (async () => {
      try {
        const token = await user.getIdToken();
        const r = await fetch(`/api/admin/banner/${viewing.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const blob = await r.blob();
        if (!live) return;
        url = URL.createObjectURL(blob);
        setFullUrl(url);
      } catch {
        // Falls back to the card image, which is already on screen.
        // A viewer that shows the smaller picture beats one that
        // shows nothing.
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewing, user]);

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
        {/* First, because it is the only tab that answers a question
            you might not know to ask. The rest report on things you
            came looking for. */}
        <button className={tab === "launch" ? "on" : ""} onClick={() => setTab("launch")}>
          Launch
          {blockers > 0 ? <span className="admin-badge due">{blockers}</span> : null}
        </button>
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
        <button className={tab === "money" ? "on" : ""} onClick={() => setTab("money")}>
          Money
          {due ? <span className="admin-badge due">!</span> : null}
        </button>
      </div>

      {/* Above the tabs' content and below the tabs themselves, so it
          is on screen whichever tab you arrived on. It is the one
          thing here that is a standing obligation rather than
          something to review. */}
      {due && tab !== "money" && (
        <button className="admin-due" onClick={() => setTab("money")}>
          <b>{due.outstandingSol} SOL of buybacks owed</b>
          <span>Past the {due.nudgeAt} mark — open Money</span>
        </button>
      )}

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

      {tab === "launch" && <div className="swap" key="launch"><AdminLaunch user={user} /></div>}
      {tab === "token" && <div className="swap" key="token"><AdminToken user={user} /></div>}
      {tab === "feed" && <div className="swap" key="feed"><AdminFeed user={user} /></div>}
      {tab === "money" && (
        <div className="swap" key="money">
          <AdminBuybacks user={user} />
          {/* Above Give credits, because it is the reason to use it.
              Renders nothing at all when there is nothing owed. */}
          <AdminUnclaimed user={user} />
          <AdminGrant user={user} />
          {/* Below Give credits, and separate from it. A balance and a
              standing are two different ladders, and one form that
              could change both in a single submit is a form somebody
              uses wrong at speed. */}
          <AdminTierGrant user={user} />
        </div>
      )}

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
                {/* ══ THE PICTURE OPENS ══

                    It was an <img> and nothing else, on a board made
                    entirely of pictures — the one thing anyone tries
                    to tap, and the one thing that did nothing.

                    Cards WITH a stored file open the real 1500×500
                    PNG. Cards without open the 900×300 card image,
                    which is still four times the area it occupies in
                    the grid and is the only thing that exists for
                    anything downloaded before the archive did.
                    Distinguished in the viewer rather than hidden
                    here, because "let me look at that one" is a
                    reasonable request either way. */}
                <button
                  type="button"
                  className="admin-open"
                  onClick={() => setViewing(it)}
                  aria-label={`View ${it.ticker || "banner"}`}
                >
                  <img src={it.src} alt={it.ticker || "banner"} />
                </button>
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
                  {/* THE ADDRESS YOU FOUND IT ON. Most banners are
                      never posted to the feed — they go straight onto
                      DEX Screener — so recognising one here and
                      attaching its token is how those get counted in
                      the directory.

                      Only when it is already live on that token's
                      page. Everything else in this product treats
                      publishing as a deliberate act, and this is the
                      one path that could put a private banner on a
                      public page. The condition is that they
                      published it themselves, somewhere more
                      prominent than our feed. */}
                  <AttachCa item={it} user={user} />
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
          {/* ══ OUR FAULT, FIRST AND ON ITS OWN ══

              An outage and a run of content refusals are opposite
              problems, and a single total cannot tell them apart —
              which is exactly how two failed PFP runs on production
              read as an empty panel. `internal` is quota, billing, a
              dead key or a crash: the number to look at before any of
              the tuning signal below. Absent when it is zero, so a
              healthy day says nothing rather than reassuring. */}
          {refusals.stats.internal > 0 && (
            <div className="notice error">
              <b>{refusals.stats.internal24h || refusals.stats.internal} failures on our side</b>
              {refusals.stats.internal24h ? " in the last 24h" : ""} — quota, billing or a
              dead key, not the brief. Check the platform log and the image provider&apos;s
              billing page.
            </div>
          )}

          <div className="admin-stats">
            {[
              ["Last 24h", refusals.stats.last24h],
              ["Content refusals", refusals.stats.policy],
              ["Our fault", refusals.stats.internal],
              ["Timed out", refusals.stats.timeout],
              ["From generating", refusals.stats.generate],
              ["From editing", refusals.stats.edit],
              ["From PFPs", refusals.stats.pfp],
            ].map(([label, n]) => (
              <div className="admin-stat" key={label}>
                <b>{n ?? 0}</b>
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
                  <span className={`admin-kind ${r.kind}`}>{(r.kind || "generate").toUpperCase()}</span>
                  {/* Why, on the row. Without it a billing failure and
                      a content refusal are two identical-looking lines
                      and the list cannot be read at a glance. Content
                      refusals stay unlabelled — they are the norm here
                      and a tag on every row is a tag on none. */}
                  {r.reason && r.reason !== "policy" ? (
                    <span className={`admin-why ${r.reason}`}>
                      {r.reason === "internal" ? "OUR FAULT" : "TIMED OUT"}
                    </span>
                  ) : null}
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

      {/* The viewer. Same two jobs as the one on My banners — see it
          properly, and get the file — and deliberately not the create
          page's Lightbox, which carries editing and undo and needs a
          live run behind it. */}
      {viewing && (
        <div
          className="hview"
          role="dialog"
          aria-modal="true"
          aria-label={`${viewing.ticker || "Banner"} full size`}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="hview-inner">
            {/* The card image until the real one arrives, rather than
                a blank frame — it is already loaded, and a viewer that
                paints instantly and sharpens beats one that waits. */}
            <img src={fullUrl || viewing.src} alt="" />
            <div className="hview-bar">
              <span className="hview-name">
                <b>{viewing.ticker || "—"}</b>
                {/* Says WHICH it is, rather than implying every card
                    has a real file behind it. Anything downloaded
                    before the archive existed only ever had the card
                    image, and pretending otherwise would make a
                    900×300 JPEG look like a deliverable. */}
                <em>
                  {!viewing.hasFile
                    ? "preview only · 900 × 300"
                    : fullUrl
                    ? "1500 × 500"
                    : "loading full size…"}
                </em>
              </span>
              <button
                className="btn small primary"
                disabled={saving || (viewing.hasFile && !fullUrl)}
                onClick={async () => {
                  setSaving(true);
                  const res = await saveImage(
                    fullUrl || viewing.src,
                    bannerFilename(viewing.ticker || "banner", 0, "")
                  );
                  setSaving(false);
                  if (res?.error) setError(res.error);
                }}
              >
                {saving ? <span className="spinner" /> : viewing.hasFile ? "Download PNG" : "Download preview"}
              </button>
              <button className="btn small" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
