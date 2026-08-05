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
import { composeBeforeAfter } from "@/lib/beforeAfter";

// `prepared` says the image is already at feed size, so it is posted
// as-is. Re-shrinking a 900px image to 900px only re-encodes it, and
// for anything saved before the archive was widened it would UPSCALE
// — a bigger file carrying no more detail.
//
// `sig` lets a caller supply the signature computed from the ORIGINAL
// full-resolution banner. Without it, posting the same banner from
// /create and from My banners produces two different signatures and
// the duplicate check never fires.
//
// `logo` is the source image the banner was built from. When it is
// present the confirm step offers a BEFORE AND AFTER — the logo, an
// arrow, the banner — because that post argues for the product in a
// way a finished banner on its own cannot. Absent (posting from My
// banners, where the original upload is long gone) the option simply
// is not offered.
export default function PostButton({ variant, brief, signedIn, onSignInNeeded, prepared = false, sig = "", defaultCa = "", logo = "" }) {
  // idle | confirm | handle | busy | done | error
  const [stage, setStage] = useState("idle");
  const [handle, setHandle] = useState("");
  const [msg, setMsg] = useState("");
  // The composite, once made. Held rather than recomputed so the
  // thing posted is exactly the thing previewed — if the preview and
  // the post are two separate renders, they are two chances to differ.
  const [ba, setBa] = useState(null);
  const [baOn, setBaOn] = useState(false);
  const [baBusy, setBaBusy] = useState(false);
  // Optional, and prefilled when the brief came from a contract
  // address — which is most of the time now the homepage asks for
  // one. Retyping something the page already knows is the kind of
  // small tax that stops people bothering.
  const [ca, setCa] = useState(defaultCa || "");

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

  // Composed on the FIRST toggle only, then cached. It is a canvas
  // pass over two images — fast, but not free, and flipping a switch
  // back and forth should not redo it each time.
  async function toggleBa() {
    if (baOn) { setBaOn(false); return; }
    if (ba) { setBaOn(true); return; }
    setBaBusy(true);
    const out = await composeBeforeAfter(logo, variant.dataUrl);
    setBaBusy(false);
    if (!out) {
      // Nothing louder than this. The banner can still be posted, and
      // an error about an optional flourish would read as a failure
      // of the post itself.
      setMsg("Couldn't build the before-and-after — posting the banner on its own still works.");
      return;
    }
    setBa(out);
    setBaOn(true);
  }

  async function post() {
    setStage("busy");
    setMsg("");
    try {
      // 900px wide: enough for a feed card at 2x, a fraction of the
      // bytes of the original, and comfortably inside a Firestore
      // document.
      //
      // The composite is 3:1 like everything else, so it shrinks by
      // the same rule — and `prepared` does not apply to it, because
      // it was just rendered at full size regardless of where the
      // banner came from.
      const src = baOn && ba
        ? await shrink(ba, 900, 300)
        : prepared ? variant.dataUrl : await shrink(variant.dataUrl, 900, 300);
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
          ca: ca.trim(),
          // Always the BANNER's signature, never the composite's, so
          // posting the same banner twice is caught as a duplicate
          // whichever way it was framed.
          sig: sig || `${variant.dataUrl.length}.${variant.dataUrl.slice(1000, 1040)}`,
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
      <div className="post-confirm">
        <span className="post-confirm-q">Post this publicly?</span>

        {/* BEFORE AND AFTER. Only when the source image is still in
            hand, and off by default — the plain banner is what people
            came to post, and quietly reframing it would be a change
            made on their behalf to something they are about to put
            their name on.

            The preview is the actual composite, not an impression of
            one, so there is nothing to discover after posting. */}
        {logo && (
          <div className="post-ba">
            <label className="post-ba-row">
              <input type="checkbox" checked={baOn} onChange={toggleBa} disabled={baBusy} />
              <span>
                Show the logo it started from
                <em>Their picture, an arrow, your banner — in one image.</em>
              </span>
              {baBusy && <span className="spinner" />}
            </label>
            {baOn && ba && (
              <img className="post-ba-preview" src={ba} alt="Preview of the before-and-after post" />
            )}
          </div>
        )}

        {/* Optional on purpose. Plenty of banners are made before
            the token exists, and demanding an address would block
            exactly those people from posting at all. */}
        <label className="post-ca">
          <input
            value={ca}
            onChange={(e) => setCa(e.target.value.trim())}
            placeholder="Contract address (optional)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={64}
          />
          <span>Adds a link to the coin on DexScreener.</span>
        </label>
        <div className="post-confirm-row">
          <button className="btn small primary" onClick={post}>Yes, post it</button>
          <button className="btn small" onClick={() => setStage("idle")}>Cancel</button>
        </div>
      </div>
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
