// ============================================================
// POST TO FEED — the one deliberate act that makes a banner public.
//
// Never a side effect of downloading, saving or featuring. People make
// banners for projects that have not launched, and a ticker on a
// public page is a leak nobody agreed to. So this is its own button,
// it names the consequence, and it asks once more before doing it.
//
// The handle prompt lives HERE rather than in settings, because this
// is the only moment anyone needs one and the only moment the reason
// is obvious — you are about to be named next to your work. Sending
// someone to a settings page to fill in a field before they can
// finish the thing they were doing is how a share flow dies.
// ============================================================
"use client";
import { useState } from "react";
import { shrink } from "@/lib/credits";

export default function PostButton({ variant, brief, signedIn, onSignInNeeded }) {
  // idle | confirm | handle | busy | done | error
  const [stage, setStage] = useState("idle");
  const [handle, setHandle] = useState("");
  const [msg, setMsg] = useState("");

  async function begin() {
    if (!signedIn) { onSignInNeeded?.(); return; }
    setMsg("");
    try {
      const r = await fetch("/api/handle");
      const d = await r.json();
      setStage(d?.handle ? "confirm" : "handle");
    } catch {
      setStage("handle");
    }
  }

  async function claim(e) {
    e?.preventDefault();
    const want = handle.trim();
    if (!want) return;
    setStage("busy");
    try {
      const r = await fetch("/api/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: want }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || "That handle didn't work."); setStage("handle"); return; }
      setStage("confirm");
      setMsg("");
    } catch {
      setMsg("Network error — try again.");
      setStage("handle");
    }
  }

  async function post() {
    setStage("busy");
    setMsg("");
    try {
      // 900px wide: enough for a feed card at 2x, a fraction of the
      // bytes of the original, and comfortably inside a Firestore
      // document.
      const src = await shrink(variant.dataUrl, 900, 300);
      if (!src) { setMsg("Couldn't prepare that image."); setStage("error"); return; }

      const r = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          src,
          ticker: brief?.ticker || "",
          name: brief?.name || "",
          styleId: variant.templateId || "",
          styleName: variant.templateName || "",
          concept: variant.concept || "",
          sig: `${variant.dataUrl.length}.${variant.dataUrl.slice(1000, 1040)}`,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg(
          d.code === "duplicate" ? "That one's already on the feed."
          : d.code === "rate" ? d.error
          : d.error || "Couldn't post that."
        );
        setStage("error");
        return;
      }
      setStage("done");
    } catch {
      setMsg("Network error — try again.");
      setStage("error");
    }
  }

  if (stage === "done") {
    return <span className="post-done">Posted to the feed</span>;
  }

  if (stage === "handle") {
    return (
      <form className="post-handle" onSubmit={claim}>
        <span className="post-handle-lead">Pick a handle — it&apos;s how you&apos;ll be credited.</span>
        <div className="post-handle-row">
          <span className="post-at">@</span>
          <input
            autoFocus
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="yourname"
            maxLength={20}
            spellCheck={false}
          />
          <button className="btn small primary" type="submit">Continue</button>
          <button className="btn small" type="button" onClick={() => setStage("idle")}>Cancel</button>
        </div>
        {msg && <span className="post-msg">{msg}</span>}
      </form>
    );
  }

  if (stage === "confirm") {
    return (
      <span className="post-confirm">
        <span>Post this publicly?</span>
        <button className="btn small primary" onClick={post}>Yes, post it</button>
        <button className="btn small" onClick={() => setStage("idle")}>Cancel</button>
      </span>
    );
  }

  return (
    <>
      <button className="btn small" disabled={stage === "busy"} onClick={begin}>
        {stage === "busy" ? <span className="spinner" /> : "Post to feed"}
      </button>
      {msg && <span className="post-msg">{msg}</span>}
    </>
  );
}
