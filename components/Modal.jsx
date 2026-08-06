// The shell both modals use. Backdrop, one panel, Escape closes.
//
// Rendered from the root layout rather than from whichever page
// opened it, so it is never clipped by a parent's overflow and never
// dies when that page navigates.
"use client";
import { useEffect } from "react";

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under the panel — on a phone
    // that reads as the modal sliding off rather than the page moving.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-back" onPointerDown={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
