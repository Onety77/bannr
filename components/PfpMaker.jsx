// ============================================================
// THE PFP MAKER — a whole separate form, kept deliberately short.
//
// The banner brief asks for a name, a ticker, a tagline, a
// description, a direction, a style set, an option count and a panel
// of advanced settings, and every one of those earns its place there.
// None of them earns it here. A profile picture needs the image and
// nothing else; the style and the optional name are the only two
// decisions, and both have a right default.
//
// So this is not the create grid with fields hidden. Sharing that
// form would have meant carrying six inputs that do not apply and
// explaining why they are greyed out — which is more work for the
// person, not less.
//
// The one thing worth saying out loud is the screenshot case, because
// people do not know it is allowed. Someone holding a blurry TikTok
// still assumes they need to crop it themselves first, and most of
// them will not bother.
// ============================================================
"use client";
import { useEffect, useRef, useState } from "react";
import { PFP_STYLES, PFP_MAX, PFP_COST, PFP_TEXT_MAX, getPfpStyle } from "@/lib/pfpStyles";
import { saveImage } from "@/lib/download";
import { openTopUp } from "@/lib/modals";
import { setUser } from "@/lib/credits";
import StageAura from "@/components/StageAura";

const TIMEOUT = 125_000;

async function post(url, body, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { method: "POST", body, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

export default function PfpMaker({ signedIn, onSignInNeeded, onCredits }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [styleId, setStyleId] = useState("default");
  const [color, setColor] = useState("");
  const [text, setText] = useState("");
  const [count, setCount] = useState(PFP_MAX);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [images, setImages] = useState(null);
  const inputRef = useRef(null);

  const style = getPfpStyle(styleId);

  // Object URLs are a real leak if the person swaps images a few
  // times — each one pins the whole file in memory until revoked.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f) {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return setError("That image is over 8MB — try a smaller one.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type))
      return setError("Images only — PNG, JPG or WEBP.");
    setError(null);
    setImages(null);
    setFile(f);
  }

  async function run() {
    if (!file) return setError("Add an image first.");
    if (!signedIn) return onSignInNeeded?.();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("image", file);
      fd.set("style", styleId);
      fd.set("count", String(count));
      if (text.trim()) fd.set("text", text.trim());
      if (styleId === "solid" && color) fd.set("color", color);

      const res = await post("/api/pfp", fd, TIMEOUT);
      const d = await res.json();
      if (!res.ok || !d.ok) {
        if (d.code === "insufficient_credits") { openTopUp(); return; }
        if (d.code === "signin_required") { onSignInNeeded?.(); return; }
        setError(d.error || "That didn't work — you weren't charged.");
        return;
      }
      setImages(d.images);
      if (d.user) { setUser(d.user); onCredits?.(); }
    } catch (e) {
      setError(e.name === "AbortError" ? "That took too long. Try again — you weren't charged." : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pfp">
      <div className="pfp-head">
        <h2>Profile picture</h2>
        {/* The screenshot case, stated. It is the input most people
            actually have and the one they assume is not allowed. */}
        <p>
          Square, and built around your subject. A screenshot is fine — a TikTok
          still, an X post, anything portrait and blurry with the app's
          interface all over it. That gets read, cleaned off and cropped out.
        </p>
      </div>

      <div className="pfp-grid">
        {/* ---------- the image ---------- */}
        <div className="pfp-panel">
          <label className="pfp-label">Your image</label>
          <button
            type="button"
            className={`pfp-drop${preview ? " has" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          >
            {preview ? (
              <img src={preview} alt="" />
            ) : (
              <span className="pfp-drop-txt">
                <b>Drop an image</b>
                <span>or tap to choose · PNG, JPG, WEBP</span>
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {preview && (
            <button type="button" className="pfp-clear" onClick={() => { setFile(null); setImages(null); }}>
              Remove
            </button>
          )}
        </div>

        {/* ---------- the two decisions ---------- */}
        <div className="pfp-panel">
          <label className="pfp-label">Style</label>
          <div className="pfp-styles">
            {PFP_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`pfp-style${styleId === s.id ? " on" : ""}`}
                style={{ "--sw": s.accent }}
                onClick={() => setStyleId(s.id)}
              >
                <b>{s.name}</b>
                <span>{s.tagline}</span>
              </button>
            ))}
          </div>

          {/* Only the one style has a parameter, and Auto is first
              because letting the model read the subject and pick beats
              most hand-chosen colours. */}
          {style.swatches && (
            <>
              <label className="pfp-label">Background colour</label>
              <div className="pfp-swatches">
                {style.swatches.map((sw) => (
                  <button
                    key={sw.v || "auto"}
                    type="button"
                    title={sw.label}
                    aria-label={sw.label}
                    aria-pressed={color === sw.v}
                    className={`pfp-sw${color === sw.v ? " on" : ""}${sw.v ? "" : " auto"}`}
                    style={sw.v ? { background: sw.v } : undefined}
                    onClick={() => setColor(sw.v)}
                  >
                    {sw.v ? "" : "Auto"}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="pfp-label">
            Text
            <span className="pfp-help">Optional. Usually a name or ticker — leave it empty for none.</span>
          </label>
          <input
            className="pfp-text"
            type="text"
            maxLength={PFP_TEXT_MAX}
            placeholder="e.g. MOONSOON"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <label className="pfp-label">Options</label>
          <div className="pfp-count">
            {Array.from({ length: PFP_MAX }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`adv-opt${count === n ? " on" : ""}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
            <span className="pfp-cost">{count * PFP_COST} credit{count * PFP_COST === 1 ? "" : "s"}</span>
          </div>

          <button className="btn primary block pfp-go" disabled={busy || !file} onClick={run}>
            {busy ? <span className="spinner" /> : `Make ${count === 1 ? "it" : count}`}
          </button>
          {error && <p className="pfp-err">{error}</p>}
        </div>
      </div>

      {(busy || images) && (
        <div className="pfp-out">
          {busy &&
            Array.from({ length: count }, (_, i) => (
              <div className="pfp-shot skel" key={`s${i}`}>
                <StageAura />
              </div>
            ))}
          {!busy &&
            images?.map((im, i) => (
              <figure className="pfp-shot" key={i}>
                <img src={im.dataUrl} alt={`Profile picture option ${i + 1}`} />
                <figcaption>
                  <span>{im.w} × {im.h}</span>
                  <button
                    className="btn small primary"
                    onClick={() => saveImage(im.dataUrl, `bannr-pfp-${i + 1}.png`)}
                  >
                    Download PNG
                  </button>
                </figcaption>
              </figure>
            ))}
        </div>
      )}
    </div>
  );
}
