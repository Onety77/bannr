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
import { squareLogo } from "@/lib/postLogo";
import { LOOKS_LIKE_CA } from "@/lib/ca";

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
// `logo` is the source image the banner was built from. A post keeps
// it — see lib/postLogo.js — so the feed shows what this place DOES
// rather than only what it produces.
//
// NOT AN OPTION, AND NOT ANNOUNCED. It is how a post looks, the same
// way a post has a handle on it. A checkbox would turn a house style
// into a decision, and every decision put in front of someone is one
// more reason to close the dialog. The image is untouched by it, so
// there is nothing to opt out of.
//
// Not required either: with no upload in hand, the contract address
// already being asked for yields the logo from the chain. /api/lookup
// downloads it server-side and returns a DATA URL, which is the only
// reason any of this works — a remote image taints the canvas and
// toDataURL then throws, so a logo pulled straight from an IPFS
// gateway would compose fine and fail to export.
export default function PostButton({ variant, brief, signedIn, onSignInNeeded, prepared = false, sig = "", defaultCa = "", logo = "", runToken = "", onEarned }) {
  // idle | confirm | handle | busy | done | error
  const [stage, setStage] = useState("idle");
  const [handle, setHandle] = useState("");
  const [msg, setMsg] = useState("");
  // Optional, and prefilled when the brief came from a contract
  // address — which is most of the time now the homepage asks for
  // one. Retyping something the page already knows is the kind of
  // small tax that stops people bothering.
  const [ca, setCa] = useState(defaultCa || "");
  // What the server actually paid, and how many are left today. Read
  // from the response rather than predicted here: the account is the
  // authority on credits, and guessing would eventually disagree.
  const [earned, setEarned] = useState(0);
  const [left, setLeft] = useState(null);

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

  // The picture the banner grew from: the upload when we have it,
  // otherwise whatever the address resolves to. Fetched at post time
  // rather than while typing, so a half-typed address never fires a
  // request and nothing happens until someone has committed.
  async function sourceLogo(caClean) {
    if (logo) return logo;
    if (!LOOKS_LIKE_CA.test(caClean)) return null;
    try {
      const r = await fetch(`/api/lookup?ca=${encodeURIComponent(caClean)}`);
      const d = await r.json();
      // A token can be real and still have no picture. Then there is
      // simply nothing to pair, and the banner posts on its own.
      return r.ok && d.ok && d.logo ? d.logo : null;
    } catch {
      return null;
    }
  }

  async function post() {
    setStage("busy");
    setMsg("");
    try {
      const caClean = ca.trim();
      // Silent throughout. Every failure below leaves the post without
      // a logo, which is a post, and none of it is worth a sentence in
      // front of someone who asked to publish a picture.
      const found = await sourceLogo(caClean);
      const postLogo = found ? await squareLogo(found) : null;

      // 900px wide: enough for a feed card at 2x, a fraction of the
      // bytes of the original, and comfortably inside a Firestore
      // document. Still 3:1 — the banner is posted exactly as it was
      // made, and the logo rides on the card rather than in the image.
      const src = prepared ? variant.dataUrl : await shrink(variant.dataUrl, 900, 300);
      if (!src) { setMsg("Couldn't prepare that image."); setStage("error"); return; }

      const r = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          src,
          // The picture the banner grew from. The card lays it over
          // the artwork; nothing is baked into the image.
          logo: postLogo,
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
          // Signed by the server when the run was made. Absent for a
          // banner posted from My banners days later, which simply
          // means no credit — not an error.
          runToken: runToken || "",
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
      if (d.earned > 0) { setEarned(d.earned); onEarned?.(d.earned); }
      if (typeof d.rewardsLeft === "number") setLeft(d.rewardsLeft);
      setStage("done");
    } catch {
      setMsg("Network error — try again.");
      setStage("error");
    }
  }

  if (stage === "done") {
    // Says what happened and stops. The credit is the news when there
    // is one; when there is not, "posted" is the whole story and
    // explaining why it did not pay would be a lecture nobody asked
    // for at the moment they did something generous.
    return (
      <span className="post-done">
        Posted to the feed
        {earned > 0 && (
          <b className="post-earned">
            +{earned} credit{earned === 1 ? "" : "s"}
            {left > 0 ? ` · ${left} more today` : ""}
          </b>
        )}
      </span>
    );
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

        {/* Optional on purpose. Plenty of banners are made before the
            token exists, and demanding an address would block exactly
            those people from posting at all.

            The hint says what it gets them and stops. It also lets us
            find the logo when there is no upload in hand, and that is
            not their problem to know about. */}
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
