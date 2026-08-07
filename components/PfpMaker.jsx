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
import { PFP_STYLES, PFP_MAX, PFP_COST, PFP_TEXT_MAX, PFP_WANTS_MAX, PFP_IMAGES_MAX, getPfpStyle, distributeStyles } from "@/lib/pfpStyles";
import { saveImage } from "@/lib/download";
import { useProgress } from "@/lib/useProgress";
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
  // [{ file, url }] — several views of ONE subject, not references.
  // Object URLs are revoked on removal and on unmount; each one pins
  // the whole file in memory until it is.
  const [files, setFiles] = useState([]);
  // Several styles, one per option — the same contract the banner
  // picker has. Never empty: deselecting the last one would leave a
  // run with no style at all, so the last selection holds.
  const [styleIds, setStyleIds] = useState(["default"]);
  const [color, setColor] = useState("");
  const [text, setText] = useState("");
  // OFF by default, and that is the point: keeping what was behind the
  // subject is the standing behaviour now, so the toggle asks for the
  // change rather than for the absence of one.
  const [newBg, setNewBg] = useState(false);
  const [wants, setWants] = useState("");
  const [count, setCount] = useState(PFP_MAX);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [images, setImages] = useState(null);
  const [zoom, setZoom] = useState(null);
  const inputRef = useRef(null);

  // MUST STAY BELOW `busy`. Declared above it this reads a const
  // before its declaration — a temporal dead zone that builds clean
  // and throws on load in the browser. scripts/check-tdz.cjs exists
  // because Lightbox did exactly this once.
  //
  // 30s rather than the banner's 45: one square with no art-director
  // pass in front of it lands sooner than four banners with one.
  const progress = useProgress(busy, 30_000);

  const plan = distributeStyles(styleIds, Math.max(count, styleIds.length));
  const showSwatches = styleIds.includes("solid");
  const showBgToggle = styleIds.some((id) => getPfpStyle(id).keepBg);
  const showWants = styleIds.some((id) => getPfpStyle(id).wants);

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

  // Revoked on unmount only — removal revokes its own, and a cleanup
  // keyed on `files` would revoke a URL that is still on screen the
  // moment another is added.
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []);

  function add(list) {
    const picked = Array.from(list || []).filter((f) => f && f.size > 0);
    if (!picked.length) return;
    if (picked.some((f) => f.size > 8 * 1024 * 1024))
      return setError("One of those is over 8MB — try a smaller one.");
    if (picked.some((f) => !["image/png", "image/jpeg", "image/webp"].includes(f.type)))
      return setError("Images only — PNG, JPG or WEBP.");
    setError(null);
    setImages(null);
    setFiles((prev) => {
      // Sliced BEFORE the object URLs are made, so a sixth file does
      // not leak a URL that is created and then thrown away.
      const room = PFP_IMAGES_MAX - prev.length;
      return [...prev, ...picked.slice(0, room).map((f) => ({ file: f, url: URL.createObjectURL(f) }))];
    });
  }

  function removeAt(i) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[i]?.url);
      return prev.filter((_, k) => k !== i);
    });
    setImages(null);
  }

  function clearAll() {
    setFiles((prev) => { prev.forEach((f) => URL.revokeObjectURL(f.url)); return []; });
    setImages(null);
  }

  async function run() {
    if (!files.length) return setError("Add an image first.");
    if (!signedIn) return onSignInNeeded?.();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("images", f.file));
      fd.set("styles", styleIds.join(","));
      fd.set("count", String(Math.max(count, styleIds.length)));
      if (text.trim()) fd.set("text", text.trim());
      // The flag now asks for the CHANGE. Keeping what was already
      // behind the subject is the standing behaviour.
      if (newBg && showBgToggle) fd.set("newBg", "1");
      if (wants.trim() && showWants) fd.set("wants", wants.trim());
      if (showSwatches && color) fd.set("color", color);

      const res = await post("/api/pfp", fd, TIMEOUT);

      // ══ THE RESPONSE IS NOT ALWAYS JSON, AND res.json() THREW ══
      //
      // This was `await res.json()` on the next line. When the route
      // answers normally that is fine; when the function itself dies —
      // a crash, a platform timeout, a response too large to return —
      // the body is an HTML error page, json() throws, and the catch
      // below reported the bare string "Something went wrong."
      //
      // So the one case where we had no idea what happened was also
      // the one case where we told the user nothing and threw away the
      // status code that would have said. Read it as text, keep the
      // status, and put the real thing in the console.
      const raw = await res.text();
      let d = null;
      try { d = JSON.parse(raw); } catch {}

      if (!d) {
        console.error("[pfp] non-JSON response", res.status, raw.slice(0, 500));
        setError(
          // NOT "you weren't charged". The route refunds in its own
          // catch, and if the function died that catch never ran — so
          // claiming it would be a guess about someone's money. It
          // says what to check instead.
          `The server failed before it could answer (${res.status}). Check your credits before trying again.`
        );
        return;
      }

      if (!res.ok || !d.ok) {
        if (d.code === "insufficient_credits") { openTopUp(); return; }
        if (d.code === "signin_required") { onSignInNeeded?.(); return; }
        setError(d.error || "That didn't work — you weren't charged.");
        return;
      }
      setImages(d.images);
      if (d.user) { setUser(d.user); onCredits?.(); }
    } catch (e) {
      // Only a genuine network failure or the abort reaches here now.
      console.error("[pfp]", e);
      setError(
        e.name === "AbortError"
          ? "That took too long. Try again — you weren't charged."
          : "Couldn't reach the server. Check your connection and try again."
      );
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
        <p>Square, built around your subject.</p>
      </div>

      <div className="pfp-grid">
        {/* ---------- the images ---------- */}
        <div className="pfp-panel">
          <label className="pfp-label">
            Your subject
            {/* Not "supporting images" — that is the banner's field and
                it means something else. These are all the SAME thing,
                and saying so is what stops someone attaching a mood
                board and getting a collage. */}
            <span className="pfp-help">Up to {PFP_IMAGES_MAX}, all of the same subject.</span>
          </label>

          <div className="pfp-shots">
            {files.map((f, i) => (
              <div className="pfp-thumb" key={f.url}>
                <img src={f.url} alt={`Image ${i + 1}`} />
                <button type="button" onClick={() => removeAt(i)} aria-label={`Remove image ${i + 1}`}>✕</button>
              </div>
            ))}
            {files.length < PFP_IMAGES_MAX && (
              <button
                type="button"
                className={`pfp-drop${files.length ? " small" : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
                aria-label="Add an image"
              >
                {files.length ? (
                  <span className="pfp-plus" aria-hidden="true">+</span>
                ) : (
                  <span className="pfp-drop-txt">
                    <b>Drop an image</b>
                    <span>PNG, JPG or WEBP</span>
                  </span>
                )}
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => { add(e.target.files); e.target.value = ""; }}
          />
          {files.length > 1 && (
            <button type="button" className="pfp-clear" onClick={clearAll}>
              Remove all
            </button>
          )}
        </div>

        {/* ---------- the two decisions ---------- */}
        <div className="pfp-panel">
          <label className="pfp-label">
            Style
            {styleIds.length > 1 && <span className="pfp-help">One per option.</span>}
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
            <span className="pfp-help">Leave it empty for none.</span>
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
          {showBgToggle && (
            <button
              type="button"
              role="switch"
              aria-checked={newBg}
              className={`pfp-toggle${newBg ? " on" : ""}`}
              onClick={() => setNewBg((v) => !v)}
            >
              <span className="pfp-track" aria-hidden="true"><span className="pfp-knob" /></span>
              <span className="pfp-toggle-txt">
                <b>Make a new background</b>
                <span>{newBg ? "The original is replaced." : "The original stays."}</span>
              </span>
            </button>
          )}

          {/* Default only. The other three styles ARE the instruction,
              and inviting a second brief on top of "make it anime"
              produces two directions arguing inside one prompt. */}
          {showWants && (
            <>
              <label className="pfp-label">
                Anything you want
                <span className="pfp-help">Optional.</span>
              </label>
              <textarea
                className="pfp-text pfp-wants"
                rows={2}
                maxLength={PFP_WANTS_MAX}
                placeholder="give it a hoodie, make him look left"
                value={wants}
                onChange={(e) => setWants(e.target.value)}
              />
            </>
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

          {/* The same filling button the banner run has, not a bare
              spinner. A spinner answers "is it working"; this answers
              the thing anyone waiting actually wants to know, which is
              how far in they are. Same hook, same markup, shorter
              median — one square lands sooner than four banners. */}
          <button
            className={`btn primary block pfp-go gen-btn${busy ? " is-running" : ""}`}
            disabled={busy || !files.length}
            aria-busy={busy}
            style={{ "--p": progress }}
            onClick={run}
          >
            <span className="gen-fill" aria-hidden="true" />
            <span className="gen-label">
              {busy ? (
                <><span className="spinner" /> Making {plan.length === 1 ? "it" : `${plan.length} options`}…</>
              ) : (
                `Make ${plan.length === 1 ? "it" : plan.length}`
              )}
            </span>
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
