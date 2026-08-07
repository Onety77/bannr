// ============================================================
// LIGHTBOX — full-screen banner viewer, and where editing happens.
// Two view modes matter here and they answer different questions:
//   FIT    — is the composition right?
//   ACTUAL — is the text actually legible at real pixel size?
// A banner that reads fine scaled down to 380px wide can be a
// blurry mess at 1500x500, so "fit" alone can't be trusted.
//
// Editing lives here rather than in the results list because this
// is where someone has actually stopped to look at one banner and
// decided it's the keeper — the exact moment they notice the one
// thing they'd change. Edits apply in place and stack, so a second
// pass refines the first rather than starting over.
//
// And they are reversible, which matters more here than in most
// editors: a banner cannot be regenerated. Re-running the same brief
// returns a different one, so an edit someone dislikes used to cost
// them the banner permanently. Three ways to move — Undo and Redo in
// the bar, and "back to the original" as a quiet link inside the
// editor, because that one throws away work and should not have
// equal weight.
//
// HOLD THE BANNER TO COMPARE. Stepping back and forth to decide
// between two versions means judging one from memory, which is the
// hard way to do it and the reason people keep toggling. Pressing
// and holding shows the previous version for as long as you hold;
// releasing snaps back. The two land in the same place at the same
// size, so the difference is the only thing that moves.
// ============================================================
"use client";
import { useEffect, useRef, useState } from "react";
import { useProgress } from "@/lib/useProgress";
import { MAX_REFS } from "@/lib/credits";
import DexPreview from "@/components/DexPreview";

const SUGGESTIONS = [
  "make the text bigger",
  "remove the text",
  "darker background",
  "move the logo to the left",
];

export default function Lightbox({ item, onClose, onDownload, onEdit, onUndo, onRedo, onRevert, editInfo }) {
  const [actual, setActual] = useState(false);
  // True only while a press is held on the banner.
  const [comparing, setComparing] = useState(false);
  const [inContext, setInContext] = useState(false);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [refs, setRefs] = useState([]); // [{ file, url }]
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // An edit is a single image and lands sooner than a full run. It
  // gets a bar across the banner itself rather than on a button,
  // because during an edit the artwork is what you are looking at and
  // the button is not on screen.
  //
  // MUST STAY BELOW `busy`. It was written above it, which reads a
  // const before its declaration — a temporal dead zone. The build
  // was clean and /create threw on load in production, while every
  // other page kept working, because this is the only component they
  // do not render. scripts/check-tdz.cjs exists because of this.
  const editProgress = useProgress(busy, 28_000);
  const inputRef = useRef(null);
  const refsRef = useRef(null);

  function addRefs(files) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setRefs((prev) =>
      [...prev, ...list.map((f) => ({ file: f, url: URL.createObjectURL(f) }))].slice(0, MAX_REFS)
    );
  }

  function dropRef(i) {
    setRefs((prev) => {
      URL.revokeObjectURL(prev[i]?.url);
      return prev.filter((_, k) => k !== i);
    });
  }

  // Object URLs are per-selection, so they're released when the set
  // changes and when the viewer unmounts.
  useEffect(() => () => refs.forEach((r) => URL.revokeObjectURL(r.url)), [refs]);

  // Reset everything whenever a different image is opened, so one
  // banner's view mode or half-typed edit doesn't leak into the next.
  useEffect(() => {
    setActual(false);
    setInContext(false);
    setComparing(false);
    setEditing(false);
    setInstruction("");
    setRefs([]);
    setErr(null);
  }, [item?.key]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e) => {
      // Never steal keys while they're typing an instruction.
      if (e.target?.tagName === "TEXTAREA" || e.target?.tagName === "INPUT") {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); setActual((a) => !a); }
    };
    window.addEventListener("keydown", onKey);
    // Lock the page behind the overlay — otherwise scrolling to see an
    // actual-size banner scrolls the results list underneath instead.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [item, onClose]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!item) return null;

  const ratio = item.w && item.h ? (item.w / item.h).toFixed(2) : null;
  // Only meaningful when there is something behind this version.
  const canCompare = Boolean(item.prevSrc) && !inContext;
  const free = editInfo?.free ?? 0;
  const canAfford = editInfo?.can ?? false;

  async function submitEdit(e) {
    e?.preventDefault();
    const text = instruction.trim();
    if (!text || busy) return;
    if (!canAfford) {
      setErr("You're out of free edits and credits — top up on the credits page.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await onEdit(text, refs.map((r) => r.file));
    setBusy(false);
    if (res?.error) { setErr(res.error); return; }
    // Kept open and cleared, so refinements can stack naturally.
    setInstruction("");
    setRefs([]);
  }

  return (
    <div className="lb" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.alt}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lb-meta">
          <b>{item.label}</b>
          {item.w ? (
            <span className="lb-dims">
              {item.w} × {item.h}
              {ratio ? ` · ${ratio}:1` : ""}
              {item.edits ? ` · edited ${item.edits}×` : ""}
            </span>
          ) : null}
        </span>
        {onEdit && (
          <button
            className={`btn small ${editing ? "" : "primary"}`}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close editor" : "Edit this banner"}
          </button>
        )}
        {/* In the bar rather than in the editor, because the moment
            someone wants this is the moment the new version lands —
            and they may well have closed the editor to look at it. */}
        {onUndo && item.pastCount > 0 && (
          <button
            className="btn small"
            onClick={onUndo}
            disabled={busy}
            title="Go back to the version before your last change"
          >
            Undo
          </button>
        )}
        {/* Only after an undo. Shown rather than disabled, because a
            permanently greyed button is furniture people stop
            seeing. */}
        {onRedo && item.futureCount > 0 && (
          <button
            className="btn small"
            onClick={onRedo}
            disabled={busy}
            title="Forward again, to the version you undid"
          >
            Redo
          </button>
        )}
        <button
          className={`btn small ${inContext ? "primary" : ""}`}
          onClick={() => { setInContext((v) => !v); setActual(false); }}
          title="See it at the size it actually ships at"
        >
          {inContext ? "Back to banner" : "See it in context"}
        </button>
        {!inContext && (
          <button className="btn small" onClick={() => setActual((a) => !a)}>
            {actual ? "Fit to screen" : "Actual size (1:1)"}
          </button>
        )}
        {onDownload && (
          <button className="btn small" onClick={onDownload}>Download PNG</button>
        )}
        <button className="lb-x" onClick={onClose} aria-label="Close viewer">✕</button>
      </div>

      <div className={`lb-stage ${actual ? "actual" : ""}`} onClick={onClose}>
        {/* stopPropagation so clicking the banner itself doesn't close —
            only the surrounding backdrop does. */}
        <div className="lb-shot" onClick={(e) => e.stopPropagation()}>
          {inContext ? (
            <DexPreview src={item.src} ticker={item.ticker} />
          ) : (
            <img
              src={comparing && item.prevSrc ? item.prevSrc : item.src}
              alt={item.alt}
              // Pointer events, so one handler covers mouse, touch
              // and pen. up/leave/cancel all release: a drag off the
              // image must not leave it stuck showing the old one.
              onPointerDown={canCompare ? () => setComparing(true) : undefined}
              onPointerUp={canCompare ? () => setComparing(false) : undefined}
              onPointerLeave={canCompare ? () => setComparing(false) : undefined}
              onPointerCancel={canCompare ? () => setComparing(false) : undefined}
              // A long press on a phone otherwise opens the save/copy
              // menu on top of the comparison. Download is a button
              // three inches away, so nothing is lost.
              onContextMenu={canCompare ? (e) => e.preventDefault() : undefined}
              draggable={false}
            />
          )}
          {canCompare && (
            <span className={`lb-compare${comparing ? " on" : ""}`}>
              {comparing ? "Before" : "Hold to compare"}
            </span>
          )}
          {busy && (
            <div className="lb-working" style={{ "--p": editProgress }}>
              <span className="spinner" />
              <span>Applying your change…</span>
              <span className="lb-progress" aria-hidden="true"><i /></span>
            </div>
          )}
        </div>
      </div>

      {editing && onEdit ? (
        <form className="lb-edit" onClick={(e) => e.stopPropagation()} onSubmit={submitEdit}>
          {err && <div className="lb-err">{err}</div>}
          <div className="lb-edit-row">
            <textarea
              ref={inputRef}
              rows={2}
              maxLength={400}
              placeholder="What should change? e.g. make the mascot bigger, remove the text at the bottom, warmer colours… (attach an image to show what you mean)"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                // Enter submits, Shift+Enter for a newline — this is a
                // one-line instruction far more often than a paragraph.
                if (e.key === "Enter" && !e.shiftKey) submitEdit(e);
              }}
              disabled={busy}
            />
            <button className="btn primary" type="submit" disabled={busy || !instruction.trim()}>
              {busy ? <span className="spinner" /> : "Apply edit"}
            </button>
          </div>
          <div className="lb-attach">
            {refs.map((r, i) => (
              <div className="lb-ref" key={r.url}>
                <img src={r.url} alt={`Reference ${i + 1}`} />
                <button type="button" onClick={() => dropRef(i)} aria-label={`Remove reference ${i + 1}`}>✕</button>
              </div>
            ))}
            {refs.length < MAX_REFS && (
              <button
                type="button"
                className="lb-ref-add"
                disabled={busy}
                onClick={() => refsRef.current?.click()}
                title="Attach an image showing what you want"
              >
                <span>+</span> Add image
              </button>
            )}
            <input
              ref={refsRef} type="file" hidden multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { addRefs(e.target.files); e.target.value = ""; }}
            />
          </div>

          <div className="lb-chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="lb-chip" disabled={busy} onClick={() => setInstruction(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="lb-edit-note">
            {free > 0
              ? `${free} free edit${free === 1 ? "" : "s"} left today — then ${editInfo?.cost ?? 1} credit each.`
              : canAfford
                ? `Free edits used up for today — this one costs ${editInfo?.cost ?? 1} credit.`
                : "Out of free edits and credits — top up to keep editing."}
            {" "}Changes apply to the banner above and stack, so you can keep refining.
            {/* Only past one step, where it stops duplicating Undo. */}
            {onRevert && item.pastCount > 1 ? (
              <>
                {" "}
                <button type="button" className="lb-undo-all" onClick={onRevert} disabled={busy}>
                  Back to the original
                </button>
              </>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="lb-tip">Esc to close · Space toggles actual size · click outside to dismiss</div>
      )}
    </div>
  );
}
