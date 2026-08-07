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
// And the copy stays out of the way. This opened by explaining the
// screenshot handling — the portrait crop, the interface, what gets
// stripped off — which is what the product DOES, not something anyone
// needs read to them before they have uploaded anything. Describing
// your own engineering at someone who came to make a picture is a
// paragraph they have to get past. One line, then the form.
// ============================================================
"use client";
import { useEffect, useRef, useState } from "react";
import { PFP_STYLES, PFP_MAX, PFP_COST, PFP_TEXT_MAX, getPfpStyle, distributeStyles } from "@/lib/pfpStyles";
import { saveImage } from "@/lib/download";
import { openTopUp } from "@/lib/modals";
import { setUser } from "@/lib/credits";
import StageAura from "@/components/StageAura";
import Lightbox from "@/components/Lightbox";

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
  // Several styles, one per option — the same contract the banner
  // picker has. Never empty: deselecting the last one would leave a
  // run with no style at all, so the last selection holds.
  const [styleIds, setStyleIds] = useState(["default"]);
  const [color, setColor] = useState("");
  const [text, setText] = useState("");
  const [keepBg, setKeepBg] = useState(false);
  const [count, setCount] = useState(PFP_MAX);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [images, setImages] = useState(null);
  const [zoom, setZoom] = useState(null);
  const inputRef = useRef(null);

  const plan = distributeStyles(styleIds, Math.max(count, styleIds.length));
  const showSwatches = styleIds.includes("solid");
  const showKeepBg = styleIds.some((id) => getPfpStyle(id).keepBg);

  function toggleStyle(id) {
    setStyleIds((prev) => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter((s) => s !== id);
      // Picking a second style needs a second option to put it in, so
      // the count comes up with it rather than the pick being refused.
      const next = [...prev, id].slice(0, PFP_MAX);
      if (next.length > count) setCount(next.length);
      return next;
    });
  }

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
      fd.set("styles", styleIds.join(","));
      fd.set("count", String(Math.max(count, styleIds.length)));
      if (text.trim()) fd.set("text", text.trim());
      if (keepBg && showKeepBg) fd.set("keepBg", "1");
      if (showSwatches && color) fd.set("color", color);

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
        <h2>PFP maker</h2>
        {/* One line. This used to explain the screenshot handling — the
            portrait crop, the interface, what gets stripped — which is
            what the product DOES, not what anyone needs read to them
            before they have uploaded anything. The work speaks after
            the picture arrives; describing it beforehand is us
            admiring our own engineering at the user. */}
        <p>Square, built around your subject. Any image works.</p>
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
          <label className="pfp-label">
            Style
            {styleIds.length > 1 && <span className="pfp-help">One per option, in the order picked.</span>}
          </label>
          <div className="pfp-styles">
            {PFP_STYLES.map((s) => {
              const at = styleIds.indexOf(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={at >= 0}
                  className={`pfp-style${at >= 0 ? " on" : ""}`}
                  style={{ "--sw": s.accent }}
                  onClick={() => toggleStyle(s.id)}
                >
                  <b>
                    {/* Which option this becomes, once there is more
                        than one to be. */}
                    {at >= 0 && styleIds.length > 1 && <span className="pfp-nth">{at + 1}</span>}
                    {s.name}
                  </b>
                  <span>{s.tagline}</span>
                </button>
              );
            })}
          </div>

          {/* Only the one style has a parameter, and Auto is first
              because letting the model read the subject and pick beats
              most hand-chosen colours. */}
          {showSwatches && (
            <>
              <label className="pfp-label">Background colour</label>
              <div className="pfp-swatches">
                {getPfpStyle("solid").swatches.map((sw) => (
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

          {/* A toggle rather than a setting, and it sits here rather
              than up with the styles because it is a small yes/no about
              the picture, not a choice about what to make.

              Hidden on Glow and Solid, which ARE their backgrounds —
              offering to keep the original there is offering to switch
              the style off, and that is what picking a different style
              is for. */}
          {showKeepBg && (
            <button
              type="button"
              role="switch"
              aria-checked={keepBg}
              className={`pfp-toggle${keepBg ? " on" : ""}`}
              onClick={() => setKeepBg((v) => !v)}
            >
              <span className="pfp-track" aria-hidden="true"><span className="pfp-knob" /></span>
              <span className="pfp-toggle-txt">
                <b>Keep the background</b>
                <span>{keepBg ? "Whatever it was shot in stays." : "A new one is made for it."}</span>
              </span>
            </button>
          )}

          <label className="pfp-label">Options</label>
          <div className="pfp-count">
            {Array.from({ length: PFP_MAX }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                // Two styles need two options to live in, so the floor
                // is however many are picked.
                disabled={n < styleIds.length}
                className={`adv-opt${plan.length === n ? " on" : ""}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
            <span className="pfp-cost">{plan.length * PFP_COST} credit{plan.length * PFP_COST === 1 ? "" : "s"}</span>
          </div>

          <button className="btn primary block pfp-go" disabled={busy || !file} onClick={run}>
            {busy ? <span className="spinner" /> : `Make ${plan.length === 1 ? "it" : plan.length}`}
          </button>
          {error && <p className="pfp-err">{error}</p>}
        </div>
      </div>

      {(busy || images) && (
        <div className="pfp-out">
          {busy &&
            plan.map((id, i) => (
              <div className="pfp-shot skel" key={`s${i}`}>
                <StageAura />
              </div>
            ))}
          {!busy &&
            images?.map((im, i) => (
              <figure className="pfp-shot" key={i}>
                <img
                  className="zoomable"
                  src={im.dataUrl}
                  alt={`Profile picture option ${i + 1}`}
                  title="Tap to view full size"
                  onClick={() =>
                    setZoom({
                      key: `pfp${i}`,
                      src: im.dataUrl,
                      alt: `Profile picture option ${i + 1}`,
                      w: im.w,
                      h: im.h,
                      label: `Option ${i + 1}${im.styleName ? ` · ${im.styleName}` : ""}`,
                      dl: () => saveImage(im.dataUrl, `bannr-pfp-${i + 1}.png`),
                    })
                  }
                />
                <figcaption>
                  <span>{im.styleName || `${im.w} × ${im.h}`}</span>
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

      {/* The same viewer the banners use. A 1024px square shown in a
          280px card is most of the picture thrown away, and the one
          thing anyone wants to check on an avatar — whether the face
          survived — is exactly what disappears at that size. */}
      <Lightbox item={zoom} onClose={() => setZoom(null)} onDownload={zoom?.dl} />
    </div>
  );
}
