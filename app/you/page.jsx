// ============================================================
// YOU — who you are, what you have, what you have posted.
//
// The tab used to open straight into settings, which is why it felt
// cluttered: sign-in methods, paying wallets, billing history, default
// styles and an avoid-rule all on one screen, none of which is
// actually YOU. It was a preferences page wearing a person's name.
//
// Split by the question each answers:
//
//   /you        me. Handle, credits, my posts.
//   /settings   configuration. Everything you set once and forget.
//   /u/{handle} the same profile as a stranger sees it.
//
// Nothing here is new capability except deleting a post — the value is
// that four unrelated things stopped sharing one screen.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/lib/useAuth";
import ConnectButton from "@/components/ConnectButton";
import { useRestoreScroll } from "@/lib/useRestoreScroll";

export default function YouPage() {
  const auth = useAuth();
  const [posts, setPosts] = useState(null);
  // Seeded from the session, so the name is right on first paint
  // rather than appearing a moment later.
  const [handle, setHandle] = useState(auth.user?.handle || null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    try {
      const p = await fetch("/api/me/posts", { cache: "no-store" }).then((r) => r.json());
      setPosts(p?.posts || []);
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    if (!auth.user) { setPosts([]); return; }
    setHandle((h) => h ?? auth.user.handle ?? null);
    load();
  }, [auth.user, load]);
  useRestoreScroll("you", Boolean(posts));

  async function saveHandle(e) {
    e?.preventDefault();
    const want = draft.trim();
    if (!want) return;
    setMsg(null);
    try {
      const r = await fetch("/api/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: want }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || "That didn't work."); return; }
      setHandle(d.handle);
      setEditing(false);
      // Old posts show the new name immediately — nothing denormalises
      // the handle onto a post, which is the entire reason for that.
      load();
    } catch {
      setMsg("Network error — try again.");
    }
  }

  async function remove(id) {
    setConfirming(null);
    setPosts((list) => list.filter((p) => p.id !== id));
    try {
      const r = await fetch(`/api/feed/${encodeURIComponent(id)}/delete`, { method: "POST" });
      if (!r.ok) throw new Error();
    } catch {
      setMsg("Couldn't remove that one — put it back.");
      load();
    }
  }

  if (!auth.user) {
    return (
      <main className="wrap">
        <div className="page-head"><h1>You</h1></div>
        {/* Sign in HERE. This used to send people to /create to do
            it, which is a strange thing to ask of someone who tapped
            "You" — and it was only that way because the sign-in
            surface was too big to put on more than one page. */}
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">Not signed in</div>
            <div className="empty-cta">
              <ConnectButton auth={auth} label="Sign in" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  const u = auth.user;

  return (
    <main className="wrap you-wrap">
      {/* ---- who ---- */}
      <div className="you-head">
        <Avatar handle={handle} photo={u.photo} size={64} />
        <div className="you-who">
          {editing ? (
            <form className="you-handle-edit" onSubmit={saveHandle}>
              <span>@</span>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value.toLowerCase())}
                placeholder="yourname"
                maxLength={20}
                spellCheck={false}
              />
              <button className="btn small primary" type="submit">Save</button>
              <button className="btn small" type="button" onClick={() => { setEditing(false); setMsg(null); }}>
                Cancel
              </button>
            </form>
          ) : (
            <>
              <h1>{handle ? `@${handle}` : "No handle yet"}</h1>
              <button
                className="you-edit"
                onClick={() => { setDraft(handle || ""); setEditing(true); setMsg(null); }}
              >
                {handle ? "Change handle" : "Pick a handle"}
              </button>
            </>
          )}
          {msg && <span className="you-msg">{msg}</span>}
        </div>
      </div>

      {/* ---- what you have ---- */}
      <div className="you-stats">
        <Link href="/credits" className="you-stat">
          <b>{u.credits}</b>
          <span>credits</span>
        </Link>
        <div className="you-stat">
          <b>{u.freeEditsLeft}</b>
          <span>free edits today</span>
        </div>
        {u.holderRunsLeft > 0 && (
          <div className="you-stat">
            <b>{u.holderRunsLeft}</b>
            <span>free runs today</span>
          </div>
        )}
        <div className="you-stat">
          <b>{posts?.length ?? "—"}</b>
          <span>posts</span>
        </div>
      </div>

      {/* ---- where else to go ---- */}
      {/* Rows, not a paragraph of coloured words. Five links wrapped
          across two lines read as leftover text; the same five as a
          list with a target each read as a menu, which is what they
          are. Sign out sits apart because it is the one that ends
          the session. */}
      <nav className="you-menu">
        {[
          ["/history", "My banners", "Everything you have made"],
          ["/credits", "Buy credits", "Top up with SOL"],
          ["/settings", "Settings", "Sign-in, wallet, defaults"],
          ...(handle
            ? [[`/u/${handle}`, "Public profile", "How others see you"]]
            : []),
        ].map(([href, label, sub]) => (
          <Link className="you-row" href={href} key={href}>
            <span className="you-row-txt">
              <b>{label}</b>
              <em>{sub}</em>
            </span>
            <span className="you-row-go" aria-hidden="true">›</span>
          </Link>
        ))}
        <button className="you-row you-row-out" onClick={auth.signOut}>
          <span className="you-row-txt"><b>Sign out</b></span>
        </button>
      </nav>

      {/* ---- what you posted ---- */}
      <div className="panel-head you-sec">
        <h3>Your posts</h3>
        {posts?.length > 0 && <span className="hint">Tap ✕ to remove</span>}
      </div>

      {posts === null ? (
        <div className="empty-canvas page-gap"><div className="dims">LOADING…</div></div>
      ) : posts.length === 0 ? (
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">Nothing posted yet</div>
            <div className="sub">Post a banner from My banners and it shows up here.</div>
          </div>
        </div>
      ) : (
        <div className="you-grid">
          {posts.map((p) => (
            <div className={`you-post${p.hidden ? " is-hidden" : ""}`} key={p.id}>
              <Link href={`/feed/${p.id}`}>
                <img src={p.src} alt={p.ticker || "Your banner"} loading="lazy" />
              </Link>
              <div className="you-post-bar">
                <span className="you-post-tick">{p.ticker || p.name || "—"}</span>
                <span className="you-post-likes">♥ {p.likes}</span>
                {/* Hidden is stated rather than silent: a post that just
                    disappears reads as our bug, not as moderation. */}
                {p.hidden && <span className="you-post-flag">Removed by a moderator</span>}
                {confirming === p.id ? (
                  <>
                    <button className="btn small danger" onClick={() => remove(p.id)}>Delete</button>
                    <button className="btn small" onClick={() => setConfirming(null)}>Keep</button>
                  </>
                ) : (
                  <button className="you-post-x" onClick={() => setConfirming(p.id)} aria-label="Remove this post">
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
